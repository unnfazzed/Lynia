/**
 * Merchant alarm discipline (D-05, RESTAURANTS-DECISIONS.md §3 "Merchant alarm").
 *
 * D-05: "The merchant alarm is unlocked at login, by design. Browsers won't loop audio without a
 * gesture, so the sign-in button is labelled 'Sign in & start the alarm'." — signing in is the
 * gesture that unlocks `AudioContext`; the alarm itself (a whole-screen takeover that rings until
 * Accept/Can't-take-it) rings when a real order arrives, which is E2's job once the kitchen queue
 * exists. E1 provides the infrastructure: the AudioContext unlock, resume-on-every-gesture (Chrome
 * can suspend a context that's been silent), and a manual test-ring (the gallery's "Play the alarm
 * to test it" / "Test the order alarm" steps) so a merchant can confirm the tablet's volume before
 * a shift.
 *
 * **The alarm has no off switch** (owner instruction 2026-08-19: "the alarm must always be on no
 * need for manual switching on or off .. No need to activate or deactivate it"). There is no muted
 * state to hold, so `start()` is gated on nothing but "already ringing" — the merchant cannot put
 * the kitchen into a state where a real order arrives silently. `armed` is NOT an on/off switch
 * either: it records whether this page load has had the one user gesture browsers require before
 * they will loop audio, and the shell arms it from the first tap anywhere rather than from a
 * dedicated control (see KitchenConnectionProvider). See docs/DESIGN-DEVIATIONS.md D-32.
 *
 * The tone-timing math is pure and unit-tested without a browser; the actual oscillator scheduling
 * is behind a minimal injectable interface so the class can be driven deterministically in tests.
 */

/** ~1.2s on, 0.8s off per D-05's own parenthetical. */
export const ALARM_TONE_ON_MS = 1200;
export const ALARM_TONE_OFF_MS = 800;
export const ALARM_CYCLE_MS = ALARM_TONE_ON_MS + ALARM_TONE_OFF_MS;
/** High tone then low tone within each "on" phase — the two-tone chime. */
export const ALARM_TONE_FREQUENCIES_HZ = [880, 660] as const;

export type AlarmPhase = "on" | "off";

/** Pure: which phase of the cycle a given elapsed-ms offset falls in. */
export function alarmPhaseAt(elapsedMs: number): AlarmPhase {
  const t = ((elapsedMs % ALARM_CYCLE_MS) + ALARM_CYCLE_MS) % ALARM_CYCLE_MS;
  return t < ALARM_TONE_ON_MS ? "on" : "off";
}

/** Pure: ms remaining until the NEXT phase boundary from a given elapsed-ms offset. */
export function msUntilNextAlarmPhase(elapsedMs: number): number {
  const t = ((elapsedMs % ALARM_CYCLE_MS) + ALARM_CYCLE_MS) % ALARM_CYCLE_MS;
  return t < ALARM_TONE_ON_MS ? ALARM_TONE_ON_MS - t : ALARM_CYCLE_MS - t;
}

/** Minimal seam over Web Audio so the scheduling loop is testable without a real AudioContext. */
export interface ToneSink {
  /** Play the two-tone chime once; may be async (real impl schedules oscillators). */
  playChime(): void;
  resume(): void;
}

export class AlarmController {
  private ringing = false;
  private armed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly sink: ToneSink) {}

  isRinging(): boolean {
    return this.ringing;
  }

  /** True once a user gesture has unlocked audio THIS PAGE LOAD. Resets on every real
   *  reload/reboot, since it's plain in-memory state on a fresh module instance — the shell re-arms
   *  it from the first tap anywhere rather than asking the merchant to turn the alarm back on. */
  isArmed(): boolean {
    return this.armed;
  }

  /** Any real user gesture — the login submit, or the first tap on the authenticated shell after a
   *  reboot — unlocks AudioContext for the rest of this page load. Never surfaced as a control: the
   *  shell calls this from its global gesture listener so the merchant never has to turn anything
   *  on. */
  arm(): void {
    this.armed = true;
    this.sink.resume();
  }

  /** Resume the underlying AudioContext — call on every subsequent user gesture while signed in,
   *  since Chrome may suspend a context that's gone quiet. Idempotent and cheap to call often. */
  resume(): void {
    if (!this.armed) return;
    this.sink.resume();
  }

  /** Start the looping chime (a real incoming order, or a manual test). No-op only if it is already
   *  ringing — there is no muted state to suppress it (see the always-on note above). `durationMs`
   *  bounds a manual test ring (undefined = ring until stop() is called, the D-05 "stops only on
   *  Accept/Can't-take-it" behaviour for a real order). */
  start(durationMs?: number): void {
    if (this.ringing) return;
    this.ringing = true;
    const startedAt = Date.now();
    const tick = () => {
      if (!this.ringing) return;
      const elapsed = Date.now() - startedAt;
      if (durationMs !== undefined && elapsed >= durationMs) {
        this.stop();
        return;
      }
      if (alarmPhaseAt(elapsed) === "on") this.sink.playChime();
      const delay = msUntilNextAlarmPhase(elapsed);
      // A bounded test ring's cutoff can land mid-phase (most often mid "off", the longer gap) — wake
      // up AT the cutoff instead of at the next phase boundary, or a cutoff inside an "off" phase would
      // never be observed until the far side of the following "on" phase.
      const boundedDelay = durationMs !== undefined ? Math.min(delay, durationMs - elapsed) : delay;
      this.timer = setTimeout(tick, boundedDelay);
    };
    tick();
  }

  stop(): void {
    this.ringing = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
