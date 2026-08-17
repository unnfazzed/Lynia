/**
 * B-O1b: the rider board's "Open orders" list was a plain ScrollView + `.map()` over up to 50
 * `JobCard`s — same unbounded-concurrent-mount shape B-O1 fixed for history/notifications and B-T3
 * fixed for the restaurant catalog. Converting it needed a real structural split (this screen carries
 * the whole KYC/location/online-gate ternary tree around the list, with zero prior test coverage), so
 * this pins two things: (1) the online/verified/no-gate state renders the open-orders list through a
 * single FlatList carrying the full dataset, and (2) every gated state (not yet a verified rider,
 * location denied, online-gate refusal, offline) renders NEITHER a FlatList NOR the stale `ranked`
 * data — confirming `showOpenOrdersList`'s early return can't leak the open-orders list into a screen
 * state that shouldn't show it.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { FlatList } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { OpenOrder, OrderSnapshot } from "../../../../src/api/orders";
import type { Me } from "../../../../src/api/auth";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

const mockGetMe = jest.fn<Promise<Me>, []>();
const mockGetActiveOrder = jest.fn();
const mockGetOpenOrders = jest.fn<Promise<OpenOrder[]>, unknown[]>();
const mockUseRiderBoard = jest.fn();
const mockSetOnline = jest.fn(async (online: boolean, _loc?: unknown) => ({ online }));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/rider",
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(cb, []);
  },
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: -17.83, longitude: 31.05 } }),
  getLastKnownPositionAsync: async () => null,
  Accuracy: { Balanced: 3 },
}));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../../src/api/auth", () => ({
  getMe: () => mockGetMe(),
}));
jest.mock("../../../../src/api/orders", () => ({
  getActiveOrder: (...args: unknown[]) => mockGetActiveOrder(...args),
  getOpenOrders: (...args: unknown[]) => mockGetOpenOrders(...args),
}));
jest.mock("../../../../src/api/offers", () => ({ makeOffer: jest.fn() }));
// The 8c mint header reads the unread count for the bell's gold dot. Mock it rather than let it
// fail: an unmocked `apiFetch` throws a network error, which flips `src/net/reachability` — and so
// react-query's PROCESS-WIDE `onlineManager` — offline, pausing every later query in this file.
jest.mock("../../../../src/api/notifications", () => ({
  getNotificationsUnreadCount: async () => ({ count: 0 }),
}));
jest.mock("../../../../src/api/riders", () => ({
  retryKyc: jest.fn(),
  sendHeartbeat: jest.fn(async () => ({ online: true })),
  setOnline: (online: boolean, loc?: unknown) => mockSetOnline(online, loc),
}));
jest.mock("../../../../src/auth/session", () => ({
  loadAcknowledgedHandbacks: async () => [],
}));
jest.mock("../../../../src/push/push", () => ({ pushOnce: jest.fn() }));
jest.mock("../../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: () => undefined,
}));
jest.mock("../../../../src/realtime/use-rider-board", () => ({
  useRiderBoard: (...args: unknown[]) => mockUseRiderBoard(...args),
}));
jest.mock("../../../../src/net/use-feature-flags", () => ({
  useFeatureFlags: () => ({ merchantDispatchAutoEnabled: false }),
}));

import RiderHome from "../index";
import { makeOffer } from "../../../../src/api/offers";

const mockMakeOffer = makeOffer as jest.MockedFunction<typeof makeOffer>;

function meFixture(overrides: Partial<NonNullable<Me["rider"]>> = {}): Me {
  return {
    profileId: "p1",
    role: "rider",
    firstName: "Tapiwa",
    lastName: "R",
    phone: "+263700000000",
    email: null,
    photoUrl: null,
    ordersCount: 0,
    idNumber: "63-123456-A-42",
    rider: {
      bikeReg: "ABC123",
      kycStatus: "verified",
      ratingAvg: 4.8,
      ratingCount: 12,
      tripsCount: 20,
      isOnline: true,
      kycMode: "auto",
      ...overrides,
    },
  };
}

function openOrderFixture(id: string): OpenOrder {
  return {
    id,
    pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: `Pickup ${id}` },
    dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: `Dropoff ${id}` },
    itemDesc: "A parcel",
    suggestedFare: "5.00",
    proposedFare: "5.00",
    distanceKm: 3.2,
    createdAt: "2026-08-03T10:00:00Z",
  };
}

function renderScreen(seed?: (qc: QueryClient) => void): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Lets a test start from a WARM cache — the real cold-start shape, since ["me"] is both persisted
  // across launches (src/query/persist.ts) and pre-seeded by useBootstrap.
  seed?.(qc);
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <RiderHome />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let activeTree: renderer.ReactTestRenderer | null = null;
beforeEach(() => {
  mockUseRiderBoard.mockReturnValue({
    connected: true,
    expiredOrderIds: new Set<string>(),
    takenOrderIds: new Set<string>(),
    boardTakenNudge: 0,
  });
});
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  jest.clearAllMocks();
});

describe("rider board (B-O1b: open-orders list must be virtualized, and only when it's actually shown)", () => {
  it("online + verified + no gate: renders the open-orders list via a single FlatList carrying the full dataset", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    const orders = Array.from({ length: 12 }, (_, i) => openOrderFixture(`order-${i}`));
    mockGetOpenOrders.mockResolvedValue(orders);

    activeTree = renderScreen();
    await settle();
    await settle();

    const lists = activeTree.root.findAllByType(FlatList);
    expect(lists).toHaveLength(1);
    expect(lists[0]!.props.data).toHaveLength(orders.length);
    expect(lists[0]!.props.data.map((r: { o: OpenOrder }) => r.o.id).sort()).toEqual(orders.map((o) => o.id).sort());
  });

  it("not yet a verified rider (knownUnverified gate): renders no FlatList and does not leak open-order data", async () => {
    mockGetMe.mockResolvedValue({ ...meFixture(), rider: null });
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("should-not-appear")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(activeTree.root.findAllByType(FlatList)).toHaveLength(0);
    const hasSetupCopy = activeTree.root.findAll((n) => {
      const c = n.props.children;
      const flat = Array.isArray(c) ? c.join("") : typeof c === "string" ? c : "";
      return flat.includes("Set up as a rider");
    });
    expect(hasSetupCopy.length).toBeGreaterThan(0);
  });

  it("KYC pending (gated, online may have been true server-side): renders no FlatList", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "manual" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("should-not-appear")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(activeTree.root.findAllByType(FlatList)).toHaveLength(0);
  });
});

/**
 * B-O9 (bundled into B-O2's memo pass): `ranked` used to be recomputed inline in the render body, and
 * the compose card's per-row `onAction={() => chooseOrder(o)}` was a fresh closure per row per render
 * — either alone hands FlatList a new `data`/`renderItem` reference on every board render, which
 * defeats VirtualizedList's own `CellRenderer` PureComponent bail-out (and, in turn, JobCard's B-O2
 * memo boundary) regardless of how stable the actual order data is. A keystroke in the compose card's
 * ETA field is a plain top-level useState, unrelated to the open-orders list — it must not hand
 * FlatList new `data`/`renderItem` props.
 */
describe("rider board (B-O9: ranked/renderItem must stay referentially stable across unrelated board churn)", () => {
  it("typing in the compose card's ETA field does not change FlatList's data or renderItem identity", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    const orders = Array.from({ length: 3 }, (_, i) => openOrderFixture(`order-${i}`));
    mockGetOpenOrders.mockResolvedValue(orders);

    activeTree = renderScreen();
    await settle();
    await settle();

    // Open the compose card via the first row's "Make an offer" action.
    const actionButtons = activeTree.root.findAll(
      (n) => n.props.label === "Make an offer" && typeof n.props.onPress === "function",
    );
    expect(actionButtons.length).toBeGreaterThan(0);
    act(() => {
      (actionButtons[0]!.props as { onPress: () => void }).onPress();
    });

    const listBefore = activeTree.root.findAllByType(FlatList)[0]!;
    const dataBefore = listBefore.props.data;
    const renderItemBefore = listBefore.props.renderItem;

    const etaField = activeTree.root.findAll(
      (n) => typeof n.props.onChangeText === "function" && n.props.keyboardType === "number-pad",
    )[0];
    expect(etaField).toBeDefined();
    act(() => {
      (etaField!.props as { onChangeText: (t: string) => void }).onChangeText("12");
    });

    const listAfter = activeTree.root.findAllByType(FlatList)[0]!;
    expect(listAfter.props.data).toBe(dataBefore);
    expect(listAfter.props.renderItem).toBe(renderItemBefore);
  });
});

function activeJobFixture(): OrderSnapshot {
  return {
    id: "job-1",
    status: "assigned",
    agreedFare: "5.00",
    proposedFare: "5.00",
    pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Pickup" },
    dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Dropoff" },
    rider: { profileId: "p1", currentLat: -17.83, currentLng: 31.05, updatedAt: "2026-08-04T10:00:00Z" },
    events: [],
    counterpartyPhone: null,
    expiresAt: null,
  };
}

// A-O4: `activeJob`'s REST poll used to have no `online`/active-job gate at all — it ran the 8s
// self-heal poll indefinitely even while the rider was fully offline with no job to track, forever
// (KNOWN backlog, `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane A). The fix can't just
// flip to `enabled: online` (the sibling pattern `openOrders` uses) because the "Go offline" button has
// no active-job guard, so a rider can go offline mid-delivery and still needs this poll to track that
// job to completion — and a cold app open while offline still needs its one-shot mount fetch to
// discover a leftover active job from a prior session. So the mount fetch must always fire, and only
// the RECURRING interval should stop once a completed fetch confirms offline-with-no-job.
async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe("rider board (A-O4: activeJob self-heal poll must stop once offline confirms no active job)", () => {
  it(
    "offline, no active job: fetches once on mount, then the 8s poll never fires again",
    async () => {
      mockUseRiderBoard.mockReturnValue({
        connected: false,
        expiredOrderIds: new Set<string>(),
        takenOrderIds: new Set<string>(),
        boardTakenNudge: 0,
      });
      mockGetMe.mockResolvedValue(meFixture({ isOnline: false }));
      mockGetActiveOrder.mockResolvedValue(null);
      mockGetOpenOrders.mockResolvedValue([]);

      activeTree = renderScreen();
      await settle();
      await settle();
      expect(mockGetActiveOrder).toHaveBeenCalledTimes(1);

      await wait(9000);
      expect(mockGetActiveOrder).toHaveBeenCalledTimes(1);
    },
    15000,
  );

  it(
    "offline WITH an active job: the 8s self-heal poll keeps tracking it to completion",
    async () => {
      mockUseRiderBoard.mockReturnValue({
        connected: false,
        expiredOrderIds: new Set<string>(),
        takenOrderIds: new Set<string>(),
        boardTakenNudge: 0,
      });
      mockGetMe.mockResolvedValue(meFixture({ isOnline: false }));
      mockGetActiveOrder.mockResolvedValue(activeJobFixture());
      mockGetOpenOrders.mockResolvedValue([]);

      activeTree = renderScreen();
      await settle();
      await settle();
      expect(mockGetActiveOrder).toHaveBeenCalledTimes(1);

      await wait(9000);
      expect(mockGetActiveOrder.mock.calls.length).toBeGreaterThanOrEqual(2);
    },
    15000,
  );
});

/**
 * RJM.board_empty / RJM offline realignment (parity task #48, display-only pass). The empty-board state
 * was restructured to the mock's `Card(EmptyState(ghost "Refresh"))` (RiderBoardEmptyView) and the
 * offline toggle card kept its handler; this pins that NEITHER wiring regressed — the Refresh action
 * still forwards `openQ.refetch()` (re-fetches the open-orders board) and the online toggle still calls
 * `onlineM.mutate` (→ setOnline). A change that dropped a row or mis-wired either action would fail here.
 */
describe("rider board (RJM.board_empty + offline: refetch/online-toggle wiring must survive the realignment)", () => {
  it("online + verified + empty board: tapping the empty-state Refresh re-fetches the open-orders board (openQ.refetch)", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]); // empty board → RiderBoardEmptyView renders

    activeTree = renderScreen();
    await settle();
    await settle();

    // The adopted empty view's ghost "Refresh" — the only action, wired to openQ.refetch().
    const refresh = activeTree.root.findAll(
      (n) => n.props.label === "Refresh" && typeof n.props.onPress === "function",
    );
    expect(refresh.length).toBeGreaterThan(0);

    const callsBefore = mockGetOpenOrders.mock.calls.length;
    act(() => {
      (refresh[0]!.props as { onPress: () => void }).onPress();
    });
    await settle();

    // Refresh re-runs the open-orders query (getOpenOrders is what openQ.refetch re-invokes).
    expect(mockGetOpenOrders.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("offline: the online toggle's 'Go online' still calls onlineM.mutate (setOnline(true))", async () => {
    mockGetMe.mockResolvedValue(meFixture({ isOnline: false }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();

    const goOnline = activeTree.root.findAll(
      (n) => n.props.label === "Go online" && typeof n.props.onPress === "function",
    );
    expect(goOnline.length).toBeGreaterThan(0);

    mockSetOnline.mockClear();
    act(() => {
      (goOnline[0]!.props as { onPress: () => void }).onPress();
    });
    await settle();

    expect(mockSetOnline).toHaveBeenCalledTimes(1);
    expect(mockSetOnline.mock.calls[0]![0]).toBe(true);
  });
});

/**
 * RJM.offer_parcel realignment (parity task #48). The parcel offer-compose card was restructured to the
 * RJM mock's Card (TypeTag · "Sender asking" · Money, then one always-shown "Your fare (USD)" field and a
 * "You'll be there in" field), retiring the old segmented accept/counter tablist — a presentation-only
 * change. This pins that the SENSITIVE agreed-price seam survived byte-identical: (1) "Send offer" still
 * calls `makeOffer(orderId, { type, offeredFare, etaMinutes })` with the same arg shape (default one-tap =
 * the asking price → an "accept" bid); (2) the one-offer-per-job rule still removes a bid order from the
 * board so it can't be offered on twice; (3) the ghost "Skip this job" still dismisses the card WITHOUT
 * submitting an offer. A change that mis-wired the mutation, dropped the one-offer filter, or turned Skip
 * into a submit would fail here.
 */
describe("rider board (RJM.offer_parcel: the agreed-price makeOffer seam must survive the realignment)", () => {
  async function openComposeForFirstRow(): Promise<renderer.ReactTestRenderer> {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    const orders = Array.from({ length: 3 }, (_, i) => openOrderFixture(`order-${i}`));
    mockGetOpenOrders.mockResolvedValue(orders);

    const tree = renderScreen();
    await settle();
    await settle();

    const actionButtons = tree.root.findAll(
      (n) => n.props.label === "Make an offer" && typeof n.props.onPress === "function",
    );
    expect(actionButtons.length).toBeGreaterThan(0);
    act(() => {
      (actionButtons[0]!.props as { onPress: () => void }).onPress();
    });
    return tree;
  }

  it("tapping 'Send offer' calls makeOffer with the agreed-price arg shape (orderId + type/offeredFare/etaMinutes)", async () => {
    mockMakeOffer.mockResolvedValue(undefined as never);
    activeTree = await openComposeForFirstRow();

    const send = activeTree.root.findAll(
      (n) => n.props.label === "Send offer" && typeof n.props.onPress === "function",
    );
    expect(send.length).toBe(1);
    act(() => {
      (send[0]!.props as { onPress: () => void }).onPress();
    });
    await settle();

    // Default one-tap = the sender's asking price ($5.00), so the bid is an "accept" of the asking price.
    expect(mockMakeOffer).toHaveBeenCalledTimes(1);
    expect(mockMakeOffer.mock.calls[0]![0]).toBe("order-0");
    expect(mockMakeOffer.mock.calls[0]![1]).toEqual(
      expect.objectContaining({ type: "accept", offeredFare: 5, etaMinutes: expect.any(Number) }),
    );
  });

  it("the one-offer-per-job rule still removes a bid order from the board (no second offer possible)", async () => {
    mockMakeOffer.mockResolvedValue(undefined as never);
    activeTree = await openComposeForFirstRow();

    const idsBefore = activeTree.root.findAllByType(FlatList)[0]!.props.data.map((r: { o: OpenOrder }) => r.o.id);
    expect(idsBefore).toContain("order-0");

    const send = activeTree.root.findAll(
      (n) => n.props.label === "Send offer" && typeof n.props.onPress === "function",
    )[0]!;
    act(() => {
      (send.props as { onPress: () => void }).onPress();
    });
    await settle();

    // Having bid on order-0, it leaves the board (bidIds filters `ranked`) — there is no row to bid on again.
    const idsAfter = activeTree.root.findAllByType(FlatList)[0]!.props.data.map((r: { o: OpenOrder }) => r.o.id);
    expect(idsAfter).not.toContain("order-0");
  });

  it("the ghost 'Skip this job' dismisses the compose card WITHOUT calling makeOffer", async () => {
    mockMakeOffer.mockResolvedValue(undefined as never);
    activeTree = await openComposeForFirstRow();

    expect(activeTree.root.findAll((n) => n.props.label === "Send offer").length).toBe(1);

    const skip = activeTree.root.findAll(
      (n) => n.props.label === "Skip this job" && typeof n.props.onPress === "function",
    );
    expect(skip.length).toBe(1);
    act(() => {
      (skip[0]!.props as { onPress: () => void }).onPress();
    });
    await settle();

    // The compose card is gone and no bid was submitted.
    expect(activeTree.root.findAll((n) => n.props.label === "Send offer").length).toBe(0);
    expect(mockMakeOffer).not.toHaveBeenCalled();
  });
});

/**
 * MOB-BOOT-02 (sibling of the feature-flag boot flash): `online` was seeded with a flat `false` and
 * reconciled from the server's `rider.isOnline` in a PASSIVE effect. With `["me"]` already warm —
 * which is the normal cold start, since it is persisted across launches and pre-seeded by
 * useBootstrap — `meQ.isLoading` is false on the first render, so the loading skeleton does not cover
 * the gap: the RJM `offline` presentation ("Go online to see and bid on nearby orders", no board)
 * committed and painted before the effect could flip it. A rider relaunching mid-shift watched their
 * own board blink through Offline. Seeding the state from the warm cache closes the gap at the source.
 */
describe("rider board — a mid-shift relaunch never flashes Offline (MOB-BOOT-02)", () => {
  const OFFLINE_COPY = "Go online to see and bid on nearby orders.";

  function offlineCopyHits(tree: renderer.ReactTestRenderer): number {
    return tree.root.findAll((n) => typeof n.props.children === "string" && n.props.children.includes(OFFLINE_COPY)).length;
  }

  it("renders online from the FIRST frame when a warm ['me'] already says the rider is on shift", async () => {
    const me = meFixture({ isOnline: true });
    mockGetMe.mockResolvedValue(me);
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen((qc) => qc.setQueryData(["me"], me));

    // Asserted BEFORE any settle(): this is the first committed frame, the one the rider actually saw
    // flash. Pre-fix, `online` was false here and the offline card rendered.
    expect(offlineCopyHits(activeTree)).toBe(0);

    await settle();
    await settle();
    expect(offlineCopyHits(activeTree)).toBe(0);
  });

  it("still renders offline from a warm ['me'] that says the rider is off shift — the seed reads the cache, it doesn't assume online", async () => {
    const me = meFixture({ isOnline: false });
    mockGetMe.mockResolvedValue(me);
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen((qc) => qc.setQueryData(["me"], me));
    await settle();
    await settle();

    expect(offlineCopyHits(activeTree)).toBeGreaterThan(0);
  });
});

/**
 * Owner instruction, 2026-08-12 (device photo of the rider board): the board must NOT raise an error
 * card for a background poll the rider never triggered. UX20-01's `ActiveJobCheckFailedBanner` did
 * exactly that — it rendered on bare `activeQ.isError`, so any flaky link camped a red
 * "Couldn't check for an active job" + Retry card at the top of the board, re-erroring every 8s. The
 * photo caught it on the KYC gate, where an unverified rider cannot have an assigned job at all.
 *
 * This pins the removal on both render paths (the verified/online FlatList branch and the gated
 * ScrollView branch), and pins that nothing else regressed with it: a SUCCESSFUL check still renders
 * the "You have an active job" way-back card, which is the safety net UX20-01 actually cared about.
 */
describe("rider board (owner 2026-08-12: a failing background active-job check must raise no error card)", () => {
  const FAILED_CHECK_COPY = "Couldn't check for an active job";
  function failedCheckHits(tree: renderer.ReactTestRenderer): number {
    return tree.root.findAll((n) => {
      const c = n.props.children;
      const flat = Array.isArray(c) ? c.join("") : typeof c === "string" ? c : "";
      // The copy renders through `&apos;`, which RN resolves to a real "'" in the committed tree.
      return flat.includes(FAILED_CHECK_COPY);
    }).length;
  }

  it("verified + online, active-job check errors: renders the board with no error card", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockRejectedValue(new Error("network down"));
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("order-0")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(failedCheckHits(activeTree)).toBe(0);
    // The board itself is unaffected — the failed background check must not swallow the job list.
    expect(activeTree.root.findAllByType(FlatList)).toHaveLength(1);
  });

  it("KYC-gated rider (the state in the photo), active-job check errors: renders no error card over the gate", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto" }));
    mockGetActiveOrder.mockRejectedValue(new Error("network down"));
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(failedCheckHits(activeTree)).toBe(0);
  });

  it("a SUCCESSFUL check still renders the way-back card — only the error card was removed", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(activeJobFixture());
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();

    const openJob = activeTree.root.findAll(
      (n) => n.props.label === "Open job" && typeof n.props.onPress === "function",
    );
    expect(openJob.length).toBeGreaterThan(0);
  });
});

// Owner instruction (2026-08-16), from a photo of the rider board's "Finish verifying your ID" wall:
// remove "Refresh status" — the app handles this from the background, no manual refreshing — and move
// "Back to customer" off this screen onto the Account tab. Both are ABSENCE assertions, which is the
// only kind that can regress silently: a future edit re-adding either button breaks nothing else.
describe("rider board (owner 2026-08-16: no manual refresh, and no customer bridge on this screen)", () => {
  function labelHits(tree: renderer.ReactTestRenderer, label: string): number {
    // Buttons carry their copy as a `label` prop; the copy also renders as a Text child, so check both.
    return (
      tree.root.findAll((n) => n.props.label === label).length +
      tree.root.findAll((n) => n.props.children === label).length
    );
  }

  // Every state that used to draw its own "Refresh status", including the exact one in the photo.
  const WALLS: ReadonlyArray<[string, Parameters<typeof meFixture>[0] | "no-rider"]> = [
    ["not a rider yet", "no-rider"],
    ["KYC pending, auto mode (the screen in the photo)", { kycStatus: "pending", kycMode: "auto" }],
    ["KYC pending, manual/ops review", { kycStatus: "pending", kycMode: "manual" }],
    ["ID expired", { kycStatus: "expired" }],
    ["ID check declined", { kycStatus: "failed" }],
    ["ID check declined and locked", { kycStatus: "failed", kycAttempts: 2 }],
  ];

  it.each(WALLS)("%s: draws no 'Refresh status' button", async (_name, patch) => {
    mockGetMe.mockResolvedValue(patch === "no-rider" ? { ...meFixture(), rider: null } : meFixture(patch));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(labelHits(activeTree, "Refresh status")).toBe(0);
  });

  it("the verified/online board draws no 'Refresh status' either", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("order-0")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(labelHits(activeTree, "Refresh status")).toBe(0);
  });

  it("'Back to customer' is gone from the board — the bridge lives on the Account tab now", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("order-0")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(labelHits(activeTree, "Back to customer")).toBe(0);
    // The confirmation that button used to open moved with it, so its copy must be gone too.
    expect(labelHits(activeTree, "Go to customer view")).toBe(0);
  });

  it("a KYC-walled rider sees no customer bridge on the board (it is reachable via the tab bar)", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(labelHits(activeTree, "Back to customer")).toBe(0);
    // The wall itself still renders — this is a removal, not a regression of the gate.
    expect(labelHits(activeTree, "Continue verification")).toBeGreaterThan(0);
  });
});

/**
 * The 8c mint header on the Jobs tab (owner instruction 2026-08-17, "the same design language for
 * the Rider home page"): the top card, the greeting and the notifications icon — and NO search bar.
 * The shift state moved off the list and into the header's sub-row, so these pin the pieces that
 * would otherwise be easy to lose in a later refactor of this very large screen.
 */
describe("rider board — the 8c mint header (owner 2026-08-17)", () => {
  const flatText = (tree: renderer.ReactTestRenderer): string =>
    tree.root
      .findAll((n) => typeof n.type === "string")
      .map((n) => {
        const c = n.props.children;
        return Array.isArray(c) ? c.filter((x) => typeof x === "string").join("") : typeof c === "string" ? c : "";
      })
      .join("|");

  it("greets the rider by first name, on every screen state the tab can be in", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("o-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();
    // greetingLine breaks the phrase and the name onto two lines inside one string.
    expect(flatText(activeTree)).toMatch(/Good (morning|afternoon|evening),\nTapiwa/);
  });

  it("renders NO search bar — a rider has nothing to search from the board", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("o-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();
    expect(flatText(activeTree)).not.toMatch(/Search/i);
  });

  it("carries the shift state and the Go-offline action in the header, not in the list", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("o-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    const text = flatText(activeTree);
    expect(text).toMatch(/Go offline/);
    // The queue composition describes the LIST, so it rides with the list's heading.
    expect(text).toMatch(/Jobs near you/);
    expect(text).toMatch(/Parcels · one queue/);
  });

  it("offline: says so and offers the way back in, once the rider is actually allowed online", async () => {
    mockGetMe.mockResolvedValue(meFixture({ isOnline: false }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();

    const text = flatText(activeTree);
    expect(text).toMatch(/Offline/);
    expect(text).toMatch(/Go online/);
  });

  it("offline AND unverified: states the shift, but offers no go-online action it cannot honour", async () => {
    mockGetMe.mockResolvedValue({ ...meFixture({ isOnline: false }), rider: null });
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();

    const text = flatText(activeTree);
    expect(text).toMatch(/Offline/);
    expect(text).not.toMatch(/Go online/);
    // The wall itself still owns the real recovery.
    expect(text).toMatch(/Set up as a rider/);
  });
});
