import { Platform, Vibration } from "react-native";

/**
 * Haptic feedback at the emotional beats of both journeys — the "feels alive" layer modern ride-hailing
 * apps lean on. Built on React Native's CORE `Vibration` API only: no `expo-haptics`, no new native
 * module, no EAS rebuild (same primitive-only constraint as LiveMap / BottomSheet). That keeps it
 * data-/battery-light too — a buzz is a few tens of milliseconds of the vibrator, nothing else.
 *
 * Android-first by design (Zimbabwe is ~90% Android): the patterns are tuned to read on Android's
 * amplitude-flat vibrator, where a `number[]` is `[wait, buzz, wait, buzz, …]` in ms. iOS has its own
 * mapping ({@link iosHapticPattern}) because it plays those patterns very differently.
 *
 * Everything is BEST-EFFORT: a device with no vibrator, a user who muted system haptics, or web all
 * degrade to a silent no-op. Haptics are never load-bearing — they punctuate an action the UI already
 * shows, so a miss costs nothing.
 */

/** The named cues, mapped to the moments they punctuate. */
export type HapticKind =
  /** A light confirming tick on a deliberate primary action (broadcast, go-online). */
  | "tap"
  /** A warm success double — a customer picked you, a parcel was delivered. */
  | "success"
  /** A single attention buzz — a new bid landed, a new nearby order opened. */
  | "notify"
  /** A firmer double for a recoverable wrong turn — a rejected delivery code. */
  | "warning"
  /** An urgent long triple — the SOS control, the one cue that must feel different. */
  | "alert";

/**
 * The vibration pattern (ms) for a cue. Pure and exported so the mapping is unit-testable off-device
 * (there is no vibrator in Jest). A bare number is a single buzz of that length; an array alternates
 * `[wait, buzz, wait, buzz, …]`.
 */
export function hapticPattern(kind: HapticKind): number | number[] {
  switch (kind) {
    case "tap":
      return 12;
    case "notify":
      return 28;
    case "success":
      return [0, 22, 70, 40];
    case "warning":
      return [0, 40, 90, 40];
    case "alert":
      return [0, 55, 120, 55, 120, 90];
    default:
      // Exhaustive in practice; keep a calm fallback rather than throwing on a bad caller.
      return 12;
  }
}

/**
 * The cue as iOS should play it, or `null` for none. React Native's iOS `Vibration` ignores durations:
 * every buzz is the same ~400ms system vibration, and a pattern's entries become the GAPS between
 * buzzes. The Android patterns above therefore play on an iPhone as a 400ms buzz for every light
 * `tap`, and as four to six buzzes blurring into one long rumble for the patterned cues.
 *
 * Without a haptics engine (no new native module — see above), the honest mapping is: no cue for a
 * tap, one buzz for notify, success and warning, and a clearly separated double for `alert`, the one
 * cue that must feel different. A bare number is one buzz (its length is ignored); `[0, gap]` is two.
 */
export function iosHapticPattern(kind: HapticKind): number | number[] | null {
  switch (kind) {
    case "tap":
      return null;
    case "alert":
      // The second buzz starts 700ms after the first, leaving a ~300ms pause between them.
      return [0, 700];
    default:
      return 400;
  }
}

/**
 * Module-level kill switch so a future "reduce feedback" setting (or a test) can silence every cue with
 * one call, without threading a prop through every screen. On by default.
 */
let enabled = true;
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/**
 * Fire a named haptic cue. Best-effort: silent no-op on web, when disabled, for a cue iOS leaves out, or
 * if the vibrator throws.
 */
export function haptic(kind: HapticKind): void {
  if (!enabled || Platform.OS === "web") return;
  const pattern = Platform.OS === "ios" ? iosHapticPattern(kind) : hapticPattern(kind);
  if (pattern == null) return;
  try {
    Vibration.vibrate(pattern);
  } catch {
    /* no vibrator / muted / permission — haptics are never load-bearing */
  }
}
