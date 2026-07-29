import { ALARM_TONE_FREQUENCIES_HZ, type ToneSink } from "../lib/alarm";

/** Real Web Audio implementation of the two-tone chime. Synthesized (no audio asset to ship/host) —
 *  two short oscillator beeps scheduled back-to-back within the ~1.2s "on" phase. */
export class WebAudioToneSink implements ToneSink {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  resume(): void {
    const ctx = this.getContext();
    if (ctx.state === "suspended") void ctx.resume();
  }

  playChime(): void {
    const ctx = this.getContext();
    if (ctx.state === "suspended") void ctx.resume();
    const beepMs = 500;
    const gapMs = 100;
    ALARM_TONE_FREQUENCIES_HZ.forEach((freq, i) => {
      const startAt = ctx.currentTime + (i * (beepMs + gapMs)) / 1000;
      const stopAt = startAt + beepMs / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startAt);
      // Short attack/release so each beep doesn't click.
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.35, startAt + 0.02);
      gain.gain.setValueAtTime(0.35, stopAt - 0.03);
      gain.gain.linearRampToValueAtTime(0, stopAt);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(stopAt);
    });
  }
}
