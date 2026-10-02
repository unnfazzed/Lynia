import { tokens } from "@lynia/shared/tokens";
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
  /**
   * A right-aligned VALUE, before the chevron — the settings grammar (`screens.jsx :: Settings`
   * draws `Notifications … On`, `Language … English`, `Payment … Cash`; `screens-shipped.jsx ::
   * SettingsPerms` draws the live permission state the same way). Distinct from {@link sub}: a sub
   * explains what a row IS, a value states what it currently SAYS, and the mocks put the two in
   * different places. Added when Settings moved into this card grammar (D-25) — the owner kept the
   * value on the right, so this is the mock's placement preserved inside the card, not a new idea.
   */
  value?: string;
  /** The value reads as a problem (a denied permission): warning triangle + danger-ink, 700. */
  warn?: boolean;
  /**
   * What a denied permission COSTS, spelled out under the row with the affordance that fixes it —
   * `SettingsPerms`'s consequence line. Drawn inside the row's hairline, so it reads as part of the
   * row rather than as a new section.
   */
  consequence?: string;
  onPress?: () => void;
  /** Destructive (sign out, delete account) — icon + label go danger and the chevron is dropped, the
   *  same treatment the settings screen already gave its danger rows. */
  danger?: boolean;
};

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
          // The hairline sits on a WRAPPER, not on the row itself, so a consequence line falls INSIDE
          // the row's rule rather than starting a new one. Visually identical for every row without
          // one — both forms draw a full-width rule under the padded row.
          <View key={r.label} style={{ borderBottomWidth: 1, borderBottomColor: tokens.color.line }}>
            <Pressable
              onPress={r.onPress}
              disabled={!r.onPress}
              // `button` only when the row DOES something. A handler-less row is a fact on a card, not
              // a control: announcing it as a (disabled) button tells a screen-reader user there is
              // something to activate here and that it has been taken away from them — neither is
              // true. `text` states what it is. This matters more since D-25, because the Language detail
              // screen is made ENTIRELY of these rows.
              accessibilityRole={r.onPress ? "button" : "text"}
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
                {r.value ? (
                  // The settings grammar's right-hand value (13, muted; danger-ink + triangle when it
                  // is a problem) — `SettingsPerms`'s own treatment, kept where the mock draws it.
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    {r.warn ? <Icon name="triangle-alert" size={14} color={tokens.color.dangerInk} /> : null}
                    <Text style={{ fontSize: 13, fontWeight: r.warn ? "700" : "400", color: r.warn ? tokens.color.dangerInk : tokens.color.muted }}>
                      {r.value}
                    </Text>
                  </View>
                ) : null}
                {r.onPress && !r.danger ? <Icon name="chevron-right" size={16} color={tokens.color.muted} /> : null}
              </View>
            </Pressable>
            {r.consequence ? (
              // Indented to the label column (row paddingLeft 10 + icon 18 + gap 11), so the cost of a
              // denied permission reads as that row's own consequence and not as loose page copy.
              <View style={{ flexDirection: "row", gap: 8, paddingBottom: 12, paddingRight: 10, paddingLeft: 39 }}>
                <Text style={{ flex: 1, fontSize: 12, color: tokens.color.muted, lineHeight: 17 }}>
                  {r.consequence}{" "}
                  <Text style={{ fontWeight: "700", color: tokens.color.accentText }} onPress={r.onPress}>
                    Open system settings
                  </Text>
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}
