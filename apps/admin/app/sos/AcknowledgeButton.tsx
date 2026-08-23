"use client";

import { useRef, useState, useTransition } from "react";
import { acknowledgeSos } from "./actions";

/**
 * Inline "Acknowledge" control for a pending SOS row (DS13-05). Calls the `acknowledgeSos` server
 * action, which POSTs to `/admin/sos/:id/ack` and revalidates `/sos` so the row flips to acknowledged.
 *
 * The DataTable rows are full-row stretched links to the order, so this sits `position: relative;
 * zIndex: 2` (the same technique the map link in the location column uses) to stay clickable above the
 * row link. `disabled` while pending; a failed write surfaces the error inline rather than silently
 * reporting success.
 */
export function AcknowledgeButton({ id, disabled = false }: { id: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // CF-04-SIB (crash-fuzz 2026-08-23): same guard-shape defect as ConfirmModal.tsx's CF-02 fix —
  // `pending` only reflects the first of two same-tick clicks. `SosService.acknowledge`'s own
  // CAS (`updateMany({ acknowledgedAt: null })`) already makes a double-fire harmless server-side,
  // but the client shouldn't rely on that alone — fixed here too, for consistency and in case a
  // future endpoint change removes the incidental protection.
  const inFlightRef = useRef(false);

  return (
    <span style={{ position: "relative", zIndex: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className="btn ghost"
        disabled={disabled || pending}
        onClick={() => {
          if (inFlightRef.current) return;
          inFlightRef.current = true;
          setError(null);
          startTransition(async () => {
            try {
              await acknowledgeSos(id);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not acknowledge — try again.");
            } finally {
              inFlightRef.current = false;
            }
          });
        }}
      >
        {pending ? "Acknowledging…" : "Acknowledge"}
      </button>
      {error ? (
        <span className="mut" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
