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
import { newSessionToken, type PlaceSuggestion, resolvePlace, searchPlaces } from "../../../lib/places";

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
 * D2 · Book · where and D3 · Book · what + fare (packages/design/handoff/merchant-mobile, ledger D-48).
 * Step 1: "Where is it going?" — an address search whose results are rows (the picked one mint, with a
 * check); a location the buyer sent (a Google Maps or WhatsApp link) pasted into the same field works
 * too — and the buyer's phone. Step 2: the items (from the shop's own list or typed), "Worth" summed
 * from them, the fare stepper (± $0.50, from $1.50) with "Typical $3–4", "Booking terms" and "Find a
 * rider · $3.50". The pickup is always the business's own pin; everything is set before the broadcast,
 * because riders have 90 seconds to offer.
 */
export default function NewBookingPage() {
  const router = useRouter();
  const { signOut, actionsDisabled } = useKitchenConnection();
  const [gate, setGate] = useState<Gate>({ status: "loading" });
  const [step, setStep] = useState<1 | 2>(1);
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

  function next() {
    const found = validateWhere(where, phone);
    setWhereErrors(found);
    if (Object.keys(found).length === 0) setStep(2);
  }

  async function book() {
    if (submittingRef.current || !where || shownFare === null) return;
    const problem = validateWhat(lines, collectCash);
    setWhatError(problem);
    setBanner(null);
    if (problem) return;
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
        {step === 1 ? (
          <AppBar back="/deliveries" title="Book a rider" right={<span className="m-hint">1 of 2</span>} />
        ) : (
          <AppBar onBack={() => setStep(1)} title="What’s going?" right={<span className="m-hint">2 of 2</span>} />
        )}

        <div className="m-bd" style={{ gap: 14 }}>
          {gate.status === "loading" && <div className="m-hint">Loading…</div>}
          {gate.status === "error" && <RetryableError message={gate.message} onRetry={() => void load()} />}
          {gate.status === "no_pin" && <p className="m-sub">Set your shop&apos;s location first, so riders know where to collect.</p>}

          {gate.status === "ready" && step === 1 && (
            <>
              <h1 className="m-h1">Where is it going?</h1>
              <WhereSearch value={where} error={whereErrors.where} signOut={signOut} onChange={(w) => {
                setWhere(w);
                setFare(null);
                setWhereErrors((e) => ({ ...e, where: undefined }));
              }} />
              <div className="m-fld">
                <label htmlFor="buyer-phone">Buyer’s phone</label>
                <span className="m-in" data-invalid={!!whereErrors.phone}>
                  <b style={{ fontSize: 16 }}>+263</b>
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
            </>
          )}

          {gate.status === "ready" && step === 2 && (
            <>
              <div className="m-fld">
                <span className="m-label">Items · {lines.length}</span>
                {lines.length > 0 && (
                  <div className="m-card" style={{ padding: "0 14px", gap: 0 }}>
                    {lines.map((l, i) => (
                      <div key={`${l.name}-${i}`} className="m-li" style={{ minHeight: 56 }}>
                        <b className="m-num" style={{ width: 28, fontSize: 15 }}>
                          {l.qty}×
                        </b>
                        <div className="m-t">
                          <b>{l.name}</b>
                          <span className="m-num">{money(l.qty * l.unitPrice)}</span>
                        </div>
                        <button type="button" className="m-back" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                          <Icon name="x" size={18} color="var(--muted)" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="m-gh" style={{ flex: 1 }} onClick={() => setSheet("items")}>
                    <Icon name="package" size={18} /> From your items
                  </button>
                  <button type="button" className="m-gh" style={{ flex: 1 }} onClick={() => setSheet("type")}>
                    <Icon name="plus" size={18} /> Type one
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <b style={{ fontSize: 15 }}>Worth</b>
                <b className="m-num" style={{ fontSize: 18 }}>
                  {money(worth(lines))}
                </b>
              </div>

              <div className="m-card" style={{ flexDirection: "row", alignItems: "center", padding: "10px 14px" }}>
                <div style={{ flex: 1 }}>
                  <b style={{ display: "block", fontSize: 15 }}>Buyer pays cash on delivery</b>
                  <span className="m-hint" style={{ display: "block", lineHeight: 1.35, marginTop: 2 }}>
                    {collectCash ? `The rider collects ${money(worth(lines))} and brings it back to you` : "Off: the buyer pays you as they do today"}
                  </span>
                </div>
                <Switch checked={collectCash} label="Buyer pays cash on delivery" onChange={setCollectCash} />
              </div>

              {shownFare !== null && (
                <div className="m-fld">
                  <span className="m-label">Fare you offer</span>
                  <div className="m-card m-fare">
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
          <div className="m-foot" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {step === 1 ? (
              <button type="button" className="m-btn" onClick={next}>
                Next
              </button>
            ) : (
              <>
                <button type="button" className="m-lnk m-muted" style={{ textDecoration: "underline", fontWeight: 400 }} onClick={() => setSheet("terms")}>
                  Booking terms
                </button>
                <button type="button" className="m-btn" disabled={busy || actionsDisabled} onClick={() => void book()}>
                  {busy ? "Booking…" : `Find a rider · ${money(shownFare)}`}
                </button>
              </>
            )}
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
  const [picked, setPicked] = useState<string | null>(null);
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

  function type(text: string) {
    setQuery(text);
    setNote(null);
    const seq = ++linkSeq.current;
    const direct = parseMapLocation(text);
    if (direct) {
      setResults([]);
      setPicked("link");
      onChange({ point: direct, address: "The location the buyer sent" });
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
            setPicked("link");
            onChange({ point, address: "The location the buyer sent" });
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
    const place = await resolvePlace(s, session.current);
    session.current = newSessionToken();
    if (!place) {
      setNote("Couldn't find that place. Try another search.");
      return;
    }
    setPicked(s.placeId);
    onChange({ point: place.point, address: [s.primary, s.secondary].filter(Boolean).join(", ") || place.address });
  }

  return (
    <div className="m-fld">
      <label className="m-in m-srch-g" data-invalid={!!error}>
        <Icon name="search" size={20} color="var(--muted)" />
        <input
          aria-label="Search street or area, or paste the buyer's location"
          placeholder="Search street or area"
          value={query}
          onChange={(e) => type(e.target.value)}
        />
      </label>
      {note && <span className="m-hint">{note}</span>}
      <div>
        {picked === "link" && value && (
          <div className="m-res" aria-current="true">
            <Icon name="map-pin" size={20} color="var(--accent-text)" />
            <div className="m-t">
              <b>{value.address}</b>
              <span className="m-num">
                {value.point.lat.toFixed(5)}, {value.point.lng.toFixed(5)}
              </span>
            </div>
            <Icon name="check" size={20} color="var(--accent-text)" />
          </div>
        )}
        {results.map((s) => {
          const on = picked === s.placeId;
          return (
            <button key={s.placeId} type="button" className="m-res" aria-current={on || undefined} onClick={() => void pick(s)}>
              <Icon name="map-pin" size={20} color={on ? "var(--accent-text)" : "var(--muted)"} />
              <div className="m-t">
                <b>{s.primary}</b>
                {s.secondary && <span>{s.secondary}</span>}
              </div>
              {on && <Icon name="check" size={20} color="var(--accent-text)" />}
            </button>
          );
        })}
      </div>
      {error && (
        <span className="m-err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function ItemsPicker({ onPick, onDone }: { onPick: (d: MerchantDishResponse) => void; onDone: () => void }) {
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
        {dishes?.length === 0 && <div className="m-hint">No items yet. Type one instead.</div>}
        {dishes?.map((d) => (
          <button key={d.id} type="button" className="m-li" onClick={() => onPick(d)}>
            <div className="m-t">
              <b>{d.name}</b>
            </div>
            <b className="m-num">{money(d.priceUsd)}</b>
          </button>
        ))}
      </div>
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
