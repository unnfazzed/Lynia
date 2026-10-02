/**
 * Customer Account tab — Rider v2 C6–C11 (`packages/design/handoff/rider-v2/`, ledger D-54).
 *
 * Pins: the four rows (Trip history · Notifications · Help & support · Settings); the Customer | Rider
 * toggle for someone who rides (Customer selected; Rider → Jobs); the Become-a-rider card's states for
 * someone who doesn't; and that neither is drawn until `me` resolves — a stale session role used to
 * flash "Become a rider" on a rider's own account (MOB-BOOT-02-SIB-3).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Me } from "../../../src/api/auth";
import { becomeStateFor } from "../../../src/logic/become-state";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
const mockGetMe = jest.fn<Promise<Me>, []>();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }) }));
jest.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined }));
jest.mock("../../../src/api/auth", () => ({ getMe: () => mockGetMe() }));
jest.mock("../../../src/api/notifications", () => ({ getNotificationsUnreadCount: () => Promise.resolve({ count: 0 }) }));

import { Linking } from "react-native";
import AccountTabScreen from "../account";

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

function me(rider: Partial<NonNullable<Me["rider"]>> | null): Me {
  return {
    profileId: "p1",
    role: rider ? "rider" : "customer",
    firstName: "Tendai",
    lastName: "Moyo",
    phone: "+263772451180",
    email: null,
    photoUrl: null,
    ordersCount: 3,
    idNumber: null,
    rider: rider ? { bikeReg: "ABH4721", kycStatus: "verified", ratingAvg: 4.9, ratingCount: 1, tripsCount: 5, isOnline: false, kycMode: "auto", ...rider } : null,
  };
}

function renderScreen(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <AccountTabScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}
const has = (t: renderer.ReactTestRenderer, copy: string): boolean =>
  t.root.findAll((n) => n.props.children === copy).length > 0 || t.root.findAll((n) => n.props.label === copy).length > 0;
function press(t: renderer.ReactTestRenderer, label: string): void {
  const btn = t.root.findAll((n) => (n.props.label === label || n.props.accessibilityLabel === label) && typeof n.props.onPress === "function");
  if (btn.length) return void act(() => btn[0]!.props.onPress());
  let node = t.root.findAll((n) => n.props.children === label)[0] ?? null;
  while (node && typeof node.props.onPress !== "function") node = node.parent;
  if (!node) throw new Error(`no pressable for "${label}"`);
  act(() => node!.props.onPress());
}

let tree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  jest.clearAllMocks();
});

describe("becomeStateFor", () => {
  it("maps each KYC stage to the card state", () => {
    expect(becomeStateFor(me(null))).toBe("none");
    expect(becomeStateFor(me({ kycStatus: "pending", kycPendingState: "unfinished" }))).toBe("progress");
    expect(becomeStateFor(me({ kycStatus: "pending", kycPendingState: "in_flight" }))).toBe("review");
    expect(becomeStateFor(me({ kycStatus: "pending", kycMode: "manual" }))).toBe("review");
    expect(becomeStateFor(me({ kycStatus: "failed" }))).toBe("failed");
    expect(becomeStateFor(me({ kycStatus: "verified" }))).toBe("toggle");
    expect(becomeStateFor(me({ kycStatus: "expired" }))).toBe("toggle");
  });
});

describe("customer Account (Rider v2 C6–C11)", () => {
  it("draws the three customer rows, routed to the customer side (Trip history retired, D-63)", async () => {
    mockGetMe.mockResolvedValue(me(null));
    tree = renderScreen();
    await settle();
    for (const row of ["Notifications", "Help & support", "Settings"]) expect(has(tree, row)).toBe(true);
    // Orders v2 (D-63): Orders is the customer's only history, so the Trip history row is gone.
    expect(has(tree, "Trip history")).toBe(false);
    press(tree, "Settings");
    press(tree, "Help & support");
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual(["/settings?side=customer"]);
    // D-60: Help & support is the support WhatsApp chat itself — no in-app help screen.
    expect(openURL).toHaveBeenCalledWith("https://wa.me/263778831938");
  });

  it("a customer-only user gets the Become-a-rider card, which starts KYC", async () => {
    mockGetMe.mockResolvedValue(me(null));
    tree = renderScreen();
    await settle();
    expect(has(tree, "Earn with your bike")).toBe(true);
    expect(has(tree, "Rider")).toBe(false);
    press(tree, "Start");
    expect(mockPush).toHaveBeenCalledWith("/rider/become");
  });

  it("a rider gets the toggle with Customer selected; Rider goes to Jobs", async () => {
    mockGetMe.mockResolvedValue(me({}));
    tree = renderScreen();
    await settle();
    expect(has(tree, "Earn with your bike")).toBe(false);
    const customer = tree.root.findAll((n) => n.props.accessibilityRole === "radio" && n.props.accessibilityLabel === "Customer")[0]!;
    expect(customer.props.accessibilityState.selected).toBe(true);
    press(tree, "Rider");
    expect(mockReplace).toHaveBeenCalledWith("/rider");
  });

  it("draws neither the toggle nor the card while the profile is loading", async () => {
    mockGetMe.mockReturnValue(new Promise(() => undefined));
    tree = renderScreen();
    await settle();
    expect(has(tree, "Earn with your bike")).toBe(false);
    expect(has(tree, "Rider")).toBe(false);
  });

  it("draws neither when the profile fetch fails", async () => {
    mockGetMe.mockRejectedValue(new Error("offline"));
    tree = renderScreen();
    await settle();
    expect(has(tree, "Earn with your bike")).toBe(false);
    expect(has(tree, "Rider")).toBe(false);
  });
});
