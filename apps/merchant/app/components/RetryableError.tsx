"use client";

import { Icon } from "./icons";

/** Order flow v2's `O.t.loadFailSub` and `O.c.tryAgain` (packages/design/handoff/order-flow-v2/code/copy.ts). */
const LOAD_FAIL_SUB = "Check your data connection and try again.";

/**
 * A screen whose FIRST load failed (D-O1: one shared component for every merchant screen). Order flow v2's
 * global rule, which the owner applied to the whole merchant app (ledger D-74): a failed first load shows
 * a calm "↻ Try again", never a red box or a lasting error line. Drawn as T14b — the disc with the
 * wifi-off glyph, what didn't load, "Check your data connection and try again.", then the one primary —
 * at the merchant-mobile handoff's own centred-state sizes (B5 "You're closed"). A later failed refresh
 * keeps the last good screen; no page shows this once its first load has landed.
 */
export function RetryableError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="m-retry">
      <span className="m-retry-ic">
        <Icon name="wifi-off" size={28} color="var(--muted)" />
      </span>
      <b>{message}</b>
      <p>{LOAD_FAIL_SUB}</p>
      <button type="button" className="m-btn" onClick={onRetry}>
        <span aria-hidden="true">↻</span>
        Try again
      </button>
    </div>
  );
}
