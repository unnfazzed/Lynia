"use client";

import { useState, useTransition } from "react";
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

  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        className="btn ghost"
        disabled={disabled || pending}
        style={{ width: "100%" }}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await logOrderFollowUpNote(orderId, new FormData());
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't record the note — try again.");
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
