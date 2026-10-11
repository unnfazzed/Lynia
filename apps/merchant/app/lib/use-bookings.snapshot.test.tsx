// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listBookings } from "./bookings-api";
import { invalidateReads } from "./read-cache";
import { clearBookingsSnapshot, useBookings } from "./use-bookings";
import { merchantBooking } from "../testing/fixtures";

vi.mock("./bookings-api", () => ({ listBookings: vi.fn() }));

const LIVE = merchantBooking({ id: "b1000000-0000-4000-8000-000000000000", state: "coming" });

afterEach(() => {
  cleanup();
  clearBookingsSnapshot();
  vi.clearAllMocks();
});

describe("MJ-RM5 review: one bookings read shared across tab hops", () => {
  it("a second screen starts from the first one's list and reads only the live bookings, not the whole history", async () => {
    vi.mocked(listBookings).mockResolvedValue([LIVE]);
    const first = renderHook(() => useBookings(true));
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    expect(listBookings).toHaveBeenCalledWith();
    first.unmount();
    vi.mocked(listBookings).mockClear();

    const second = renderHook(() => useBookings(true));
    expect(second.result.current.loaded).toBe(true);
    expect(second.result.current.bookings.map((b) => b.id)).toEqual([LIVE.id]);
    await waitFor(() => expect(listBookings).toHaveBeenCalledTimes(1));
    expect(listBookings).toHaveBeenCalledWith({ live: true });
  });

  it("a write or branch switch in between drops the shared list: the next screen reads it all", async () => {
    vi.mocked(listBookings).mockResolvedValue([LIVE]);
    const first = renderHook(() => useBookings(true));
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    first.unmount();
    invalidateReads();
    vi.mocked(listBookings).mockClear();

    const second = renderHook(() => useBookings(true));
    expect(second.result.current.loaded).toBe(false);
    await waitFor(() => expect(listBookings).toHaveBeenCalledTimes(1));
    expect(listBookings).toHaveBeenCalledWith();
  });
});
