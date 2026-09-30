"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MerchantBusinessType } from "@lynia/shared";
import { Icon } from "../components/icons";
import { AppBar } from "../components/m/AppBar";
import { useToast } from "../components/m/Toast";
import { RetryableError } from "../components/RetryableError";
import { ApiError, becomeMerchant, getMyAccount, getMyMerchant } from "../lib/api-client";
import { homePath } from "../lib/booking";
import { newSessionToken, type PlaceSuggestion, placesEnabled, resolvePlace, reverseGeocode, searchPlaces } from "../lib/places";
import { clearMerchantSession } from "../lib/session";
import { fieldForReason, type SignUpErrors, type SignUpForm, type SignUpLocation, toBecomeRequest, validateDetails } from "../lib/sign-up";
import { noBusinessPath } from "../lib/team-api";

type Gate = { status: "checking" } | { status: "form" } | { status: "error"; message: string };

const EMPTY_FORM: SignUpForm = { businessType: null, ownerName: "", name: "", location: null, contactPhone: "" };

/**
 * A3 · What do you sell? and A4 · Your business (packages/design/handoff/merchant-mobile, ledger D-48)
 * — what a signed-in number that isn't on a business sees. Two steps: restaurant or shop, then the
 * business name, your name and where it is: "Use my current location" (GPS, named by a reverse
 * lookup) or "Or search street or area" (Google Places). No map pin, no landmark, no contact-phone
 * field (it is the sign-in number) and no privacy tick (accepted on the sign-in screen). It creates the
 * business and the caller's owner membership in one call (`POST /merchant/become`), then goes home.
 *
 * Outside the `(app)` group on purpose: no tab bar and no queue socket, because the person isn't on a
 * business yet.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [gate, setGate] = useState<Gate>({ status: "checking" });
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<SignUpForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

  const signOut = useCallback(() => {
    clearMerchantSession();
    router.replace("/login");
  }, [router]);

  const check = useCallback(() => {
    let cancelled = false;
    setGate({ status: "checking" });
    getMyMerchant()
      .then((merchant) => {
        // Already on a business (a bookmark, or the back button after signing up): go to its home.
        if (!cancelled) router.replace(homePath(merchant));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          // A team's invite for this number shows Join instead, unless the person chose "Start my own
          // business" there (`?own=1`).
          const own = new URLSearchParams(window.location.search).get("own") === "1";
          if (!own) {
            void noBusinessPath().then((path) => {
              if (cancelled) return;
              if (path === "/join") router.replace("/join");
              else showForm();
            });
            return;
          }
          showForm();
        } else if (err instanceof ApiError && err.status === 401) {
          signOut();
        } else {
          setGate({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your account." });
        }
      });

    function showForm() {
      setGate({ status: "form" });
      // Your name and the contact phone come from the person's own account. Best effort.
      getMyAccount()
        .then((me) => {
          if (cancelled) return;
          const fullName = `${me.firstName} ${me.lastName}`.trim();
          setForm((f) => ({ ...f, ownerName: f.ownerName || fullName, contactPhone: f.contactPhone || me.phone }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [router, signOut]);

  useEffect(() => check(), [check]);

  function update<K extends keyof SignUpForm>(key: K, value: SignUpForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    const found = validateDetails(form);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const merchant = await becomeMerchant(toBecomeRequest(form));
      toast("Business created");
      router.replace(homePath(merchant));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.reason === "already_member") {
        // A retry whose first answer was lost: the business exists, so carry on to it.
        router.replace(form.businessType === "shop" ? "/deliveries" : "/queue");
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        signOut();
        return;
      }
      const field = err instanceof ApiError ? fieldForReason(err.reason) : null;
      if (field) setErrors((prev) => ({ ...prev, [field]: err instanceof ApiError ? err.message : "" }));
      else setBanner(err instanceof ApiError ? err.message : "Couldn't set up your business. Try again.");
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }

  if (gate.status === "checking") {
    return <div className="m-app" aria-busy="true" />;
  }
  if (gate.status === "error") {
    return (
      <div className="m-app">
        <div className="m-bd" style={{ padding: "40px 20px" }}>
          <RetryableError message={gate.message} onRetry={check} />
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="m-app">
        <AppBar onBack={signOut} center title="Step 1 of 2" />
        <div className="m-bd" style={{ flex: 1, padding: "4px 20px 20px", gap: 14 }}>
          <div className="m-prog">
            <i className="m-on" />
            <i />
          </div>
          <h1 className="m-h1" style={{ marginTop: 8 }}>
            What do you sell?
          </h1>
          <div role="radiogroup" aria-label="What do you sell?" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <TypeCard type="restaurant" picked={form.businessType} onPick={(t) => update("businessType", t)} />
            <TypeCard type="shop" picked={form.businessType} onPick={(t) => update("businessType", t)} />
          </div>
          <div style={{ flex: 1 }} />
          <Link href="/join" className="m-lnk" style={{ fontSize: 13 }}>
            Joining a team instead?
          </Link>
          <button type="button" className="m-btn" disabled={!form.businessType} onClick={() => setStep(2)}>
            Next
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="m-app">
      <AppBar onBack={() => setStep(1)} center title="Step 2 of 2" />
      <form className="m-bd" style={{ flex: 1, padding: "4px 20px 20px", gap: 14, overflowY: "auto" }} onSubmit={submit} noValidate>
        <div className="m-prog">
          <i className="m-on" />
          <i className="m-on" />
        </div>
        <h1 className="m-h1" style={{ marginTop: 6 }}>
          Your business
        </h1>
        <TextField id="biz-name" label="Business name" value={form.name} error={errors.name} autoComplete="organization" onChange={(v) => update("name", v)} />
        <TextField id="owner-name" label="Your name" value={form.ownerName} error={errors.ownerName} autoComplete="name" onChange={(v) => update("ownerName", v)} />
        <LocationField
          value={form.location}
          error={errors.location}
          onChange={(loc) => {
            update("location", loc);
            setBanner(null);
          }}
        />
        {banner && (
          <div className="m-alert" role="alert">
            {banner}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button type="submit" className="m-btn" disabled={busy}>
          {busy ? "Creating…" : "Create my business"}
        </button>
      </form>
    </div>
  );
}

function TypeCard({ type, picked, onPick }: { type: MerchantBusinessType; picked: MerchantBusinessType | null; onPick: (t: MerchantBusinessType) => void }) {
  const restaurant = type === "restaurant";
  return (
    <button type="button" role="radio" aria-checked={picked === type} className="m-opt" style={{ minHeight: 84 }} onClick={() => onPick(type)}>
      <span className={`m-th ${restaurant ? "m-tile-food" : "m-tile-shop"}`} style={{ width: 56, height: 56 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static illustrations from /public */}
        <img src={restaurant ? "/brand/food.svg" : "/brand/biz-small-business.svg"} alt="" style={{ width: restaurant ? 44 : 52 }} />
      </span>
      <b style={{ fontSize: 16, flex: 1 }}>{restaurant ? "Restaurant" : "Shop"}</b>
      <span className="m-rad" />
    </button>
  );
}

function TextField({
  id,
  label,
  value,
  error,
  autoComplete,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  autoComplete?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="m-fld">
      <label htmlFor={id}>{label}</label>
      <div className="m-in" data-invalid={error ? true : undefined}>
        <input id={id} value={value} autoComplete={autoComplete} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />
      </div>
      {error && <span className="m-err">{error}</span>}
    </div>
  );
}

/**
 * A4's location: the result card once there is one (map pin, the address line, where it came from,
 * "Change"), and under it, always, the two ways in — "Use my current location" and "Or search street
 * or area" — as drawn.
 */
function LocationField({ value, error, onChange }: { value: SignUpLocation | null; error?: string; onChange: (loc: SignUpLocation | null) => void }) {
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const session = useRef(newSessionToken());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return undefined;
    }
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

  function locate() {
    setNote(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNote("This phone can't share its location. Search for your street instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        void reverseGeocode(point).then((place) => {
          setLocating(false);
          onChange({ point, address: place?.address ?? "", source: "gps" });
        });
      },
      () => {
        setLocating(false);
        setNote("Couldn't get your location. Search for your street instead.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  async function pick(s: PlaceSuggestion) {
    const place = await resolvePlace(s, session.current);
    session.current = newSessionToken();
    if (!place) {
      setNote("Couldn't find that place. Try another search.");
      return;
    }
    setQuery("");
    setResults([]);
    onChange({ point: place.point, address: place.address || s.primary, source: "search" });
  }

  return (
    <div className="m-fld">
      <span className="m-label">Location</span>
      {value && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: "2px solid var(--accent)",
            background: "var(--accent-wash)",
            borderRadius: 12,
            padding: "10px 14px",
          }}
        >
          <Icon name="map-pin" size={18} color="var(--accent-text)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 14.5, display: "block" }}>{value.address || "Your current location"}</b>
            <span className="m-hint">{value.source === "gps" ? "From your phone’s location" : "From your search"}</span>
          </div>
          {/* "Change" = search for a different address (proto.js A4). */}
          <button
            type="button"
            className="m-lnk"
            style={{ minHeight: 36, fontSize: 13 }}
            onClick={() => (searchRef.current ? searchRef.current.focus() : onChange(null))}
          >
            Change
          </button>
        </div>
      )}
      <button type="button" className="m-gh" style={{ width: "100%" }} disabled={locating} onClick={locate}>
        <Icon name="navigation" size={16} />
        {locating ? "Finding you…" : "Use my current location"}
      </button>
      {placesEnabled() && (
        <div className="m-in">
          <Icon name="search" size={16} color="var(--muted)" />
          <input
            ref={searchRef}
            aria-label="Search street or area"
            placeholder="Or search street or area"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      {results.length > 0 && (
        <div className="m-card" style={{ padding: "0 14px", gap: 0 }}>
          {results.map((r) => (
            <button key={r.placeId} type="button" className="m-li" onClick={() => void pick(r)}>
              <Icon name="map-pin" size={16} color="var(--muted)" />
              <div className="m-t">
                <b>{r.primary}</b>
                {r.secondary && <span>{r.secondary}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
      {note && <span className="m-hint">{note}</span>}
      {error && <span className="m-err">{error}</span>}
    </div>
  );
}
