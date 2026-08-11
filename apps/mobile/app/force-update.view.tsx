// GENERATED — do not edit by hand. Structural-parity source of truth for LJ.force_update.
// Source mock: packages/design/explorations/journey/screens.jsx :: ForceUpdate
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.force_update
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/force-update.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { SystemState } from "../src/ui";

export type ForceUpdateViewProps = {
  /** The brand mark node the kit's `brand` boolean draws internally (app feeds <DoveMark/>). */
  mark: React.ReactNode;
  title: string;
  message: string;
  /** Hidden (undefined) when no store URL is configured — never a dead 'Update now' link. */
  primary?: string;
  onPrimary?: () => void;
};

export function ForceUpdateView({
  mark,
  title,
  message,
  primary,
  onPrimary
}: ForceUpdateViewProps): React.ReactElement {
  return <SystemState tone="green" mark={mark} title={title} message={message} primary={primary} onPrimary={onPrimary} />;
}
