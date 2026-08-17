// GENERATED — do not edit by hand. Structural-parity source of truth for LJ.role_select.
// Source mock: packages/design/explorations/journey/screens.jsx :: RoleSelect
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.role_select
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/role.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text, Pressable } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { Icon, Button, Heading, Sub, BrandLockup, type IconName } from "../src/ui";

export type RoleSelectViewProps = {
  /** The customer option's live selected state (drives its mint-wash + check). */
  customerSelected: boolean;
  /** The rider option's live selected state. */
  riderSelected: boolean;
  onSelectCustomer: () => void;
  onSelectRider: () => void;
  /** 'Continue as a customer' / 'Continue as a rider', per the live selection. */
  continueLabel: string;
  onContinue: () => void;
};

/** The nested Opt option card's props (mock `Opt` param), typed so the view compiles strict. */
type RoleOptionData = { icon: IconName; title: string; desc: string; selected: boolean };

export function RoleSelectView({
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
      <BrandLockup />
      <Heading>How do you want to start?</Heading>
      <Sub>It's one account — pick how you'll use LyniaGo now, and switch anytime.</Sub>
      <Pressable onPress={onSelectCustomer} accessibilityRole="radio"><Opt icon="shopping-bag" title="Use LyniaGo" desc="Order food, send parcels, more services soon." selected={customerSelected} /></Pressable>
      <Pressable onPress={onSelectRider} accessibilityRole="radio"><Opt icon="bike" title="Earn as a rider" desc="Deliver parcels near you and get paid in cash." selected={riderSelected} /></Pressable>
      <Button label={continueLabel} onPress={onContinue} />
    </View>;
}
