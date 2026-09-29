"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MerchantProfileResponse } from "@lynia/shared";
import { getAlarmController } from "./alarm-singleton";
import { Icon } from "./icons";
import { dangerGhostButtonStyle, disabledStyle, ghostButtonStyle } from "./queue/styles";
import { ApiError } from "../lib/api-client";
import { clearBusinessCache } from "../lib/business";
import { firstName, ROLE_LABEL, signedInLabel } from "../lib/team";
import { leaveBusiness } from "../lib/team-api";

/**
 * Who is signed in, in the top bar (merchant web upgrade L4, design doc "Shared devices"): everyone signs
 * in with their own code, so a shared counter tablet says whose it is right now. "Switch person" signs
 * out for the next person; Staff can also leave the business here. Undrawn in the RM top bar, ledgered as
 * D-46.
 */
export function PersonMenu({ business, onSwitchPerson }: { business: MerchantProfileResponse; onSwitchPerson: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  const staff = business.myRole === "staff";

  // Closes on Escape and on a tap anywhere else, like any small menu.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  async function onLeave() {
    if (leaving) return;
    setLeaving(true);
    setError(null);
    try {
      await leaveBusiness();
      // They're on no business now: no alarm, no cached business, and "Set up your business" (or another
      // invite's Join) next.
      clearBusinessCache();
      getAlarmController().stop();
      router.replace("/onboarding");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't leave. Try again.");
      setLeaving(false);
    }
  }

  const label = signedInLabel(business.myName, business.myRole);
  const first = business.myName ? firstName(business.myName) : "";

  return (
    <span ref={wrapRef} className="kitchen-bar-person-wrap">
      <button
        type="button"
        className="kitchen-bar-person"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Signed in: ${label}`}
        onClick={() => {
          setOpen((o) => !o);
          setConfirmLeave(false);
          setError(null);
        }}
      >
        <Icon name="user" size={15} />
        {/* One run of text, so "Farai · Owner" is spaced like a sentence; on a phone the role gives way. */}
        <span className="kitchen-bar-person-text">
          {first ? (
            <>
              {first}
              <span className="kitchen-bar-person-role"> · {ROLE_LABEL[business.myRole]}</span>
            </>
          ) : (
            ROLE_LABEL[business.myRole]
          )}
        </span>
      </button>

      {open && (
        <div id={panelId} className="kitchen-bar-person-panel">
          <div style={{ fontSize: 14, fontWeight: 800, overflowWrap: "anywhere" }}>{business.myName ?? ROLE_LABEL[business.myRole]}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, overflowWrap: "anywhere" }}>
            {ROLE_LABEL[business.myRole]} at {business.name}
          </div>

          {!confirmLeave && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              <button type="button" onClick={onSwitchPerson} style={{ ...ghostButtonStyle, width: "100%" }}>
                Switch person
              </button>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>Signs out so the next person signs in with their own code.</div>
              {staff && (
                <button type="button" onClick={() => setConfirmLeave(true)} style={{ ...dangerGhostButtonStyle, width: "100%", marginTop: 4 }}>
                  Leave this business
                </button>
              )}
            </div>
          )}

          {confirmLeave && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>
                Leave <b>{business.name}</b>? You&apos;ll stop seeing its orders and deliveries. The owner can add you again.
              </div>
              <button
                type="button"
                onClick={() => void onLeave()}
                disabled={leaving}
                style={{ ...dangerGhostButtonStyle, width: "100%", ...disabledStyle(leaving) }}
              >
                {leaving ? "Leaving…" : "Yes, leave"}
              </button>
              <button type="button" onClick={() => setConfirmLeave(false)} style={{ ...ghostButtonStyle, width: "100%" }}>
                Stay
              </button>
            </div>
          )}

          {error && (
            <div role="alert" style={{ fontSize: 12.5, color: "var(--danger-ink)", marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
