import type { BootSignal } from "../boot-readiness";

/**
 * The splash's timing rules (`packages/design/handoff/splash-v1/README.md` § Interactions & behaviour,
 * as changed by `CHANGE-2026-10-06.md`), as pure functions so the "how long is the splash up" contract
 * is unit-tested without a device.
 *
 * The splash stays up for exactly as long as the boot takes, and never shorter than the brand intro
 * ({@link INTRO_MS}). The three boot tasks (src/boot/boot-readiness.ts) run in parallel. Since the
 * 2026-10-06 change the customer's splash has no steps card, so nothing on screen ticks per task and
 * there is no per-task minimum: the splash is done the moment the last task it waits for is in, or when
 * the intro ends, whichever is later. The rider board's boot keeps its card (see {@link isRiderBoot}).
 */

/** `boot` phase length — the intro timeline ends and the `loading` phase begins. */
export const INTRO_MS = 1300;
/** The slow pill drops in this long into `loading` if the splash is still up. */
export const SLOW_AFTER_MS = 4000;
/**
 * Never-strand bound: if the boot is still not done this long after launch (and the device is not
 * offline — that state has its own "Try again"), hand off anyway. The destination screen already
 * renders its own loading/empty states, so an over-long splash is the worse failure. Not in the
 * handoff (which keeps loading with the slow pill); it only ever fires on a hung request.
 */
export const GIVE_UP_MS = 20_000;

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

/** The three boot tasks, in the handoff's order: the session check, saved places, then Home's content. */
export const BOOT_TASKS: readonly BootSignal[] = ["session", "profile", "home"];
/**
 * The rider board's boot (First Run v2 H1, ledger D-82 §2 #2). It keeps its steps card, because
 * CHANGE-2026-10-06 removed only the customer's ("Don't change Home or the rider splash"). Step 1 is the
 * session, and step 2 ("Getting jobs near you") is the board's first reads (src/boot/rider-board-ready.ts).
 */
export const RIDER_DESTINATION = "/rider";
export const RIDER_TASKS: readonly BootSignal[] = ["session", "rider"];

/** A boot into the rider board. A push-tap deep link into a rider job is not one: it hands off after the session. */
export function isRiderBoot(destination: string | null): boolean {
  return destination === RIDER_DESTINATION;
}

/** When each task resolved (ms since launch), or null while it is still running. */
export type TaskTimes = Readonly<Record<BootSignal, number | null>>;

/**
 * The tasks a boot to `destination` waits for. Home (and a boot whose destination isn't known yet)
 * waits for all three, and the rider board for its two ({@link RIDER_TASKS}). Anywhere else (onboarding,
 * sign-in, a push-tap deep link) waits for the session check alone (handoff: "if there's no valid session, still route to onboarding/login
 * once the session check finishes").
 */
export function awaitedTasks(destination: string | null): readonly BootSignal[] {
  if (destination == null || destination === "/home") return BOOT_TASKS;
  return isRiderBoot(destination) ? RIDER_TASKS : ["session"];
}

/**
 * The awaited tasks that haven't finished. This is the splash's task status: "Try again" resumes only
 * these, because a finished task is stamped once and never runs again (boot-readiness is one-way).
 */
export function pendingTasks(times: TaskTimes, destination: string | null): BootSignal[] {
  return awaitedTasks(destination).filter((task) => times[task] == null);
}

/**
 * When the splash is done (ms since launch): every awaited task is in and the intro has played. Null
 * while one is still running. A rider boot is done once its card's last tick has been seen
 * ({@link CUT_AFTER_TICK_MS}), so it never cuts on a step that didn't visibly complete.
 */
export function splashDoneAt(times: TaskTimes, destination: string | null): number | null {
  if (pendingTasks(times, destination).length) return null;
  if (isRiderBoot(destination)) {
    const last = riderStepTimes(times).doneAt[RIDER_TASKS.length - 1];
    return last == null ? null : last + CUT_AFTER_TICK_MS;
  }
  return Math.max(INTRO_MS, ...awaitedTasks(destination).map((task) => times[task] ?? 0));
}

// ── The rider's steps card (First Run v2 H1, D-82 §2 #2) ──
// The card is splash-v1's old steps card with the rider's two rows. It keeps splash-v1's per-step rules:
// the per-step minimum (so a tick doesn't flicker) and the wait for the last tick before the cut.

/** Minimum time each rider step spends active. */
export const STEP_MIN_ACTIVE_MS = 400;
/** The cut waits this long past the last tick so the tick (a 300ms pop) is actually seen. */
export const CUT_AFTER_TICK_MS = 300;

export type StepState = "pending" | "active" | "done";

export interface StepTimes {
  /** When each step goes active (ms since launch), or null while an earlier step is still running. */
  activeAt: (number | null)[];
  /** When each step is done (ms since launch), or null while its task is still pending. */
  doneAt: (number | null)[];
}

/**
 * Lay steps out on the launch clock. `readyAt[i]` is when step i's task resolved (ms since launch), or
 * null. Steps run in order from the end of the intro: step N goes active when step N-1 is done, and is
 * done at the later of (active + {@link STEP_MIN_ACTIVE_MS}) and the moment its task resolved.
 */
export function stepTimes(readyAt: readonly (number | null)[]): StepTimes {
  const activeAt: (number | null)[] = [];
  const doneAt: (number | null)[] = [];
  let prevDone: number | null = INTRO_MS;
  for (const ready of readyAt) {
    const active: number | null = prevDone;
    const done: number | null = active == null || ready == null ? null : Math.max(active + STEP_MIN_ACTIVE_MS, ready);
    activeAt.push(active);
    doneAt.push(done);
    prevDone = done;
  }
  return { activeAt, doneAt };
}

/** The rider's two steps on the launch clock. */
export function riderStepTimes(times: TaskTimes): StepTimes {
  return stepTimes(RIDER_TASKS.map((task) => times[task]));
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
