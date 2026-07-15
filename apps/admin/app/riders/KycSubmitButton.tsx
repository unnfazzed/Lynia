"use client";

import { tokens } from "@lynia/shared";
import { useFormStatus } from "react-dom";

/**
 * UX-2026-07-15: every other admin action (ConfirmModal-based) already disables its confirm button
 * while its submit is in flight — this quick KYC approve button was a plain `<form action={setKyc}>`
 * submit with no such guard, the one inconsistent double-submit surface in the console. `useFormStatus`
 * reads the enclosing `<form>`'s pending state, so this must be rendered as a child of that form (see
 * KycButton in page.tsx).
 */
export function KycSubmitButton({ label, solid }: { label: string; solid: boolean }): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 36,
        fontSize: 12,
        fontWeight: 600,
        padding: "6px 14px",
        borderRadius: 999,
        border: solid ? "none" : `1px solid ${tokens.color.line}`,
        background: solid ? tokens.color.cta : "transparent",
        color: solid ? tokens.color.onAccent : tokens.color.muted,
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending ? "Working…" : label}
    </button>
  );
}
