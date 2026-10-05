"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isShortMapLink, type LatLng, type MerchantDishResponse, type MerchantProfileResponse, parseMapLocation } from "@lynia/shared";
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
import { bookingsAvailable, newIdempotencyKey, suggestedFare } from "../../../lib/booking";
import { createBooking, resolveMapLink } from "../../../lib/bookings-api";
import { primeBusiness } from "../../../lib/business";
import { getMerchantProfile, listDishes } from "../../../lib/menu-api";
import { parseAmountInput } from "../../../lib/money-input";
import { money } from "../../../lib/orders-view";
import { formatLocalDigits, localDigits } from "../../../lib/phone-input";
import { newSessionToken, pinnedLine, type PlaceSuggestion, resolvePlace, reverseGeocode, searchPlaces } from "../../../lib/places";

type Gate = { status: "loading" } | { status: "ready"; business: MerchantProfileResponse; pickup: LatLng } | { status: "no_pin" } | { status: "error"; message: string };
type Sheet = null | "items" | "type" | "terms";

const UNREADABLE_LINK = "We couldn't read a location from that link. Search for the street instead.";
/** A typed short link is resolved once typing stops; a paste lands whole, so it resolves right after. */
const RESOLVE_DELAY_MS = 400;

/** Send's liability terms, as the customer app shows them before a broadcast (DisclaimerSheet). */
const SEND_TERMS = [
  "Sending is at your own risk: if the order is lost, damaged or not delivered, LyniaGo isn't liable. You're hiring an independent rider.",
  "You agree the fare here and pay your rider cash at pickup. LyniaGo isn't involved in payment or any money dispute.",
  "LyniaGo connects you with a nearby rider. We don't carry, insure or guarantee the goods.",
];

/**
 * S4 · Book a rider, one screen (Merchant v2, packages/design/handoff/merchant-v2, ledger D-77; it
 * replaces D-48's two steps D2/D3). "Going to": an address search, or the location the buyer sent (a
 * Google Maps or WhatsApp link pasted into the same field), shown once picked as a mint pill; the
 * buyer's phone; "What's going · $51.00" as item chips with "+ Add" (from the shop's own items, or typed);
 * "Rider collects $51.00 · and brings it back to you"; the fare stepper with "Riders usually get $6–7";
 * then "Find a rider · $6.00". Riders' offers then use the Send v2 list, unchanged. The pickup is always
 * the business's own pin; everything is set before the broadcast, because riders have 90 seconds to offer.
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

  const pickup = gate.status === "ready" ? gate.pickup : null;
  const suggested = pickup && where ? suggestedFare(pickup, where.point) : null;
  const shownFare = fare ?? (suggested !== null ? startFare(suggested) : null);
  const pharmacy = gate.status === "ready" && gate.business.businessType === "shop" && gate.business.shopKind === "pharmacy";

  async function book() {
    if (submittingRef.current) return;
    const found = validateWhere(where, phone);
    setWhereErrors(found);
    const problem = validateWhat(lines, collectCash);
    setWhatError(problem);
    setBanner(null);
    if (Object.keys(found).length > 0 || problem || !where || shownFare === null) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const booking = await createBooking(toBookingRequest(where, phone, lines, shownFare, idempotencyKey.current, collectCash));
      router.replace(`/deliveries/${booking.id}`);
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setBanner(err instanceof ApiError ? err.message : "Couldn't book a rider. Try again.");
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }

  const shop = gate.status === "ready" && gate.business.businessType === "shop";

  return (
    <Kitchen active={shop ? "deliveries" : "queue"} tabs={false}>
      <div className="m-page">
        <AppBar back="/deliveries" title="Book a rider" />

        <div className="m-bd m-s4" style={{ gap: 14, paddingTop: 4 }}>
          {gate.status === "loading" && <div className="m-hint">Loading…</div>}
          {gate.status === "error" && <RetryableError message={gate.message} onRetry={() => void load()} />}
          {gate.status === "no_pin" && <p className="m-sub">Set your shop&apos;s location first, so riders know where to collect.</p>}

          {gate.status === "ready" && (
            <>
              <WhereSearch
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
                  <b>Rider collects {money(worth(lines))}</b>
                  <span>and brings it back to you</span>
                </div>
                <Switch checked={collectCash} label={`Rider collects ${money(worth(lines))}`} onChange={setCollectCash} />
              </div>

              {shownFare !== null && (
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
            <button type="button" className="m-lnk m-muted" style={{ textDecoration: "underline", fontWeight: 400, fontSize: 13 }} onClick={() => setSheet("terms")}>
              Booking terms
            </button>
            <button type="button" className="m-btn" disabled={busy || actionsDisabled} onClick={() => void book()}>
              {busy ? "Booking…" : shownFare !== null ? `Find a rider · ${money(shownFare)}` : "Find a rider"}
            </button>
          </div>
        )}
      </div>

      {sheet && (
        <div className="m-overlay" style={{ zIndex: 70 }}>
          <div className="m-overlay-frame">
            <button type="button" className="m-scrim" aria-label="Close" onClick={() => setSheet(null)} />
            <div className="m-sheet" role="dialog" aria-modal="true" aria-label={sheet === "items" ? "Your items" : sheet === "type" ? "Type an item" : "Booking terms"}>
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
              {sheet === "terms" && (
                <>
                  <b style={{ fontSize: 18 }}>Booking terms</b>
                  <ul className="m-sub" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                    {SEND_TERMS.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                    <li>No prescription medicine, weapons, drugs or cash.{pharmacy ? " Over-the-counter items only." : ""}</li>
                    <li>
                      {collectCash
                        ? "Cash on delivery: the rider collects what the goods are worth from the buyer and brings it back to you within 30 minutes. You confirm it in the app."
                        : "No cash-on-delivery: the rider collects nothing from the buyer. The buyer pays you as they do today."}
                    </li>
                  </ul>
                  <p className="m-hint">Booking a rider means you accept these.</p>
                  <button type="button" className="m-btn" onClick={() => setSheet(null)}>
                    OK
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Kitchen>
  );
}

/** D2's search: Places rows as you type, or a pasted location link read straight away. */
function WhereSearch({ value, error, signOut, onChange }: { value: Where | null; error?: string; signOut: () => void; onChange: (w: Where | null) => void }) {
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
      void searchPlaces(q, session.current).then((rows) => {
        if (alive) setResults(rows);
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

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
            setNote(err instanceof ApiError ? err.message : UNREADABLE_LINK);
          },
        );
      }, RESOLVE_DELAY_MS);
      return;
    }
    if (/https?:\/\//i.test(text)) setNote(UNREADABLE_LINK);
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
  useEffect(() => {
    listDishes()
      .then((ds) => setDishes(ds.filter((d) => !d.isDraft)))
      .catch(() => setDishes([]));
  }, []);
  return (
    <>
      <b style={{ fontSize: 18 }}>Your items</b>
      <div style={{ maxHeight: "50dvh", overflowY: "auto" }}>
        {dishes === null && <div className="m-hint">Loading…</div>}
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
