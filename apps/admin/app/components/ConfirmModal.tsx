"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
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

  onConfirm?: (result: {
    reasonCode: string | null;
    note: string;
    amount: string;
    /** Form-open idempotency key — stable across retries of ONE confirmed submit, fresh per modal-open.
     *  A money-moving caller (wallet credit) forwards this so a lost-response retry can't double-apply. */
    idempotencyKey: string;
  }) => void | Promise<void>;
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Form-open idempotency key: minted fresh each time the dialog OPENS and held stable while it stays
  // open. A failed confirm keeps the dialog open, so re-clicking Confirm reuses this key and the endpoint
  // dedups instead of double-applying — critical for the money-moving wallet-credit path. A brand-new
  // open (or a new page) mints a new key, so a genuinely separate action is never deduped away.
  const [formKey, setFormKey] = useState("");

  // A11y: stable ids so the dialog is labelled by its title, and the controls by their field labels.
  const titleId = useId();
  const amountId = useId();
  const noteId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Where focus was before the dialog opened — restored on close (WCAG 2.4.3).
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Move focus INTO the dialog on open, and remember where it was so we can restore it on close.
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      // Trap Tab within the dialog so focus can't reach the (inert) page behind it.
      if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Restore focus to the trigger (or wherever it was) when the dialog closes.
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  function reset() {
    setReason(null);
    setNote("");
    setAmountVal("");
    setError(null);
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
    setError(null);
    startTransition(async () => {
      try {
        // Skip the standalone audit POST when the domain endpoint records the audit row in its own
        // transaction (A-01) — otherwise the action is double-recorded in the audit log.
        if (!auditInEndpoint) await submitAdminAction(fd);
        // Await the caller's domain mutation so a thrown server-action rejection surfaces here instead
        // of escaping unhandled — a failed KYC / settlement / refund write must NOT report success.
        await onConfirm?.({ reasonCode: reason, note, amount: amountVal, idempotencyKey: formKey });
        setOpen(false);
        reset();
      } catch (e) {
        // Keep the dialog open and tell the operator the action was NOT recorded, so a failed audit
        // or domain write is never mistaken for success.
        setError(e instanceof Error ? e.message : "The action could not be recorded. Please try again.");
      }
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
          // Mint a fresh idempotency key for THIS open; retries within the open reuse it (see formKey).
          setFormKey(crypto.randomUUID());
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
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
            <h3 id={titleId}>{title}</h3>
            <div className="body">{consequence}</div>

            {reasons.length > 0 ? (
              // <fieldset>/<legend> so screen readers announce the radio group's purpose.
              <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
                <legend className="field-label" style={{ padding: 0 }}>
                  Reason — required
                </legend>
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
              </fieldset>
            ) : null}

            {amount ? (
              <>
                <label className="field-label" htmlFor={amountId}>
                  {amount.label} {amount.required ? "— required" : "(optional)"}
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {amount.prefix ? <span className="num" style={{ fontWeight: 600 }}>{amount.prefix}</span> : null}
                  <input
                    id={amountId}
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

            <label className="field-label" htmlFor={noteId}>
              Note {noteRequired ? "— required" : "(optional)"}
            </label>
            <textarea
              id={noteId}
              value={note}
              placeholder={notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
            />

            {error ? (
              <div
                role="alert"
                style={{
                  background: "var(--danger-wash)",
                  color: "var(--danger)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                {error}
              </div>
            ) : null}

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
