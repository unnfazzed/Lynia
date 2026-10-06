import * as Device from "expo-device";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/*
 * Tab bar v1.4's glass material (`packages/design/handoff/tab-bar-v1/` README "Accessibility fallback",
 * ledger D-56 §6, owner-approved 2026-10-06). The bar is glass unless one of the handoff's fallback
 * conditions holds, and then it is solid `bg`. It is never translucent without blur.
 */

/** Android: below API 31 there is no RenderEffect blur, and the handoff says solid. */
export const GLASS_MIN_API = 31;

/**
 * Stand-in for `ActivityManager.isLowRamDevice()`, which no installed module exposes: `expo-device`'s
 * total memory. A phone sold as "3GB" reports about 2.8 GiB and a "4GB" one about 3.7 GiB, so 3.5 GiB
 * keeps the build brief's "2–3GB devices get the solid fallback" (ledger D-56 §6).
 */
export const GLASS_MIN_RAM_BYTES = 3.5 * 1024 ** 3;

/** Can this platform draw a backdrop blur at all? */
export function blurSupported(os: string, api: number): boolean {
  if (os === "android") return api >= GLASS_MIN_API;
  if (os === "ios") return true;
  if (os === "web") {
    const css = (globalThis as { CSS?: { supports?: (p: string, v: string) => boolean } }).CSS;
    return !!css?.supports && (css.supports("backdrop-filter", "blur(1px)") || css.supports("-webkit-backdrop-filter", "blur(1px)"));
  }
  return false;
}

/** Android low-RAM phones stay solid; `ram` is total memory in bytes (null when unknown). */
export function lowRam(os: string, ram: number | null | undefined): boolean {
  return os === "android" && ram != null && ram < GLASS_MIN_RAM_BYTES;
}

type Flags = { reduceTransparency: boolean; highContrast: boolean };

/** The last settled settings, so a remount (keyboard close, side switch) doesn't start solid again. */
let known: Flags | null = null;

function mediaMatches(q: string): boolean {
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  return !!mm && mm(q).matches;
}

/**
 * The OS settings that force the solid bar, live: Reduce Transparency and Increase Contrast (iOS), high
 * contrast text (Android), and the matching media queries (web, the parity lane). `null` until the
 * first read settles, so a user with one of them on never sees a frame of glass.
 *
 * Each platform's query is asked on that platform only: on React Native 0.81,
 * `isHighTextContrastEnabled` never settles on iOS and `isDarkerSystemColorsEnabled` never settles on
 * Android. A query that rejects (no native module) reads as off.
 */
function useA11yFlags(enabled: boolean): Flags | null {
  const [flags, setFlags] = useState<Flags | null>(known);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let cur: Flags = known ?? { reduceTransparency: false, highContrast: false };
    const set = (patch: Partial<Flags>): void => {
      cur = { ...cur, ...patch };
      known = cur;
      if (alive) setFlags(cur);
    };
    const off = (p: Promise<boolean>): Promise<boolean> => p.catch(() => false);
    const subs: { remove: () => void }[] = [];
    if (Platform.OS === "android") {
      void off(AccessibilityInfo.isHighTextContrastEnabled()).then((hc) => set({ highContrast: hc }));
      subs.push(AccessibilityInfo.addEventListener("highTextContrastChanged", (hc: boolean) => set({ highContrast: hc })));
    } else if (Platform.OS === "ios") {
      void Promise.all([off(AccessibilityInfo.isReduceTransparencyEnabled()), off(AccessibilityInfo.isDarkerSystemColorsEnabled())]).then(([rt, hc]) =>
        set({ reduceTransparency: rt, highContrast: hc }),
      );
      subs.push(AccessibilityInfo.addEventListener("reduceTransparencyChanged", (rt: boolean) => set({ reduceTransparency: rt })));
      subs.push(AccessibilityInfo.addEventListener("darkerSystemColorsChanged", (hc: boolean) => set({ highContrast: hc })));
    } else {
      set({
        reduceTransparency: mediaMatches("(prefers-reduced-transparency: reduce)"),
        highContrast: mediaMatches("(prefers-contrast: more)") || mediaMatches("(forced-colors: active)"),
      });
    }
    return () => {
      alive = false;
      subs.forEach((s) => s.remove());
    };
  }, [enabled]);
  return flags;
}

/**
 * Whether the tab bar draws the glass material. `false` (solid `bg`) when it isn't wanted, the platform
 * can't blur (Android < 31), the phone is low on RAM, or Reduce Transparency / increased contrast is on.
 * Power-save mode, the handoff's last condition, has no source without another native module (D-56 §6).
 */
export function useGlass(want = true): boolean {
  const capable = want && blurSupported(Platform.OS, Number(Platform.Version)) && !lowRam(Platform.OS, Device.totalMemory);
  const flags = useA11yFlags(capable);
  return capable && flags != null && !flags.reduceTransparency && !flags.highContrast;
}
