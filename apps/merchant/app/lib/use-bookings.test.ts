import { describe, expect, it } from "vitest";
import { bookingsPollMs, isBoardBooking, mergeLiveBookings } from "./use-bookings";
import { merchantBooking } from "../testing/fixtures";

/** MJ-RL26 (2026-10-07): the board reads only its live bookings between full reads of the history. */
describe("the board's live-only reads (MJ-RL26)", () => {
  const due = { amount: "45.00", status: "due" as const, dueAt: null };

  it("counts what the board draws: live bookings, and delivered ones whose cash is still due", () => {
    expect(isBoardBooking(merchantBooking({ state: "finding" }))).toBe(true);
    expect(isBoardBooking(merchantBooking({ state: "finding_again" }))).toBe(true);
    expect(isBoardBooking(merchantBooking({ state: "coming" }))).toBe(true);
    expect(isBoardBooking(merchantBooking({ state: "picked_up" }))).toBe(true);
    expect(isBoardBooking(merchantBooking({ state: "delivered", cashOnDelivery: due }))).toBe(true);
    expect(isBoardBooking(merchantBooking({ state: "delivered", cashOnDelivery: { ...due, status: "returned" } }))).toBe(false);
    expect(isBoardBooking(merchantBooking({ state: "delivered" }))).toBe(false);
    expect(isBoardBooking(merchantBooking({ state: "cancelled" }))).toBe(false);
  });

  it("folds a live read into the day's list when the same bookings are live", () => {
    const ended = merchantBooking({ id: "ended", state: "delivered" });
    const live = merchantBooking({ id: "live", state: "finding", offerCount: 0 });
    const merged = mergeLiveBookings([live, ended], [{ ...live, offerCount: 2 }]);
    expect(merged?.map((b) => [b.id, b.offerCount])).toEqual([
      ["live", 2],
      ["ended", 0],
    ]);
  });

  it("asks for a full read when the live set changed: one ended, one started, a teammate booked one", () => {
    const a = merchantBooking({ id: "a", state: "coming" });
    const b = merchantBooking({ id: "b", state: "finding" });
    expect(mergeLiveBookings([a, b], [a])).toBeNull();
    expect(mergeLiveBookings([a], [a, b])).toBeNull();
    expect(mergeLiveBookings([a], [b])).toBeNull();
  });

  it("reads an older API's whole history (it ignores ?status) the same way", () => {
    const live = merchantBooking({ id: "live", state: "coming" });
    const ended = merchantBooking({ id: "ended", state: "cancelled" });
    expect(mergeLiveBookings([live, ended], [live, ended])).toEqual([live, ended]);
  });

  it("polls at the fastest cadence a live booking needs, else every 30 s (MJ-RM6)", () => {
    expect(bookingsPollMs([merchantBooking({ state: "finding" }), merchantBooking({ state: "coming" })])).toBe(3_000);
    expect(bookingsPollMs([merchantBooking({ state: "coming" })])).toBe(15_000);
    expect(bookingsPollMs([merchantBooking({ state: "delivered" })])).toBe(30_000);
    expect(bookingsPollMs([])).toBe(30_000);
  });
});
