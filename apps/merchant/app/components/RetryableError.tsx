"use client";

import { ghostButtonStyle } from "./queue/styles";

/**
 * D-O1: the shared "failed initial load, tap to retry" banner — previously hand-copied with
 * identical markup across queue/statement/shop/menu/hours, one of which (queue) had also drifted
 * to a locally-defined `ghostButtonStyle` instead of this shared one.
 */
export function RetryableError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ background: "var(--danger-wash)", color: "var(--danger-ink)", borderRadius: 16, padding: 20, maxWidth: 480 }}>
      <div>{message}</div>
      <button type="button" onClick={onRetry} style={{ ...ghostButtonStyle, marginTop: 12 }}>
        Retry
      </button>
    </div>
  );
}
