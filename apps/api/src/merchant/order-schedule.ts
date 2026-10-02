import { type MerchantHours, ORDER_SCHEDULE, type ScheduleSlot } from "@lynia/shared";
import { harareWallClock } from "./harare-clock";

/**
 * Order flow v2 (ledger D-59, BRIEF §12): the scheduled-order slot math, pure. Venue hours are Harare
 * wall-clock times; Harare is UTC+2 all year (no daylight saving), so a wall time converts to an instant
 * with a fixed offset. Slots start on the half hour (`ORDER_SCHEDULE.slotMinutes`).
 *
 * A slot is offered when the venue can meet it: it starts making the order (the order "rings") at
 * `slot start − lead` (lead = prep + delivery estimate), and that ring time must be
 *  - inside the venue's opening window for that day (open ≤ ring < close),
 *  - not before now (so a same-day slot it can't reach in time is hidden — BRIEF open question 4, as drawn),
 *  - not while it's closed by hand (`closedUntil`).
 * A venue with no hours at all is open all day (the fail-open rule every client applies).
 */

const HARARE_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const MINUTE_MS = 60_000;

export interface SlotDay {
  date: string;
  slots: ComputedSlot[];
}

export interface ComputedSlot {
  start: Date;
  end: Date;
  ringsAt: Date;
  label: string;
}

export interface SlotInputs {
  hours: MerchantHours | null;
  closedUntil: Date | null;
  /** prep + delivery, minutes. */
  leadMinutes: number;
  now: Date;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function hhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}

/** The instant a Harare wall time names: `wallDate` carries the wall calendar day in its LOCAL fields
 *  (as harareWallClock returns), `minutes` is minutes past that wall midnight. */
export function harareWallToInstant(wallDate: Date, minutes: number): Date {
  return new Date(Date.UTC(wallDate.getFullYear(), wallDate.getMonth(), wallDate.getDate()) + minutes * MINUTE_MS - HARARE_OFFSET_MS);
}

/** Today's and tomorrow's slots the venue can meet (before the "Full" count). */
export function computeSlotDays(input: SlotInputs): { today: SlotDay; tomorrow: SlotDay } {
  const wallNow = harareWallClock(input.now);
  const days = [0, 1].map((offset) => {
    const wallDay = new Date(wallNow.getFullYear(), wallNow.getMonth(), wallNow.getDate() + offset);
    const date = `${wallDay.getFullYear()}-${pad(wallDay.getMonth() + 1)}-${pad(wallDay.getDate())}`;
    const window = input.hours ? input.hours[DAY_KEYS[wallDay.getDay()]!] : { open: "00:00", close: "24:00" };
    const slots: ComputedSlot[] = [];
    if (window) {
      const open = parseHHMM(window.open);
      const close = parseHHMM(window.close);
      const step = ORDER_SCHEDULE.slotMinutes;
      // The first slot whose ring time is at or after opening, on a slot boundary.
      let startMin = Math.ceil((open + input.leadMinutes) / step) * step;
      for (; startMin - input.leadMinutes < close; startMin += step) {
        const start = harareWallToInstant(wallDay, startMin);
        const ringsAt = new Date(start.getTime() - input.leadMinutes * MINUTE_MS);
        if (ringsAt.getTime() < input.now.getTime()) continue;
        if (input.closedUntil && ringsAt.getTime() < input.closedUntil.getTime()) continue;
        const end = new Date(start.getTime() + step * MINUTE_MS);
        slots.push({ start, end, ringsAt, label: `${hhmm(startMin)}–${hhmm(startMin + step)}` });
      }
    }
    return { date, slots };
  });
  return { today: days[0]!, tomorrow: days[1]! };
}

/** The slot starting exactly at `startIso`, if the venue offers it. */
export function findSlot(days: { today: SlotDay; tomorrow: SlotDay }, startIso: string): ComputedSlot | null {
  const t = new Date(startIso).getTime();
  if (!Number.isFinite(t)) return null;
  return [...days.today.slots, ...days.tomorrow.slots].find((s) => s.start.getTime() === t) ?? null;
}

export function toWireSlot(slot: ComputedSlot, full: boolean): ScheduleSlot {
  return { start: slot.start.toISOString(), end: slot.end.toISOString(), label: slot.label, full };
}
