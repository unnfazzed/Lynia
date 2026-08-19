"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { MerchantDishResponse, MerchantProfileResponse } from "@lynia/shared";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { Icon, type IconName } from "../../components/icons";
import { RetryableError } from "../../components/RetryableError";
import { cardStyle, disabledStyle, ghostButtonStyle, primaryButtonStyle } from "../../components/queue/styles";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { getMerchantProfile, listDishes } from "../../lib/menu-api";
import { buildSetupState, markAlarmTested, readAlarmTested, type SetupItem, type SetupItemKey } from "../../lib/setup-checklist";

/**
 * M0·2 `setup` (r-merchant.jsx:103-128) — the first-run checklist: add your menu, set your hours,
 * merchant payment numbers, test the order alarm, plus the go-live gate.
 *
 * Every tick is derived from real state (see `lib/setup-checklist.ts` for exactly which, and for the
 * two places the kit's version assumes capability this codebase doesn't have). Nothing here writes
 * anything except the alarm test, which is a local per-tablet fact and is labelled as one.
 */
type LoadState =
  | { status: "loading" }
  | { status: "ready"; profile: MerchantProfileResponse; dishes: MerchantDishResponse[] }
  | { status: "error"; message: string };

const ICONS: Record<SetupItemKey, IconName> = { menu: "utensils", hours: "clock", payment: "wallet", alarm: "volume-2" };

export default function SetupPage() {
  const { alarm, signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [alarmTested, setAlarmTested] = useState(false);

  const refresh = useCallback(() => {
    setState({ status: "loading" });
    Promise.all([getMerchantProfile(), listDishes()])
      .then(([profile, dishes]) => {
        setState({ status: "ready", profile, dishes });
        setAlarmTested(readAlarmTested(profile.id));
      })
      .catch((err: unknown) => {
        if (redirectIfSessionExpired(err, signOut)) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your setup." });
      });
  }, [signOut]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function onTestAlarm(merchantId: string) {
    alarm.testRing();
    markAlarmTested(merchantId);
    setAlarmTested(true);
  }

  const setup = state.status === "ready" ? buildSetupState({ profile: state.profile, dishes: state.dishes, alarmTested }) : null;

  return (
    <Kitchen active="queue">
      <div className="kitchen-page" style={{ display: "flex", flexDirection: "column", gap: 16, overflow: "auto", height: "100%" }}>
        {state.status === "loading" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading your setup…</div>}

        {state.status === "error" && <RetryableError message={state.message} onRetry={refresh} />}

        {state.status === "ready" && setup && (
          <>
            <div>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>Set up {state.profile.name}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                {setup.remaining === 0
                  ? "Everything on this list is done. About 10 minutes well spent."
                  : `${setup.remaining} thing${setup.remaining === 1 ? "" : "s"} left and you're taking orders. About 10 minutes.`}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
              {setup.items.map((item) => (
                <ChecklistCard
                  key={item.key}
                  item={item}
                  icon={ICONS[item.key]}
                  onAlarmTest={item.key === "alarm" ? () => onTestAlarm(state.profile.id) : undefined}
                />
              ))}
            </div>

            {/* The go-live gate. `pilotEnabled` is the flag the customer read API really filters on and
             *  it is an admin switch — the kit's "you go live once X and Y are done" would be a promise
             *  this app cannot keep, so the copy names who actually flips it. */}
            <div
              style={{
                ...cardStyle,
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                alignItems: "flex-start",
                background: setup.live ? "var(--accent-wash)" : "var(--highlight-wash)",
                boxShadow: "none",
              }}
            >
              <Icon
                name={setup.live ? "circle-check" : "circle-alert"}
                size={20}
                color={setup.live ? "var(--accent-text)" : "var(--highlight-ink)"}
                style={{ marginTop: 2 }}
              />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: setup.live ? "var(--accent-text)" : "var(--highlight-ink)" }}>
                  {setup.live ? "Your shop is live" : "Customers can't see you yet"}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 4, lineHeight: 1.5 }}>
                  {setup.live
                    ? "Customers can find you and order. Anything you change on this list goes live straight away."
                    : "Finish this list, then LyniaGo switches your shop on — it isn't automatic, and support does it once your menu and hours are in."}
                </div>
              </div>
              <Link href="/queue" style={{ ...ghostButtonStyle, textDecoration: "none", display: "inline-block", whiteSpace: "nowrap" }}>
                Go to orders
              </Link>
            </div>
          </>
        )}
      </div>
    </Kitchen>
  );
}

function ChecklistCard({ item, icon, onAlarmTest }: { item: SetupItem; icon: IconName; onAlarmTest?: () => void }) {
  return (
    <div style={{ ...cardStyle, display: "flex", gap: 13, alignItems: "flex-start" }}>
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: item.done ? "var(--accent-wash)" : "var(--surface)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={item.done ? "circle-check" : icon} size={20} color={item.done ? "var(--accent-text)" : "var(--muted)"} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>{item.detail}</div>
        {item.action &&
          (item.action.href ? (
            <Link
              href={item.action.href}
              style={{
                ...(item.done ? ghostButtonStyle : primaryButtonStyle),
                display: "inline-block",
                marginTop: 10,
                padding: item.done ? "8px 16px" : "10px 18px",
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              {item.action.label}
            </Link>
          ) : (
            // Deliberately NOT gated on `actionsDisabled`: the alarm test is a local audio play with no
            // API call behind it, and a merchant checking their volume while the wifi is down is
            // exactly the moment it matters most.
            <button
              type="button"
              onClick={onAlarmTest}
              disabled={!onAlarmTest}
              style={{
                ...(item.done ? ghostButtonStyle : primaryButtonStyle),
                marginTop: 10,
                padding: item.done ? "8px 16px" : "10px 18px",
                fontSize: 13,
                ...disabledStyle(!onAlarmTest),
              }}
            >
              {item.done ? "Play it again" : item.action.label}
            </button>
          ))}
      </div>
    </div>
  );
}
