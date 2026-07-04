import Constants from "expo-constants";

/**
 * True only in the QA test APK. app.config.ts sets `extra.testBuild` from the LYNIA_TEST_BUILD env,
 * which only the android-test-apk workflow provides — so a real EAS release build reads false and the
 * TEST BUILD banner (src/ui Screen) never renders. Isolated in its own module (expo-constants only) so
 * it's unit-testable without pulling the font/asset import chain.
 */
export function isTestBuild(): boolean {
  return (Constants.expoConfig?.extra as { testBuild?: boolean } | undefined)?.testBuild === true;
}
