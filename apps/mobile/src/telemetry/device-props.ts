import { useEffect } from "react";
import { useWindowDimensions } from "react-native";
import { setDeviceProps } from "./events";
import { setTags } from "./sentry";

/**
 * The phone facts analytics and crash reports carry, so a layout or crash problem can be split by them.
 * On 2026-10-17 two new bikers hit overflowing screens and a crash, and nothing recorded which phone had
 * its text size turned up. `font_scale` is the SYSTEM setting (before the app's 1.3 cap, D-111), rounded
 * to 0.05 so it stays a handful of values; `screen_width_dp` is rounded to whole dp. Nothing identifying.
 */
export function deviceFacts(width: number, fontScale: number): { font_scale: number; screen_width_dp: number } {
  return {
    font_scale: Math.round(fontScale * 20) / 20,
    screen_width_dp: Math.round(width),
  };
}

/** Keeps the facts current: `useWindowDimensions` re-renders on rotation and on a font-scale change. */
export function useDeviceTelemetry(): void {
  const { width, fontScale } = useWindowDimensions();
  const { font_scale, screen_width_dp } = deviceFacts(width, fontScale);
  useEffect(() => {
    setDeviceProps({ font_scale, screen_width_dp });
    setTags({ font_scale: String(font_scale), screen_width_dp: String(screen_width_dp) });
  }, [font_scale, screen_width_dp]);
}
