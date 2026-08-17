import { tokens } from "@lynia/shared/tokens";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { View } from "react-native";
import { DoveMark, Wordmark } from "../src/ui/Brand";

/**
 * LJ.splash — the brand-green boot moment (journey 0·1).
 *
 * Source mock: packages/design/explorations/journey/screens.jsx :: `Splash`
 *   full-height accent-green column, centred, `gap: 18`
 *   → `<Dove size={104} on="green" />`
 *   → the "LyniaGo" wordmark at 32px, weight 600, white
 *
 * The mock draws the wordmark as text in `var(--font-wordmark)` (Fredoka 600). No Fredoka font file
 * ships in the app (docs/APP-SIZE.md — the wordmark ships as OUTLINED Fredoka-600 vector paths in
 * `src/ui/Brand.tsx` instead), so the drawn letterforms are reproduced by `<Wordmark/>` at the mock's
 * 32px, tinted white for the green ground. Rendering a plain <Text> would silently substitute Inter.
 *
 * Presentational only — `app/index.tsx` renders it while the boot reads (session, onboarding flag,
 * saved role, cold-start push) are still settling. Default-exported so the parity lane can mount the
 * state directly (tools/parity/app-targets.mjs "LJ.splash"); it takes no props and no providers.
 */
export function SplashView(): React.ReactElement {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 18, backgroundColor: tokens.color.accent }}>
      {/* Light status-bar icons while the green frame is up (dark-on-green is near-invisible).
          expo-status-bar renders RN's StatusBar, whose props STACK pops on unmount — so the root
          layout's style="dark" is restored the moment the splash gives way to a real screen. */}
      <StatusBar style="light" />
      <DoveMark size={104} on="green" />
      <Wordmark size={32} color={tokens.color.onAccent} />
    </View>
  );
}

export default SplashView;
