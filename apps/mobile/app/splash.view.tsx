import { tokens } from "@lynia/shared/tokens";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { View } from "react-native";
import { DoveMark, Wordmark } from "../src/ui/Brand";
import { SPLASH_DOVE_SIZE, SPLASH_GAP, SPLASH_WORDMARK_SIZE } from "../src/ui/splash-lockup";

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
 * The three sizes come from `src/ui/splash-lockup.ts` rather than sitting as literals here, because
 * the NATIVE launch screen is generated from the same constants (scripts/build-splash-icon.mjs).
 * The cold start shows this picture three times — native launch screen, this view on route "/", then
 * `BootSplashHold` over the destination — and it is supposed to look like one screen that never
 * moves, which only holds if all three are drawn from one set of numbers.
 *
 * Presentational only — `app/index.tsx` renders it while the boot reads (session, onboarding flag,
 * saved role, cold-start push) are still settling. Default-exported so the parity lane can mount the
 * state directly (tools/parity/app-targets.mjs "LJ.splash"); it takes no props and no providers.
 */
export function SplashView(): React.ReactElement {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: SPLASH_GAP,
        backgroundColor: tokens.color.accent,
      }}
    >
      {/* Light status-bar icons while the green frame is up (dark-on-green is near-invisible).
          expo-status-bar renders RN's StatusBar, whose props STACK pops on unmount — so the root
          layout's style="dark" is restored the moment the splash gives way to a real screen. */}
      <StatusBar style="light" />
      <DoveMark size={SPLASH_DOVE_SIZE} on="green" />
      <Wordmark size={SPLASH_WORDMARK_SIZE} color={tokens.color.onAccent} />
    </View>
  );
}

export default SplashView;
