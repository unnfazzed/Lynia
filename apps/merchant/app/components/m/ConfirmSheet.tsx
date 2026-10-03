"use client";

import { useEffect, useRef } from "react";

/**
 * The handoff's confirm sheet (merchant-mobile README "Interactions"): a bottom sheet with a title, one
 * line, the confirm button and "Keep"; tapping the scrim or pressing Escape keeps things as they are.
 * Every destructive or closing action goes through it. `danger` paints the confirm red (decline,
 * cancel, sign out, remove); a neutral close ("Mark completed", "Close order") stays the CTA green.
 * `children` is a field the answer needs (a payment reference), under the line; `confirmDisabled` holds
 * the confirm until it is filled in.
 */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  danger = true,
  busy = false,
  confirmDisabled = false,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
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
    // Above any full-screen takeover (the ringing order sits at 60), so its own confirm shows on top.
    <div className="m-overlay" style={{ zIndex: 70 }}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label="Keep" onClick={onCancel} />
        <div className="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-confirm-title">
          <div className="m-grab" />
          <b id="m-confirm-title" style={{ fontSize: 18 }}>
            {title}
          </b>
          <p className="m-sub">{body}</p>
          {children}
          {error && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`m-btn${danger ? " m-danger" : ""}`}
            disabled={busy || confirmDisabled}
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
