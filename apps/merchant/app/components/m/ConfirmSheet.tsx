"use client";

import { useEffect, useRef } from "react";

/**
 * The handoff's confirm sheet (merchant-mobile README "Interactions"): a bottom sheet with a title, one
 * line, the confirm button and "Keep"; tapping the scrim or pressing Escape keeps things as they are.
 * Every destructive or closing action goes through it. `danger` paints the confirm red (decline,
 * cancel, sign out, remove); a neutral close ("Mark completed", "Close order") stays the CTA green.
 */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  danger = true,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="m-overlay">
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label="Keep" onClick={onCancel} />
        <div className="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-confirm-title">
          <div className="m-grab" />
          <b id="m-confirm-title" style={{ fontSize: 18 }}>
            {title}
          </b>
          <p className="m-sub">{body}</p>
          {error && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`m-btn${danger ? " m-danger" : ""}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button type="button" className="m-lnk" onClick={onCancel}>
            Keep
          </button>
        </div>
      </div>
    </div>
  );
}
