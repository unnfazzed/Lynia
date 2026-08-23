"use client";

import { useRef, useState, useTransition } from "react";
import { logOrderFollowUpNote } from "../../actions/audit";

/**
 * "Log a follow-up note" was a plain `<form action={logOrderFollowUpNote.bind(null, o.id)}>` submit
 * with no client-side error handling — `logOrderFollowUpNote` deliberately throws on a failed audit
 * write, and with zero `error.tsx` anywhere in this app that throw escaped the row straight to Next's
 * generic unstyled crash screen instead of the console's own inline, retryable error text (UX21-01,
 * same class as `KycApproveButton`). Calling the server action directly (not via `<form action>`) lets
 * this component catch that throw itself, mirroring `AcknowledgeButton`'s `useTransition` + inline-error
 * pattern.
 */
export function FollowUpNoteButton({ orderId, disabled }: { orderId: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // CF-04-SIB (crash-fuzz 2026-08-23): `pending` (useTransition's own state) only reflects the
  // FIRST of two same-tick clicks — a fast double-click wrote two distinct audit_logs rows ~2ms
  // apart (confirmed live via concurrent requests against the real API). Same guard shape as
  // ConfirmModal.tsx's CF-02 fix: a synchronous ref checked-and-set before the transition starts.
  const inFlightRef = useRef(false);

  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        className="btn ghost"
        disabled={disabled || pending}
        style={{ width: "100%" }}
        onClick={() => {
          if (inFlightRef.current) return;
          inFlightRef.current = true;
          setError(null);
          startTransition(async () => {
            try {
              await logOrderFollowUpNote(orderId, new FormData());
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't record the note — try again.");
            } finally {
              inFlightRef.current = false;
            }
          });
        }}
      >
        {pending ? "Recording…" : "Log a follow-up note (doesn't contact the rider)"}
      </button>
      {error ? (
        <span role="alert" style={{ fontSize: 11, color: "var(--danger)" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
