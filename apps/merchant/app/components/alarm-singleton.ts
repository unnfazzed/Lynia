import { AlarmController } from "../lib/alarm";
import { WebAudioToneSink } from "./web-audio-tone-sink";

// One AlarmController (and its one underlying AudioContext) for the tab's whole lifetime — the login
// page's "Sign in & start the alarm" gesture, the shell's arm-on-any-gesture listener and the
// test-ring must share the same unlocked context, not each create their own.
let singleton: AlarmController | null = null;

export function getAlarmController(): AlarmController {
  if (!singleton) singleton = new AlarmController(new WebAudioToneSink());
  return singleton;
}
