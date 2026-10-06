/**
 * Splash v1 timing (ledger D-64, packages/design/handoff/splash-v1 § Interactions & behaviour, as changed
 * by CHANGE-2026-10-06). The contract the owner asked for — the splash is up for exactly as long as the
 * boot takes — lives in these rules: done when every task the destination waits for is in AND the
 * 1300ms intro has played. The steps card (and its 400ms per-step minimum) is gone.
 */
import {
  BOOT_TASKS,
  CUT_AFTER_TICK_MS,
  INTRO_MS,
  RIDER_TASKS,
  STEP_MIN_ACTIVE_MS,
  type TaskTimes,
  awaitedTasks,
  isRiderBoot,
  nextStepChange,
  pendingTasks,
  riderStepTimes,
  splashDoneAt,
  stepStates,
} from "../timeline";

const at = (session: number | null, profile: number | null, home: number | null, rider: number | null = null): TaskTimes => ({ session, profile, home, rider });

describe("splashDoneAt", () => {
  it("Home waits for all three tasks", () => {
    expect(splashDoneAt(at(200, 3000, 4000), "/home")).toBe(4000);
    expect(splashDoneAt(at(200, 6000, 1000), "/home")).toBe(6000); // the tasks run in parallel: the last one in decides
    expect(splashDoneAt(at(200, 3000, null), "/home")).toBeNull();
  });

  it("never before the 1300ms intro has played, however fast the tasks are", () => {
    expect(splashDoneAt(at(0, 0, 0), "/home")).toBe(INTRO_MS);
    expect(splashDoneAt(at(100, 900, 1299), "/home")).toBe(INTRO_MS);
  });

  it("no per-task minimum any more: a task that lands after the intro ends the splash at that moment", () => {
    expect(splashDoneAt(at(0, 0, 1301), "/home")).toBe(1301);
  });

  it("anywhere else hands off once the session check is in (onboarding, sign-in, a deep link — the rider board has its own two)", () => {
    for (const d of ["/onboarding", "/phone", "/rider/job", "/order/abc"]) {
      expect(splashDoneAt(at(0, null, null), d)).toBe(INTRO_MS);
      expect(splashDoneAt(at(2500, null, null), d)).toBe(2500);
    }
  });

  it("is not done before the boot decision exists", () => {
    expect(splashDoneAt(at(null, 500, 900), null)).toBeNull();
  });
});

describe("task status", () => {
  it("Home (and a boot not yet decided) waits on all three; anywhere else on the session check alone", () => {
    expect(awaitedTasks("/home")).toEqual(BOOT_TASKS);
    expect(awaitedTasks(null)).toEqual(BOOT_TASKS);
    expect(awaitedTasks("/phone")).toEqual(["session"]);
    expect(awaitedTasks("/rider")).toEqual(RIDER_TASKS);
  });

  it("lists only the unfinished tasks — what a retry resumes", () => {
    expect(pendingTasks(at(0, 400, null), "/home")).toEqual(["home"]);
    expect(pendingTasks(at(0, null, null), "/home")).toEqual(["profile", "home"]);
    expect(pendingTasks(at(0, null, null), "/phone")).toEqual([]);
    expect(pendingTasks(at(null, null, null), null)).toEqual(["session", "profile", "home"]);
  });
});

describe("the rider boot keeps its steps card (First Run v2 H1, ledger D-81 §2 #2)", () => {
  it("is the rider board only: a push-tap into a rider job hands off after the session", () => {
    expect(isRiderBoot("/rider")).toBe(true);
    expect(isRiderBoot("/rider/job")).toBe(false);
    expect(isRiderBoot("/home")).toBe(false);
    expect(isRiderBoot(null)).toBe(false);
  });

  it("runs its two steps in order from the end of the intro, each active for at least the minimum", () => {
    const times = riderStepTimes(at(0, null, null, 5000));
    expect(times.activeAt).toEqual([INTRO_MS, INTRO_MS + STEP_MIN_ACTIVE_MS]);
    expect(times.doneAt).toEqual([INTRO_MS + STEP_MIN_ACTIVE_MS, 5000]);
    expect(stepStates(times, 1000)).toEqual(["pending", "pending"]);
    expect(stepStates(times, INTRO_MS)).toEqual(["active", "pending"]);
    expect(stepStates(times, 2000)).toEqual(["done", "active"]);
    expect(stepStates(times, 5000)).toEqual(["done", "done"]);
    expect(nextStepChange(times, 2000)).toBe(5000);
    expect(nextStepChange(times, 5000)).toBeNull();
  });

  it("waits for step 2 (the board's first reads), then cuts once its tick has been seen", () => {
    expect(splashDoneAt(at(0, null, null, 5000), "/rider")).toBe(5000 + CUT_AFTER_TICK_MS);
    expect(splashDoneAt(at(0, null, null, null), "/rider")).toBeNull();
    // A board that was ready at once still shows both ticks.
    expect(splashDoneAt(at(0, null, null, 0), "/rider")).toBe(INTRO_MS + 2 * STEP_MIN_ACTIVE_MS + CUT_AFTER_TICK_MS);
  });

  it("a retry resumes only the rider's unfinished task", () => {
    expect(pendingTasks(at(0, null, null, null), "/rider")).toEqual(["rider"]);
    expect(pendingTasks(at(null, null, null, null), "/rider")).toEqual(["session", "rider"]);
  });
});
