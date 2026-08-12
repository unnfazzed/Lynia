"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAlarmController } from "../components/alarm-singleton";
import { Icon } from "../components/icons";
import { ApiError, requestOtp, verifyOtp } from "../lib/api-client";
import { isSafeMerchantRedirectPath } from "../lib/merchant-access";

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
      // CWE-601 guard: `next` is an attacker-controllable query param — only ever follow it back to
      // a genuine in-app path, never a protocol-relative URL that would leave the app.
      router.replace(isSafeMerchantRedirectPath(next) ? next : "/queue");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That code didn't work — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "var(--surface)" }}>
      <div style={{ width: 420, maxWidth: "calc(100vw - 32px)", background: "var(--bg)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: 28 }}>
        {/* M0·1 opens with the dove + wordmark lockup above the title (r-merchant.jsx:84).
         *  eslint-disable: a static brand SVG from /public, not a content image. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lyniago-mark.svg" alt="" width={32} height={32} />
          {/* The wordmark is Fredoka 600 with "Go" in --accent-700 (r-parts.jsx Wordmark, size 22) —
           *  not the app's plain Inter run. */}
          <span style={{ fontFamily: "var(--font-wordmark)", fontSize: 22, fontWeight: 600 }}>
            Lynia<span style={{ color: "var(--accent-700)" }}>Go</span>
          </span>
        </div>
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
              placeholder="0771234567"
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
            {/* r-merchant.jsx:87-91 — the code is six segmented boxes (52×60, radius 12), the
             *  next-empty box carrying the accent border. A single transparent input laid over the
             *  boxes captures typing and screen-reader focus, so the `code` state and the verify path
             *  are unchanged — the boxes are only its view. */}
            <div style={{ position: "relative", marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {Array.from({ length: 6 }, (_, i) => {
                  const active = i === Math.min(code.length, 5);
                  return (
                    <span
                      key={i}
                      style={{
                        width: 52,
                        height: 60,
                        borderRadius: 12,
                        border: `1.5px solid ${active ? "var(--accent)" : "var(--line)"}`,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 26,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {code[i] ?? ""}
                    </span>
                  );
                })}
              </div>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                aria-label="6-digit code"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  margin: 0,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: "transparent",
                  caretColor: "transparent",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              />
            </div>
            {/* r-merchant.jsx:92-95 — the alarm notice carries the volume glyph. */}
            <div
              style={{
                display: "flex",
                gap: 9,
                padding: "11px 13px",
                background: "var(--accent-wash)",
                borderRadius: 12,
                marginBottom: 4,
                fontSize: 12.5,
                color: "var(--ink)",
                lineHeight: 1.45,
              }}
            >
              <Icon name="volume-2" size={17} color="var(--accent-text)" style={{ marginTop: 1 }} />
              <span>Signing in turns the order alarm on for this tablet. Keep this tab open and the volume up.</span>
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

// Same shape language as every other primary in the app (16/600 on a --radius-button pill).
const buttonStyle: React.CSSProperties = {
  width: "100%",
  height: 52,
  fontSize: 16,
  fontWeight: 600,
  color: "#fff",
  background: "var(--cta-fill)",
  border: "none",
  borderRadius: "var(--radius-button)",
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
