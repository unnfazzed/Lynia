"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../icons";

/**
 * Merchant v2 follow-ups (packages/design/handoff/merchant-v2 README "Shared patterns", ledger D-77): the
 * bottom sheet with single-choice reason rows, an optional note under "Something else", a danger CTA and
 * a secondary button (K2a/S2a "Why can't you take it?", K3b/K3c "Cancel #A222?"); the path cards of K3a;
 * and the info strips (neutral, gold money, mint money, red goods back). At 320×640 the sheet stops 24px
 * short of the top and its body scrolls under the pinned buttons.
 */

export type InfoTone = "neutral" | "gold" | "mint" | "red";

export function InfoStrip({ tone = "neutral", icon, children }: { tone?: InfoTone; icon: IconName; children: ReactNode }) {
  return (
    <div className="m-info" data-tone={tone}>
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  );
}

export function PathCard({ icon, tone, title, sub, onClick }: { icon: IconName; tone: "mint" | "red"; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className="m-path" data-tone={tone} onClick={onClick}>
      <span className="m-path-ic">
        <Icon name={icon} size={20} />
      </span>
      <span className="m-path-t">
        <b>{title}</b>
        <span>{sub}</span>
      </span>
      <Icon name="chevron-right" size={20} color="var(--muted)" />
    </button>
  );
}

/** The sheet frame: scrim, grab handle, title and sub, a scrolling body and the pinned buttons. */
export function Sheet({
  title,
  sub,
  onClose,
  children,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="m-overlay" style={{ zIndex: 70 }}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label="Close" onClick={onClose} />
        <div className="m-sheet m-rsheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="m-grab" />
          <div className="m-rsheet-hd">
            <b id={titleId}>{title}</b>
            {sub && <p>{sub}</p>}
          </div>
          <div className="m-rsheet-bd">{children}</div>
          <div className="m-rsheet-ft">{actions}</div>
        </div>
      </div>
    </div>
  );
}

export interface ReasonSheetProps<C extends string> {
  title: string;
  sub: ReactNode;
  reasons: readonly (readonly [C, string])[];
  /** The reason that opens the note field ("Something else"). */
  noteFor?: C;
  /** "Rudo sees this note." */
  noteHelper?: string;
  noteMax?: number;
  /** Shown under the rows for the picked reason (K2a's busy-mode hint, K3b's info strip). */
  extra?: (picked: C | null) => ReactNode;
  cta: string;
  busyCta?: string;
  secondary: string;
  busy: boolean;
  /** Holds the CTA (K3c: the refund reference is still empty). */
  confirmDisabled?: boolean;
  error?: string | null;
  onConfirm: (reason: C, note?: string) => void;
  onCancel: () => void;
}

/** K2a / S2a / K3b / K3c: pick one reason (the whole row is the target), maybe add a note, confirm. */
export function ReasonSheet<C extends string>({
  title,
  sub,
  reasons,
  noteFor,
  noteHelper,
  noteMax = 80,
  extra,
  cta,
  busyCta,
  secondary,
  busy,
  confirmDisabled = false,
  error,
  onConfirm,
  onCancel,
}: ReasonSheetProps<C>) {
  const [picked, setPicked] = useState<C | null>(null);
  const [note, setNote] = useState("");
  const noteId = useId();
  const withNote = noteFor !== undefined && picked === noteFor;
  return (
    <Sheet
      title={title}
      sub={sub}
      onClose={onCancel}
      actions={
        <>
          {error && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
          <button type="button" className="m-btn m-danger" disabled={busy || confirmDisabled || picked === null} onClick={() => picked && onConfirm(picked, withNote && note.trim() ? note.trim() : undefined)}>
            {busy && busyCta ? (
              <>
                <span className="m-wspin" aria-hidden="true" /> {busyCta}
              </>
            ) : (
              cta
            )}
          </button>
          <button type="button" className="m-btn2" disabled={busy} onClick={onCancel}>
            {secondary}
          </button>
        </>
      }
    >
      <div role="radiogroup" aria-label={title} className="m-reasons">
        {reasons.map(([code, label]) => (
          <button key={code} type="button" role="radio" aria-checked={picked === code} className="m-reason" onClick={() => setPicked(code)}>
            <span className="m-rad" />
            {label}
          </button>
        ))}
      </div>
      {withNote && (
        <div className="m-fld m-rnote">
          <label htmlFor={noteId}>
            Add a note <span>(optional)</span>
          </label>
          <span className="m-in">
            <input id={noteId} value={note} maxLength={noteMax} autoComplete="off" onChange={(e) => setNote(e.target.value)} />
          </span>
          {noteHelper && <span className="m-hint">{noteHelper}</span>}
        </div>
      )}
      {extra?.(picked)}
    </Sheet>
  );
}
