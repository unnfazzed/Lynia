"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAlarmController } from "../components/alarm-singleton";
import { AppBar } from "../components/m/AppBar";
import { MerchantLockup } from "../components/m/Wordmark";
import { ApiError, getMyMerchant, requestOtp, verifyOtp } from "../lib/api-client";
import { homePath } from "../lib/booking";
import { API_BASE_URL } from "../lib/config";
import { isSafeMerchantRedirectPath } from "../lib/merchant-access";
import { noBusinessPath } from "../lib/team-api";
import { formatLocalDigits, localDigits, RESEND_AFTER_S, toE164 } from "../lib/phone-input";

type Step = { kind: "phone" } | { kind: "code"; phone: string; deliveryChannel?: "whatsapp" | "sms" };

/** The per-device sign-up cap (the API's `device_signup_cap`: 3 new accounts per device per day). */
const DEVICE_CAP_MESSAGE = "This device has added 3 new people today. Sign in on your own phone, or try tomorrow.";

/**
 * A1 · Sign in and A2 · Code (packages/design/handoff/merchant-mobile). "LyniaGo Merchant" lockup, a
 * phone field with a fixed +263, "Send code" pinned at the bottom and the privacy line — the notice is
 * accepted once, here (README A1). Then six code boxes that sign in on the sixth digit, a resend
 * countdown and "Wrong number?". There is no alarm step (README global change 6): order alerts are
 * always on, and the Sign in tap still unlocks the browser's audio for them, silently.
 */
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // A ref, not `busy`: two taps in one tick both run the handler before React re-renders.
  const submittingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    // Keystrokes typed before hydration land in the DOM but not in state; pull them in once.
    const domValue = inputRef.current?.value ?? "";
    if (step.kind === "phone" && domValue && localDigits(domValue) !== digits) setDigits(localDigits(domValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate one-shot-per-step reconcile
  }, [step.kind]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setBusy(true);
    try {
      const phone = toE164(digits);
      const sent = await requestOtp(phone);
      setStep({ kind: "code", phone, deliveryChannel: sent.deliveryChannel });
      setCode("");
      setResendIn(RESEND_AFTER_S);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the code. Try again.");
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }

  async function signIn(value: string) {
    if (step.kind !== "code" || submittingRef.current || value.length !== 6) return;
    submittingRef.current = true;
    setError(null);
    setBusy(true);
    try {
      await verifyOtp(step.phone, value);
      // The tap (or the sixth digit) is the user gesture that lets the order alert play later.
      getAlarmController().arm();
      router.replace(await landingPath(searchParams.get("next")));
    } catch (err) {
      if (err instanceof ApiError && err.status === 429 && err.reason === "device_signup_cap") setError(DEVICE_CAP_MESSAGE);
      else setError(err instanceof ApiError ? err.message : "That code didn't work. Try again.");
      setBusy(false);
    } finally {
      submittingRef.current = false;
    }
  }

  function onCodeChange(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, 6);
    setCode(next);
    if (next.length === 6) void signIn(next);
  }

  function wrongNumber() {
    setStep({ kind: "phone" });
    setCode("");
    setError(null);
  }

  if (step.kind === "phone") {
    return (
      <div className="m-app">
        <form
          className="m-bd"
          style={{ flex: 1, padding: "40px 20px 20px", gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <MerchantLockup />
          <h1 className="m-h1" style={{ marginTop: 24 }}>
            Sign in
          </h1>
          <div className="m-fld">
            <label htmlFor="phone">Phone number</label>
            <div className="m-in">
              <b style={{ fontWeight: 600 }}>+263</b>
              <span style={{ width: 1, height: 22, background: "var(--line)" }} />
              <input
                id="phone"
                ref={inputRef}
                className="m-num"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                aria-label="Phone number"
                placeholder="77 123 4567"
                value={formatLocalDigits(digits)}
                onChange={(e) => setDigits(localDigits(e.target.value))}
              />
            </div>
          </div>
          {error && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <button type="submit" className="m-btn" disabled={busy || digits.length < 9}>
            {busy ? "Sending…" : "Send code"}
          </button>
          <p className="m-hint" style={{ textAlign: "center", margin: 0 }}>
            By continuing you accept the{" "}
            <a href={`${API_BASE_URL}/legal/privacy`} target="_blank" rel="noreferrer">
              privacy notice
            </a>
            .
          </p>
        </form>
      </div>
    );
  }

  const active = Math.min(code.length, 5);
  return (
    <div className="m-app">
      <AppBar onBack={wrongNumber} />
      <form
        className="m-bd"
        style={{ flex: 1, padding: "8px 20px 20px", gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          void signIn(code);
        }}
      >
        <div>
          <h1 className="m-h1">Enter the code</h1>
          <p className="m-sub" style={{ marginTop: 8 }}>
            Sent {step.deliveryChannel === "sms" ? "by SMS" : "on WhatsApp"} to <b style={{ color: "var(--ink)" }}>{formatE164(step.phone)}</b>
          </p>
        </div>
        <div className="m-code">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={i === active ? "m-f" : undefined}>
              {code[i] ?? ""}
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-label="6-digit code"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
          {resendIn > 0 ? (
            <span style={{ color: "var(--muted)" }}>
              Resend in <b className="m-num" style={{ color: "var(--ink)" }}>{`${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, "0")}`}</b>
            </span>
          ) : (
            <button type="button" className="m-lnk" style={{ fontSize: 13, justifyContent: "flex-start", margin: "-12px 0" }} disabled={busy} onClick={() => void sendCode()}>
              Resend code
            </button>
          )}
          <button type="button" className="m-lnk" style={{ fontSize: 13, margin: "-12px 0" }} onClick={wrongNumber}>
            Wrong number?
          </button>
        </div>
        {error && (
          <div className="m-alert" role="alert">
            {error}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button type="submit" className="m-btn" disabled={busy || code.length !== 6}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

/** "+263771234567" → "+263 77 123 4567". */
function formatE164(phone: string): string {
  return phone.startsWith("+263") ? `+263 ${formatLocalDigits(phone.slice(4))}` : phone;
}

/**
 * Where a fresh sign-in lands (merchant web upgrade L1). Membership is read, never the token's role: a
 * number that isn't on a business yet goes to Join when a team invited it (L4), otherwise to "Set up
 * your business"; a shop goes to its Orders home. Everyone else goes back to what they were opening
 * (`next`), or to Orders. If the check itself fails, fall through to the normal landing, whose own
 * load shows the error with a Retry.
 */
async function landingPath(next: string | null): Promise<string> {
  // CWE-601 guard: `next` is attacker-controllable — only ever follow it back to an in-app path.
  const fallback = isSafeMerchantRedirectPath(next) ? next : "/queue";
  try {
    const merchant = await getMyMerchant();
    return merchant.businessType === "shop" ? homePath(merchant) : fallback;
  } catch (err) {
    return err instanceof ApiError && err.status === 403 ? await noBusinessPath() : fallback;
  }
}
