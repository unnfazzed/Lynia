// GENERATED — do not edit by hand. Structural-parity source of truth for RJM.account.
// Source mock: packages/design/explorations/journey/rider-one-app.jsx :: account
// Regenerate:  node tools/parity/codegen/cli.mjs gen RJM.account
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/rider/(tabs)/account.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text, Pressable } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { AppBar, Screen, Card, Icon, StatusPill, type IconName } from "../../../src/ui";

/** A settings row: [icon, label, sub] — mirrors the mock's `[ic, l, s2]` tuple verbatim. */
export type RiderAccountRow = [IconName, string, string];
export type RiderAccountViewProps = {
  name: string;
  /** '★ 4.9 · 312 jobs · verified' — the rating/jobs/KYC line, honest-empty until data lands. */
  identityLine: string;
  /** Whether the rider is online now — drives the always-drawn status pill's tone + label. */
  online: boolean;
  onIdentityPress: () => void;
  rows: RiderAccountRow[];
  onRowPress: (index: number) => void;
};

export function RiderAccountView({
  name,
  identityLine,
  online,
  onIdentityPress,
  rows,
  onRowPress
}: RiderAccountViewProps): React.ReactElement {
  return <Screen scroll><View>
    <AppBar title="Account" back={false} />
    <View style={{
        padding: tokens.space.screen,
        minHeight: "100%",
        paddingTop: 0
      }}>
      <Pressable onPress={onIdentityPress} accessibilityRole="button" accessibilityLabel="Your profile and settings"><Card style={{
            padding: 12
          }}>
        <View style={{
              alignItems: "center",
              gap: 11,
              flexDirection: "row"
            }}>
          <View style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: tokens.color.accentWash,
                alignItems: "center",
                justifyContent: "center"
              }}><Icon name="user" size={22} color={tokens.color.accentText} /></View>
          <View style={{
                flex: 1
              }}>
            <Text style={{
                  fontSize: 15.5,
                  fontWeight: "700"
                }}>{name}</Text>
            <Text style={{
                  fontSize: 12.5,
                  color: tokens.color.muted,
                  fontVariant: ["tabular-nums"]
                }}>{identityLine}</Text>
          </View>
          <StatusPill status={online ? "Online" : "Offline"} tone={online ? "online" : "offline"} dot />
        </View>
      </Card></Pressable>
      <Card style={{
          padding: 4,
          marginTop: 10
        }}>
        {rows.map(([ic, l, s2], i) => <Pressable key={l} onPress={() => onRowPress(i)} accessibilityRole="button"><View style={{
              alignItems: "center",
              gap: 11,
              paddingTop: 11,
              paddingRight: 10,
              paddingBottom: 11,
              paddingLeft: 10,
              borderBottomWidth: 1,
              borderBottomColor: tokens.color.line,
              flexDirection: "row"
            }}>
            <Icon name={ic} size={18} color={tokens.color.muted} />
            <View style={{
                flex: 1
              }}>
              <Text style={{
                  fontSize: 13.5,
                  fontWeight: "600"
                }}>{l}</Text>
              <Text style={{
                  fontSize: 12,
                  color: tokens.color.muted
                }}>{s2}</Text>
            </View>
            <Icon name="chevron-right" size={16} color={tokens.color.muted} />
          </View></Pressable>)}
      </Card>
    </View>
  </View></Screen>;
}
