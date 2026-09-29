"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MerchantBusinessType } from "@lynia/shared";
import { formatPhoneLocal } from "@lynia/shared";
import { Icon, type IconName } from "../components/icons";
import { LocationPin } from "../components/LocationPin";
import { RetryableError } from "../components/RetryableError";
import { disabledStyle, ghostButtonStyle, primaryButtonStyle } from "../components/queue/styles";
import { ApiError, becomeMerchant, getMyAccount, getMyMerchant } from "../lib/api-client";
import { homePath } from "../lib/booking";
import { noBusinessPath } from "../lib/team-api";
import { API_BASE_URL } from "../lib/config";
import { HARARE_CBD, insideServiceArea } from "../lib/geo";
import { clearMerchantSession } from "../lib/session";
import {
  fieldForReason,
  OUTSIDE_AREA_MESSAGE,
  SHOP_KINDS,
  shopKindLabel,
  type SignUpErrors,
  type SignUpForm,
  toBecomeRequest,
  typeStepComplete,
  validateDetails,
} from "../lib/sign-up";

/** A fix this precise is taken as the merchant's door; anything looser only centres the map. */
const CONFIRMING_ACCURACY_M = 100;

type Gate = { status: "checking" } | { status: "form" } | { status: "error"; message: string };
type Locating = { status: "idle" } | { status: "locating" } | { status: "note"; message: string };

const EMPTY_FORM: SignUpForm = {
  businessType: null,
  shopKind: null,
  ownerName: "",
  name: "",
  point: HARARE_CBD,
  pinConfirmed: false,
  landmark: "",
  contactPhone: "",
  termsAccepted: false,
};

/**
 * "Set up your business" (merchant web upgrade L1.4) — what a signed-in number that isn't on a business
 * sees, replacing the old "this number isn't a merchant, contact support" dead end. Two steps: what you
 * sell, then your name, the business name, a confirmed map pin, a landmark, the contact phone and the
 * privacy line. It creates the business and the caller's owner membership in one call
 * (`POST /merchant/become`), then lands on the type-aware `/setup`.
 *
 * Undrawn in the RM mocks, so it is built from the RM primitives (the login card, pill buttons, the
 * option-row pattern) and ledgered as D-43 (docs/DESIGN-DEVIATIONS.md).
 *
 * Outside the `(app)` group on purpose: it has no kitchen chrome, no alarm and no queue socket, because
 * the person isn't on a business yet.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>({ status: "checking" });
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<SignUpForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState<Locating>({ status: "idle" });
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
          // L4: a team's invite for this number shows Join instead, unless the person chose "Set up my
          // own business" there (`?own=1`).
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
      // Prefill from the person's own LyniaGo account. Best effort: the form works without it.
      getMyAccount()
        .then((me) => {
          if (cancelled) return;
          const fullName = `${me.firstName} ${me.lastName}`.trim();
          setForm((f) => ({
            ...f,
            ownerName: f.ownerName || fullName,
            contactPhone: f.contactPhone || formatPhoneLocal(me.phone),
          }));
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

  function pickType(businessType: MerchantBusinessType) {
    setForm((f) => ({ ...f, businessType, shopKind: businessType === "shop" ? f.shopKind : null }));
  }

  function movePin(point: typeof form.point) {
    setForm((f) => ({ ...f, point, pinConfirmed: true }));
    setErrors((e) => ({ ...e, point: undefined }));
    if (locating.status === "note") setLocating({ status: "idle" });
  }

  function locateMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocating({ status: "note", message: "This browser can't share your location. Drag the map instead." });
      return;
    }
    setLocating({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const precise = pos.coords.accuracy <= CONFIRMING_ACCURACY_M;
        setForm((f) => ({ ...f, point, pinConfirmed: precise }));
        setErrors((e) => ({ ...e, point: undefined }));
        setLocating(
          precise
            ? { status: "idle" }
            : {
                status: "note",
                message: `Your location is only accurate to about ${formatDistance(pos.coords.accuracy)}. Drag the map until the pin sits on your door.`,
              },
        );
      },
      () => setLocating({ status: "note", message: "Couldn't get your location. Drag the map until the pin sits on your door." }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
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
      await becomeMerchant(toBecomeRequest(form));
      router.replace("/setup");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.reason === "already_member") {
        // A retry of a sign-up whose answer was lost: the business exists, so carry on to it.
        router.replace("/setup");
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

  const outside = form.pinConfirmed && !insideServiceArea(form.point);

  return (
    <div className="onboarding-screen">
      <div className="onboarding-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static brand SVG from /public */}
          <img src="/brand/lyniago-mark.svg" alt="" width={32} height={32} />
          <span style={{ fontFamily: "var(--font-wordmark)", fontSize: 22, fontWeight: 600 }}>
            Lynia<span style={{ color: "var(--accent-700)" }}>Go</span>
          </span>
        </div>

        {gate.status === "checking" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading…</div>}

        {gate.status === "error" && <RetryableError message={gate.message} onRetry={check} />}

        {gate.status === "form" && step === 1 && (
          <div>
            <h1 style={titleStyle}>Set up your business</h1>
            <div style={subStyle}>What do you sell?</div>

            <div role="radiogroup" aria-label="What do you sell?" style={{ display: "grid", gap: 10 }}>
              <TypeOption
                icon="utensils"
                title="Restaurant"
                line="Cooked food. Customers order from your menu."
                selected={form.businessType === "restaurant"}
                onSelect={() => pickType("restaurant")}
              />
              <TypeOption
                icon="store"
                title="Shop"
                line="Pharmacy, groceries, clothes, car parts and more."
                selected={form.businessType === "shop"}
                onSelect={() => pickType("shop")}
              />
            </div>

            {form.businessType === "shop" && (
              <div style={{ marginTop: 18 }}>
                <div id="shop-kind-label" style={labelStyle}>
                  What kind of shop?
                </div>
                <div role="radiogroup" aria-labelledby="shop-kind-label" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SHOP_KINDS.map(({ kind, label }) => (
                    <KindChip key={kind} label={label} selected={form.shopKind === kind} onSelect={() => update("shopKind", kind)} />
                  ))}
                </div>
                {form.shopKind === "pharmacy" && (
                  <div style={{ ...noteStyle, marginTop: 12 }}>Over-the-counter products only for now.</div>
                )}
              </div>
            )}

            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 16, lineHeight: 1.45 }}>
              You can't switch between restaurant and shop later. LyniaGo support can change it for you.
            </div>
            {/* L4 (design doc L1.4): staff don't set up a business, their owner adds them. */}
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.45 }}>
              Work at a business that&apos;s already on LyniaGo? Ask the owner to add you in <b>Team</b>.
            </div>

            <button
              type="button"
              disabled={!typeStepComplete(form)}
              onClick={() => setStep(2)}
              style={{ ...primaryWideStyle, marginTop: 16, ...disabledStyle(!typeStepComplete(form)) }}
            >
              Next
            </button>
            <SignOutLine onSignOut={signOut} />
          </div>
        )}

        {gate.status === "form" && step === 2 && (
          <form onSubmit={submit} noValidate>
            <button type="button" onClick={() => setStep(1)} style={backLinkStyle}>
              <Icon name="chevron-left" size={16} /> Back
            </button>
            <h1 style={titleStyle}>Your business</h1>
            <div style={subStyle}>
              {form.businessType === "shop" && form.shopKind ? `${shopKindLabel(form.shopKind)} · Shop` : "Restaurant"}
            </div>

            <Field id="owner-name" label="Your name" error={errors.ownerName}>
              <input
                id="owner-name"
                value={form.ownerName}
                onChange={(e) => update("ownerName", e.target.value)}
                autoComplete="name"
                maxLength={60}
                aria-invalid={!!errors.ownerName}
                style={inputStyle}
              />
            </Field>

            <Field id="business-name" label="Business name" error={errors.name}>
              <input
                id="business-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                autoComplete="organization"
                maxLength={120}
                placeholder={form.businessType === "shop" ? "e.g. Mbare Auto Spares" : "e.g. Mai Tino's Kitchen"}
                aria-invalid={!!errors.name}
                style={inputStyle}
              />
            </Field>

            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>Where are you?</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
                Drag the map until the pin sits on your door.
              </div>
              <LocationPin value={form.point} onMove={movePin} label="Your business on the map. Use the arrow keys to move it." />
              <button
                type="button"
                onClick={locateMe}
                disabled={locating.status === "locating"}
                style={{ ...ghostButtonStyle, marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8, ...disabledStyle(locating.status === "locating") }}
              >
                <Icon name="locate" size={17} />
                {locating.status === "locating" ? "Finding you…" : "Use my location"}
              </button>
              {locating.status === "note" && <div style={{ ...noteStyle, marginTop: 10 }}>{locating.message}</div>}
              {(errors.point || outside) && (
                <div role="alert" style={fieldErrorStyle}>
                  {errors.point ?? OUTSIDE_AREA_MESSAGE}
                </div>
              )}
            </div>

            <Field id="landmark" label="A landmark riders look for" error={errors.landmark}>
              <input
                id="landmark"
                value={form.landmark}
                onChange={(e) => update("landmark", e.target.value)}
                maxLength={160}
                placeholder="e.g. Next to the Total garage, blue gate"
                aria-invalid={!!errors.landmark}
                style={inputStyle}
              />
            </Field>

            <Field id="contact-phone" label="Contact phone" hint="Riders call this number when they arrive." error={errors.contactPhone}>
              <input
                id="contact-phone"
                type="tel"
                inputMode="tel"
                value={form.contactPhone}
                onChange={(e) => update("contactPhone", e.target.value)}
                autoComplete="tel"
                maxLength={20}
                placeholder="0771234567"
                aria-invalid={!!errors.contactPhone}
                style={inputStyle}
              />
            </Field>

            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.45, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.termsAccepted}
                onChange={(e) => update("termsAccepted", e.target.checked)}
                style={{ width: 22, height: 22, margin: 0, flexShrink: 0, accentColor: "var(--cta-fill)" }}
              />
              <span>
                I accept LyniaGo's{" "}
                <a href={`${API_BASE_URL}/legal/privacy`} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)", fontWeight: 600 }}>
                  privacy notice
                </a>
                .
              </span>
            </label>
            {errors.termsAccepted && (
              <div role="alert" style={fieldErrorStyle}>
                {errors.termsAccepted}
              </div>
            )}

            {banner && (
              <div role="alert" style={bannerStyle}>
                {banner}
              </div>
            )}

            <button type="submit" disabled={busy} style={{ ...primaryWideStyle, marginTop: 18, ...disabledStyle(busy) }}>
              {busy ? "Setting up…" : "Create my business"}
            </button>
            <SignOutLine onSignOut={signOut} />
          </form>
        )}
      </div>
    </div>
  );
}

function formatDistance(metres: number): string {
  return metres >= 1000 ? `${Math.round(metres / 100) / 10} km` : `${Math.round(metres / 10) * 10} m`;
}

function TypeOption({
  icon,
  title,
  line,
  selected,
  onSelect,
}: {
  icon: IconName;
  title: string;
  line: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 13,
        width: "100%",
        minHeight: "var(--target-primary)",
        padding: 14,
        textAlign: "left",
        borderRadius: 14,
        border: `1.5px solid ${selected ? "var(--accent)" : "var(--line)"}`,
        background: selected ? "var(--accent-wash)" : "var(--bg)",
        color: "var(--ink)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: selected ? "var(--bg)" : "var(--surface)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={20} color={selected ? "var(--accent-text)" : "var(--muted)"} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>{line}</span>
      </span>
      {selected && <Icon name="circle-check" size={20} color="var(--accent-text)" />}
    </button>
  );
}

function KindChip({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        minHeight: "var(--target-min)",
        padding: "0 16px",
        borderRadius: "var(--radius-pill)",
        border: `1.5px solid ${selected ? "var(--accent)" : "var(--line)"}`,
        background: selected ? "var(--accent-wash)" : "var(--bg)",
        color: selected ? "var(--accent-text)" : "var(--ink)",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {hint && <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>{hint}</div>}
      {children}
      {error && (
        <div role="alert" style={fieldErrorStyle}>
          {error}
        </div>
      )}
    </div>
  );
}

function SignOutLine({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
      Wrong number?{" "}
      <button type="button" onClick={onSignOut} style={{ ...inlineLinkStyle }}>
        Sign out
      </button>
    </div>
  );
}

const titleStyle: React.CSSProperties = { fontSize: 22, fontWeight: 800, margin: 0 };
const subStyle: React.CSSProperties = { fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 16 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 };

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 52,
  fontSize: 16,
  padding: "0 14px",
  borderRadius: "var(--radius-input)",
  border: "1.5px solid var(--line)",
  fontFamily: "inherit",
  background: "var(--bg)",
  color: "var(--ink)",
};

// The one primary per step: full width at the 52px primary height (--target-primary), like the
// login card's own button.
const primaryWideStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  width: "100%",
  height: "var(--target-primary)",
  padding: "0 16px",
  fontSize: 16,
};

const noteStyle: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.45,
  color: "var(--highlight-ink)",
  background: "var(--highlight-wash)",
  border: "1px solid var(--highlight-border)",
  borderRadius: 10,
  padding: "9px 12px",
};

const fieldErrorStyle: React.CSSProperties = { fontSize: 12.5, color: "var(--danger-ink)", marginTop: 6 };

const bannerStyle: React.CSSProperties = {
  color: "var(--danger-ink)",
  background: "var(--danger-wash)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  marginTop: 14,
};

const backLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  minHeight: "var(--target-min)",
  padding: "0 8px 0 0",
  marginBottom: 4,
  border: "none",
  background: "none",
  color: "var(--accent-text)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const inlineLinkStyle: React.CSSProperties = {
  minHeight: "var(--target-min)",
  padding: "0 4px",
  border: "none",
  background: "none",
  color: "var(--accent-text)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
