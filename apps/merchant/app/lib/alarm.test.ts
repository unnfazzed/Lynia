import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALARM_CYCLE_MS,
  ALARM_TONE_OFF_MS,
  ALARM_TONE_ON_MS,
  AlarmController,
  alarmPhaseAt,
  msUntilNextAlarmPhase,
  type ToneSink,
} from "./alarm";

describe("alarmPhaseAt", () => {
  it("is 'on' for the first ~1.2s of each cycle and 'off' for the rest", () => {
    expect(alarmPhaseAt(0)).toBe("on");
    expect(alarmPhaseAt(ALARM_TONE_ON_MS - 1)).toBe("on");
    expect(alarmPhaseAt(ALARM_TONE_ON_MS)).toBe("off");
    expect(alarmPhaseAt(ALARM_CYCLE_MS - 1)).toBe("off");
    expect(alarmPhaseAt(ALARM_CYCLE_MS)).toBe("on"); // wraps to the next cycle
  });

  it("wraps correctly across multiple cycles", () => {
    expect(alarmPhaseAt(ALARM_CYCLE_MS * 3 + 10)).toBe("on");
    expect(alarmPhaseAt(ALARM_CYCLE_MS * 3 + ALARM_TONE_ON_MS + 10)).toBe("off");
  });
});

describe("msUntilNextAlarmPhase", () => {
  it("counts down to the off boundary during the on phase", () => {
    expect(msUntilNextAlarmPhase(0)).toBe(ALARM_TONE_ON_MS);
    expect(msUntilNextAlarmPhase(100)).toBe(ALARM_TONE_ON_MS - 100);
  });

  it("counts down to the next on boundary during the off phase", () => {
    expect(msUntilNextAlarmPhase(ALARM_TONE_ON_MS)).toBe(ALARM_TONE_OFF_MS);
    expect(msUntilNextAlarmPhase(ALARM_CYCLE_MS - 1)).toBe(1);
  });
});

function fakeSink(): ToneSink & { chimes: number; resumes: number } {
  return {
    chimes: 0,
    resumes: 0,
    playChime() {
      this.chimes += 1;
    },
    resume() {
      this.resumes += 1;
    },
  };
}

describe("AlarmController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts unarmed, unmuted, not ringing", () => {
    const controller = new AlarmController(fakeSink());
    expect(controller.isArmed()).toBe(false);
    expect(controller.isMuted()).toBe(false);
    expect(controller.isRinging()).toBe(false);
  });

  it("arm() resumes the sink and flips armed — resume() is a no-op before arm()", () => {
    const sink = fakeSink();
    const controller = new AlarmController(sink);
    controller.resume();
    expect(sink.resumes).toBe(0); // not armed yet — D-05's gesture hasn't happened
    controller.arm();
    expect(controller.isArmed()).toBe(true);
    expect(sink.resumes).toBe(1);
    controller.resume();
    expect(sink.resumes).toBe(2);
  });

  it("a muted alarm never rings, even when started", () => {
    const sink = fakeSink();
    const controller = new AlarmController(sink);
    controller.arm();
    controller.setMuted(true);
    controller.start();
    expect(controller.isRinging()).toBe(false);
    expect(sink.chimes).toBe(0);
  });

  it("rings the chime on the 'on' phase and stays silent during the 'off' phase, looping", () => {
    const sink = fakeSink();
    const controller = new AlarmController(sink);
    controller.arm();
    controller.start();
    expect(sink.chimes).toBe(1); // immediate chime at t=0 (on phase)
    vi.advanceTimersByTime(ALARM_TONE_ON_MS); // now in the off phase
    expect(sink.chimes).toBe(1);
    vi.advanceTimersByTime(ALARM_TONE_OFF_MS); // wraps to the next cycle's on phase
    expect(sink.chimes).toBe(2);
    controller.stop();
    expect(controller.isRinging()).toBe(false);
  });

  it("a bounded test ring auto-stops after durationMs", () => {
    const sink = fakeSink();
    const controller = new AlarmController(sink);
    controller.arm();
    controller.start(ALARM_CYCLE_MS + 100);
    expect(controller.isRinging()).toBe(true);
    vi.advanceTimersByTime(ALARM_CYCLE_MS + 200);
    expect(controller.isRinging()).toBe(false);
  });

  it("stop() is idempotent", () => {
    const controller = new AlarmController(fakeSink());
    controller.arm();
    controller.stop();
    expect(controller.isRinging()).toBe(false);
  });
});
