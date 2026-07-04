"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { submitAdminAction } from "../actions/audit";

type TriggerVariant = "ghost" | "danger" | "solid" | "quiet";

/**
 * Reason-code destructive-action modal — the console's audit contract in one component. Renders its
 * own trigger button; opening shows title → consequence → required reason radio → optional/required
 * note → the audit line, exactly like the kit's `AdminShell.confirmAction`.
 *
 * On confirm it calls the `submitAdminAction` server action with `{ action, target, reasonCode, note,
 * path }` (the A-01 audit-log seam). `onConfirm` additionally surfaces `{ reasonCode, note }` to the
 * caller if it wants to react client-side. When `disabled` (offline / not-connected), the trigger is
 * inert — matching A-07 offline discipline.
 */
export interface ConfirmModalProps {
  /** Machine action name written to the audit row, e.g. "rider.suspend". */
  action: string;
  /** Human target the action applies to (rider name, order id, …). */
  target: string;
  /** Path to revalidate after the mutation. */
  path: string;

  triggerLabel: string;
  triggerVariant?: TriggerVariant;
  triggerIcon?: ReactNode;
  disabled?: boolean;

  title: string;
  consequence: ReactNode;
  reasons?: readonly string[];
  noteRequired?: boolean;
  notePlaceholder?: string;
  confirmLabel?: string;
  danger?: boolean;
  auditActor?: string;

  onConfirm?: (result: { reasonCode: string | null; note: string }) => void;
}

export function ConfirmModal(props: ConfirmModalProps) {
  const {
    action,
    target,
    path,
    triggerLabel,
    triggerVariant = "ghost",
    triggerIcon,
    disabled = false,
    title,
    consequence,
    reasons = [],
    noteRequired = false,
    notePlaceholder = "Add context for the audit log",
    confirmLabel = "Confirm",
    danger = false,
    auditActor = "the signed-in admin",
    onConfirm,
  } = props;

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function reset() {
    setReason(null);
    setNote("");
  }

  const reasonOk = reasons.length === 0 || reason !== null;
  const noteOk = !noteRequired || note.trim().length > 0;
  const canConfirm = reasonOk && noteOk && !pending;

  function confirm() {
    if (!canConfirm) return;
    const fd = new FormData();
    fd.set("action", action);
    fd.set("target", target);
    fd.set("path", path);
    if (reason) fd.set("reasonCode", reason);
    fd.set("note", note);
    startTransition(async () => {
      await submitAdminAction(fd);
      onConfirm?.({ reasonCode: reason, note });
      setOpen(false);
      reset();
    });
  }

  return (
    <>
      <button
        type="button"
        className={`btn ${triggerVariant}`}
        disabled={disabled}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {triggerIcon ? <span style={{ display: "inline-flex", fontSize: 14 }}>{triggerIcon}</span> : null}
        {triggerLabel}
      </button>

      {open ? (
        <div
          className="modal-wrap"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
            <h3>{title}</h3>
            <div className="body">{consequence}</div>

            {reasons.length > 0 ? (
              <>
                <span className="field-label">Reason — required</span>
                <div className="reason-list">
                  {reasons.map((r) => (
                    <label key={r}>
                      <input
                        type="radio"
                        name="reasonCode"
                        value={r}
                        checked={reason === r}
                        onChange={() => setReason(r)}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </>
            ) : null}

            <span className="field-label">Note {noteRequired ? "— required" : "(optional)"}</span>
            <textarea
              value={note}
              placeholder={notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
            />

            <div className="actions">
              <button type="button" className="btn quiet" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${danger ? "danger-solid" : "solid"}`}
                disabled={!canConfirm}
                onClick={confirm}
              >
                {pending ? "Working…" : confirmLabel}
              </button>
            </div>

            <div className="audit">
              Recorded in the audit log as {auditActor} ·{" "}
              {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
