"use client";

import { useRef, useState, useTransition } from "react";
import { tokens } from "@lynia/shared";
import { setKyc } from "./actions";

/**
 * UX-2026-07-15: every other admin action (ConfirmModal-based, or AcknowledgeButton-style for a
 * reason-less one-tap action) already disables its trigger while in flight AND surfaces a failed
 * write inline so it's never mistaken for success — this quick KYC approve button was a plain
 * `<form action={setKyc}>` submit with no client-side error handling at all. A failed API write must
 * never silently fail-open on a KYC decision, and with zero `error.tsx` anywhere in this app, the throw
 * `setKyc` used to raise escaped past this row straight to Next's generic unstyled crash screen instead
 * of the console's own inline, retryable error text (UX21-01). Calling the server action directly (not
 * via `<form action>`) lets this component show the failure itself, mirroring `AcknowledgeButton`'s
 * `useTransition` + inline-error pattern. `setKyc` now RETURNS the failure (D-75), because production
 * redacts a thrown server-action message and a refused approval needs the API's own words.
 */
export function KycApproveButton({ profileId }: { profileId: string }): React.ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // CF-02-SIB-4 (crash-fuzz 2026-08-23, KYC gating — sensitive lane): same guard-shape defect as
  // ConfirmModal.tsx's CF-02 fix — `pending` only reflects the first of two same-tick clicks.
  // `adminSetKyc` deliberately re-records an audit row on every call (by design, per its own code
  // comment) — a double-tap race must not multiply that further than one genuine extra click would.
  const inFlightRef = useRef(false);

  function approve() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("profileId", profileId);
        fd.set("status", "verified");
        // A refusal comes back in the API's own words (e.g. a D-75 approval refused because the ID-check
        // number is on another live account), not as a throw that production would redact.
        const res = await setKyc(fd);
        if (!res.ok) setError(res.message);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't approve — try again.");
      } finally {
        inFlightRef.current = false;
      }
    });
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        onClick={approve}
        disabled={pending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: 36,
          fontSize: 12,
          fontWeight: 600,
          padding: "6px 14px",
          borderRadius: 999,
          border: "none",
          background: tokens.color.cta,
          color: tokens.color.onAccent,
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Working…" : "Approve"}
      </button>
      {error ? (
        <span role="alert" style={{ fontSize: 11, color: "var(--danger)" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
