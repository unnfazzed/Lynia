"use client";

import { useState, useTransition } from "react";
import { formatPhoneLocal, tokens } from "@lynia/shared";
import { revealPhone } from "../actions/phone";

/**
 * The Details card's Phone value (owner 2026-10-18). Shows the masked number; for an operator allowed to reveal,
 * a "Show number" button swaps in the full number with a Call link. Each reveal is audited by the API.
 */
export function PhoneReveal({
  profileId,
  masked,
  hint,
  allowed,
  connected,
}: {
  profileId: string;
  /** The number as the API sent it (masked unless a live order reveals it). */
  masked: string;
  /** The muted note beside the masked number. */
  hint?: string;
  allowed: boolean;
  connected: boolean;
}) {
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (phone) {
    return (
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="mono">{formatPhoneLocal(phone)}</span>
        <a className="btn ghost" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
          Call
        </a>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span className="mono">{masked}</span>
      {hint ? (
        <span className="mut" style={{ fontSize: 11, fontFamily: tokens.font.family }}>
          {hint}
        </span>
      ) : null}
      {allowed ? (
        <button
          type="button"
          className="btn quiet"
          disabled={!connected || pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await revealPhone(profileId);
              if ("phone" in res) setPhone(res.phone);
              else setError(res.error);
            })
          }
        >
          {pending ? "Showing…" : "Show number"}
        </button>
      ) : null}
      {error ? (
        <span role="alert" style={{ fontSize: 11, color: tokens.color.danger }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
