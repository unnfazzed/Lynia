/**
 * Splash v1 timing (ledger D-64, packages/design/handoff/splash-v1 § Interactions & behaviour). The
 * contract the owner asked for — the splash is up for exactly as long as the boot takes — lives in
 * these rules, bounded below by the handoff's two minimums (1300ms intro, 400ms per active step).
 */
import { CUT_AFTER_TICK_MS, INTRO_MS, STEP_MIN_ACTIVE_MS, nextStepChange, shownSteps, splashDoneAt, stepStates, stepTimes } from "../timeline";

describe("stepTimes", () => {
  it("a boot that was ready before the intro ended still shows each step for its minimum", () => {
    const times = stepTimes([0, 0, 0]);
    expect(times.activeAt).toEqual([INTRO_MS, INTRO_MS + STEP_MIN_ACTIVE_MS, INTRO_MS + 2 * STEP_MIN_ACTIVE_MS]);
    expect(times.doneAt).toEqual([1700, 2100, 2500]);
  });

  it("a slow task holds its step — and every later step — until it actually resolves", () => {
    const times = stepTimes([200, 6000, 1000]);
    expect(times.doneAt).toEqual([1700, 6000, 6400]);
  });

  it("a non-Home boot runs step 1 only: step 2 never flashes active as step 1 completes", () => {
    const times = stepTimes([0, 0, 0], shownSteps("/phone"));
    expect(times.activeAt).toEqual([INTRO_MS, null, null]);
    expect(stepStates(times, 1700)).toEqual(["done", "pending", "pending"]);
    expect(shownSteps("/home")).toBe(3);
    expect(shownSteps(null)).toBe(3);
  });

  it("a pending task leaves its step (and the ones after it) open-ended", () => {
    const times = stepTimes([500, null, 900]);
    expect(times.doneAt).toEqual([1700, null, null]);
    expect(times.activeAt).toEqual([1300, 1700, null]);
  });
});

describe("stepStates", () => {
  const times = stepTimes([0, 3000, 3100]);
  it.each([
    [0, ["pending", "pending", "pending"]],
    [1300, ["active", "pending", "pending"]],
    [1700, ["done", "active", "pending"]],
    [3000, ["done", "done", "active"]],
    [3400, ["done", "done", "done"]],
  ])("at %ims", (t, expected) => {
    expect(stepStates(times, t)).toEqual(expected);
  });

  it("schedules the next wake at the next boundary", () => {
    expect(nextStepChange(times, 0)).toBe(1300);
    expect(nextStepChange(times, 1700)).toBe(3000);
    expect(nextStepChange(times, 3400)).toBeNull();
  });
});

describe("splashDoneAt", () => {
  const times = stepTimes([0, 0, 4000]);
  it("Home waits for all three steps", () => {
    expect(splashDoneAt(times, "/home")).toBe(4000); // step 3 went active at 2100; its task resolved at 4000
  });
  it("anywhere else hands off after step 1's tick has been seen (onboarding, sign-in, rider, a deep link)", () => {
    for (const d of ["/onboarding", "/phone", "/rider", "/order/abc"]) expect(splashDoneAt(times, d)).toBe(1700 + CUT_AFTER_TICK_MS);
  });
  it("is not done before the boot decision exists", () => {
    expect(splashDoneAt(times, null)).toBeNull();
  });
});
