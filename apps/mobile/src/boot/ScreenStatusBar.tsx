import { StatusBar, type StatusBarProps } from "expo-status-bar";
import React from "react";
import { useBootPhase } from "./boot-phase";

/**
 * A screen's own status-bar style, held back until the cold start has ended (S-1, ledger D-64).
 *
 * React Native's StatusBar is a stack in which the most recently MOUNTED entry wins — an update to an
 * entry already in the stack changes it in place and does not move it back on top. Home and the rider
 * board mount UNDER the splash while it is still showing, so their `style="dark"` was mounted after the
 * splash's `light` and won: the green splash showed dark icons from the moment the destination mounted.
 * The handoff wants light icons until Home rises (the splash flips its own entry to dark then).
 *
 * Rendering nothing while booting leaves the splash's entry on top for the whole splash; the moment the
 * boot ends this mounts — after the splash's entry — and the screen's style applies, just as the splash
 * unmounts. Outside the boot (every later mount, tests, the parity lane) it is a plain `<StatusBar>`.
 */
export function ScreenStatusBar(props: StatusBarProps): React.ReactElement | null {
  const { booting } = useBootPhase();
  return booting ? null : <StatusBar {...props} />;
}
