import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Card, Icon, type IconName } from "../index";

/**
 * The account-cluster row grammar, extracted from the RIDER account screen so the customer side can
 * speak it too (owner decision 2026-08-16: "the account under customer is visually different than the
 * rider account — let's harmonise the design to match the state of the rider account", authorised as
 * `docs/DESIGN-DEVIATIONS.md` D-15).
 *
 * **Every value here is copied from the GENERATED `app/rider/(tabs)/account.tsx` view**
 * (`account.view.tsx`, transpiled from `packages/design/explorations/journey/rider-one-app.jsx ::
 * account` and locked to it by `apps/api/src/parity/structure-snapshot.spec.ts`). That file is
 * codegen output and must not be edited or imported from — so this module MIRRORS its geometry rather
 * than sharing it, and the generated view stays the source of truth for the numbers:
 *
 *   identity card  padding 12 · row gap 11 · 48px accent-wash disc · user icon 22 accentText
 *                  name 15.5/700 · line 12.5 muted tabular
 *   row list card  padding 4 · marginTop 10
 *   row            padding 11/10 · gap 11 · bottom hairline · icon 18 muted
 *                  label 13.5/600 · sub 12 muted · chevron-right 16 muted
 *
 * If the mock moves, the codegen regenerates the rider view and these numbers are updated to match —
 * never the other way round.
 */

/** A row: [icon, label, sub-line]. Mirrors the mock's `[ic, l, s2]` tuple. */
export type AccountRow = {
  icon: IconName;
  label: string;
  /** The sub-line is what makes a row self-explanatory before it is tapped, and it is what keeps the
   *  row above the 44px touch floor without a hand-set minHeight. Every row on the two Account
   *  screens carries one. It is OPTIONAL only because the settings screen's rows are asserted against
   *  a drawn mock (LJ.settings_perms / settings_perms_ok) that draws several of them label-only —
   *  inventing a sub-line there would add undrawn copy, which "not drawn ⇒ not rendered" forbids. */
  sub?: string;
  onPress?: () => void;
  /** Destructive (sign out, delete account) — icon + label go danger and the chevron is dropped, the
   *  same treatment the settings screen already gave its danger rows. */
  danger?: boolean;
};

/**
 * The identity block: avatar disc · name · one identity line · an optional trailing pill.
 * `onPress` wraps it in the mock's Pressable (the rider's route into profile/settings).
 */
export function AccountIdentityCard({
  name,
  line,
  detail,
  trailing,
  onPress,
  accessibilityLabel,
}: {
  name: string;
  line?: string;
  /** An extra line under `line`, inside the same column — `/profile`'s account-record detail
   *  ({@link AccountIdLine}). The two Account TABS pass nothing, so their card is unchanged. */
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}): React.ReactElement {
  const body = (
    <Card style={{ padding: 12 }}>
      <View style={{ alignItems: "center", gap: 11, flexDirection: "row" }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
          <Icon name="user" size={22} color={tokens.color.accentText} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: "700", color: tokens.color.ink }}>{name}</Text>
          {line ? <Text style={{ fontSize: 12.5, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{line}</Text> : null}
          {detail}
        </View>
        {trailing}
      </View>
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? "Your profile and settings"}>
      {body}
    </Pressable>
  );
}

/**
 * One card of `icon · label · sub · chevron` rows — the whole navigation surface of an account
 * screen. A row with no `onPress` renders inert (no chevron), so a not-yet-wired entry reads as
 * information rather than a dead tap.
 */
export function AccountRowList({ rows, style }: { rows: AccountRow[]; style?: { marginTop?: number } }): React.ReactElement {
  return (
    <Card style={{ padding: 4, marginTop: 10, ...style }}>
      {rows.map((r) => {
        const tint = r.danger ? tokens.color.danger : tokens.color.muted;
        return (
          <Pressable
            key={r.label}
            onPress={r.onPress}
            disabled={!r.onPress}
            accessibilityRole="button"
            accessibilityLabel={r.label}
            style={({ pressed }) => ({ opacity: pressed && r.onPress ? 0.6 : 1 })}
          >
            <View
              style={{
                alignItems: "center",
                gap: 11,
                paddingTop: 11,
                paddingRight: 10,
                paddingBottom: 11,
                paddingLeft: 10,
                borderBottomWidth: 1,
                borderBottomColor: tokens.color.line,
                flexDirection: "row",
                // A row WITH a sub-line already clears the 44px floor from its own content (11 + 11
                // padding + two lines). A label-only row does not, so it gets the floor explicitly —
                // the same guard the settings screen's own row carried before this grammar replaced it.
                ...(r.sub ? null : { minHeight: tokens.touchTargetMin }),
              }}
            >
              <Icon name={r.icon} size={18} color={tint} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: "600", color: r.danger ? tokens.color.danger : tokens.color.ink }}>{r.label}</Text>
                {r.sub ? <Text style={{ fontSize: 12, color: tokens.color.muted }}>{r.sub}</Text> : null}
              </View>
              {r.onPress && !r.danger ? <Icon name="chevron-right" size={16} color={tokens.color.muted} /> : null}
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

/**
 * The verification pill for the identity card's trailing slot — the customer-side counterpart of the
 * rider account's online/offline `StatusPill`, per the owner's decision (2026-08-16) to fill that slot
 * with verification state "when relevant" and leave it empty for a plain customer.
 *
 * Not `StatusPill`: the failed/expired states need `danger`, which the shared pill tones deliberately
 * exclude. It still follows the DS pill spec (full radius, 12/600, wash background, hairline border).
 * This is the ONE copy — `app/(tabs)/account.tsx` and `app/profile/index.tsx` each carried their own
 * duplicate `KycBadge` before this module existed.
 */
export type KycStatus = "pending" | "verified" | "failed" | "expired";

export function KycPill({ status }: { status: KycStatus }): React.ReactElement {
  // Expired reads like failed (danger) — the rider isn't currently ridable and must act — but keeps
  // its own label so it isn't mistaken for a first-time verification failure.
  const bad = status === "failed" || status === "expired";
  const color = status === "verified" ? tokens.color.accentText : bad ? tokens.color.danger : tokens.color.muted;
  const bg = status === "verified" ? tokens.color.accentWash : tokens.color.surface;
  const label =
    status === "verified" ? "Verified rider" : status === "expired" ? "ID expired" : status === "failed" ? "Verification failed" : "Verification pending";
  return (
    <View
      style={{
        alignSelf: "center",
        borderRadius: tokens.radius.pill,
        borderWidth: 1,
        borderColor: tokens.color.line,
        paddingHorizontal: tokens.space.md,
        paddingVertical: 4,
        backgroundColor: bg,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color }}>{label}</Text>
    </View>
  );
}

/**
 * The account-record line under the identity card on `/profile`: the national ID as stored, plus a
 * pill saying whether anyone has checked it.
 *
 * Drawn from `LJ.profile` (`screens.jsx :: Profile`), which pairs the ID with a `NOT VERIFIED` tag —
 * the app's copy of the registration mock's promise that a customer's ID is "stored on your account
 * only — we don't verify it. Riders go through a separate ID check." So the pill is not decoration:
 * for a customer it is the whole point of showing the number, and for a rider it is their real KYC
 * state, which is the one thing that makes the same number mean something different.
 *
 * The mock MASKS the number (`ID 63•1234••••••42`); the app draws it in full, per the owner's
 * instruction of 2026-08-16 and `docs/DESIGN-DEVIATIONS.md` D-23. It renders only here — never on a
 * tab — because this is the screen the identity card promises will show your details, and the value
 * is deliberately kept out of the persisted query cache (`src/query/persist.ts`).
 */
export function AccountIdLine({ idNumber, kycStatus }: { idNumber: string; kycStatus?: KycStatus }): React.ReactElement {
  const verified = kycStatus === "verified";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
      {/* One interpolated string, not `ID {idNumber}` — that renders as two text nodes, which can
          break the line between the label and the number it labels. */}
      <Text style={{ fontSize: 13, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{`ID ${idNumber}`}</Text>
      <View style={{ borderRadius: tokens.radius.pill, backgroundColor: verified ? tokens.color.accentWash : tokens.color.surface, paddingHorizontal: 8, paddingVertical: 2 }}>
        {/* Mock copy verbatim for the customer case ("NOT VERIFIED", 10.5/700 tracked, muted on
            surface). A verified rider gets the same pill in the affirmative — the mock never drew
            that state because LJ.profile is a customer screen. */}
        <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3, color: verified ? tokens.color.accentText : tokens.color.muted }}>
          {verified ? "VERIFIED" : "NOT VERIFIED"}
        </Text>
      </View>
    </View>
  );
}

/** The "Bike & documents" sub-line, shared by both account screens so the two never drift apart. */
export function bikeDocsSub(kycStatus: KycStatus | undefined, bikeReg?: string): string {
  if (kycStatus === "verified") return bikeReg ? `Bike ${bikeReg} · verified` : "Verified · view your documents";
  if (kycStatus === "expired") return "Your ID has expired — send a new one.";
  if (kycStatus === "failed") return "Verification failed — try again.";
  return "Verify your ID and register your bike.";
}
