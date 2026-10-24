"use client";

import { useState, useTransition } from "react";
import { tokens } from "@lynia/shared";
import { revealPhone } from "../actions/phone";
import { whatsappHref } from "../lib/format";
import { IconMessageCircle, IconPhone } from "./icons";

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/**
 * "Call biker" / "Call customer" (owner 2026-10-18), and their WhatsApp twins (owner 2026-10-24: "contact someone via
 * whatsapp just like you can call"). A number the API already sent in full (a live order) is a plain tel: / wa.me
 * link. A masked one is fetched in full on tap (audited by the API) and then dialled or opened in WhatsApp, never a
 * link that dials the bullets.
 */
export function CallButton({
  profileId,
  phone,
  label,
  connected,
  via = "call",
}: {
  profileId: string;
  /** The number as the API sent it: masked (A-03) unless a live order reveals it. */
  phone: string;
  label: string;
  connected: boolean;
  /** `whatsapp` opens a wa.me chat in a new tab instead of dialling. */
  via?: "call" | "whatsapp";
}) {
  const [full, setFull] = useState<string | null>(phone && !phone.includes("•") ? phone : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const icon = (
    <span style={{ display: "inline-flex", fontSize: 14 }}>{via === "whatsapp" ? <IconMessageCircle /> : <IconPhone />}</span>
  );
  const href = full ? (via === "whatsapp" ? whatsappHref(full) : telHref(full)) : null;

  if (href) {
    return via === "whatsapp" ? (
      <a className="btn ghost" href={href} target="_blank" rel="noopener noreferrer">
        {icon}
        {label}
      </a>
    ) : (
      <a className="btn ghost" href={href}>
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
        onClick={() => {
          // The tab opens inside the click (after the await a browser treats it as a popup and blocks it); it is
          // pointed at the chat once the number arrives, or closed if it doesn't.
          const tab = via === "whatsapp" ? window.open("", "_blank") : null;
          startTransition(async () => {
            setError(null);
            const res = await revealPhone(profileId);
            const next = "phone" in res ? (via === "whatsapp" ? whatsappHref(res.phone) : telHref(res.phone)) : null;
            if ("phone" in res && next) {
              setFull(res.phone);
              if (tab) {
                tab.opener = null;
                tab.location.href = next;
              } else window.location.href = next;
            } else {
              tab?.close();
              setError("error" in res ? res.error : "This number can't take a WhatsApp chat.");
            }
          });
        }}
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
