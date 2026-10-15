import { useCallback, useState } from "react";
import { Linking, useWindowDimensions } from "react-native";
import { INSTALL_TIP_KEYS, INSTALL_TIP_SMALL_WIDTH, installTipSurface } from "../../logic/install-tip";
import { isCustomerWebBuild } from "../../web-build";
import { browser, installParamPending } from "./install-param";

export type InstallSheetVariant = "default" | "small" | "launched";

export interface InstallTip {
  /** The sheet to show over Home, or null. */
  sheet: InstallSheetVariant | null;
  /** The pin row under the Home header (§2.3). */
  pin: boolean;
  /** ✕, the scrim and the primary button on the tip; "Keep using the web app" on the launched sheet. */
  dismissSheet: () => void;
  /** The pin row's ✕: gone for good. */
  dismissPin: () => void;
  /** The pin row's "How": the full tip again, without un-dismissing it. */
  reopen: () => void;
  /** The launched sheet's "Get it on the App Store". */
  openAppStore: () => void;
}

const APP_STORE_URL = process.env.EXPO_PUBLIC_APP_STORE_URL ?? "";

type Dismissed = { tip: boolean; pin: boolean; appStore: boolean };

function readFlag(key: string): boolean {
  try {
    return browser.localStorage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    browser.localStorage?.setItem(key, "1");
  } catch {
    // Blocked storage: dismissed for this visit only.
  }
}

function standalone(): boolean {
  if (browser.navigator?.standalone === true) return true;
  try {
    return browser.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    return false;
  }
}

/**
 * The customer web app's Add to Home Screen tip (handoff download-qr-install-tip-2026-10 §2). The rules
 * are `installTipSurface` (src/logic/install-tip.ts); this hook feeds it the browser's facts and keeps the
 * dismissals in localStorage under the handoff's keys. Always `{ sheet: null, pin: false }` on the phones.
 */
export function useInstallTip(): InstallTip {
  const { width } = useWindowDimensions();
  const web = isCustomerWebBuild();
  const [dismissed, setDismissed] = useState<Dismissed>(() =>
    web ? { tip: readFlag(INSTALL_TIP_KEYS.tip), pin: readFlag(INSTALL_TIP_KEYS.pin), appStore: readFlag(INSTALL_TIP_KEYS.appStore) } : { tip: false, pin: false, appStore: false },
  );
  const [reopened, setReopened] = useState(false);

  const surface = web
    ? installTipSurface({
        webBuild: true,
        userAgent: browser.navigator?.userAgent ?? "",
        maxTouchPoints: browser.navigator?.maxTouchPoints ?? 0,
        standalone: standalone(),
        installParam: installParamPending(),
        dismissed,
        appStoreUrl: APP_STORE_URL,
        width,
      })
    : null;

  const small = width < INSTALL_TIP_SMALL_WIDTH;
  const sheet: InstallSheetVariant | null = reopened
    ? small
      ? "small"
      : "default"
    : surface === "sheet"
      ? "default"
      : surface === "sheetSmall"
        ? "small"
        : surface === "launched"
          ? "launched"
          : null;

  const dismiss = useCallback((key: keyof Dismissed) => {
    writeFlag(INSTALL_TIP_KEYS[key]);
    setDismissed((d) => ({ ...d, [key]: true }));
  }, []);

  const dismissSheet = useCallback(() => {
    if (reopened) setReopened(false);
    else dismiss(surface === "launched" ? "appStore" : "tip");
  }, [reopened, surface, dismiss]);

  const openAppStore = useCallback(() => {
    dismiss("appStore");
    if (APP_STORE_URL) void Linking.openURL(APP_STORE_URL);
  }, [dismiss]);

  return {
    sheet,
    pin: surface === "pin",
    dismissSheet,
    dismissPin: useCallback(() => dismiss("pin"), [dismiss]),
    reopen: useCallback(() => setReopened(true), []),
    openAppStore,
  };
}
