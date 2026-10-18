"use client";

import { useState, useTransition } from "react";
import { tokens } from "@lynia/shared";
import { revealPhone } from "../actions/phone";
import { IconPhone } from "./icons";

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/**
 * "Call biker" / "Call customer" (owner 2026-10-18). A number the API already sent in full (a live order) is a
 * plain tel: link. A masked one is fetched in full on tap (audited by the API) and then dialled, never a link that
 * dials the bullets.
 */
export function CallButton({
  profileId,
  phone,
  label,
  connected,
}: {
  profileId: string;
  /** The number as the API sent it: masked (A-03) unless a live order reveals it. */
  phone: string;
  label: string;
  connected: boolean;
}) {
  const [full, setFull] = useState<string | null>(phone && !phone.includes("•") ? phone : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const icon = (
    <span style={{ display: "inline-flex", fontSize: 14 }}>
      <IconPhone />
    </span>
  );

  if (full) {
    return (
      <a className="btn ghost" href={telHref(full)}>
        {icon}
        {label}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        disabled={!connected || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await revealPhone(profileId);
            if ("phone" in res) {
              setFull(res.phone);
              window.location.href = telHref(res.phone);
            } else setError(res.error);
          })
        }
      >
        {icon}
        {pending ? "Getting number…" : label}
      </button>
      {error ? (
        <span role="alert" style={{ fontSize: 11, color: tokens.color.danger }}>
          {error}
        </span>
      ) : null}
    </>
  );
}
