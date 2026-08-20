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
import renderer, { act } from "react-test-renderer";
import { controlInteractions, type InteractionControl } from "../../../../src/testing/interactions";
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
// Location behaviour is driven by these two switches rather than per-test `jest.spyOn`: a spy on a
// module-factory mock did NOT reliably restore between tests, and a leaked "permission denied" made
// every later test think the rider was gated. Reset in afterEach, set by the tests that need them.
let mockLocPermission: "granted" | "denied" = "granted";
let mockLocFixFails = false;
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: async () => ({ status: mockLocPermission }),
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
import * as WebBrowser from "expo-web-browser";
import { makeOffer } from "../../../../src/api/offers";
import { retryKyc } from "../../../../src/api/riders";

const mockMakeOffer = makeOffer as jest.MockedFunction<typeof makeOffer>;
// The KYC launch lane: `retryKyc` hands back a verification URL, and the in-app browser either opens
// it, is closed by the rider, or cannot open at all — the three outcomes the pending walls resolve on.
const mockRetryKyc = retryKyc as jest.MockedFunction<typeof retryKyc>;
const mockOpenAuthSession = WebBrowser.openAuthSessionAsync as jest.MockedFunction<
  typeof WebBrowser.openAuthSessionAsync
>;
/** The rider closing the in-app tab. Written as a literal because the mock replaces the whole module,
 *  so `WebBrowserResultType.DISMISS` does not exist at runtime here. */
const DISMISSED = { type: "dismiss" } as unknown as WebBrowser.WebBrowserAuthSessionResult;

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
    mockGetOpenOrders.mockResolvedValue([]); // empty board → RiderBoardEmptyView renders

    activeTree = renderScreen();
    await settle();
    await settle();

    // The empty state renders...
    const emptyText = activeTree.root
      .findAll((n) => typeof n.props.title === "string")
      .map((n) => n.props.title as string);
    expect(emptyText).toContain("Nothing in range yet");

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
    // The wall itself still renders — this is a removal, not a regression of the gate. (Copy is the
    // mock's since the pending split: an auto-mode rider with no server pending-state resolves to
    // `unfinished`, whose primary is "Finish verifying".)
    expect(labelHits(activeTree, "Finish verifying")).toBeGreaterThan(0);
  });

  /**
   * The 2026-08-16 removal, pinned by SHAPE rather than by string.
   *
   * The assertions above name "Back to customer" — which only stops the bridge coming back under the
   * name it had. The P0-1 pending split (2026-08-20) proposed re-adding it as "Order food and send
   * parcels", which every absence assertion above would have waved through. The owner's instruction
   * was about the bridge, not the label, so pin the whole action set: any new action on a KYC wall
   * fails here and has to be argued for on purpose.
   */
  const WALL_ACTIONS: ReadonlyArray<[string, Parameters<typeof meFixture>[0], string[]]> = [
    ["in flight — with the vendor, nothing to press", { kycStatus: "pending", kycMode: "auto", kycPendingState: "in_flight" }, []],
    ["unfinished — the rider's move", { kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }, ["Finish verifying"]],
    ["manual/ops review — nothing to press", { kycStatus: "pending", kycMode: "manual" }, []],
    ["ID expired", { kycStatus: "expired" }, ["Re-verify my ID"]],
    ["declined", { kycStatus: "failed", kycAttempts: 1 }, ["Try again"]],
  ];

  it.each(WALL_ACTIONS)("%s: the wall offers exactly its own actions and no exit", async (_name, patch, expected) => {
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
  });
});

/**
 * P0-1 — `kyc_pending` is three screens, not one (`RJ kyc_pending` / `kyc_unfinished` / `kyc_cant_start`).
 *
 * The bug these exist for: a rider who opened the check and backed out at step one used to land on
 * "Your ID check is with Didit" — false, nothing was submitted — with no way to resume. Each state now
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

  it("in flight: says the check is with the vendor, and asks nothing of the rider", async () => {
    const text = await wall({ kycStatus: "pending", kycMode: "auto", kycPendingState: "in_flight" });
    expect(text).toContain("Finishing verification");
    expect(text).toContain("Your ID check is with Didit");
    expect(text).not.toContain("Finish verifying your ID");
  });

  it("unfinished: never claims the check is with the vendor — nothing was submitted", async () => {
    const text = await wall({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" });
    expect(text).toContain("Finish verifying your ID");
    expect(text).toContain("You haven't finished verifying your ID");
    // The precise lie this split exists to remove.
    expect(text).not.toContain("Your ID check is with Didit");
  });

  // Absent signal ⇒ unfinished. An older API that sends no pending-state must still leave the rider a
  // way forward; defaulting the other way would strand someone who cancelled with nothing to press.
  it("an API that sends no pending state still offers the resume", async () => {
    const text = await wall({ kycStatus: "pending", kycMode: "auto" });
    expect(text).toContain("Finish verifying your ID");
  });

  /**
   * The launch lane. `openAuthSessionAsync` was wrapped in `.catch(() => undefined)`, so a browser
   * that could not open — no WebView, a stripped Android build — swallowed the failure whole: the
   * rider tapped, nothing happened, and they were left on the same wall with no explanation.
   */
  it("a launch that never opened shows the couldn't-start wall, not silence", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", verificationUrl: "https://verify.didit.me/s1" });
    mockOpenAuthSession.mockRejectedValue(new Error("no browser available"));

    activeTree = renderScreen();
    await settle();
    await settle();

    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Finish verifying").props.onPress();
    });
    await settle();

    const text = treeText(activeTree);
    expect(text).toContain("We couldn't open the ID check");
    // It must NOT read as a decline: nothing was assessed, and blaming the rider for a device fault
    // sends them round a loop that fails the same way.
    expect(text).not.toContain("We couldn't verify your ID");
    const labels = activeTree.root
      .findAll((n) => typeof n.props.label === "string" && typeof n.props.onPress === "function")
      .map((n) => n.props.label as string);
    expect(labels).toEqual(["Try again", "Contact support"]);
  });

  // Closing the tab is a choice, not a fault — it must land on the resume, never on the alert state.
  it("closing the verification tab is unfinished, not a failure", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", verificationUrl: "https://verify.didit.me/s1" });
    mockOpenAuthSession.mockResolvedValue(DISMISSED);

    activeTree = renderScreen();
    await settle();
    await settle();

    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Finish verifying").props.onPress();
    });
    await settle();

    expect(treeText(activeTree)).not.toContain("We couldn't open the ID check");
    expect(treeText(activeTree)).toContain("Finish verifying your ID");
  });

  // The cached pending-state is from BEFORE the rider went to verify, so it says "unfinished" — which
  // would tell someone who just completed the check that they haven't started it.
  it("a completed check shows in flight, not the stale unfinished it was cached with", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", verificationUrl: "https://verify.didit.me/s1" });
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: "lynia://kyc" } as unknown as WebBrowser.WebBrowserAuthSessionResult);

    activeTree = renderScreen();
    await settle();
    await settle();
    // Hold the refetch open so only the optimistic value is on screen — that window IS the bug: it is
    // where a rider who just finished would otherwise be told they haven't started.
    mockGetMe.mockImplementation(() => new Promise(() => undefined));
    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Finish verifying").props.onPress();
    });

    expect(treeText(activeTree)).toContain("Your ID check is with Didit");
    expect(treeText(activeTree)).not.toContain("Finish verifying your ID");
  });

  /**
   * ...and it must stay a hint. The obvious fix — let a `completed` launch outrank the server — would
   * strand a rider whose completion the vendor never registered: the in-flight wall has no action by
   * design, so there is nothing to press to get off it. The refetch has to be able to pull them back.
   */
  it("but the server can still pull a completed rider back to the resume", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", verificationUrl: "https://verify.didit.me/s1" });
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: "lynia://kyc" } as unknown as WebBrowser.WebBrowserAuthSessionResult);

    activeTree = renderScreen();
    await settle();
    await settle();
    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Finish verifying").props.onPress();
    });
    // The refetch the launch fires lands with the vendor's real answer: nothing was registered.
    await settle();
    await settle();

    expect(treeText(activeTree)).toContain("Finish verifying your ID");
    expect(treeText(activeTree)).not.toContain("Your ID check is with Didit");
  });

  // Without the reset, one failed launch would hold the rider on the alert wall forever — the exact
  // dead end the state was added to remove.
  it("a retry that opens fine clears the couldn't-start wall", async () => {
    mockGetMe.mockResolvedValue(meFixture({ kycStatus: "pending", kycMode: "auto", kycPendingState: "unfinished" }));
    mockGetActiveOrder.mockResolvedValue(null);
    mockGetOpenOrders.mockResolvedValue([]);
    mockRetryKyc.mockResolvedValue({ kycStatus: "pending", mode: "auto", verificationUrl: "https://verify.didit.me/s1" });
    mockOpenAuthSession.mockRejectedValueOnce(new Error("no browser available"));

    activeTree = renderScreen();
    await settle();
    await settle();
    const tree = activeTree;
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Finish verifying").props.onPress();
    });
    await settle();
    expect(treeText(activeTree)).toContain("We couldn't open the ID check");

    mockOpenAuthSession.mockResolvedValue(DISMISSED);
    await renderer.act(async () => {
      tree.root.find((n) => n.props.label === "Try again").props.onPress();
    });
    await settle();

    expect(treeText(activeTree)).not.toContain("We couldn't open the ID check");
  });

  it("manual review stays its own state, whatever the pending state says", async () => {
    const text = await wall({ kycStatus: "pending", kycMode: "manual", kycPendingState: "in_flight" });
    expect(text).toContain("Your ID is under review");
    expect(text).not.toContain("Your ID check is with Didit");
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
    // greetingLine breaks the phrase and the name onto two lines inside one string.
    expect(treeText(activeTree)).toMatch(/Good (morning|afternoon|evening),\nTapiwa/);
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

    expect(treeText(activeTree)).toMatch(/Couldn't get your location/);
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

    expect(treeText(activeTree)).toMatch(/Can't find your location/);
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
    // list. The row's label says "update it", never "change location", and the sheet is absent.
    const labels = activeTree.root
      .findAll((n) => typeof n.props.accessibilityLabel === "string")
      .map((n) => n.props.accessibilityLabel as string);
    expect(labels.some((l) => /Your location: .*\. Update it/.test(l))).toBe(true);
    expect(labels.some((l) => /Change location/.test(l))).toBe(false);
    expect(treeText(activeTree)).not.toMatch(/Deliver to|Use my current location|Search an address/);
  });
});
