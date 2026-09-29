// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingsStrip } from "./BookingsStrip";
import { listBookings } from "../../lib/bookings-api";
import { merchantBooking } from "../../testing/fixtures";

vi.mock("../../lib/bookings-api", () => ({ listBookings: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BookingsStrip, a restaurant's way into Book a rider on Orders (L2)", () => {
  it("offers Book a rider for a phone order when nothing is live", async () => {
    vi.mocked(listBookings).mockResolvedValue([merchantBooking({ state: "delivered" })]);
    render(<BookingsStrip />);
    expect(await screen.findByText("A phone order to deliver? Book a LyniaGo rider.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Book a rider" }).getAttribute("href")).toBe("/deliveries/new");
  });

  it("counts the live bookings, not the ones Send already re-sent, and opens Deliveries", async () => {
    vi.mocked(listBookings).mockResolvedValue([
      merchantBooking({ id: "a", state: "finding" }),
      merchantBooking({ id: "b", state: "picked_up" }),
      // A rider cancelled this one; its re-broadcast (the first row) is the one that counts.
      merchantBooking({ id: "c", state: "cancelled", rebroadcastedToId: "a" }),
      merchantBooking({ id: "d", state: "expired" }),
    ]);
    render(<BookingsStrip />);
    const view = await screen.findByRole("link", { name: /2 bookings live/ });
    expect(view.getAttribute("href")).toBe("/deliveries");
  });

  it("stays quiet when the read fails: it never pushes the kitchen board around", async () => {
    vi.mocked(listBookings).mockRejectedValue(new Error("offline"));
    render(<BookingsStrip />);
    expect(await screen.findByText("A phone order to deliver? Book a LyniaGo rider.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
