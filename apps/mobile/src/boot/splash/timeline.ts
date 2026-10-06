import type { BootSignal } from "../boot-readiness";

/**
 * The splash's timing rules (`packages/design/handoff/splash-v1/README.md` § Interactions & behaviour,
 * as changed by `CHANGE-2026-10-06.md`), as pure functions so the "how long is the splash up" contract
 * is unit-tested without a device.
 *
 * The splash stays up for exactly as long as the boot takes, and never shorter than the brand intro
 * ({@link INTRO_MS}). The three boot tasks (src/boot/boot-readiness.ts) run in parallel. Since the
 * 2026-10-06 change there is no steps card, so nothing on screen ticks per task and there is no
 * per-task minimum: the splash is done the moment the last task it waits for is in, or when the intro
 * ends, whichever is later.
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

/** When each task resolved (ms since launch), or null while it is still running. */
export type TaskTimes = Readonly<Record<BootSignal, number | null>>;

/**
 * The tasks a boot to `destination` waits for. Home (and a boot whose destination isn't known yet)
 * waits for all three. Anywhere else (onboarding, sign-in, the rider app, a push-tap deep link) waits
 * for the session check alone (handoff: "if there's no valid session, still route to onboarding/login
 * once the session check finishes").
 */
export function awaitedTasks(destination: string | null): readonly BootSignal[] {
  return destination == null || destination === "/home" ? BOOT_TASKS : ["session"];
}

/**
 * The awaited tasks that haven't finished. This is the splash's task status: "Try again" resumes only
 * these, because a finished task is stamped once and never runs again (boot-readiness is one-way).
 */
export function pendingTasks(times: TaskTimes, destination: string | null): BootSignal[] {
  return awaitedTasks(destination).filter((task) => times[task] == null);
}

/** When the splash is done (ms since launch): every awaited task is in and the intro has played. Null while one is still running. */
export function splashDoneAt(times: TaskTimes, destination: string | null): number | null {
  if (pendingTasks(times, destination).length) return null;
  return Math.max(INTRO_MS, ...awaitedTasks(destination).map((task) => times[task] ?? 0));
}
