// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QueuePage from "./page";
import { ApiError, getMyMerchant } from "../../lib/api-client";
import { merchantProfile } from "../../testing/fixtures";

vi.mock("../../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");
  return { ...actual, getMyMerchant: vi.fn() };
});

// One router object for the whole test run: the page's load callback depends on it, so a fresh object
// per render would re-run the load on every render — just as a real Next router, which is stable, doesn't.
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace, push: vi.fn() };
  return { useRouter: () => router };
});

vi.mock("../../lib/use-queue-poll", () => ({
  useQueuePoll: () => ({ orders: [], loading: false, error: null, refetch: vi.fn(async () => {}) }),
}));

const signOut = vi.fn();
let reachable = true;
vi.mock("../../components/KitchenConnectionProvider", () => ({
  useKitchenConnection: () => ({
    alarm: { ring: vi.fn(), silence: vi.fn(), testRing: vi.fn() },
    actionsDisabled: false,
    reachability: { reachable, attempt: 0, unreachableSinceMs: null },
    signOut,
  }),
}));

vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/queue/QueueBoard", () => ({
  QueueBoard: () => <div>queue board</div>,
}));

// L2's strip on Orders is self-contained; a stand-in makes "is it there?" a one-line check.
vi.mock("../../components/bookings/BookingsStrip", () => ({
  BookingsStrip: () => <div>bookings strip</div>,
}));

const PIN = { point: { lat: -17.83, lng: 31.05 }, landmark: "Opposite Mbare market", contactPhone: "+263771234567" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  reachable = true;
});

// LC-D##: before this fix, a single dropped /merchant/me call at mount left the merchant
// permanently stuck on this error screen — useQueuePoll(state.status === "ready") never starts,
// so the whole order poll + alarm loop never armed, with no button anywhere to try again.
describe("QueuePage initial-load failure has a way out (LC-D##)", () => {
  it("shows a Retry button on a failed load, and retrying recovers to the ready state", async () => {
    vi.mocked(getMyMerchant)
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."))
      .mockResolvedValueOnce(merchantProfile());

    render(<QueuePage />);
    await screen.findByText("Couldn't reach the server — check the connection and try again.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByText("Test Kitchen");
    expect(getMyMerchant).toHaveBeenCalledTimes(2);
  });

  it("auto-retries the instant reachability recovers, without a manual tap — this is the alarm loop, so it can't wait on the merchant noticing", async () => {
    reachable = false;
    vi.mocked(getMyMerchant)
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."))
      .mockResolvedValueOnce(merchantProfile());

    const { rerender } = render(<QueuePage />);
    await screen.findByText("Couldn't reach the server — check the connection and try again.");
    expect(getMyMerchant).toHaveBeenCalledTimes(1);

    reachable = true;
    rerender(<QueuePage />);

    await screen.findByText("Test Kitchen");
    expect(getMyMerchant).toHaveBeenCalledTimes(2);
  });
});

// Merchant web upgrade L1: the old "this number isn't a merchant — contact support" card was a dead
// end. A number that isn't on a business goes to the self-serve sign-up, and a shop (no customer
// orders, so no Orders board) goes to its setup checklist.
describe("QueuePage routes by membership (merchant web upgrade L1)", () => {
  it("a number that isn't on a business (403 not_a_member) goes to the sign-up, not a dead end", async () => {
    vi.mocked(getMyMerchant).mockRejectedValueOnce(new ApiError(403, "This number isn't on a business on LyniaGo yet.", "not_a_member"));

    render(<QueuePage />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
    expect(screen.queryByText("This number isn't on a business on LyniaGo yet.")).toBeNull();
  });

  it("a shop goes to its setup checklist instead of an Orders board (API that can't book riders yet)", async () => {
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile({ businessType: "shop", shopKind: "auto_parts" }));

    render(<QueuePage />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/setup"));
    expect(screen.queryByText("Orders")).toBeNull();
  });

  it("a shop's home is Deliveries once the API can book riders (L2)", async () => {
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile({ businessType: "shop", shopKind: "auto_parts", location: PIN }));

    render(<QueuePage />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/deliveries"));
  });

  it("a restaurant stays on its Orders board, with no bookings strip on an API that can't book riders", async () => {
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile());

    render(<QueuePage />);

    await screen.findByText("Test Kitchen");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText("bookings strip")).toBeNull();
  });

  it("a restaurant gets Book a rider on Orders once the API can book riders (L2)", async () => {
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile({ location: PIN }));

    render(<QueuePage />);

    expect(await screen.findByText("bookings strip")).toBeTruthy();
    expect(screen.getByText("queue board")).toBeTruthy();
  });
});
