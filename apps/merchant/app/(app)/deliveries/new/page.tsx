"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FLEET_DISPATCH,
  isShortMapLink,
  type LatLng,
  type MerchantBookingResponse,
  type MerchantDishResponse,
  type MerchantProfileResponse,
  parseMapLocation,
} from "@lynia/shared";
import { Icon } from "../../../components/icons";
import { Kitchen } from "../../../components/Kitchen";
import { useKitchenConnection } from "../../../components/KitchenConnectionProvider";
import { AppBar } from "../../../components/m/AppBar";
import { Switch } from "../../../components/m/Switch";
import { RetryableError } from "../../../components/RetryableError";
import { ApiError, redirectIfSessionExpired } from "../../../lib/api-client";
import {
  addLine,
  type BookLine,
  startFare,
  stepFare,
  toBookingRequest,
  typicalLine,
  validateWhat,
  validateWhere,
  type Where,
  type WhereErrors,
  worth,
} from "../../../lib/book-form";
import { bookingsAvailable, newIdempotencyKey, rememberCode, suggestedFare } from "../../../lib/booking";
import { cancelBooking, createBooking, getBooking, resolveMapLink } from "../../../lib/bookings-api";
import { CountdownBar } from "../../../components/m/CountdownBar";
import { supportWhatsAppUrl } from "../../../lib/config";
import { createFleetBooking, retryFleetBooking, sendFleetBookingToAny } from "../../../lib/fleet-api";
import { OBM } from "../../../lib/own-bikers-copy";
import { bikersOnline, likelyFleet, useFleet } from "../../../lib/use-fleet";
import { useNow } from "../../../lib/use-now";
import { primeBusiness } from "../../../lib/business";
import { getMerchantProfile, listDishes } from "../../../lib/menu-api";
import { parseAmountInput } from "../../../lib/money-input";
import { money } from "../../../lib/orders-view";
import { formatLocalDigits, localDigits } from "../../../lib/phone-input";
import { newSessionToken, pinnedLine, placesEnabled, type PlaceSuggestion, resolvePlace, reverseGeocode, searchPlaces } from "../../../lib/places";
import { bookingHref } from "../../../lib/routes";

type Gate = { status: "loading" } | { status: "ready"; business: MerchantProfileResponse; pickup: LatLng } | { status: "no_pin" } | { status: "error"; message: string };
type Sheet = null | "items" | "type";
/** OB-M8: who the booking goes to. */
type Mode = "mine" | "any";
/** How often the ringing sheet re-reads its booking (OB-M9–M11). */
const RING_POLL_MS = 2_000;
const RING_TOTAL_MS = FLEET_DISPATCH.rounds * FLEET_DISPATCH.roundMs;

const UNREADABLE_LINK = "We couldn't read a location from that link. Search for the street instead.";
/** MJ-M15 (DESIGN-DEVIATIONS D-91): without a Places key typing an address finds nothing, so the field says
 *  what does work — the location the buyer sent — and an unreadable link doesn't send them to a search. */
const NO_SEARCH_HINT = "Paste the location the buyer sent you, like a Google Maps or WhatsApp location link.";
const UNREADABLE_LINK_NO_SEARCH = "We couldn't read a location from that link. Ask the buyer to send their location again.";
/** MJ-RL8 (D-91): the item list didn't load — not "No items yet." */
const ITEMS_LOAD_FAILED = "Couldn't load your items.";

function unreadableLink(): string {
  return placesEnabled() ? UNREADABLE_LINK : UNREADABLE_LINK_NO_SEARCH;
}
/** A typed short link is resolved once typing stops; a paste lands whole, so it resolves right after. */
const RESOLVE_DELAY_MS = 400;

/**
 * S4 · Book a rider, one screen (Merchant v2, packages/design/handoff/merchant-v2, ledger D-77; it
 * replaces D-48's two steps D2/D3). "Going to": an address search, or the location the buyer sent (a
 * Google Maps or WhatsApp link pasted into the same field), shown once picked as a mint pill; the
 * buyer's phone; "What's going · $51.00" as item chips with "+ Add" (from the shop's own items, or typed);
 * "Rider collects $51.00 · and brings it back to you"; the fare stepper with "Riders usually get $6–7";
 * then "Find a rider · $6.00". Riders' offers then use the Send v2 list, unchanged. The pickup is always
 * the business's own pin; everything is set before the broadcast, because riders have 90 seconds to offer.
 *
 * Own bikers v1 (OB-M8–M12, ledger D-117): a business with Own bikers gets "My bikers · 2 online | Any biker" on top
 * (My bikers by default when one is online; otherwise Any biker with "0 of your bikers online"). My bikers has no
 * fare stepper; "Ring my bikers" rings them, and a sheet over this screen counts the two minutes down (OB-M9). None
 * took it (OB-M10) or nobody online (OB-M11): "Send to any biker" switches to Any biker with the stepper filled, and
 * "Find a biker" then sends that same booking to the public. Paused (OB-M12): My bikers is locked. Once a biker
 * accepts, the booking's own screen opens.
 */
export default function NewBookingPage() {
  const router = useRouter();
  const { signOut, actionsDisabled } = useKitchenConnection();
  const [gate, setGate] = useState<Gate>({ status: "loading" });
  const [where, setWhere] = useState<Where | null>(null);
  const [phone, setPhone] = useState("");
  const [whereErrors, setWhereErrors] = useState<WhereErrors>({});
  const [lines, setLines] = useState<BookLine[]>([]);
  const [fare, setFare] = useState<number | null>(null);
  // D-48 PR 4b (owner decision): cash on delivery is optional per booking.
  const [collectCash, setCollectCash] = useState(false);
  const [whatError, setWhatError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  // One key per form: a double tap, or a retry after a lost answer, books once (Send dedupes on it).
  const idempotencyKey = useRef(newIdempotencyKey());
  // Own bikers (OB-M8–M12).
  const { fleet: fleetRead, reload: reloadFleet } = useFleet();
  const fleet = fleetRead && fleetRead !== "unreachable" ? fleetRead : null;
  const online = fleet ? bikersOnline(fleet) : 0;
  const wantsMine = useSearchParams()?.get("mine") === "1";
  const [mode, setMode] = useState<Mode | null>(null);
  /** The fleet booking ringing (or held for a decision) under the sheet. */
  const [ringing, setRinging] = useState<MerchantBookingResponse | null>(null);
  /** A fleet booking nobody took, now to be sent to any biker from the Any biker form. */
  const [heldId, setHeldId] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  // MJ-RL5 (not a bug): the key stays for the whole form, edits included. Send stores a key only when it
  // created a booking, so an edit after a refused attempt is already a fresh booking; after a lost success
  // the same key lands the merchant on the booking that exists instead of booking a second rider.

  const load = useCallback(async () => {
    setGate({ status: "loading" });
    try {
      const business = await getMerchantProfile();
      primeBusiness(business);
      if (!bookingsAvailable(business)) {
        router.replace("/deliveries");
        return;
      }
      if (!business.location) {
        setGate({ status: "no_pin" });
        return;
      }
      setGate({ status: "ready", business, pickup: business.location.point });
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setGate({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load the booking form." });
    }
  }, [router, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  // OB-M8 default: My bikers when at least one is online (or the first-biker banner asked for it), else Any biker.
  useEffect(() => {
    if (mode !== null || fleetRead === undefined) return;
    setMode(fleet && !fleet.paused && (online > 0 || wantsMine) ? "mine" : "any");
  }, [mode, fleetRead, fleet, online, wantsMine]);
  const mine = fleet !== null && !fleet.paused && mode === "mine" && heldId === null;
  // OB-M8 "loading count": a business last seen with Own bikers gets the toggle at once, its count still loading.
  const [pendingMine] = useState(() => typeof window !== "undefined" && likelyFleet());
  const loadingMine = fleetRead === undefined && pendingMine;

  // OB-M9–M11: follow the ringing booking until a biker takes it (its own screen), or it waits on a decision.
  const ringingId = ringing?.id ?? null;
  useEffect(() => {
    if (!ringingId) return undefined;
    let alive = true;
    const t = setInterval(() => {
      getBooking(ringingId).then(
        (b) => {
          if (!alive) return;
          if (b.fleet) setRinging(b);
          else if (b.state === "cancelled") setRinging(null);
          else router.replace(bookingHref(b.id));
        },
        () => undefined, // a missed read: the next one tries again
      );
    }, RING_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ringingId, router]);
  const now = useNow(1000, ringing?.fleet?.state === "ringing");

  const pickup = gate.status === "ready" ? gate.pickup : null;
  const suggested = pickup && where ? suggestedFare(pickup, where.point) : null;
  const shownFare = fare ?? (suggested !== null ? startFare(suggested) : null);

  async function book() {
    if (submittingRef.current) return;
    // A held fleet booking already has its address, buyer and items: only the fare is new.
    if (heldId === null) {
      const found = validateWhere(where, phone);
      setWhereErrors(found);
      const problem = validateWhat(lines, collectCash);
      setWhatError(problem);
      if (Object.keys(found).length > 0 || problem || !where) return;
    }
    setBanner(null);
    setUnreachable(false);
    if (!mine && shownFare === null) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      if (heldId !== null && shownFare !== null) {
        // OB-M10/M11 "Send to any biker": the same booking and code, now to the public at this fare.
        await sendFleetBookingToAny(heldId, shownFare);
        router.replace(bookingHref(heldId));
      } else if (mine && where) {
        const { proposedFare: _fare, ...body } = toBookingRequest(where, phone, lines, shownFare ?? 0, idempotencyKey.current, collectCash);
        const { booking, deliveryCode } = await createFleetBooking(body);
        rememberCode(booking.id, deliveryCode);
        setRinging(booking);
      } else if (where && shownFare !== null) {
        const booking = await createBooking(toBookingRequest(where, phone, lines, shownFare, idempotencyKey.current, collectCash));
        router.replace(bookingHref(booking.id));
      }
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      // OB-M8 "can't reach": the strip over the button, with Try again.
      if (!(err instanceof ApiError) || err.status === 0) setUnreachable(true);
      else setBanner(err.message);
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }

  /** OB-M10 "Try my bikers again", OB-M9 Cancel, and "Send to any biker" from either result sheet. */
  async function onRing(action: "retry" | "cancel" | "any") {
    if (!ringing || submittingRef.current) return;
    if (action === "any") {
      setHeldId(ringing.id);
      setRinging(null);
      setMode("any");
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    try {
      if (action === "retry") setRinging(await retryFleetBooking(ringing.id));
      else {
        await cancelBooking(ringing.id);
        setRinging(null);
        // Booking again starts a new one.
        idempotencyKey.current = newIdempotencyKey();
      }
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setBanner(err instanceof ApiError && err.status !== 0 ? err.message : "Couldn't reach LyniaGo. Try again.");
      setRinging(null);
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }

  const shop = gate.status === "ready" && gate.business.businessType === "shop";

  return (
    <Kitchen active={shop ? "deliveries" : "queue"} tabs={false}>
      <div className="m-page">
        <AppBar back="/deliveries" title="Book a biker" />

        <div className="m-bd m-s4" style={{ gap: 14, paddingTop: 4 }}>
          {gate.status === "loading" && <div className="m-hint">Loading…</div>}
          {gate.status === "error" && <RetryableError message={gate.message} onRetry={() => void load()} />}
          {gate.status === "no_pin" && <p className="m-sub">Set your shop&apos;s location first, so bikers know where to collect.</p>}

          {gate.status === "ready" && fleet?.paused && (
            <div className="m-ob-paused">
              <div>
                <span className="m-ob-strip-ic">
                  <Icon name="pause" size={16} />
                </span>
                <div>
                  <b>{OBM.pausedT}</b>
                  <span>{OBM.pausedB}</span>
                </div>
              </div>
              <a className="m-ob-pill" data-out="" href={supportWhatsAppUrl(`Hi LyniaGo, about Own bikers for ${gate.business.name}`) ?? undefined} target="_blank" rel="noreferrer">
                <Icon name="message-circle" size={16} />
                {OBM.contact}
              </a>
            </div>
          )}
          {gate.status === "ready" && fleet && heldId === null && (
            <>
              <div className="m-ob-seg" role="radiogroup" aria-label={OBM.bookTitle}>
                <button type="button" role="radio" aria-checked={mine} disabled={fleet.paused} onClick={() => setMode("mine")}>
                  {fleet.paused && <Icon name="lock" size={16} />}
                  <span className="m-ob-wide">{fleet.paused ? OBM.segMine : OBM.segMineN(online)}</span>
                  <span className="m-ob-narrow">{OBM.segMine}</span>
                </button>
                <button type="button" role="radio" aria-checked={!mine} onClick={() => setMode("any")}>
                  {OBM.segAny}
                </button>
              </div>
              {!fleet.paused && (
                <p className={`m-ob-seghint${online === 0 ? "" : " m-ob-narrow"}`}>{OBM.mineOnline(online)}</p>
              )}
            </>
          )}
          {gate.status === "ready" && loadingMine && (
            <div className="m-ob-seg" aria-busy="true" aria-label={OBM.bookTitle}>
              <button type="button" role="radio" aria-checked={true} disabled>
                {`${OBM.segMine} · `}
                <i className="m-ob-segsk" aria-hidden="true" />
              </button>
              <button type="button" role="radio" aria-checked={false} disabled>
                {OBM.segAny}
              </button>
            </div>
          )}

          {gate.status === "ready" && (
            <>
              <WhereSearch
                near={pickup}
                value={where}
                error={whereErrors.where}
                signOut={signOut}
                onChange={(w) => {
                  setWhere(w);
                  setFare(null);
                  setWhereErrors((e) => ({ ...e, where: undefined }));
                }}
              />
              <div className="m-fld">
                <label htmlFor="buyer-phone">Buyer’s phone</label>
                <span className="m-in" data-invalid={!!whereErrors.phone}>
                  <b style={{ fontSize: 15 }}>+263</b>
                  <input
                    id="buyer-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="77 123 4567"
                    value={formatLocalDigits(phone)}
                    onChange={(e) => {
                      setPhone(localDigits(e.target.value));
                      setWhereErrors((er) => ({ ...er, phone: undefined }));
                    }}
                  />
                </span>
                {whereErrors.phone && (
                  <span className="m-err" role="alert">
                    {whereErrors.phone}
                  </span>
                )}
              </div>

              <div className="m-fld">
                <span className="m-label">
                  What’s going{lines.length > 0 ? ` · ${money(worth(lines))}` : ""}
                </span>
                <div className="m-ichips">
                  {lines.map((l, i) => (
                    <button
                      key={`${l.name}-${i}`}
                      type="button"
                      className="m-ichip"
                      aria-label={`Remove ${l.qty}× ${l.name}`}
                      onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    >
                      {l.qty}× {l.name}
                    </button>
                  ))}
                  <button type="button" className="m-ichip m-add" onClick={() => setSheet("items")}>
                    <Icon name="plus" size={16} /> Add
                  </button>
                </div>
              </div>

              <div className="m-collect">
                <div>
                  <b>Biker collects {money(worth(lines))}</b>
                  <span>and brings it back to you</span>
                </div>
                <Switch checked={collectCash} label={`Biker collects ${money(worth(lines))}`} onChange={setCollectCash} />
              </div>

              {shownFare !== null && !mine && !loadingMine && (
                <div className="m-fld">
                  <span className="m-label">Fare you offer</span>
                  <div className="m-fare2">
                    <button type="button" aria-label="Offer $0.50 less" disabled={shownFare <= 1.5} onClick={() => setFare(stepFare(shownFare, -1))}>
                      <Icon name="minus" size={20} />
                    </button>
                    <div>
                      <b className="m-num">{money(shownFare)}</b>
                      {suggested !== null && <span>{typicalLine(suggested)}</span>}
                    </div>
                    <button type="button" aria-label="Offer $0.50 more" onClick={() => setFare(stepFare(shownFare, 1))}>
                      <Icon name="plus" size={20} />
                    </button>
                  </div>
                </div>
              )}

              {whatError && (
                <div className="m-alert" role="alert">
                  {whatError}
                </div>
              )}
              {banner && (
                <div className="m-alert" role="alert">
                  {banner}
                </div>
              )}
            </>
          )}
        </div>

        {gate.status === "ready" && (
          <div className="m-cta m-cta-pin">
            {(unreachable || fleetRead === "unreachable") && (
              <div className="m-ob-strip" data-tone="bad" data-act="" role="alert">
                <span className="m-ob-strip-ic">
                  <Icon name="wifi-off" size={16} />
                </span>
                <div>
                  <b>{OBM.cantReach}</b>
                </div>
                <button type="button" className="m-ob-pill" onClick={() => (fleetRead === "unreachable" ? reloadFleet() : void book())}>
                  <Icon name="rotate-cw" size={16} />
                  {OBM.tryAgain}
                </button>
              </div>
            )}
            <button type="button" className="m-btn" disabled={busy || actionsDisabled || fleetRead === undefined} onClick={() => void book()}>
              {mine || loadingMine ? (
                <>
                  <Icon name="bike" size={20} />
                  {OBM.ringMine}
                </>
              ) : busy ? (
                "Booking…"
              ) : shownFare !== null ? (
                OBM.findAny(money(shownFare))
              ) : (
                "Find a biker"
              )}
            </button>
          </div>
        )}
      </div>

      {sheet && (
        <div className="m-overlay" style={{ zIndex: 70 }}>
          <div className="m-overlay-frame">
            <button type="button" className="m-scrim" aria-label="Close" onClick={() => setSheet(null)} />
            <div className="m-sheet" role="dialog" aria-modal="true" aria-label={sheet === "items" ? "Your items" : "Type an item"}>
              <div className="m-grab" />
              {sheet === "items" && (
                <ItemsPicker
                  onPick={(d) => {
                    setLines((ls) => addLine(ls, { dishId: d.id, name: d.name, qty: 1, unitPrice: d.priceUsd }));
                    setWhatError(null);
                    setSheet(null);
                  }}
                  onType={() => setSheet("type")}
                  onDone={() => setSheet(null)}
                />
              )}
              {sheet === "type" && (
                <TypeOne
                  onAdd={(l) => {
                    setLines((ls) => addLine(ls, l));
                    setWhatError(null);
                    setSheet(null);
                  }}
                  onDone={() => setSheet(null)}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {ringing?.fleet && (
        <div className="m-overlay" style={{ zIndex: 70 }}>
          <div className="m-overlay-frame">
            <div className="m-scrim" aria-hidden="true" />
            {ringing.fleet.state === "ringing" ? (
              <div className="m-sheet" role="dialog" aria-modal="true" aria-label={OBM.ringing(ringing.fleet.rung)}>
                <div className="m-grab" />
                <div className="m-ob-ring" aria-live="polite">
                  <span>
                    <Icon name="volume-2" size={20} />
                  </span>
                  <div>
                    <b>{OBM.ringing(ringing.fleet.rung)}</b>
                    <small>{OBM.ringingSub}</small>
                  </div>
                </div>
                <CountdownBar msLeft={ringing.fleet.endsAt ? Date.parse(ringing.fleet.endsAt) - now : 0} totalMs={RING_TOTAL_MS} />
                <button type="button" className="m-btn2" disabled={busy} onClick={() => void onRing("cancel")}>
                  {OBM.cancel}
                </button>
              </div>
            ) : (
              <div className="m-sheet" role="alertdialog" aria-modal="true" aria-label={ringing.fleet.state === "none_took" ? OBM.noneTook : OBM.noneOnline}>
                <div className="m-grab" />
                <span className="m-ob-result-ic">
                  <Icon name="users" size={24} />
                </span>
                <h2 className="m-ob-sheet-t">{ringing.fleet.state === "none_took" ? OBM.noneTook : OBM.noneOnline}</h2>
                <p className="m-ob-sheet-s">{ringing.fleet.state === "none_took" ? OBM.noneTookB : OBM.noneOnlineB}</p>
                <button type="button" className="m-btn" disabled={busy} onClick={() => void onRing("any")}>
                  {OBM.sendAny}
                </button>
                {ringing.fleet.state === "none_took" ? (
                  <button type="button" className="m-btn2" disabled={busy} onClick={() => void onRing("retry")}>
                    {OBM.tryMine}
                  </button>
                ) : (
                  <button type="button" className="m-btn2" disabled={busy} onClick={() => void onRing("cancel")}>
                    {OBM.cancel}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Kitchen>
  );
}

/** D2's search: Places rows as you type, or a pasted location link read straight away. */
function WhereSearch({ value, error, near, signOut, onChange }: { value: Where | null; error?: string; near: LatLng | null; signOut: () => void; onChange: (w: Where | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const session = useRef(newSessionToken());
  // Only the latest link counts: an older short link's answer arriving late never moves the location.
  const linkSeq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || /https?:\/\//i.test(q) || parseMapLocation(q)) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      void searchPlaces(q, session.current, near).then((rows) => {
        if (alive) setResults(rows);
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, near]);

  /** A pasted pin: shown at once, then named by its area when the reverse lookup answers (if it does). */
  function pinned(point: LatLng, seq: number) {
    onChange({ point, address: pinnedLine() });
    void reverseGeocode(point).then(
      (place) => {
        if (seq === linkSeq.current && place?.area) onChange({ point, address: pinnedLine(place.area) });
      },
      () => undefined,
    );
  }

  function type(text: string) {
    setQuery(text);
    setNote(null);
    const seq = ++linkSeq.current;
    const direct = parseMapLocation(text);
    if (direct) {
      setResults([]);
      pinned(direct, seq);
      return;
    }
    const url = /https:\/\/\S+/i.exec(text)?.[0];
    if (url && isShortMapLink(url)) {
      setResults([]);
      setNote("Reading the link…");
      setTimeout(() => {
        resolveMapLink(url).then(
          (point) => {
            if (seq !== linkSeq.current) return;
            setNote(null);
            pinned(point, seq);
          },
          (err: unknown) => {
            if (seq !== linkSeq.current || redirectIfSessionExpired(err, signOut)) return;
            // MJ-M15: an unreadable link is this screen's own line (the server's used to name a pin control
            // that doesn't exist); any other refusal is said as the server says it.
            setNote(err instanceof ApiError && err.reason !== "unreadable_link" ? err.message : unreadableLink());
          },
        );
      }, RESOLVE_DELAY_MS);
      return;
    }
    if (/https?:\/\//i.test(text)) setNote(unreadableLink());
    // MJ-M15: no Places key, so a typed address finds nothing — say what does work.
    else if (!placesEnabled() && text.trim().length >= 3) setNote(NO_SEARCH_HINT);
  }

  async function pick(s: PlaceSuggestion) {
    linkSeq.current++; // a pasted pin's late area lookup never overwrites a picked place
    const place = await resolvePlace(s, session.current);
    session.current = newSessionToken();
    if (!place) {
      setNote("Couldn't find that place. Try another search.");
      return;
    }
    onChange({ point: place.point, address: [s.primary, s.secondary].filter(Boolean).join(", ") || place.address });
  }

  // S4: once picked, "Going to" is one mint pill; tapping it searches again.
  if (value) {
    return (
      <div className="m-fld">
        <span className="m-label">Going to</span>
        <button
          type="button"
          className="m-goto"
          aria-label={`Going to ${value.address}. Change it`}
          onClick={() => {
            linkSeq.current++;
            setQuery("");
            setResults([]);
            onChange(null);
          }}
        >
          <Icon name="map-pin" size={16} />
          <span>{value.address}</span>
          <Icon name="check" size={16} />
        </button>
        {error && (
          <span className="m-err" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="m-fld">
      <label className="m-label" htmlFor="going-to">
        Going to
      </label>
      <label className="m-in m-srch-g" data-invalid={!!error}>
        <Icon name="search" size={20} color="var(--muted)" />
        <input
          id="going-to"
          aria-label="Search street or area, or paste the buyer's location"
          placeholder="Search street or area"
          value={query}
          onChange={(e) => type(e.target.value)}
        />
      </label>
      {note && <span className="m-hint">{note}</span>}
      <div>
        {results.map((s) => (
          <button key={s.placeId} type="button" className="m-res" onClick={() => void pick(s)}>
            <Icon name="map-pin" size={20} color="var(--muted)" />
            <div className="m-t">
              <b>{s.primary}</b>
              {s.secondary && <span>{s.secondary}</span>}
            </div>
          </button>
        ))}
      </div>
      {error && (
        <span className="m-err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function ItemsPicker({ onPick, onType, onDone }: { onPick: (d: MerchantDishResponse) => void; onType: () => void; onDone: () => void }) {
  const [dishes, setDishes] = useState<MerchantDishResponse[] | null>(null);
  // MJ-RL8: a failed read is its own state, never "No items yet."
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    setDishes(null);
    listDishes()
      .then((ds) => setDishes(ds.filter((d) => !d.isDraft)))
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <b style={{ fontSize: 18 }}>Your items</b>
      <div style={{ maxHeight: "50dvh", overflowY: "auto" }}>
        {failed && <RetryableError message={ITEMS_LOAD_FAILED} onRetry={load} />}
        {dishes === null && !failed && <div className="m-hint">Loading…</div>}
        {dishes?.length === 0 && <div className="m-hint">No items yet.</div>}
        {dishes?.map((d) => (
          <button key={d.id} type="button" className="m-li" onClick={() => onPick(d)}>
            <div className="m-t">
              <b>{d.name}</b>
            </div>
            <b className="m-num">{money(d.priceUsd)}</b>
          </button>
        ))}
      </div>
      <button type="button" className="m-gh" onClick={onType}>
        <Icon name="plus" size={18} /> Type one
      </button>
      <button type="button" className="m-lnk" onClick={onDone}>
        Done
      </button>
    </>
  );
}

function TypeOne({ onAdd, onDone }: { onAdd: (l: BookLine) => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  function add(e: React.FormEvent) {
    e.preventDefault();
    const q = Number.parseInt(qty, 10);
    const p = parseAmountInput(price);
    if (!name.trim()) return setError("Say what it is.");
    if (!Number.isInteger(q) || q < 1 || q > 99) return setError("How many, from 1 to 99.");
    if (p === null) return setError("What one costs, in dollars, like 7.");
    onAdd({ name: name.trim(), qty: q, unitPrice: p });
  }
  return (
    <form onSubmit={add} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <b style={{ fontSize: 18 }}>Type an item</b>
      <div className="m-fld">
        <label htmlFor="line-name">What it is</label>
        <span className="m-in">
          <input id="line-name" value={name} maxLength={140} placeholder="e.g. Oil filter" onChange={(e) => setName(e.target.value)} />
        </span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="m-fld" style={{ flex: 1 }}>
          <label htmlFor="line-qty">How many</label>
          <span className="m-in">
            <input id="line-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </span>
        </div>
        <div className="m-fld" style={{ flex: 1 }}>
          <label htmlFor="line-price">Price of one ($)</label>
          <span className="m-in">
            <input id="line-price" inputMode="decimal" value={price} placeholder="7.00" onChange={(e) => setPrice(e.target.value)} />
          </span>
        </div>
      </div>
      {error && (
        <span className="m-err" role="alert">
          {error}
        </span>
      )}
      <button type="submit" className="m-btn">
        Add
      </button>
      <button type="button" className="m-lnk" onClick={onDone}>
        Done
      </button>
    </form>
  );
}
