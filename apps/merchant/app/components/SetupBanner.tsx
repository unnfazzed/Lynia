"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import { useKitchenConnection } from "./KitchenConnectionProvider";
import { ghostButtonStyle } from "./queue/styles";
import { getMerchantProfile, listDishes } from "../lib/menu-api";
import { buildSetupState, readAlarmTested } from "../lib/setup-checklist";

/**
 * The way into M0·2 (`/setup`). The kit shows that checklist as its own first-login screen; this app
 * has no first-login branch to hang it on (the tablet lands on the queue and the alarm arms there), so
 * the queue carries a one-line entry that appears only while something on the list is genuinely
 * outstanding, and disappears for good once it isn't.
 *
 * Self-contained on purpose: it owns its own one-shot fetch rather than widening the queue screen's
 * state machine, and renders nothing at all — no skeleton, no reserved space — until it knows there is
 * something to say. A failure to load is silent: this is a nudge, not a gate, and the queue screen
 * must never be pushed around by it.
 */
export function SetupBanner() {
  const { session } = useKitchenConnection();
  const [pending, setPending] = useState<{ remaining: number; live: boolean } | null>(null);

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    Promise.all([getMerchantProfile(), listDishes()])
      .then(([profile, dishes]) => {
        if (cancelled) return;
        const setup = buildSetupState({ profile, dishes, alarmTested: readAlarmTested(profile.id) });
        if (setup.remaining > 0) setPending({ remaining: setup.remaining, live: setup.live });
      })
      .catch(() => {
        // Silent by design — see the doc comment.
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!pending) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 14,
        background: "var(--highlight-wash)",
        border: "1px solid var(--highlight-border)",
        marginBottom: 14,
      }}
    >
      <Icon name="circle-alert" size={18} color="var(--highlight-ink)" />
      <div style={{ flex: 1, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.45 }}>
        <b>
          {pending.remaining} thing{pending.remaining === 1 ? "" : "s"} left to set up
        </b>{" "}
        — {pending.live ? "your shop is live, but this list isn't finished." : "customers can't see your shop until this list is done."}
      </div>
      <Link href="/setup" style={{ ...ghostButtonStyle, textDecoration: "none", display: "inline-block", whiteSpace: "nowrap" }}>
        Finish setting up
      </Link>
    </div>
  );
}
