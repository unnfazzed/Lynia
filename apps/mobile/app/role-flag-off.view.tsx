// GENERATED — do not edit by hand. Structural-parity source of truth for LJ.role_select_flag_off.
// Source mock: packages/design/explorations/journey/screens-shipped.jsx :: RoleSelectFlagOff
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.role_select_flag_off
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/role.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text, Pressable } from "react-native";
import { tokens } from "@lynia/shared";
import { Icon, Button, Heading, Sub, DoveMark, Wordmark, type IconName } from "../src/ui";

export type RoleSelectViewProps = {
  customerSelected: boolean;
  riderSelected: boolean;
  onSelectCustomer: () => void;
  onSelectRider: () => void;
  continueLabel: string;
  onContinue: () => void;
};

type RoleOptionData = { icon: IconName; title: string; desc: string; selected: boolean };

export function RoleSelectFlagOffView({
  customerSelected,
  riderSelected,
  onSelectCustomer,
  onSelectRider,
  continueLabel,
  onContinue
}: RoleSelectViewProps): React.ReactElement {
  const Opt = ({
    icon,
    title,
    desc,
    selected
  }: RoleOptionData) => <View style={{
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: tokens.radius.card,
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: selected ? tokens.color.accent : tokens.color.line,
    backgroundColor: selected ? tokens.color.accentWash : tokens.color.bg,
    marginBottom: 10,
    flexDirection: "row",
    ...(selected ? {} : tokens.shadow.card)
  }}>
      <View style={{
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: selected ? tokens.color.accent : tokens.color.surface,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    }}>
        <Icon name={icon} size={22} color={selected ? "#fff" : tokens.color.accentText} />
      </View>
      <View style={{
      flex: 1,
      minWidth: 0
    }}>
        <Text style={{
        fontSize: 15,
        fontWeight: "700",
        color: tokens.color.ink
      }}>{title}</Text>
        <Text style={{
        fontSize: 12.5,
        color: tokens.color.muted,
        lineHeight: 18
      }}>{desc}</Text>
      </View>
      {selected ? <Icon name="check" size={20} color={tokens.color.accentText} /> : <Icon name="chevron-right" size={18} color={tokens.color.muted} />}
    </View>;
  return <View style={{
    padding: tokens.space.screen,
    minHeight: "100%"
  }}>
      <View style={{
      alignItems: "center",
      gap: 10,
      marginBottom: 20,
      flexDirection: "row"
    }}><DoveMark size={40} on="white" /><Wordmark size={24} /></View>
      <Heading>How do you want to start?</Heading>
      <Sub>It's one account — pick how you'll use LyniaGo now, and switch anytime.</Sub>
      <Pressable onPress={onSelectCustomer} accessibilityRole="radio"><Opt icon="package" title="Use LyniaGo" desc="Send parcels across Harare — more services soon." selected={customerSelected} /></Pressable>
      <Pressable onPress={onSelectRider} accessibilityRole="radio"><Opt icon="bike" title="Earn as a rider" desc="Deliver parcels near you and get paid in cash." selected={riderSelected} /></Pressable>
      <Button label={continueLabel} onPress={onContinue} />
    </View>;
}
