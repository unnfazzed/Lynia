// GENERATED — do not edit by hand. Structural-parity source of truth for LJ.perm_loc.
// Source mock: packages/design/explorations/journey/screens.jsx :: PermLoc
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.perm_loc
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/permissions.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { SystemState, type IconName } from "../src/ui";

export type PermPrimeViewProps = {
  icon: IconName;
  title: string;
  message: string;
  primary: string;
  secondary: string;
  onPrimary: () => void;
  onSecondary: () => void;
};

export function PermLocView({
  icon,
  title,
  message,
  primary,
  secondary,
  onPrimary,
  onSecondary
}: PermPrimeViewProps): React.ReactElement {
  return <SystemState icon={icon} title={title} message={message} primary={primary} secondary={secondary} onPrimary={onPrimary} onSecondary={onSecondary} />;
}
