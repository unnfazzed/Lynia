/**
 * The rider Jobs tab (Rider v2, `packages/design/handoff/rider-v2/`, ledger D-54): a full-bleed map with
 * a sheet of job cards, and one wall (G1–G14) in front of it whenever the rider can't take jobs. These
 * pin the board's live wiring — cards only when the board is actually shown, the offer route, your
 * offers / withdraw, always-online, the KYC walls' copy and action sets, and the mint header.
 */
import renderer, { act } from "react-test-renderer";
import { controlInteractions, type InteractionControl } from "../../../../src/testing/interactions";
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
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockWithdrawOffer = jest.fn(async (orderId: string) => ({ orderId, withdrawn: true }));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/rider",
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(cb, []);
  },
}));
// Location behaviour is driven by these two switches rather than per-test `jest.spyOn`: a spy on a
// module-factory mock did NOT reliably restore between tests, and a leaked "permission denied" made
// every later test think the rider was gated. Reset in afterEach, set by the tests that need them.
let mockLocPermission: "granted" | "denied" | "undetermined" = "granted";
let mockLocFixFails = false;
/** OS permission prompts shown, and whether the cold-start splash is still up (S-6). */
let mockPermissionAsks = 0;
let mockBooting = false;
jest.mock("../../../../src/boot/boot-phase", () => {
  const actual = jest.requireActual("../../../../src/boot/boot-phase");
  return { ...actual, useBootPhase: () => ({ ...actual.useBootPhase(), booting: mockBooting }) };
});
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: async () => {
    mockPermissionAsks += 1;
    return { status: mockLocPermission };
  },
  getForegroundPermissionsAsync: async () => ({
    status: mockLocPermission,
    granted: mockLocPermission === "granted",
    canAskAgain: true,
  }),
  getCurrentPositionAsync: async () => {
    if (mockLocFixFails) throw new Error("location-timeout");
    return { coords: { latitude: -17.83, longitude: 31.05 } };
  },
  getLastKnownPositionAsync: async () => null,
  reverseGeocodeAsync: async () => [],
  Accuracy: { Balanced: 3 },
}));
jest.mock("../../../../src/kyc/verify", () => ({ runKycVerification: jest.fn() }));
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
// Owner 2026-10-01: busy zones come from the server's demand feed; food offers ride the dispatch poll.
const mockGetDemandZones = jest.fn(async (_loc: unknown) => [] as unknown[]);
jest.mock("../../../../src/api/rider-v2", () => ({ getDemandZones: (loc: unknown) => mockGetDemandZones(loc) }));
const mockGetFoodOffer = jest.fn(async () => null as unknown);
jest.mock("../../../../src/api/food-rider", () => ({ getFoodDispatchOffer: () => mockGetFoodOffer() }));
let mockFoodOn = false;
jest.mock("../../../../src/api/offers", () => ({
  makeOffer: jest.fn(),
  withdrawOffer: (orderId: string) => mockWithdrawOffer(orderId),
}));
let mockNotifGranted = true;
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: async () => (mockNotifGranted ? { granted: true, status: "granted" } : { granted: false, status: "undetermined", canAskAgain: true }),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));
// The 8c mint header reads the unread count for the bell's gold dot. Mock it rather than let it
// fail: an unmocked `apiFetch` throws a network error, which flips `src/net/reachability` — and so
// react-query's PROCESS-WIDE `onlineManager` — offline, pausing every later query in this file.
jest.mock("../../../../src/api/notifications", () => ({
  getNotificationsUnreadCount: async () => ({ count: 0 }),
}));
jest.mock("../../../../src/api/riders", () => ({
  noteKycLaunched: jest.fn(async () => undefined),
  retryKyc: jest.fn(),
  sendHeartbeat: jest.fn(async () => ({ online: true })),
  setOnline: (online: boolean, loc?: unknown) => mockSetOnline(online, loc),
}));
jest.mock("../../../../src/auth/session", () => ({
  loadAcknowledgedHandbacks: async () => [],
  saveRolePreference: async () => undefined,
}));
jest.mock("../../../../src/push/push", () => ({ pushOnce: jest.fn() }));
jest.mock("../../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: () => undefined,
}));
jest.mock("../../../../src/realtime/use-rider-board", () => ({
  useRiderBoard: (...args: unknown[]) => mockUseRiderBoard(...args),
}));
jest.mock("../../../../src/net/use-feature-flags", () => ({
  useFeatureFlags: () => ({ merchantDispatchAutoEnabled: mockFoodOn }),
}));

import RiderHome from "../index";
import { ApiError } from "../../../../src/api/client";
import { SENT_OFFERS_KEY } from "../../../../src/query/use-sent-offers";
import { runKycVerification } from "../../../../src/kyc/verify";
import { retryKyc } from "../../../../src/api/riders";
import { recordKycLaunch, takeKycLaunch } from "../../../../src/kyc/launch-hint";
import { KY } from "../../../../src/ui/firstrun/copy";

// The KYC launch lane: `retryKyc` hands back an opaque Didit SESSION TOKEN, and the native SDK either
// completes, is cancelled by the rider, or fails to launch — the three outcomes the pending walls
// resolve on. `sessionUnusable` rides alongside for the one failure a fresh session can fix (expiry).
const mockRetryKyc = retryKyc as jest.MockedFunction<typeof retryKyc>;
const mockRunKyc = runKycVerification as jest.MockedFunction<typeof runKycVerification>;
/** The three launch outcomes, named — every KYC test below picks one of these. */
const LAUNCH_COMPLETED = { outcome: "completed" as const, sessionUnusable: false };
const LAUNCH_CANCELLED = { outcome: "cancelled" as const, sessionUnusable: false };
const LAUNCH_FAILED = { outcome: "failed" as const, sessionUnusable: false };

/** Flattened text of every host element, "|"-joined — used to assert copy without depending on layout. */
function treeText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAll((n) => typeof n.type === "string")
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.filter((x) => typeof x === "string").join("") : typeof c === "string" ? c : "";
    })
    .join("|");
}

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
  // The board's sheet mounts once its area has a height (Rider v2 J1): give it one, as a device would.
  if (activeTree) layoutBoard(activeTree);
}

function layoutBoard(tree: renderer.ReactTestRenderer): void {
  const area = tree.root.findAll((n) => typeof n.type === "string" && n.props.testID === "rider-board-area");
  if (area.length) act(() => area[0]!.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 560 } } }));
}

/**
 * The job cards the board shows, by order id (Rider v2 J3: cards in the sheet, not a FlatList).
 * `BoardJobCard` is memoised, which `findAllByType` cannot match, so cards are found by their props.
 */
function cards(tree: renderer.ReactTestRenderer): renderer.ReactTestInstance[] {
  return tree.root.findAll((n) => typeof n.type !== "string" && n.props.job != null && typeof n.props.job.id === "string" && "item" in n.props.job, { deep: false });
}
function cardIds(tree: renderer.ReactTestRenderer, kind: "nearby" | "offer" = "nearby"): string[] {
  return [...new Set(cards(tree).filter((n) => (kind === "offer" ? n.props.offer != null : n.props.offer == null)).map((n) => n.props.job.id as string))];
}

let activeTree: renderer.ReactTestRenderer | null = null;
/**
 * Idle-time work is held, never flushed. The board warms `/rider/job` and `/rider/food-job` from its
 * own idle time (src/boot/prewarm-routes.ts) — 36 and 39 modules, plus react-native-maps,
 * socket.io-client and the image-picker pair — and jest runs `runAfterInteractions` inside the
 * test's own await, so every case here was paying to evaluate both graphs before asserting on a
 * FlatList. That is not what these tests are about (the registry has its own suite), and it is not
 * free: it measured 464 ms against 285 ms on the case below, which is what tipped this file over
 * the 5 s per-test budget on a loaded CI runner. Holding the queue keeps the cost out and each test
 * independent of what the previous one left scheduled — the reason this seam exists at all.
 */
let interactions: InteractionControl;
beforeEach(() => {
  interactions = controlInteractions();
  // A launch hint left by an earlier test must not leak into this one.
  takeKycLaunch();
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
  interactions.restore();
  jest.clearAllMocks();
  mockLocPermission = "granted";
  mockLocFixFails = false;
  mockPermissionAsks = 0;
  mockBooting = false;
  mockNotifGranted = true;
  mockFoodOn = false;
  mockGetDemandZones.mockImplementation(async () => []);
  mockGetFoodOffer.mockImplementation(async () => null);
});

/**
 * Cold start is paid here, not by the first test. React Native's index resolves each component
 * lazily (`get FlatList() {…}`), so the first render in a fresh Jest worker also compiles and
 * evaluates every module the board touches. With an empty transform cache, which is how CI starts,
 * that measured 4.4 s on an idle machine (0.5 s warm) against the 5 s per-test timeout. On `main`
 * after the Expo SDK 54 merge (CI run 36466348789) the first test timed out, and the act() scope it
 * left open failed the file's other 51 tests. One throwaway render of the same board, under its own
 * budget, keeps each test's 5 s about the board rather than the compiler.
 */
beforeAll(async () => {
  const held = controlInteractions();
  mockUseRiderBoard.mockReturnValue({
    connected: true,
    expiredOrderIds: new Set<string>(),
    takenOrderIds: new Set<string>(),
    boardTakenNudge: 0,
  });
  mockGetMe.mockResolvedValue(meFixture());
  mockGetActiveOrder.mockResolvedValue(null);
  mockGetOpenOrders.mockResolvedValue([openOrderFixture("warm-up")]);
  const tree = renderScreen();
  await settle();
  await settle();
  act(() => tree.unmount());
  held.restore();
  // Back to the bare jest.fn()s they were declared as, so no test inherits the warm-up's answers.
  for (const mock of [mockGetMe, mockGetActiveOrder, mockGetOpenOrders, mockUseRiderBoard]) mock.mockReset();
  jest.clearAllMocks();
}, 60_000);

describe("rider board (Rider v2 J1/J3: the board draws every job as a card, and only when it's actually shown)", () => {
  it("online + verified + no gate: every open order is a card in the sheet", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    const orders = Array.from({ length: 12 }, (_, i) => openOrderFixture(`order-${i}`));
    mockGetOpenOrders.mockResolvedValue(orders);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(cardIds(activeTree).sort()).toEqual(orders.map((o) => o.id).sort());
    expect(treeText(activeTree)).toContain("12 parcels near you");
  });

  // CF-04 (crash-fuzz 2026-08-23): a malformed 200 body from getOpenOrders is a truthy non-array
  // that `?? []` used to let straight through into `.filter()`/`.map()`, crashing the whole board.
  it("does not crash when getOpenOrders resolves a non-array body — renders an empty board, not a crash", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue({ orders: [] } as unknown as OpenOrder[]);

    activeTree = renderScreen();
    await expect(settle()).resolves.toBeUndefined();
    await settle();

    expect(treeText(activeTree)).toContain("No jobs nearby"); // empty-states v2 J4 (D-78)
  });

  it("not yet a verified rider (G1): renders no job cards and does not leak open-order data", async () => {
    mockGetMe.mockResolvedValue({ ...meFixture(), rider: null });
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("should-not-appear")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(cards(activeTree)).toHaveLength(0);
    // First Run v2 G1 (D-82): no "Earn with your bike" interstitial — the account goes to R1.
    expect(mockReplace).toHaveBeenCalledWith("/rider/become");
    expect(treeText(activeTree)).not.toContain("Earn with your bike");
    expect(treeText(activeTree)).not.toContain("should-not-appear");
  });

  it("KYC pending (gated, online may have been true server-side): renders no job cards", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "manual" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("should-not-appear")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(cards(activeTree)).toHaveLength(0);
  });
});

/**
 * Rider v2 O1: "Make an offer" opens its own screen (`/rider/offer/[jobId]`) instead of the old inline
 * compose card, and a sent offer moves the job from NEARBY JOBS to YOUR OFFERS — the one-offer-per-job
 * rule, now drawn. Withdraw (J10) hides it at once, offers Undo for 5 s, and only then calls the API.
 */
describe("rider board (Rider v2 O1/J9/J10: make an offer, your offers, withdraw)", () => {
  it("'Make an offer' opens the offer screen for THAT job — no inline compose card", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("order-0")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    const offer = activeTree.root.findAll((n) => n.props.label === "Make an offer" && typeof n.props.onPress === "function");
    expect(offer.length).toBeGreaterThan(0);
    act(() => (offer[0]!.props as { onPress: () => void }).onPress());

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/rider/offer/[jobId]", params: expect.objectContaining({ jobId: "order-0" }) }),
    );
    // The retired compose card's controls are nowhere on the board.
    expect(activeTree.root.findAll((n) => n.props.label === "Send offer")).toHaveLength(0);
    expect(activeTree.root.findAll((n) => n.props.label === "Skip this job")).toHaveLength(0);
  });

  function seedOffer(order: OpenOrder) {
    return (qc: QueryClient): void => {
      qc.setQueryData(SENT_OFFERS_KEY, [
        { order, fare: "5.50", etaMinutes: 10, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() },
      ]);
    };
  }

  it("a job the rider already offered on sits under YOUR OFFERS, never again under NEARBY JOBS", async () => {
    const bid = { ...openOrderFixture("order-0"), createdAt: new Date().toISOString() };
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([bid, openOrderFixture("order-1")]);

    activeTree = renderScreen(seedOffer(bid));
    await settle();
    await settle();

    expect(cardIds(activeTree, "offer")).toEqual(["order-0"]);
    expect(cardIds(activeTree)).toEqual(["order-1"]);
    const text = treeText(activeTree);
    expect(text).toContain("YOUR OFFERS");
    expect(text).toContain("NEARBY JOBS");
  });

  it("Withdraw hides the offer at once and offers Undo; Undo brings it back without calling the API", async () => {
    const bid = { ...openOrderFixture("order-0"), createdAt: new Date().toISOString() };
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([bid]);

    activeTree = renderScreen(seedOffer(bid));
    await settle();
    await settle();

    const withdraw = activeTree.root.findAll((n) => n.props.label === "Withdraw" && typeof n.props.onPress === "function");
    expect(withdraw.length).toBeGreaterThan(0);
    act(() => (withdraw[0]!.props as { onPress: () => void }).onPress());

    expect(cardIds(activeTree, "offer")).toEqual([]);
    expect(treeText(activeTree)).toContain("Offer withdrawn.");

    // RToast renders the shared FirstRunToast (D-82), which receives the same props — count the board toast only.
    const undo = activeTree.root.findAll((n) => n.props.action === "Undo" && typeof n.props.onAction === "function" && (n.type as { name?: string }).name === "RToast");
    expect(undo.length).toBe(1);
    act(() => (undo[0]!.props as { onAction: () => void }).onAction());

    expect(cardIds(activeTree, "offer")).toEqual(["order-0"]);
    await wait(5200);
    expect(mockWithdrawOffer).not.toHaveBeenCalled();
  }, 10000);

  it("without Undo, the withdraw reaches the API after the 5 s window", async () => {
    const bid = { ...openOrderFixture("order-0"), createdAt: new Date().toISOString() };
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([bid]);

    activeTree = renderScreen(seedOffer(bid));
    await settle();
    await settle();

    const withdraw = activeTree.root.findAll((n) => n.props.label === "Withdraw" && typeof n.props.onPress === "function");
    act(() => (withdraw[0]!.props as { onPress: () => void }).onPress());
    expect(mockWithdrawOffer).not.toHaveBeenCalled();

    await wait(5200);
    expect(mockWithdrawOffer).toHaveBeenCalledWith("order-0");
  }, 10000);
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
    "gated (so not online), no active job: fetches once on mount, then the 8s poll never fires again",
    async () => {
      mockUseRiderBoard.mockReturnValue({
        connected: false,
        expiredOrderIds: new Set<string>(),
        takenOrderIds: new Set<string>(),
        boardTakenNudge: 0,
      });
      // Since "you are always online" (2026-08-17) a rider is offline ONLY behind a wall, so an
      // unverified rider is how this state is reached now — `isOnline: false` no longer produces it.
      mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending" }));
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
 * RJM.board_empty / RJM offline. The empty-board state draws the mock's `Card(EmptyState(…))` WITHOUT
 * the mock's ghost "Refresh" (docs/DESIGN-DEVIATIONS.md D-30 — the owner's standing 2026-08-16
 * no-manual-refreshing instruction), while the offline toggle card keeps its handler. This pins both
 * halves on the real screen: the empty board offers NO refresh affordance, and the online toggle still
 * calls `onlineM.mutate` (→ setOnline). The absence half is the one that can regress silently — this
 * button already survived #755's sweep once, because it is labelled plain "Refresh" rather than
 * "Refresh status".
 */
describe("rider board (RJM.board_empty + offline: no manual refresh, online-toggle wiring intact)", () => {
  it("online + verified + empty board: offers NO refresh affordance (D-30)", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]); // empty board → the sheet's J2 empty state

    activeTree = renderScreen();
    await settle();
    await settle();

    // The empty state renders...
    expect(treeText(activeTree)).toContain("No jobs nearby"); // empty-states v2 J4 (D-78)

    // ...and carries no Refresh button. Pinned by the exact label the sweep missed, and by the general
    // "no refresh-shaped action anywhere on the empty board".
    expect(activeTree.root.findAll((n) => n.props.label === "Refresh")).toHaveLength(0);
    expect(activeTree.root.findAll((n) => n.props.label === "Refresh status")).toHaveLength(0);
  });

  it("the shift is automatic — setOnline(true) fires with no toggle to press (owner 2026-08-17)", async () => {
    mockGetMe.mockResolvedValue(meFixture({ isOnline: false }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();

    // The switch is gone in BOTH of its old forms — the Card's button and the board's pill row.
    expect(activeTree.root.findAll((n) => n.props.label === "Go online")).toHaveLength(0);
    expect(activeTree.root.findAll((n) => n.props.label === "Go offline")).toHaveLength(0);
    expect(activeTree.root.findAll((n) => n.props.accessibilityLabel === "Go offline")).toHaveLength(0);

    // …and the app did the work the rider used to do by hand — WITH a position, so the server
    // records them as broadcast-eligible rather than on-shift-but-invisible.
    expect(mockSetOnline).toHaveBeenCalledTimes(1);
    expect(mockSetOnline.mock.calls[0]![0]).toBe(true);
    expect(mockSetOnline.mock.calls[0]![1]).toEqual({ lat: -17.83, lng: 31.05 });
  });

  it("never re-fires setOnline in a loop when the server refuses", async () => {
    // The auto-online effect is ref-guarded precisely because a failed mutation flips `isPending`
    // back, which would otherwise re-run the effect and hammer the endpoint.
    mockSetOnline.mockRejectedValueOnce(new Error("network down"));
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();
    await settle();

    expect(mockSetOnline.mock.calls.length).toBeLessThanOrEqual(1);
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

  it("ignores a server 'off shift' — the rider is always online (owner 2026-08-17)", async () => {
    // `is_online` only ever flipped on an explicit toggle, and there is no toggle any more. A warm
    // cache saying "off shift" is therefore a stale fact about a control that no longer exists; the
    // rider is online because they are VERIFIED, and the board must not blink through an offline
    // presentation that has itself been removed.
    const me = meFixture({ isOnline: false });
    mockGetMe.mockResolvedValue(me);
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen((qc) => qc.setQueryData(["me"], me));
    expect(offlineCopyHits(activeTree)).toBe(0);

    await settle();
    await settle();
    expect(offlineCopyHits(activeTree)).toBe(0);
    // …and the app puts them online with the server rather than waiting for a tap.
    expect(mockSetOnline.mock.calls.some((c) => c[0] === true)).toBe(true);
  });

  it("does NOT go online behind a wall — an unverified rider stays off", async () => {
    const me = meFixture({ kycStatus: "pending" });
    mockGetMe.mockResolvedValue(me);
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen((qc) => qc.setQueryData(["me"], me));
    await settle();
    await settle();

    expect(mockSetOnline).not.toHaveBeenCalled();
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
    expect(cardIds(activeTree)).toEqual(["order-0"]);
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
// "Back to customer" off this screen onto the Account tab. ABSENCE assertions, which is the only kind
// that can regress silently: a future edit re-adding either button breaks nothing else.
//
// HALF of this was reversed on 2026-08-20 (T8 / D-36): the customer bridge is back, on the two walls
// where the rider can do nothing but wait. What survives here is everything that was NOT reversed —
// "Refresh status" is still gone everywhere, the OLD bridge name and its confirm sheet are still
// gone, and the walls that have a real action still carry no competing exit.
describe("rider board (owner 2026-08-16: no manual refresh; bridge scoped, not restored wholesale)", () => {
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

  // The reinstated bridge is a plain ghost that navigates. The button REMOVED in 2026-08-16 was a
  // different thing: it opened a confirm sheet about going offline and losing nearby deliveries. That
  // machinery stayed removed, and on a verified/online board there is no bridge at all.
  it("neither the old 'Back to customer' button nor its confirm sheet came back", async () => {
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

  // First Run v2 F3 (D-82): the unfinished page draws its one tap that clears it — and nothing else: the ✕ is
  // the way out (no "Order food and send parcels" bridge on an F page, owner D-82 §2 #3).
  it("the unfinished page (F3) leads with its own action and draws no bridge", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(labelHits(activeTree, "Back to customer")).toBe(0);
    const labels = activeTree.root
      .findAll((n) => typeof n.props.label === "string" && typeof n.props.onPress === "function")
      .map((n) => n.props.label as string);
    expect(labels).toEqual([KY.unfCta]);
    expect(activeTree.root.findAll((n) => typeof n.type === "string" && n.props.testID === "exit-button")).toHaveLength(1);
  });

  /**
   * Every ID-check page's action set, pinned by SHAPE rather than by string (First Run v2 F, D-82). The
   * Rider v2 walls' "Order food and send parcels" bridge (D-36) is gone from every F page: owner D-82 §2 #3
   * made the ✕ (customer Home) the only way out. Any OTHER new action on an ID-check page fails here and has
   * to be argued for.
   */
  const CUSTOMER_BRIDGE = "Order food and send parcels";
  const WALL_ACTIONS: ReadonlyArray<[string, Parameters<typeof meFixture>[0], string[]]> = [
    // Calm Mint v2 R2 (D-55): in flight is "Rider setup", whose only action is its ghost.
    ["in flight — with the vendor, only the R2 ghost", { kycStatus: "pending", kycMode: "auto", kycPendingState: "in_flight" }, ["Send a parcel while you wait"]],
    ["F3 unfinished — the rider's move", { kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }, [KY.unfCta]],
    // R-3: a check held for a human review is F2 — not R2, no retry; WhatsApp only.
    ["F2 held for review — WhatsApp only", { kycStatus: "pending", kycMode: "auto", kycPendingState: "in_flight", kycHeld: true }, [KY.help]],
    ["F1 manual/ops review — nothing to press", { kycStatus: "pending", kycMode: "manual" }, []],
    ["F6 ID expired", { kycStatus: "expired" }, [KY.expCta]],
    ["F4d declined", { kycStatus: "failed", kycAttempts: 1 }, [KY.tryAgain, KY.help]],
    ["F5 locked", { kycStatus: "failed", kycAttempts: 2 }, [KY.msg]],
  ];

  it.each(WALL_ACTIONS)("%s: the wall offers exactly its own actions", async (_name, patch, expected) => {
    mockGetMe.mockResolvedValue(meFixture(patch));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();

    const labels = activeTree.root
      .findAll((n) => typeof n.props.label === "string" && typeof n.props.onPress === "function")
      .map((n) => n.props.label as string);
    expect(labels).toEqual(expected);
    expect(labels).not.toContain(CUSTOMER_BRIDGE);
  });
});

/**
 * P0-1 — `kyc_pending` is three screens, not one (`RJ kyc_pending` / `kyc_unfinished` / `kyc_cant_start`).
 *
 * The bug these exist for: a rider who opened the check and backed out at step one used to land on
 * "We're checking your ID" — false, nothing was submitted — with no way to resume. Each state now
 * says something the other two must not, so assert the COPY, not just the action count: a regression
 * that renders the right buttons under the wrong sentence is exactly the failure being fixed.
 */
describe("rider board — the three KYC pending states (P0-1)", () => {
  async function wall(patch: Parameters<typeof meFixture>[0]): Promise<string> {
    mockGetMe.mockResolvedValue(meFixture(patch));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    return treeText(activeTree);
  }

  it("in flight: R2 'Rider setup' says the check is under way, and asks nothing of the rider", async () => {
    const text = await wall({ kycStatus: "pending", kycMode: "auto", kycPendingState: "in_flight" });
    expect(text).toContain("Rider setup");
    expect(text).toContain("We\u2019re checking your ID");
    expect(text).toContain("In review");
    expect(text).not.toContain(KY.unfBody);
  });

  it("unfinished: never claims the check is with the vendor — nothing was submitted", async () => {
    const text = await wall({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" });
    // F3 "Almost there, Tapiwa" (D-82).
    expect(text).toContain("Almost there,");
    expect(text).toContain(KY.unfBody);
    // The precise lie this split exists to remove.
    expect(text).not.toContain("We\u2019re checking your ID");
    expect(text).not.toContain(KY.justBody);
  });

  // Absent signal ⇒ unfinished. An older API that sends no pending-state must still leave the rider a
  // way forward; defaulting the other way would strand someone who cancelled with nothing to press.
  it("an API that sends no pending state still offers the resume", async () => {
    const text = await wall({ kycStatus: "pending", kycMode: "auto" });
    expect(text).toContain(KY.unfBody);
  });

  /**
   * The launch lane. This began as a browser bug — `openAuthSessionAsync` was wrapped in
   * `.catch(() => undefined)`, so a browser that could not open swallowed the failure whole and the
   * rider tapped into silence. The browser is gone (Route A: Didit's native SDK opens over this
   * screen), but the failure mode it guards against is not: a KYC SDK that R8 shrank away, or an
   * Expo Go run with no native module, fails to launch exactly the same way. The seam reports that as
   * `failed` instead of throwing, and this test pins that it still reaches the rider as words.
   */
  it("a launch that never opened shows the couldn't-start wall, not silence", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    mockRunKyc.mockResolvedValue(LAUNCH_FAILED);

    activeTree = renderScreen();
    await settle();
    await settle();

    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    await settle();

    const text = treeText(activeTree);
    // F7 "Couldn't open the ID check" (D-82).
    expect(text).toContain(KY.cantBody);
    // It must NOT read as a decline: nothing was assessed, and blaming the rider for a device fault
    // sends them round a loop that fails the same way.
    expect(text).not.toContain(KY.otherBody);
    expect(text).not.toContain(KY.triesLeft);
    const labels = activeTree.root
      .findAll((n) => typeof n.props.label === "string" && typeof n.props.onPress === "function")
      .map((n) => n.props.label as string);
    expect(labels).toEqual([KY.tryAgain, KY.help]);
  });

  // Closing the tab is a choice, not a fault — it must land on the resume, never on the alert state.
  it("closing the verification tab is unfinished, not a failure", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    mockRunKyc.mockResolvedValue(LAUNCH_CANCELLED);

    activeTree = renderScreen();
    await settle();
    await settle();

    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    await settle();

    expect(treeText(activeTree)).not.toContain(KY.cantBody);
    expect(treeText(activeTree)).toContain(KY.unfBody);
  });

  // The cached pending-state is from BEFORE the rider went to verify, so it says "unfinished" — which
  // would tell someone who just completed the check that they haven't started it.
  it("a completed check shows F8 'Sending your ID', not the stale unfinished it was cached with", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    mockRunKyc.mockResolvedValue(LAUNCH_COMPLETED);

    activeTree = renderScreen();
    await settle();
    await settle();
    // Hold the refetch open so only the optimistic value is on screen — that window IS the bug: it is
    // where a rider who just finished would otherwise be told they haven't started.
    mockGetMe.mockImplementation(() => new Promise(() => undefined));
    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });

    expect(treeText(activeTree)).toContain(KY.justBody);
    expect(treeText(activeTree)).not.toContain(KY.unfBody);
  });

  /**
   * R-4 (startup review 2026-10-06): right after a real submit the vendor still reads "In Progress" and the
   * server cached it, so the refetch the launch fires lands "unfinished" — and the rider who just finished
   * was told "You started the ID check but didn't finish". A completed launch now outranks that for
   * KYC_COMPLETED_HINT_MS…
   */
  it("a completed launch outranks the stale 'unfinished' the immediate refetch brings back", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    mockRunKyc.mockResolvedValue(LAUNCH_COMPLETED);

    activeTree = renderScreen();
    await settle();
    await settle();
    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    await settle();
    await settle();

    expect(mockGetMe.mock.calls.length).toBeGreaterThan(1);
    expect(treeText(activeTree)).toContain(KY.justBody);
    expect(treeText(activeTree)).not.toContain(KY.unfBody);
    // …and the server was told to drop its cached pending state, so the next read asks the vendor.
    const { noteKycLaunched } = jest.requireMock("../../../../src/api/riders") as { noteKycLaunched: jest.Mock };
    expect(noteKycLaunched).toHaveBeenCalledTimes(1);
  });

  /**
   * …and only for that window. A `completed` launch that outranked the server FOREVER would strand a
   * rider whose completion the vendor never registered: the in-flight wall has no action by design, so
   * there is nothing to press to get off it. Once the hint is stale, the server pulls them back.
   */
  it("but once the hint is stale, the server pulls a completed rider back to the resume", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    mockRunKyc.mockResolvedValue(LAUNCH_COMPLETED);

    activeTree = renderScreen();
    await settle();
    await settle();
    // Hold the refetch the launch fires, so it lands only after the window has passed.
    let land!: (me: Me) => void;
    mockGetMe.mockImplementation(() => new Promise<Me>((resolve) => (land = resolve)));
    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    expect(treeText(activeTree)).toContain(KY.justBody);

    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now + 31_000);
    try {
      await renderer.act(async () => {
        land(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
      });
      await settle();
      expect(treeText(activeTree)).toContain(KY.unfBody);
      expect(treeText(activeTree)).not.toContain(KY.justBody);
    } finally {
      clock.mockRestore();
    }
  });

  // R-4: retrying from a decline puts the rider back to pending server-side; the old decline wall must not
  // come back while the refetch is out.
  it("retrying from a decline shows pending at once, not the old decline wall", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "failed", kycAttempts: 1 }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    mockRunKyc.mockResolvedValue(LAUNCH_CANCELLED);

    activeTree = renderScreen();
    await settle();
    await settle();
    // F4d (no reason on the decline).
    expect(treeText(activeTree)).toContain(KY.otherBody);
    mockGetMe.mockImplementation(() => new Promise(() => undefined));
    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Try again").props.onPress();
    });
    expect(treeText(activeTree)).not.toContain(KY.otherBody);
    expect(treeText(activeTree)).toContain(KY.unfBody);
  });

  /**
   * The resume loop. The server's free resume path proves a session EXISTS, never that it still
   * opens, and an expired token fires no webhook — so left alone, "Try again" hands back the same
   * dead token forever and the rider never gets past the wall. The device is the only party that can
   * see it, so the next attempt has to carry that knowledge back.
   */
  it("an expired session makes the NEXT attempt mint a fresh one", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    mockRunKyc.mockResolvedValueOnce({ outcome: "failed", sessionUnusable: true });

    activeTree = renderScreen();
    await settle();
    await settle();

    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    await settle();
    // First tap takes the free resume — we had no reason to think the session was dead yet.
    expect(mockRetryKyc).toHaveBeenNthCalledWith(1, false);

    mockRunKyc.mockResolvedValue(LAUNCH_CANCELLED);
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Try again").props.onPress();
    });
    await settle();
    // Second tap says "not that one again", so the server mints instead of resuming.
    expect(mockRetryKyc).toHaveBeenNthCalledWith(2, true);
  });

  // ...and the flag is spent, not sticky. Left latched, every later tap would mint a PAID session for
  // a rider whose session was fine — turning one expiry into a standing charge.
  it("stops forcing once a fresh session opens", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    mockRunKyc.mockResolvedValueOnce({ outcome: "failed", sessionUnusable: true });

    activeTree = renderScreen();
    await settle();
    await settle();
    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    await settle();

    mockRunKyc.mockResolvedValue(LAUNCH_CANCELLED);
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Try again").props.onPress();
    });
    await settle();
    expect(mockRetryKyc).toHaveBeenNthCalledWith(2, true);

    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    await settle();
    expect(mockRetryKyc).toHaveBeenNthCalledWith(3, false);
  });

  /**
   * One forced mint per stuck episode, on the client too.
   *
   * The server holds the real bound (a claimed, windowed replacement — see rider.service), but the
   * client must not lean on it: if `force` re-armed on every expiry, a session that is minted fresh
   * and STILL reports expired — device clock skew, the realistic cause on low-end Android — would
   * have the app asking to pay again on every single tap, and the server would spend the rider's one
   * claim on the first of them.
   */
  it("does not keep forcing when the replacement session also reports expired", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    // Every launch says "expired" — the pathological case.
    mockRunKyc.mockResolvedValue({ outcome: "failed", sessionUnusable: true });

    activeTree = renderScreen();
    await settle();
    await settle();

    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    await settle();
    expect(mockRetryKyc).toHaveBeenNthCalledWith(1, false);

    for (const nth of [2, 3, 4]) {
      await renderer.act(async () => {
        tree.root.find((n) => n.props.label === "Try again").props.onPress();
      });
      await settle();
      // Tap 2 spends the one force; taps 3 and 4 must fall back rather than ask to pay again.
      expect(mockRetryKyc).toHaveBeenNthCalledWith(nth, nth === 2);
    }
  });

  /**
   * The other half of the server's claim-release (rider.service.releaseForcedKycReplacement).
   *
   * If the retry REQUEST itself fails — the vendor was down, so the server released the claim it had
   * taken — the rider must still be able to force on the next tap. The arm is deliberately not
   * cleared in `onError`: a request that never produced a session has not resolved the expiry that
   * armed it, so the intent to force is still live. Server release + client arm is what makes a
   * vendor outage recoverable rather than a window-long trap.
   */
  it("keeps the force armed when the retry request itself fails", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    mockRunKyc.mockResolvedValueOnce({ outcome: "failed", sessionUnusable: true });

    activeTree = renderScreen();
    await settle();
    await settle();

    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    await settle();

    // The forced attempt reaches a vendor that is down.
    mockRetryKyc.mockRejectedValueOnce(new Error("didit down"));
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Try again").props.onPress();
    });
    await settle();
    expect(mockRetryKyc).toHaveBeenNthCalledWith(2, true);

    // The wall is back on `unfinished`, not `cant_start`: a failed REQUEST is not a failed launch —
    // `onMutate` cleared the launch result, and the error speaks as a toast. So the control here is
    // the resume primary, not "Try again".
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s2" });
    mockRunKyc.mockResolvedValue(LAUNCH_CANCELLED);
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    await settle();
    expect(mockRetryKyc).toHaveBeenNthCalledWith(3, true);
  });

  // A denied camera is not a dead session. Re-minting for it would burn a Didit credit on every tap
  // to fix something a new session cannot fix.
  it("does not force a fresh session for a launch failure that is not expiry", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    mockRunKyc.mockResolvedValue(LAUNCH_FAILED);

    activeTree = renderScreen();
    await settle();
    await settle();
    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    await settle();

    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Try again").props.onPress();
    });
    await settle();
    expect(mockRetryKyc).toHaveBeenNthCalledWith(2, false);
  });

  // Without the reset, one failed launch would hold the rider on the alert wall forever — the exact
  // dead end the state was added to remove.
  it("a retry that opens fine clears the couldn't-start wall", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", sessionToken: "sess_tok_s1" });
    // The seam never throws; a launch that could not open reports `failed`.
    mockRunKyc.mockResolvedValueOnce(LAUNCH_FAILED);

    activeTree = renderScreen();
    await settle();
    await settle();
    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === KY.unfCta).props.onPress();
    });
    await settle();
    expect(treeText(activeTree)).toContain(KY.cantBody);

    mockRunKyc.mockResolvedValue(LAUNCH_CANCELLED);
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Try again").props.onPress();
    });
    await settle();

    expect(treeText(activeTree)).not.toContain(KY.cantBody);
  });

  // First Run v2 F1: ops review — the rider waits, whatever the vendor's pending state says.
  it("manual review is F1 'Our team is taking a look', whatever the pending state says", async () => {
    const text = await wall({ kycStatus: "pending", kycMode: "manual", kycPendingState: "unfinished" });
    expect(text).toContain(KY.reviewBody);
    expect(text).not.toContain(KY.unfBody);
  });
});

/**
 * The 8c mint header on the Jobs tab (owner instruction 2026-08-17, "the same design language for
 * the Rider home page"): the top card, the greeting and the notifications icon — and NO search bar.
 * The shift state moved off the list and into the header's sub-row, so these pin the pieces that
 * would otherwise be easy to lose in a later refactor of this very large screen.
 */
describe("rider board — the 8c mint header (owner 2026-08-17)", () => {
  it("greets the rider by first name, on every screen state the tab can be in", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("o-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toMatch(/Good (morning|afternoon|evening),\s*Tapiwa/);
  });

  it("renders NO search bar — a rider has nothing to search from the board", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("o-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).not.toMatch(/Search/i);
  });

  it("draws no shift row at all — no status pill, no Go offline (owner 2026-08-17)", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("o-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    const text = treeText(activeTree);
    expect(text).not.toMatch(/Go offline/);
    expect(text).not.toMatch(/Go online/);
    // The connection is still honest — the reconnecting BANNER keeps the top of the screen — but
    // there is nothing left to toggle, so no pill states a constant.
    expect(text).not.toMatch(/You're online/);
  });

  it("draws neither the 'Jobs near you' heading nor the queue subtitle (owner 2026-08-17)", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("o-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    const text = treeText(activeTree);
    expect(text).not.toMatch(/Jobs near you/);
    expect(text).not.toMatch(/one queue/);
  });

  it("carries the detected location in the header, the same row the customer home draws", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("o-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    // The test's expo-location mock resolves no address, so the row shows its honest prompt — the
    // point is that the ROW is there and never blank.
    expect(treeText(activeTree)).toMatch(/Set your location|Harare/);
  });

  it("shows the no-fix warning on the LIVE board — the one place it matters", async () => {
    // `locHint` (a timed-out fix with no cached last-known) does NOT block going online, so the
    // board renders while the rider has no position — and this line is the only thing that explains
    // why it may be empty. It used to live in the offline toggle Card, a state that no longer exists.
    mockLocFixFails = true;
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("o-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(treeText(activeTree)).toContain("Jobs are matched by distance, so location must be on while you ride.");
  });

  it("E2E 2026-10-05 FS-7: a go-online refused for want of a position shows the no-GPS wall, and a fix retries it with coordinates", async () => {
    // The API refuses online without coordinates now (`location_required`) — the rider used to show
    // "Online" from anywhere and never get a job. The wall is the board's own no-GPS gate.
    mockLocFixFails = true;
    mockSetOnline.mockRejectedValueOnce(new ApiError(403, "Can't find your location. Jobs are matched by distance, so location must be on while you ride.", "location_required"));
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("o-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(mockSetOnline).toHaveBeenCalledTimes(1);
    expect(mockSetOnline.mock.calls[0]![1]).toBeUndefined();
    expect(treeText(activeTree)).toContain("Can't find your location");
    // GPS comes back: "I've turned it on" re-reads the position, the wall lifts, and the shift starts WITH it.
    mockLocFixFails = false;
    const gpsOn = activeTree.root.findAll((n) => n.props.label === "I've turned it on" && typeof n.props.onPress === "function")[0];
    expect(gpsOn).toBeDefined();
    await act(async () => {
      gpsOn!.props.onPress();
    });
    await settle();
    await settle();
    expect(mockSetOnline).toHaveBeenCalledTimes(2);
    expect(mockSetOnline.mock.calls[1]).toEqual([true, { lat: -17.83, lng: 31.05 }]);
    expect(treeText(activeTree)).not.toContain("Can't find your location");
  });

  it("the location-denied wall offers no shift control — there is no shift to end", async () => {
    // The last "Go offline" in the app lived on this wall. Always-online means it must be gone from
    // here too, or this becomes the one screen still offering a switch removed everywhere else.
    mockLocPermission = "denied";
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);

    activeTree = renderScreen();
    await settle();
    await settle();

    // First Run v2 P14 G8 (D-82): no permission → the empty-states mark, not the Rider v2 wall.
    expect(treeText(activeTree)).toContain("Turn on location");
    expect(treeText(activeTree)).toContain("Jobs need your location.");
    expect(activeTree.root.findAll((n) => n.props.label === "Go offline")).toHaveLength(0);
  });

  it(
    "retries a TRANSIENT activation failure instead of stranding the rider offline",
    async () => {
      // One failed setOnline at launch used to leave the rider offline for the life of the screen:
      // the auto-online effect had consumed its ref and nothing re-armed it. REAL timers here — fake
      // ones deadlock against react-query's own scheduling and the act()/setTimeout settle helpers —
      // so this test costs a real ACTIVATION_RETRY_MS. It is the only coverage of the recovery path,
      // which is worth one slow test.
      mockSetOnline.mockRejectedValueOnce(new Error("network down"));
      mockGetMe.mockResolvedValue(meFixture());
      mockGetActiveOrder.mockResolvedValue(null);
      mockGetOpenOrders.mockResolvedValue([]);

      activeTree = renderScreen();
      await settle();
      await settle();
      const afterFirst = mockSetOnline.mock.calls.length;
      expect(afterFirst).toBeGreaterThanOrEqual(1);

      await wait(16_000);
      expect(mockSetOnline.mock.calls.length).toBeGreaterThan(afterFirst);
    },
    30000,
  );

  it("the location row is DETECT-only — it never offers a picker it could not honour", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("o-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    // The board ranks jobs off its own live GPS fix and the server pushes off the heartbeat
    // position — neither reads this row — so a picker here would silently fail to move the job
    // list. Rider v2 J1 draws the place as plain text beside the connection dot: nothing to press.
    const labels = activeTree.root
      .findAll((n) => typeof n.props.accessibilityLabel === "string")
      .map((n) => n.props.accessibilityLabel as string);
    expect(labels.some((l) => /Change location/.test(l))).toBe(false);
    expect(treeText(activeTree)).not.toMatch(/Deliver to|Use my current location|Search an address/);
  });
});

/** Calm Mint v2 R3 (D-55): "You're verified" takes the board's place once, for a new rider only. */
describe("rider board — R3 'You're verified' (Calm Mint v2)", () => {
  it("a verified rider with no trips yet sees R3; 'Go online' starts the rider permission flow (D-82 §2 #5)", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "verified", tripsCount: 0 }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain("You’re verified");
    // BRIEF 13 (D-82): no licence anywhere.
    expect(treeText(activeTree)).toContain("Add your photo and bike papers later in Account");
    // An older server that doesn't serve `rider.freeJobs` (D-70) gets no meter card.
    expect(treeText(activeTree)).not.toContain("Commission-free jobs");
    const tree = activeTree;
    // Everything is granted on this phone: R3's "Go online" goes straight online — no flow (owner #5).
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Go online" && typeof n.props.onPress === "function").props.onPress();
    });
    await settle();
    await settle();
    expect(mockPush).not.toHaveBeenCalledWith("/permissions?from=flow");
    expect(treeText(activeTree)).not.toContain("You’re verified");
    expect(mockSetOnline).toHaveBeenCalledWith(true, { lat: -17.83, lng: 31.05 });
  });

  it("D-70: R3 draws the 'Commission-free jobs · 5 of 5 left' meter the server reports", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "verified", tripsCount: 0, freeJobs: { left: 5, total: 5 } }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain("You’re verified");
    expect(treeText(activeTree)).toContain("Commission-free jobs");
    expect(treeText(activeTree)).toContain("5 of 5 left");
    expect(treeText(activeTree)).toContain("After these, commission comes off a prepaid balance.");
  });

  it("FR-H1: location never asked yet — R3 comes first, not the G8 'Turn on location' wall", async () => {
    mockLocPermission = "undetermined";
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "verified", tripsCount: 0 }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain("You’re verified");
    expect(treeText(activeTree)).not.toContain("Jobs need your location.");
  });

  it("FR-H1: a denied location still walls a rider past R3", async () => {
    mockLocPermission = "denied";
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "verified", tripsCount: 0 }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain("Turn on location");
  });

  it("a rider with trips behind them never sees R3", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "verified", tripsCount: 20 }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).not.toContain("You’re verified");
  });
});

describe("rider board — tagged jobs and demand (owner 2026-10-01)", () => {
  it("a business's booking wears the SHOP tag beside PARCEL jobs, and the count says jobs", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([{ ...openOrderFixture("shop-1"), kind: "shop", customerFirstName: "Mama's Kitchen" }, openOrderFixture("parcel-1")]);

    activeTree = renderScreen();
    await settle();
    await settle();

    const kinds = cards(activeTree).map((n) => [n.props.job.id, n.props.job.kind]);
    expect(kinds).toEqual(expect.arrayContaining([["shop-1", "shop"], ["parcel-1", "parcel"]]));
    const text = treeText(activeTree);
    expect(text).toContain("SHOP");
    expect(text).toContain("PARCEL");
    expect(text).toContain("2 jobs near you");
  });

  it("the live food offer is a FOOD card on the board, and its button opens the offer", async () => {
    mockFoodOn = true;
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("parcel-1")]);
    mockGetFoodOffer.mockImplementation(async () => ({
      orderId: "food-1",
      merchantId: "m1",
      pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Mama's Kitchen" },
      dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Belgravia" },
      itemDesc: "2 items",
      merchantGoodsTotal: 12.5,
      deliveryFee: 3.2,
      distanceKm: 3.1,
      expiresAt: new Date(Date.now() + 40_000).toISOString(),
      merchantPaymentMethod: "cash",
      merchantCashRule: "collect_and_return",
    }));

    activeTree = renderScreen();
    await settle();
    await settle();

    const food = cards(activeTree).find((n) => n.props.job.kind === "food");
    expect(food?.props.job).toMatchObject({ id: "food:food-1", asking: 3.2 });
    const accept = activeTree.root.findAll((n) => n.props.label === "Accept this job" && typeof n.props.onPress === "function");
    expect(accept.length).toBeGreaterThan(0);
    act(() => accept[0]!.props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/rider/food-offer");
  });

  it("the busiest demand zone names itself in the sheet", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("parcel-1")]);
    mockGetDemandZones.mockImplementation(async () => [{ lat: -17.8, lng: 31.04, radiusM: 800, level: 1, place: "Avondale Shops" }]);

    activeTree = renderScreen();
    await settle();
    await settle();

    expect(mockGetDemandZones).toHaveBeenCalledWith({ lat: -17.83, lng: 31.05 });
    expect(treeText(activeTree)).toMatch(/Busier near Avondale Shops · \d/);
  });
});

/** Startup review 2026-10-06 — the rider registration / ID-check fixes on the board. */
describe("rider board — startup review 2026-10-06", () => {
  const PENDING_UNFINISHED = { kycStatus: "pending" as const, kycMode: "auto" as const, kycPendingState: "unfinished" as const };

  it("R-10: a launch Become a rider couldn't open lands on F7 (with WhatsApp help), not F3", async () => {
    recordKycLaunch("failed");
    mockGetMe.mockResolvedValue(meFixture(PENDING_UNFINISHED));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain(KY.cantBody);
    expect(treeText(activeTree)).not.toContain(KY.unfBody);
  });

  it("R-4: a check Become a rider just completed shows F8 'Sending your ID', not the stale 'unfinished'", async () => {
    recordKycLaunch("completed");
    mockGetMe.mockResolvedValue(meFixture(PENDING_UNFINISHED));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain(KY.justBody);
    expect(treeText(activeTree)).not.toContain(KY.unfBody);
  });

  it("G1 (D-82): a non-rider reaching the board is replaced by R1 — no interstitial, nothing pushed over the board", async () => {
    mockGetMe.mockResolvedValue({ ...meFixture(), rider: null });
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(mockReplace).toHaveBeenCalledWith("/rider/become");
    expect(mockPush).not.toHaveBeenCalled();
    expect(activeTree.root.findAll((n) => n.props.label === "Become a rider")).toHaveLength(0);
  });

  it("G1: a cached customer `me` doesn't bounce a rider who just registered — R1 only once the re-read agrees", async () => {
    // The warm cache still says "no rider"; the server (mid re-read) says pending.
    let land!: (me: Me) => void;
    mockGetMe.mockImplementation(() => new Promise<Me>((resolve) => (land = resolve)));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen((qc) => qc.setQueryData(["me"], { ...meFixture(), rider: null }));
    await settle();
    expect(mockReplace).not.toHaveBeenCalledWith("/rider/become");
    await renderer.act(async () => {
      land(meFixture(PENDING_UNFINISHED));
    });
    await settle();
    expect(mockReplace).not.toHaveBeenCalledWith("/rider/become");
    expect(treeText(activeTree)).toContain(KY.unfBody);
  });

  it("R-3: a check held for review is F2 'One more look', never R2's 'usually under a minute'", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "in_flight", kycHeld: true }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain(KY.heldBody);
    expect(treeText(activeTree)).not.toContain("Rider setup");
  });

  // R-6 → First Run v2 BRIEF 15 (D-82): each decline reason gets its own page and advice.
  it.each([
    ["id_unreadable", KY.blurryTip2],
    ["face_mismatch", KY.faceTip1],
    ["liveness_failed", KY.faceTip1],
    ["doc_tampered", KY.docBody],
  ] as const)("R-6: a decline for %s draws its own advice", async (reason, advice) => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "failed", kycAttempts: 1, kycDeclineReason: reason }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain(advice);
    expect(treeText(activeTree)).toContain(KY.triesLeft);
  });

  it("R-7: the rider is not put online behind R3 — its 'Go online' hands over to the permission flow first", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "verified", tripsCount: 0 }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen((qc) => qc.setQueryData(["me"], meFixture({ kycStatus: "verified", tripsCount: 0 })));
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain("You’re verified");
    expect(mockSetOnline).not.toHaveBeenCalled();
    mockNotifGranted = false; // something is missing, so R3 hands over to the flow
    // The board socket isn't live behind R3 either (warm cache started `online` true on frame 1).
    expect(mockUseRiderBoard.mock.calls.at(-1)?.[0]).toBe(false);
    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Go online" && typeof n.props.onPress === "function").props.onPress();
    });
    await settle();
    // D-82 §2 #5: P13's "Go online" is what goes online; this board hands over to the flow without going online.
    expect(mockPush).toHaveBeenCalledWith("/permissions?from=flow");
    expect(mockSetOnline).not.toHaveBeenCalled();
    expect(treeText(activeTree)).toContain("You’re verified");
  });

  it("R-9: a failed re-read keeps the rider behind their wall (the last known `me` stands)", async () => {
    const declined = meFixture({ kycStatus: "failed", kycAttempts: 2 });
    mockGetMe.mockRejectedValue(new Error("503"));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([openOrderFixture("order-0")]);
    activeTree = renderScreen((qc) => qc.setQueryData(["me"], declined));
    await settle();
    await settle();
    expect(mockGetMe).toHaveBeenCalled();
    // F5 "Let's finish this together".
    expect(treeText(activeTree)).toContain(KY.lockedBody);
    expect(mockSetOnline).not.toHaveBeenCalled();
  });

  it("D-82: the board never opens the OS location dialog — during the boot or after; G8 asks instead", async () => {
    mockLocPermission = "undetermined";
    mockBooting = true;
    mockPermissionAsks = 0;
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["me"], meFixture());
    // A fresh element per render — re-rendering the SAME element would bail out and never re-run the hook.
    const el = () => (
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <RiderHome />
        </QueryClientProvider>
      </SafeAreaProvider>
    );
    act(() => {
      activeTree = renderer.create(el());
    });
    await settle();
    await settle();
    expect(mockPermissionAsks).toBe(0);
    expect(mockSetOnline).not.toHaveBeenCalled();
    // The splash hands off: still no dialog — the board shows G8, whose "Turn on" opens P1 (First Run v2).
    mockBooting = false;
    act(() => {
      qc.setQueryData(["me"], { ...meFixture(), firstName: "Tapiwa2" });
    });
    await settle();
    await settle();
    expect(mockPermissionAsks).toBe(0);
    expect(treeText(activeTree!)).toContain("Turn on location");
    const turnOn = activeTree!.root.findAll((n) => n.props.accessibilityLabel === "Turn on" && typeof n.props.onPress === "function")[0]!;
    await renderer.act(async () => turnOn.props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/permissions?step=location");
  });

  it("P14 J8: notifications off shows the danger row; 'Turn on' opens P9, not the phone's settings", async () => {
    mockNotifGranted = false;
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen((qc) => qc.setQueryData(["me"], meFixture()));
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain("Notifications are off. You won’t get new jobs or food offers.");
    const j8 = activeTree.root.find((n) => n.props.testID === "rider-j8" && typeof n.props.onPress === "function");
    await renderer.act(async () => j8.props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/permissions?step=notifications");
  });

  it("S-6: an already-granted permission still reads the position during the boot", async () => {
    mockLocPermission = "granted";
    mockBooting = true;
    mockPermissionAsks = 0;
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen((qc) => qc.setQueryData(["me"], meFixture()));
    await settle();
    await settle();
    expect(mockPermissionAsks).toBe(0);
    // The fix was read without an ask, so the shift starts with a position.
    expect(mockSetOnline).toHaveBeenCalledWith(true, { lat: -17.83, lng: 31.05 });
  });

  it("§5: no active-job read behind a KYC wall", async () => {
    mockGetMe.mockResolvedValue(meFixture(PENDING_UNFINISHED));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen((qc) => qc.setQueryData(["me"], meFixture(PENDING_UNFINISHED)));
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain(KY.unfBody);
    expect(mockGetActiveOrder).not.toHaveBeenCalled();
  });
});

/** First Run v2 F (ledger D-82 §2 #3): the outcome pages are full screens, and ✕ goes to the customer side. */
describe("rider board — First Run v2 ID-check outcome pages (D-82)", () => {
  it("an F page draws no mint top card and no tab bar slot; ✕ switches to the customer side (Home)", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "failed", kycAttempts: 1, kycDeclineReason: "id_unreadable" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(activeTree.root.findAll((n) => typeof n.type === "string" && n.props.testID === "kyc-outcome-F4a")).toHaveLength(1);
    // The mint top card greets the rider by name; the F page doesn't.
    expect(treeText(activeTree)).not.toContain("Tapiwa");
    const exit = activeTree.root.findAll((n) => typeof n.type === "string" && n.props.testID === "exit-button")[0]!;
    let p: renderer.ReactTestInstance | null = exit;
    while (p && typeof p.props.onPress !== "function") p = p.parent;
    await renderer.act(async () => {
      p!.props.onPress();
    });
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("a duplicate decline is F5's WhatsApp-only page — no Try again (owner 2026-10-06)", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "failed", kycAttempts: 1, kycDeclineReason: "duplicate" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(activeTree.root.findAll((n) => typeof n.type === "string" && n.props.testID === "kyc-outcome-F5dup")).toHaveLength(1);
    const labels = activeTree.root
      .findAll((n) => typeof n.props.label === "string" && typeof n.props.onPress === "function")
      .map((n) => n.props.label as string);
    expect(labels).toEqual([KY.msg]);
  });

  it("F6 names the day the ID expired when the server sends it (kycExpiredOn)", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "expired", kycExpiredOn: "2026-10-02" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain("Expired 2 Oct 2026. Re-verify to keep riding.");
  });

  it("reopening the rider side re-resolves the same page from the server (G3)", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "expired" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain("Re-verify to keep riding.");
    act(() => activeTree!.unmount());
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain("Re-verify to keep riding.");
  });

  it("the non-KYC gates keep their Rider v2 walls (here: suspended), with the tab bar", async () => {
    mockGetMe.mockResolvedValue(meFixture());
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockSetOnline.mockRejectedValueOnce(new ApiError(403, "Your account is suspended", "suspended"));
    activeTree = renderScreen();
    await settle();
    await settle();
    expect(treeText(activeTree)).toContain("Your account is suspended");
    // D-82 §4 (owner 2026-10-06): the server pushes and pins an "Account paused" row — it sends no SMS.
    expect(treeText(activeTree)).toContain("The details are in your notifications.");
    expect(treeText(activeTree)).not.toContain("SMS");
    expect(activeTree.root.findAll((n) => typeof n.type === "string" && typeof n.props.testID === "string" && n.props.testID.startsWith("kyc-outcome-"))).toHaveLength(0);
  });
});
