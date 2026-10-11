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

  it("asks for a full read when a booking it had as live is no longer live (only that shows how it ended)", () => {
    const a = merchantBooking({ id: "a", state: "coming" });
    const b = merchantBooking({ id: "b", state: "finding" });
    expect(mergeLiveBookings([a, b], [a])).toBeNull();
    expect(mergeLiveBookings([a], [b])).toBeNull();
  });

  it("adds a live booking the list doesn't hold — a teammate's new one — in its place by time", () => {
    const old = merchantBooking({ id: "old", state: "delivered", createdAt: "2026-09-29T09:00:00.000Z" });
    const a = merchantBooking({ id: "a", state: "coming", createdAt: "2026-09-29T10:00:00.000Z" });
    const fresh = merchantBooking({ id: "fresh", state: "finding", createdAt: "2026-09-29T11:00:00.000Z" });
    expect(mergeLiveBookings([a, old], [a, fresh])?.map((b) => b.id)).toEqual(["fresh", "a", "old"]);
  });

  // Review of MJ-RL26: a delivery with its cash still due, older than the history's newest 50, made every
  // tick a full read too, and never reached the board.
  it("keeps a live booking older than the newest 50: no full read, and it is on the list", () => {
    const history = Array.from({ length: 50 }, (_, i) =>
      merchantBooking({ id: `h${i}`, state: "delivered", createdAt: new Date(Date.UTC(2026, 8, 29, 12) - i * 60_000).toISOString() }),
    );
    const cashDue = merchantBooking({ id: "cash", state: "delivered", cashOnDelivery: due, createdAt: "2026-09-20T10:00:00.000Z" });
    const merged = mergeLiveBookings(history, [cashDue]);
    expect(merged).not.toBeNull();
    expect(merged?.at(-1)?.id).toBe("cash");
    // …and the next tick folds in quietly too.
    expect(mergeLiveBookings(merged!, [cashDue])).not.toBeNull();
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
