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
  /** Reason options. A plain string is shown and submitted verbatim; a `{value,label}` pair submits
   *  `value` (a stable code, e.g. a KycDeclineReason key) while showing `label` — use the pair form
   *  whenever the stored reasonCode must be machine-readable, not a display string. */
  reasons?: readonly (string | { value: string; label: string })[];
  /** When the caller's `onConfirm` domain mutation hits an endpoint that writes the audit row IN its
   *  own transaction (A-01), set this so the modal does NOT also POST a standalone audit row — that
   *  would double-record the action. Leave false when the audit comes only from `submitAdminAction`. */
  auditInEndpoint?: boolean;
  noteRequired?: boolean;
  notePlaceholder?: string;
  confirmLabel?: string;
  danger?: boolean;
  auditActor?: string;

  /**
   * Optional single numeric input (e.g. an adjusted fare) rendered above the note. Its value is NOT
   * written to the audit row — the audit contract stays `{ action, target, reasonCode, note }` — but
   * it is surfaced to `onConfirm` as `amount` so the caller's domain mutation can consume it.
   */
  amount?: { label: string; prefix?: string; placeholder?: string; required?: boolean };

  onConfirm?: (result: { reasonCode: string | null; note: string; amount: string }) => void;
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
    auditInEndpoint = false,
    noteRequired = false,
    notePlaceholder = "Add context for the audit log",
    confirmLabel = "Confirm",
    danger = false,
    auditActor = "the signed-in admin",
    amount,
    onConfirm,
  } = props;

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [amountVal, setAmountVal] = useState("");
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
    setAmountVal("");
  }

  // Normalize to {value,label}: a plain string submits its own text; a pair submits the stable value.
  const reasonOpts = reasons.map((r) => (typeof r === "string" ? { value: r, label: r } : r));
  const reasonOk = reasons.length === 0 || reason !== null;
  const noteOk = !noteRequired || note.trim().length > 0;
  const amountOk = !amount?.required || amountVal.trim().length > 0;
  const canConfirm = reasonOk && noteOk && amountOk && !pending;

  function confirm() {
    if (!canConfirm) return;
    const fd = new FormData();
    fd.set("action", action);
    fd.set("target", target);
    fd.set("path", path);
    if (reason) fd.set("reasonCode", reason);
    fd.set("note", note);
    startTransition(async () => {
      // Skip the standalone audit POST when the domain endpoint records the audit row in its own
      // transaction (A-01) — otherwise the action is double-recorded in the audit log.
      if (!auditInEndpoint) await submitAdminAction(fd);
      onConfirm?.({ reasonCode: reason, note, amount: amountVal });
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
                  {reasonOpts.map((r) => (
                    <label key={r.value}>
                      <input
                        type="radio"
                        name="reasonCode"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </>
            ) : null}

            {amount ? (
              <>
                <span className="field-label">
                  {amount.label} {amount.required ? "— required" : "(optional)"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {amount.prefix ? <span className="num" style={{ fontWeight: 600 }}>{amount.prefix}</span> : null}
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="num"
                    value={amountVal}
                    placeholder={amount.placeholder}
                    onChange={(e) => setAmountVal(e.target.value)}
                    style={{
                      flex: 1,
                      border: "1px solid var(--line)",
                      borderRadius: 12,
                      fontFamily: "var(--font-sans)",
                      fontSize: 13,
                      padding: "10px 12px",
                    }}
                  />
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
