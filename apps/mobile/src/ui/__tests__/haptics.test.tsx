import { Platform, Vibration } from "react-native";
import { haptic, hapticPattern, iosHapticPattern, type HapticKind } from "../haptics";

/** jest-expo runs as iOS; flip the platform for the branch under test and always put it back. */
function withPlatform(os: "android" | "ios", fn: () => void): void {
  const original = Platform.OS;
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  }
}

describe("hapticPattern", () => {
  it("returns a single short buzz for a light tap", () => {
    expect(hapticPattern("tap")).toBe(12);
  });

  it("returns a single attention buzz for notify", () => {
    expect(hapticPattern("notify")).toBe(28);
  });

  it("returns a two-buzz double for success", () => {
    const p = hapticPattern("success");
    expect(Array.isArray(p)).toBe(true);
    // [wait, buzz, wait, buzz] — exactly two buzzes.
    expect((p as number[]).length).toBe(4);
  });

  it("warning is firmer than success (longer total)", () => {
    const total = (k: HapticKind): number => {
      const p = hapticPattern(k);
      return Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p;
    };
    expect(total("warning")).toBeGreaterThan(total("success"));
  });

  it("alert is the most urgent — a three-buzz triple", () => {
    const p = hapticPattern("alert");
    expect(Array.isArray(p)).toBe(true);
    // [wait, buzz, wait, buzz, wait, buzz] — three buzzes.
    expect((p as number[]).length).toBe(6);
  });

  it("every cue yields a positive-duration pattern (never a no-op zero)", () => {
    const kinds: HapticKind[] = ["tap", "notify", "success", "warning", "alert"];
    for (const k of kinds) {
      const p = hapticPattern(k);
      const total = Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p;
      expect(total).toBeGreaterThan(0);
    }
  });
});

describe("iosHapticPattern", () => {
  // React Native's iOS Vibration plays every buzz as the same ~400ms system vibration and reads a
  // pattern's entries as the gaps between buzzes, so the Android patterns can't be reused there.
  it("drops the light tap, which an iPhone would play as a full 400ms buzz", () => {
    expect(iosHapticPattern("tap")).toBeNull();
  });

  it("plays notify, success and warning as one buzz", () => {
    for (const k of ["notify", "success", "warning"] as HapticKind[]) {
      expect(typeof iosHapticPattern(k)).toBe("number");
    }
  });

  it("keeps alert distinct: two buzzes with a pause longer than a buzz between their starts", () => {
    const p = iosHapticPattern("alert");
    expect(p).toEqual([0, expect.any(Number)]);
    expect((p as number[])[1]).toBeGreaterThan(400);
  });
});

describe("haptic", () => {
  const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => undefined);
  afterEach(() => vibrate.mockClear());
  afterAll(() => vibrate.mockRestore());

  it("plays the iOS mapping on an iPhone, and nothing for a tap", () => {
    withPlatform("ios", () => {
      haptic("tap");
      expect(vibrate).not.toHaveBeenCalled();
      haptic("success");
      expect(vibrate).toHaveBeenCalledWith(iosHapticPattern("success"));
    });
  });

  it("keeps the tuned Android patterns on Android", () => {
    withPlatform("android", () => {
      haptic("tap");
      haptic("success");
      expect(vibrate.mock.calls).toEqual([[hapticPattern("tap")], [hapticPattern("success")]]);
    });
  });
});
