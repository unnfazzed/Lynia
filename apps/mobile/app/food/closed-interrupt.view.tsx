// GENERATED — do not edit by hand. Structural-parity source of truth for RC.closed_interrupt#interrupt.
// Source mock: packages/design/explorations/restaurants/r-customer-a.jsx :: closed_interrupt :: region interrupt
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.closed_interrupt#interrupt
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/food/[id].tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { Card, Icon, Button } from "../../src/ui";

export type ClosedInterruptViewProps = {
  /** '<Shop> just closed' — the live restaurant name drives the headline. */
  title: string;
  /** The reassurance line (cart kept, nothing ordered). */
  body: string;
  /** 'See places still open' → the browse list. */
  onSeeOpen: () => void;
  /** 'Keep my cart for tomorrow' → dismiss the interrupt. */
  onDismiss: () => void;
};

export function ClosedInterruptView({
  title,
  body,
  onSeeOpen,
  onDismiss
}: ClosedInterruptViewProps): React.ReactElement {
  return <Card style={{
    padding: 18,
    width: "100%"
  }}>
        <View style={{
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: tokens.color.highlightWash,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10
    }}>
          <Icon name="clock" size={21} color={tokens.color.highlightInk} />
        </View>
        <Text style={{
      fontSize: 16.5,
      fontWeight: "700"
    }}>{title}</Text>
        <Text style={{
      fontSize: 13,
      color: tokens.color.muted,
      marginTop: 5,
      lineHeight: 19
    }}>{body}</Text>
        <Button label="See places still open" onPress={onSeeOpen} />
        <Button label="Keep my cart for tomorrow" variant="ghost" onPress={onDismiss} />
      </Card>;
}
