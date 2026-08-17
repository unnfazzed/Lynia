// GENERATED — do not edit by hand. Structural-parity source of truth for LJ.home_empty#footer.
// Source mock: packages/design/explorations/journey/screens.jsx :: Home :: region footer
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.home_empty#footer
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/send.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { Button } from "../src/ui";

export type SendComposeFooterViewProps = {
  /**
   * Show the missing-requirements hint above the CTA (mock: shown until the pins are set).
   * D-31: the container hard-codes this false — the hint is not shown at all any more. The branch
   * stays so this generated tree still matches the mock's `div(hint?, Button)`.
   */
  showHint: boolean;
  /** The live 'Add … to broadcast' summary of what is still missing. Unused while D-31 stands. */
  hint: string;
  onBroadcast: () => void;
  busy?: boolean;
  disabled?: boolean;
};

export function SendComposeFooterView({
  showHint,
  hint,
  onBroadcast,
  busy,
  disabled
}: SendComposeFooterViewProps): React.ReactElement {
  return <View>
          {showHint ? <Text style={{
      fontSize: 12,
      color: tokens.color.muted,
      marginBottom: 4
    }}>{hint}</Text> : null}
          <Button label="Proceed" onPress={onBroadcast} loading={busy} disabled={disabled} />
        </View>;
}
