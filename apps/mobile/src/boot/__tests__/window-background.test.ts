/**
 * The boot-scoped window background (MOB-BOOT-05, the white-flash half). The native window
 * background ships brand green (app.config.ts) so no boot-timing race can ever expose a white
 * frame; this module is the other half of that contract — the green must RESET to the app's own
 * ground once the destination has settled, or the next keyboard resize on a white screen flashes a
 * green strip instead. Pinned here: the reset is delayed (the green backstop must outlive the
 * release instant), one-shot, targets the app bg token, and — like every boot step since
 * MOB-BOOT-04 — can never throw into the boot path.
 */
import { tokens } from "@lynia/shared/tokens";

const mockSetBackgroundColorAsync = jest.fn(async (_color: string) => {});
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: (color: string) => mockSetBackgroundColorAsync(color),
}));

import {
  WINDOW_BACKGROUND_RESET_DELAY_MS,
  resetWindowBackgroundLatchForTest,
  scheduleWindowBackgroundReset,
} from "../window-background";

beforeEach(() => {
  jest.useFakeTimers();
  mockSetBackgroundColorAsync.mockClear();
  resetWindowBackgroundLatchForTest();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("scheduleWindowBackgroundReset", () => {
  it("keeps the green backstop armed through the release instant, then resets to the app bg", () => {
    scheduleWindowBackgroundReset();
    // Immediately after the boot release the destination's native mount may still be lagging — the
    // green window is exactly what covers that, so it must NOT reset yet.
    jest.advanceTimersByTime(WINDOW_BACKGROUND_RESET_DELAY_MS - 1);
    expect(mockSetBackgroundColorAsync).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2);
    expect(mockSetBackgroundColorAsync).toHaveBeenCalledWith(tokens.color.bg);
  });

  it("is one-shot — a release path that fires twice schedules one reset", () => {
    scheduleWindowBackgroundReset();
    scheduleWindowBackgroundReset();
    jest.advanceTimersByTime(WINDOW_BACKGROUND_RESET_DELAY_MS + 1);
    expect(mockSetBackgroundColorAsync).toHaveBeenCalledTimes(1);
  });

  it("survives a hostile native module — a cosmetic reset must never kill the boot", () => {
    mockSetBackgroundColorAsync.mockImplementationOnce(() => {
      throw new Error("native module unavailable");
    });
    scheduleWindowBackgroundReset();
    expect(() => jest.advanceTimersByTime(WINDOW_BACKGROUND_RESET_DELAY_MS + 1)).not.toThrow();
  });
});
