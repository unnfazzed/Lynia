"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAlarmController } from "../components/alarm-singleton";
import { ApiError, requestOtp, verifyOtp } from "../lib/api-client";

type Step = { kind: "phone" } | { kind: "code"; phone: string };

/** M0·1 — Kitchen sign-in (D-05: "the sign-in button is labelled 'Sign in & start the alarm'" —
 *  the tap is the browser gesture that unlocks AudioContext for the whole page load). */
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the current step's input via a ref rather than the `autoFocus` attribute (jsx-a11y flags
  // autoFocus as a usability hazard for screen-reader/keyboard users landing mid-page) — this only
  // runs on the step transitions this tablet-kiosk flow itself drives, not on an arbitrary mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, [step.kind]);

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestOtp(phone);
      setStep({ kind: "code", phone });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the code — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "code") return;
    setError(null);
    setBusy(true);
    try {
      await verifyOtp(step.phone, code);
      // The submit click IS the user gesture — unlock the alarm's AudioContext now, at sign-in,
      // exactly as D-05 specifies, before navigating into the dashboard.
      getAlarmController().arm();
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/queue");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That code didn't work — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "var(--surface)" }}>
      <div style={{ width: 420, maxWidth: "calc(100vw - 32px)", background: "var(--bg)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Kitchen sign-in</div>

        {step.kind === "phone" && (
          <form onSubmit={submitPhone}>
            <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 16 }}>
              Enter the phone number for this kitchen.
            </div>
            <input
              ref={inputRef}
              type="tel"
              inputMode="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+263 77 000 0000"
              style={inputStyle}
            />
            {error && <div style={errorStyle}>{error}</div>}
            <button type="submit" disabled={busy || phone.trim().length < 6} style={buttonStyle}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        )}

        {step.kind === "code" && (
          <form onSubmit={submitCode}>
            <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 16 }}>
              Enter the code we sent to {step.phone}.
            </div>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              style={{ ...inputStyle, letterSpacing: "0.3em", textAlign: "center", fontSize: 26 }}
            />
            <div
              style={{
                display: "flex",
                gap: 9,
                padding: "11px 13px",
                background: "var(--accent-wash)",
                borderRadius: 12,
                marginBottom: 14,
                fontSize: 12.5,
                color: "var(--ink)",
                lineHeight: 1.45,
              }}
            >
              Signing in turns the order alarm on for this tablet. Keep this tab open and the volume up.
            </div>
            {error && <div style={errorStyle}>{error}</div>}
            <button type="submit" disabled={busy || code.length !== 6} style={buttonStyle}>
              {busy ? "Signing in…" : "Sign in & start the alarm"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 52,
  fontSize: 16,
  padding: "0 14px",
  borderRadius: 12,
  border: "1.5px solid var(--line)",
  marginBottom: 14,
  fontFamily: "inherit",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  height: 52,
  fontSize: 16,
  fontWeight: 700,
  color: "#fff",
  background: "var(--cta-fill)",
  border: "none",
  borderRadius: 999,
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  color: "var(--danger-ink)",
  background: "var(--danger-wash)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  marginBottom: 14,
};
