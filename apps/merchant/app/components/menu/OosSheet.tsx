"use client";

import { useEffect, useState } from "react";
import type { DishOutOfStockFor } from "@lynia/shared";

/**
 * C2 · Out-of-stock sheet (packages/design/handoff/merchant-mobile, ledger D-48): "Mazondo is off. For
 * how long?" with **Rest of today** (chosen to start with, "Back on automatically at 08:00") and "Until
 * I turn it back on", then "Turn off" and "Keep it on". The scrim and Escape keep it on. Staff may use
 * it (the permission table).
 */
export function OosSheet({
  dishName,
  backOn,
  disabled,
  submitting,
  onConfirm,
  onCancel,
}: {
  dishName: string;
  /** "Back on automatically at 08:00" — tomorrow's opening time (lib/menu-view backOnLine). */
  backOn: string;
  disabled: boolean;
  submitting: boolean;
  onConfirm: (forHowLong: DishOutOfStockFor) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState<DishOutOfStockFor>("rest_of_today");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="m-overlay" style={{ zIndex: 70 }}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label="Keep it on" onClick={onCancel} />
        <div className="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-oos-title">
          <div className="m-grab" />
          <b id="m-oos-title" style={{ fontSize: 18 }}>
            {dishName} is off. For how long?
          </b>
          <div role="radiogroup" aria-label="For how long" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="button" role="radio" aria-checked={choice === "rest_of_today"} aria-label={`Rest of today. ${backOn}`} className="m-opt" onClick={() => setChoice("rest_of_today")}>
              <span className="m-rad" />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 0" }}>
                <b style={{ fontSize: 15 }}>Rest of today</b>
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{backOn}</span>
              </span>
            </button>
            <button type="button" role="radio" aria-checked={choice === "until_back"} className="m-opt" onClick={() => setChoice("until_back")}>
              <span className="m-rad" />
              <b style={{ fontSize: 15 }}>Until I turn it back on</b>
            </button>
          </div>
          <button type="button" className="m-btn" disabled={disabled || submitting} onClick={() => onConfirm(choice)}>
            Turn off
          </button>
          <button type="button" className="m-lnk" onClick={onCancel}>
            Keep it on
          </button>
        </div>
      </div>
    </div>
  );
}
