/**
 * Notifications v1 (ledger D-66) — the screen container: read state, the side filter, the danger pin,
 * swipe-to-remove with Undo, and the loading / empty / couldn't-load states. The view-model rules are
 * pinned in src/ui/notifications/__tests__/model.test.ts.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FlatList, Text } from "react-native";
import type { NotificationRow } from "../../../src/api/notifications";
import { N } from "../../../src/ui/notifications/copy";
import { emptyCopy } from "../../../src/ui/emptyCopy";

const E = emptyCopy.notifications;

const NOW = new Date();
// Clamped to local midnight so a run just after 00:00 still lands every row under TODAY.
const TODAY_START = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime();
const ago = (min: number): string => new Date(Math.max(NOW.getTime() - min * 60_000, TODAY_START)).toISOString();

const mockGetNotificationsFeed = jest.fn();
const mockMarkNotificationsRead = jest.fn();
const mockDismissNotification = jest.fn();
const mockPush = jest.fn();
let mockParams: { side?: string } = {};
let mockPermission = { granted: true };

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  // Same immediate-invoke stub the other focus-effect suites use — there is no navigator to fire focus.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(cb, []);
  },
}));
// Only the permission read. The real module (pulled in through src/push/push) registers native listeners
// that keep a single-process (--runInBand, as on the 2-core CI runner) jest run from ever finishing.
jest.mock("expo-notifications", () => ({ getPermissionsAsync: () => Promise.resolve(mockPermission) }));
jest.mock("../../../src/push/push", () => ({
  notificationRowDestination: (r: { orderId: string | null }) => (r.orderId ? `/order/${r.orderId}` : "/home"),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children }: { children: unknown }) => children }));
jest.mock("../../../src/api/notifications", () => ({
  getNotificationsFeed: (...args: unknown[]) => mockGetNotificationsFeed(...args),
  markNotificationsRead: (...args: unknown[]) => mockMarkNotificationsRead(...args),
  dismissNotification: (...args: unknown[]) => mockDismissNotification(...args),
}));
jest.mock("../../../src/api/auth", () => ({ getMe: () => Promise.resolve({ firstName: "Nyasha", rider: null }) }));
jest.mock("../../../src/api/orders", () => ({ getActiveOrder: () => Promise.resolve(null) }));
jest.mock("../../../src/api/riders", () => ({ setOnline: () => Promise.resolve({}) }));

import NotificationsScreen from "../index";

function row(p: Partial<NotificationRow> & { id: string }): NotificationRow {
  return { orderId: null, icon: "bell", title: "t", message: "m", at: ago(5), unread: false, ...p };
}

const PARCEL = (id: string, minAgo: number, extra: Partial<NotificationRow> = {}): NotificationRow =>
  row({
    id,
    orderId: "o1",
    to: "customer",
    type: "status",
    status: "delivered",
    beat: "delivered",
    service: "send",
    dropoffArea: "Glenara Ave",
    riderName: "Tendai",
    title: "Parcel delivered",
    message: "Handed over.",
    at: ago(minAgo),
    steps: [
      { beat: "delivered", title: "Delivered", at: ago(minAgo) },
      { beat: "picked_up", title: "Parcel collected", at: ago(minAgo + 20) },
    ],
    ...extra,
  });

let tree: renderer.ReactTestRenderer;
async function renderScreen(): Promise<void> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={qc}>
        <NotificationsScreen />
      </QueryClientProvider>,
    );
  });
  await settle();
}
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
const texts = (): string[] => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(""));
const has = (s: string): boolean => texts().some((t) => t === s);

beforeEach(() => {
  jest.useRealTimers();
  mockParams = {};
  mockPermission = { granted: true };
  mockPush.mockReset();
  mockGetNotificationsFeed.mockReset();
  mockMarkNotificationsRead.mockReset().mockResolvedValue({ readAt: NOW.toISOString() });
  mockDismissNotification.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  // useNow's minute interval and the pending-removal timer would otherwise keep jest alive.
  act(() => tree?.unmount());
  jest.useRealTimers();
});

describe("Notifications v1 screen", () => {
  it("draws one row per order, titled by place, with the latest line and the bead line", async () => {
    mockGetNotificationsFeed.mockResolvedValue([
      PARCEL("s1", 5),
      row({ id: "f1", orderId: "o1", to: "customer", type: "fare", amount: "3.50", service: "send", at: ago(30) }),
    ]);
    await renderScreen();
    expect(texts().filter((t) => t === "Parcel to Glenara Ave")).toHaveLength(1);
    expect(has("Delivered. How was Tendai?")).toBe(true);
    // Delivered + collected + fare = three steps → two earlier updates.
    expect(has("2 earlier updates")).toBe(true);
    expect(has(N.dToday)).toBe(true);
  });

  it("B-O1: the day groups render through a FlatList", async () => {
    mockGetNotificationsFeed.mockResolvedValue([PARCEL("s1", 5)]);
    await renderScreen();
    expect(tree.root.findAllByType(FlatList)).toHaveLength(1);
  });

  it("stamps the read watermark on focus, and still renders if that fails", async () => {
    mockMarkNotificationsRead.mockRejectedValue(new Error("offline"));
    mockGetNotificationsFeed.mockResolvedValue([PARCEL("s1", 5)]);
    await renderScreen();
    expect(mockMarkNotificationsRead).toHaveBeenCalledTimes(1);
    expect(has("Parcel to Glenara Ave")).toBe(true);
  });

  it("follows the side: the rider sees jobs, both sides see account rows", async () => {
    const rows = [
      PARCEL("s1", 5),
      row({ id: "r1", orderId: "o2", to: "rider", type: "status", beat: "assigned", status: "assigned", amount: "3.20", pickupArea: "Eastgate", dropoffArea: "Belgravia", service: "send" }),
      row({ id: "a1", type: "account", action: "rider.kyc_approve", to: "rider" }),
    ];
    mockGetNotificationsFeed.mockResolvedValue(rows);
    await renderScreen();
    expect(has("Parcel to Glenara Ave")).toBe(true);
    expect(has("Eastgate → Belgravia")).toBe(false);
    expect(has(N.aVerifiedT)).toBe(true);

    mockParams = { side: "rider" };
    act(() => tree.unmount());
    await renderScreen();
    expect(has("Parcel to Glenara Ave")).toBe(false);
    expect(has("Eastgate → Belgravia")).toBe(true);
    expect(has("You got the job. $3.20 cash.")).toBe(true);
    expect(has(N.aVerifiedT)).toBe(true);
  });

  it("pins an account pause in force above the day groups", async () => {
    mockGetNotificationsFeed.mockResolvedValue([row({ id: "a1", type: "account", action: "rider.suspend", active: true, message: "Your account was paused." })]);
    mockParams = { side: "rider" };
    await renderScreen();
    expect(has(N.aPausedT)).toBe(true);
    expect(has(N.dToday)).toBe(false);
  });

  it("a needs-you row has its button, and it deep-links", async () => {
    mockGetNotificationsFeed.mockResolvedValue([
      row({ id: "of1", orderId: "o3", to: "customer", type: "offer", active: true, riderName: "Farai", amount: "3.20", service: "send", dropoffArea: "Avondale" }),
    ]);
    await renderScreen();
    expect(has("Farai offered $3.20 to carry it.")).toBe(true);
    const btn = tree.root.findAll((n) => n.props.accessibilityRole === "button" && n.props.accessibilityLabel === N.seeOffer)[0];
    expect(btn).toBeTruthy();
    act(() => btn!.props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/order/o3");
  });

  it("swipe-remove hides the order at once, offers Undo, and dismisses only when the toast expires", async () => {
    mockGetNotificationsFeed.mockResolvedValue([PARCEL("s1", 5), row({ id: "f1", orderId: "o1", to: "customer", type: "fare", service: "send", at: ago(30) })]);
    await renderScreen();
    // Real timers, not jest.useFakeTimers(): faked timers leaked into the rest of a single-process
    // (--runInBand) run — as on the 2-core CI runner — and the run never finished.
    const swipe = tree.root.findAll((n) => typeof n.props.onAccessibilityAction === "function")[0]!;
    act(() => swipe.props.onAccessibilityAction({ nativeEvent: { actionName: "delete" } }));
    expect(has("Parcel to Glenara Ave")).toBe(false);
    expect(has(N.removed)).toBe(true);
    expect(mockDismissNotification).not.toHaveBeenCalled();

    // Undo brings it back, and nothing is sent.
    const undo = tree.root.findAll((n) => n.props.accessibilityLabel === N.undo && typeof n.props.onPress === "function")[0]!;
    act(() => undo.props.onPress());
    expect(has("Parcel to Glenara Ave")).toBe(true);
    expect(mockDismissNotification).not.toHaveBeenCalled();

    // Remove again and let the toast run out: every row of the order is dismissed.
    const swipe2 = tree.root.findAll((n) => typeof n.props.onAccessibilityAction === "function")[0]!;
    act(() => swipe2.props.onAccessibilityAction({ nativeEvent: { actionName: "delete" } }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
    });
    expect(mockDismissNotification).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_300));
    });
    expect(mockDismissNotification.mock.calls.map((c) => c[0]).sort()).toEqual(["f1", "s1"]);
  }, 15_000);

  it("shows the notifications-off row when the permission isn't granted", async () => {
    mockPermission = { granted: false };
    mockGetNotificationsFeed.mockResolvedValue([PARCEL("s1", 5)]);
    await renderScreen();
    expect(has(N.offC)).toBe(true);
  });

  // Empty states v2 (D-78): "No notifications" with one line per side, and no action on either.
  it("empty: one quiet line per side, no Send a parcel", async () => {
    mockGetNotificationsFeed.mockResolvedValue([]);
    await renderScreen();
    expect(has(E.customer.title)).toBe(true);
    expect(has(E.customer.body)).toBe(true);
    expect(has(N.sendParcel)).toBe(false);
    mockParams = { side: "rider" };
    act(() => tree.unmount());
    await renderScreen();
    expect(has(E.rider.body)).toBe(true);
    expect(has(N.sendParcel)).toBe(false);
  });

  it("a non-array body renders the empty state, not a crash (CF-04)", async () => {
    mockGetNotificationsFeed.mockResolvedValue({ error: "nope" });
    await renderScreen();
    expect(has(E.customer.title)).toBe(true);
  });

  it("couldn't load with nothing cached: N10 with Try again", async () => {
    mockGetNotificationsFeed.mockRejectedValue(new Error("offline"));
    await renderScreen();
    expect(has(E.error.title)).toBe(true);
    expect(has(E.error.primary)).toBe(true);
  });
});
