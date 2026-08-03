// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QueuePage from "./page";
import { ApiError, getMyMerchant } from "../../lib/api-client";

vi.mock("../../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");
  return { ...actual, getMyMerchant: vi.fn() };
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
      .mockResolvedValueOnce({ id: "m1", name: "Test Kitchen" });

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
      .mockResolvedValueOnce({ id: "m1", name: "Test Kitchen" });

    const { rerender } = render(<QueuePage />);
    await screen.findByText("Couldn't reach the server — check the connection and try again.");
    expect(getMyMerchant).toHaveBeenCalledTimes(1);

    reachable = true;
    rerender(<QueuePage />);

    await screen.findByText("Test Kitchen");
    expect(getMyMerchant).toHaveBeenCalledTimes(2);
  });
});
