/**
 * Splash v1 timing (ledger D-64, packages/design/handoff/splash-v1 § Interactions & behaviour, as changed
 * by CHANGE-2026-10-06). The contract the owner asked for — the splash is up for exactly as long as the
 * boot takes — lives in these rules: done when every task the destination waits for is in AND the
 * 1300ms intro has played. The steps card (and its 400ms per-step minimum) is gone.
 */
import { BOOT_TASKS, INTRO_MS, type TaskTimes, awaitedTasks, pendingTasks, splashDoneAt } from "../timeline";

const at = (session: number | null, profile: number | null, home: number | null): TaskTimes => ({ session, profile, home });

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

  it("anywhere else hands off once the session check is in (onboarding, sign-in, rider, a deep link)", () => {
    for (const d of ["/onboarding", "/phone", "/rider", "/order/abc"]) {
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
  });

  it("lists only the unfinished tasks — what a retry resumes", () => {
    expect(pendingTasks(at(0, 400, null), "/home")).toEqual(["home"]);
    expect(pendingTasks(at(0, null, null), "/home")).toEqual(["profile", "home"]);
    expect(pendingTasks(at(0, null, null), "/phone")).toEqual([]);
    expect(pendingTasks(at(null, null, null), null)).toEqual(["session", "profile", "home"]);
  });
});
