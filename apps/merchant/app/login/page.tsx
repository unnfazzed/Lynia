"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAlarmController } from "../components/alarm-singleton";
import { AppBar } from "../components/m/AppBar";
import { MerchantLockup } from "../components/m/Wordmark";
import { ApiError, getMyMerchant, requestOtp, verifyOtp } from "../lib/api-client";
import { homePath } from "../lib/booking";
import { API_BASE_URL } from "../lib/config";
import { isSafeMerchantRedirectPath } from "../lib/merchant-access";
import { otpErrorMessage } from "../lib/otp-message";
import { takeSignOutNotice } from "../lib/session";
import { noBusinessPath } from "../lib/team-api";
import { useStepBack } from "../lib/use-step-back";
import { formatLocalDigits, localDigits, RESEND_AFTER_S, toE164 } from "../lib/phone-input";

type Step = { kind: "phone" } | { kind: "code"; phone: string; deliveryChannel?: "whatsapp" | "sms" };

/** The per-device sign-up cap (the API's `device_signup_cap`: 3 new accounts per device per day). */
const DEVICE_CAP_MESSAGE = "This device has added 3 new people today. Sign in on your own phone, or try tomorrow.";

/** MJ-L2 (ledger D-90): why the app signed someone out — the owner took them off the team. */
const REMOVED_MESSAGE = "You’re no longer on the team. Ask the owner to add you again.";

/**
 * D-113 (owner, 2026-10-18): A1 draws no way in for a business that isn't on LyniaGo yet, so a new owner
 * never learns that the same phone and code create the account. "Create an account" is the same two steps
 * with its own words; after the code a number with no business lands on "What do you sell?" as before.
 * `/login?new=1` opens it directly, for links from the website or WhatsApp.
 */
const CREATE = {
  title: "Create your business account",
  sub: "Enter your phone number. We’ll send you a code, then you’ll set up your business.",
  toCreate: "New business? Create an account",
  toSignIn: "Already on LyniaGo? Sign in",
  submit: "Continue",
} as const;

/**
 * A1 · Sign in and A2 · Code (packages/design/handoff/merchant-mobile). "LyniaGo Merchant" lockup, a
 * phone field with a fixed +263, "Send code" pinned at the bottom and the privacy line — the notice is
 * accepted once, here (README A1). Then six code boxes that sign in on the sixth digit, a resend
 * countdown and "Wrong number?". There is no alarm step (README global change 6): order alerts are
 * always on, and the Sign in tap still unlocks the browser's audio for them, silently.
 */
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // A ref, not `busy`: two taps in one tick both run the handler before React re-renders.
  const submittingRef = useRef(false);
  // MJ-M9: the code step is its own history entry, so Back returns to the number instead of leaving.
  const codeStep = useStepBack(step.kind === "code", () => {
    setStep({ kind: "phone" });
    setCode("");
    setError(null);
  });

  // MJ-L2: a person the owner took off the team lands here signed out; say why, once.
  useEffect(() => {
    if (takeSignOutNotice() === "removed") setError(REMOVED_MESSAGE);
  }, []);

  // D-113: read once on mount, not with useSearchParams (that would keep this page out of the static HTML).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") setCreating(true);
  }, []);

  function switchMode(create: boolean) {
    setCreating(create);
    setError(null);
    const url = new URL(window.location.href);
    if (create) url.searchParams.set("new", "1");
    else url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url);
    inputRef.current?.focus();
  }

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
      // MJ-L10: the five-an-hour cap says how long to wait.
      setError(otpErrorMessage(err, "Couldn't send the code. Try again."));
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
      // Read at sign-in, not with useSearchParams: that would keep this page out of the static HTML, and
      // sign-in is the one page that should paint before the JS runs (docs/MERCHANT-WEB.md).
      const landing = await landingPath(new URLSearchParams(window.location.search).get("next"));
      // The finished code step leaves history first, so Back from the landing screen doesn't reopen it.
      await codeStep.leave();
      router.replace(landing);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429 && err.reason === "device_signup_cap") setError(DEVICE_CAP_MESSAGE);
      else setError(otpErrorMessage(err, "That code didn't work. Try again."));
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
    codeStep.back();
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
          <div style={{ marginTop: 24 }}>
            <h1 className="m-h1">{creating ? CREATE.title : "Sign in"}</h1>
            {creating && (
              <p className="m-sub" style={{ marginTop: 8 }}>
                {CREATE.sub}
              </p>
            )}
          </div>
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
          <button type="button" className="m-lnk" style={{ margin: "-8px 0" }} onClick={() => switchMode(!creating)}>
            {creating ? CREATE.toSignIn : CREATE.toCreate}
          </button>
          <p className="m-hint" style={{ textAlign: "center", margin: 0 }}>
            {/* Terms added by owner instruction 2026-09-30 (D-49): one set for every kind of user. */}
            By continuing you accept the{" "}
            <a href={`${API_BASE_URL}/legal/terms`} target="_blank" rel="noreferrer">
              terms
            </a>{" "}
            and{" "}
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
          {busy ? (creating ? "Checking…" : "Signing in…") : creating ? CREATE.submit : "Sign in"}
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
