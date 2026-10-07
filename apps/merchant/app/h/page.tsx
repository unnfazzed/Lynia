"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { HandoverLinkInfoResponse } from "@lynia/shared";
import { ApiError, confirmHandoverLink, getHandoverLink } from "../lib/api-client";

type State = { kind: "loading" } | { kind: "gone"; message: string } | { kind: "ready"; info: HandoverLinkInfoResponse } | { kind: "done"; info: HandoverLinkInfoResponse };

const GONE = "This link has expired. Ask the counter for a new one.";

/**
 * Merchant v2 (ledger D-77): the rider's hand-over page, for when the rider can't enter the pickup code
 * in the app. The counter texted this signed link from its own phone ("Rider can't enter code", behind
 * NEXT_PUBLIC_MERCHANT_HANDOVER_FALLBACK). The rider types the same 6-digit code the counter reads out;
 * the API checks it exactly as the app does, so the counter's screen moves on by itself. No session:
 * the token is the authority (15 minutes, dies at pickup or when the code is re-minted). Not drawn in
 * the handoff; built from the app's own parts (ledger D-77 §4).
 */
export default function HandoverLinkPage() {
  const token = useSearchParams().get("t") ?? "";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getHandoverLink(token).then(
      (info) => alive && setState({ kind: "ready", info }),
      (err: unknown) => alive && setState({ kind: "gone", message: err instanceof ApiError && err.status !== 0 ? GONE : "Couldn't reach LyniaGo. Check your connection." }),
    );
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit() {
    if (state.kind !== "ready" || busy) return;
    setBusy(true);
    setError(null);
    try {
      await confirmHandoverLink(token, code);
      setState({ kind: "done", info: state.info });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="m-page">
      <div className="m-hd">
        <b style={{ fontSize: 22 }}>Pick up the order</b>
        {state.kind !== "loading" && state.kind !== "gone" && (
          <span className="m-sub">
            {state.info.orderLabel} · {state.info.venueName}
          </span>
        )}
      </div>
      <div className="m-bd" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {state.kind === "loading" && <div className="m-hint">Loading…</div>}
        {state.kind === "gone" && (
          <div className="m-alert" role="alert">
            {state.message}
          </div>
        )}
        {state.kind === "ready" && (
          <>
            <label className="m-fld">
              <span className="m-label">Code the counter reads out</span>
              <span className="m-in">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  aria-label="Pickup code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </span>
            </label>
            {error && (
              <div className="m-alert" role="alert">
                {error}
              </div>
            )}
            <button type="button" className="m-btn" disabled={busy || code.length !== 6} onClick={() => void submit()}>
              {busy ? "Checking…" : "Confirm pickup"}
            </button>
          </>
        )}
        {state.kind === "done" && <p className="m-sub">Picked up. Finish the delivery in the LyniaGo app when you can.</p>}
      </div>
    </div>
  );
}
