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
import { bookingsAvailable } from "../../lib/booking";
import { listBookings } from "../../lib/bookings-api";
import { getMerchantProfile, listDishes } from "../../lib/menu-api";
import {
  buildSetupState,
  buildShopSetupState,
  markAlarmTested,
  readAlarmTested,
  type SetupItem,
  type SetupItemKey,
} from "../../lib/setup-checklist";
import { shopKindLabel } from "../../lib/sign-up";

/**
 * M0·2 `setup` (r-merchant.jsx:103-128) — the first-run checklist: add your menu, set your hours,
 * merchant payment numbers, test the order alarm, plus the go-live gate.
 *
 * Every tick is derived from real state (see `lib/setup-checklist.ts` for exactly which, and for the
 * two places the kit's version assumes capability this codebase doesn't have). Nothing here writes
 * anything except the alarm test, which is a local per-tablet fact and is labelled as one.
 *
 * Type-aware from the merchant web upgrade's L1: a shop gets its own checklist and no kitchen chrome
 * (it takes no customer orders, so it has no Orders board or alarm; its own nav lands in L2). Undrawn,
 * ledgered as D-43.
 */
type LoadState =
  | { status: "loading" }
  // `bookings`: how many the business has made; null where the API can't book riders yet (L2).
  | { status: "ready"; profile: MerchantProfileResponse; dishes: MerchantDishResponse[]; bookings: number | null }
  | { status: "error"; message: string };

const ICONS: Record<SetupItemKey, IconName> = {
  menu: "utensils",
  hours: "clock",
  payment: "wallet",
  alarm: "volume-2",
  pin: "map-pin",
  first_booking: "navigation",
  items: "package",
};

export default function SetupPage() {
  const { alarm, signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [alarmTested, setAlarmTested] = useState(false);

  const refresh = useCallback(() => {
    setState({ status: "loading" });
    Promise.all([getMerchantProfile(), listDishes()])
      .then(async ([profile, dishes]) => {
        // A shop's "Book your first rider" ticks with its first booking (L2). Best effort: a failed
        // read just leaves the step untick'd.
        const bookings =
          profile.businessType === "shop" && bookingsAvailable(profile) ? await listBookings().then((b) => b.length, () => 0) : null;
        setState({ status: "ready", profile, dishes, bookings });
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

  if (state.status === "ready" && state.profile.businessType === "shop") {
    return <ShopSetup profile={state.profile} items={state.dishes.length} bookings={state.bookings} onSignOut={signOut} />;
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
             *  this app cannot keep, so the copy names who actually flips it, and when (ops calls a new
             *  restaurant within one business day — docs/MERCHANT-GO-LIVE-RUNBOOK.md). */}
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
                    : "Finish this list and LyniaGo will call you within a day to switch you on. It isn't automatic."}
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

/** A shop's `/setup` (merchant web upgrade L1, inside the shop's own shell from L2). */
function ShopSetup({
  profile,
  items,
  bookings,
  onSignOut,
}: {
  profile: MerchantProfileResponse;
  items: number;
  bookings: number | null;
  onSignOut: () => void;
}) {
  const setup = buildShopSetupState({ bookingsOn: bookings !== null, bookings: bookings ?? 0, items });
  return (
    <Kitchen active="setup">
      <div className="kitchen-page" style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "auto", height: "100%", maxWidth: 720 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>Set up {profile.name}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
            {profile.shopKind ? `${shopKindLabel(profile.shopKind)} · Shop` : "Shop"}
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {setup.items.map((item) => (
            <ChecklistCard key={item.key} item={item} icon={ICONS[item.key]} />
          ))}
        </div>

        <div
          style={{
            ...cardStyle,
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            background: "var(--highlight-wash)",
            boxShadow: "none",
          }}
        >
          <Icon name="circle-alert" size={20} color="var(--highlight-ink)" style={{ marginTop: 2 }} />
          <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>
            Customers will find you when LyniaGo Shops opens. We'll check your items first.
          </div>
        </div>

        <div>
          <button type="button" onClick={onSignOut} style={ghostButtonStyle}>
            Sign out
          </button>
        </div>
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
        {item.soon && (
          <span
            style={{
              display: "inline-block",
              marginTop: 10,
              padding: "4px 10px",
              borderRadius: "var(--radius-pill)",
              background: "var(--surface)",
              color: "var(--muted)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Coming soon
          </span>
        )}
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
