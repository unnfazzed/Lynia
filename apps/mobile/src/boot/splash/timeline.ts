/**
 * The splash's timing rules (`packages/design/handoff/splash-v1/README.md` § Interactions & behaviour),
 * as pure functions so the "how long is the splash up" contract is unit-tested without a device.
 *
 * The splash stays up for exactly as long as the boot takes, bounded below by the handoff's two
 * minimums so a fast boot still reads:
 *  - the brand intro plays for {@link INTRO_MS} before loading starts;
 *  - each step spends at least {@link STEP_MIN_ACTIVE_MS} in the active state, so ticks don't flicker.
 * Steps run in order: step N goes active when step N-1 is done, and is done at the later of
 * (active + minimum) and the moment its real task resolved. A task that resolved early (Home's data
 * is often in cache) simply ticks after its minimum.
 */

/** `boot` phase length — the intro timeline ends and the `loading` phase begins. */
export const INTRO_MS = 1300;
/** Minimum time each step spends active. */
export const STEP_MIN_ACTIVE_MS = 400;
/** The slow pill drops in this long into `loading` if the splash is still up. */
export const SLOW_AFTER_MS = 4000;
/**
 * Never-strand bound: if the boot is still not done this long after launch (and the device is not
 * offline — that state has its own "Try again"), hand off anyway. The destination screen already
 * renders its own loading/empty states, so an over-long splash is the worse failure. Not in the
 * handoff (which keeps loading with the slow pill); it only ever fires on a hung request.
 */
export const GIVE_UP_MS = 20_000;
/**
 * A non-Home boot ends after step 1 (handoff: "route to onboarding/login after step 1"). The cut waits
 * this long past step 1's tick so the tick is actually SEEN — it pops in over 300ms (§ Steps card);
 * cutting in the same render as the tick showed a step that never visibly completed.
 */
export const CUT_AFTER_TICK_MS = 300;

/** Exit (`done`) timings, from the moment the splash is done. */
export const EXIT = {
  orbitMs: 500,
  doveMs: 200,
  sunMs: 650,
  /** Home starts sliding up at this offset… */
  homeDelayMs: 450,
  /** …and takes this long. */
  homeMs: 700,
  /** Reduced motion: every state change is a 200ms cross-fade. */
  fadeMs: 200,
} as const;

export type StepState = "pending" | "active" | "done";

export interface StepTimes {
  /** When each step goes active (ms since launch), or null while an earlier step is still running. */
  activeAt: (number | null)[];
  /** When each step is done (ms since launch), or null while its task is still pending. */
  doneAt: (number | null)[];
}

/**
 * Lay the steps out on the launch clock. `readyAt[i]` is when step i's real task resolved (ms since
 * launch), or null if it hasn't. Only the first `shown` steps ever run: the rest stay pending (a
 * non-Home boot shows step 1 only, so step 2 must not flash "active" as step 1 completes).
 */
export function stepTimes(readyAt: readonly (number | null)[], shown: number = readyAt.length): StepTimes {
  const activeAt: (number | null)[] = [];
  const doneAt: (number | null)[] = [];
  let prevDone: number | null = INTRO_MS;
  for (const [i, ready] of readyAt.entries()) {
    const active: number | null = i < shown ? prevDone : null;
    const done: number | null = active == null || ready == null ? null : Math.max(active + STEP_MIN_ACTIVE_MS, ready);
    activeAt.push(active);
    doneAt.push(done);
    prevDone = done;
  }
  return { activeAt, doneAt };
}

/** Each step's state at `t` (ms since launch). */
export function stepStates(times: StepTimes, t: number): StepState[] {
  return times.activeAt.map((active, i) => {
    const done = times.doneAt[i];
    if (done != null && t >= done) return "done";
    if (active != null && t >= active) return "active";
    return "pending";
  });
}

/** The next moment (ms since launch) after `t` at which a step changes state, or null if none is scheduled. */
export function nextStepChange(times: StepTimes, t: number): number | null {
  const upcoming = [...times.activeAt, ...times.doneAt].filter((x): x is number => x != null && x > t);
  return upcoming.length ? Math.min(...upcoming) : null;
}

/** How many steps a boot to `destination` shows: all three for Home (and while still undecided), else step 1. */
export function shownSteps(destination: string | null): number {
  return destination == null || destination === "/home" ? 3 : 1;
}

/**
 * When the splash is done, given where the boot is going. Home waits for all three steps (the
 * handoff's `done`). Anywhere else — onboarding, sign-in, the rider app, a push-tap deep link —
 * "skip the exit and route … after step 1": only the session step is shown, and the cut waits for its
 * tick to be seen ({@link CUT_AFTER_TICK_MS}).
 */
export function splashDoneAt(times: StepTimes, destination: string | null): number | null {
  if (destination == null) return null;
  if (destination === "/home") return times.doneAt[2] ?? null;
  const step1 = times.doneAt[0] ?? null;
  return step1 == null ? null : step1 + CUT_AFTER_TICK_MS;
}
