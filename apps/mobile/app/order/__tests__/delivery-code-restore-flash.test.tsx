/**
 * MOB-BOOT-02 (sibling of the feature-flag boot flash): the hand-off code card branched on
 * `deliveryCode` alone, and that state was seeded `null` then filled by an async SecureStore read. So
 * `null` meant both "no code held" and "not read yet", and the C7 branch rendered the second as the
 * first: a customer who DOES hold a valid code was shown the alarming "Your hand-off code isn't
 * showing — tap to re-issue" card, with a primary CTA that would have burned a rotation, until the
 * keychain read landed and the real digits replaced it.
 *
 * The loading skeleton does not cover this window: `app/(tabs)/home.tsx` pre-seeds `orderKey(id)` via
 * `setQueryData` before navigating, so tapping the live-order card mounts this screen with `order`
 * already in cache and paints the body on the first render.
 *
 * The fix adds a `codeRestored` sentinel and renders neither card until the read settles. These tests
 * hold the SecureStore read open so that window can be asserted on; the first fails pre-fix.
 *
 * After Send (ledger D-53) removed the "Re-issue" button: once the read confirms no code is held, the
 * screen issues a fresh one by itself, once, so the delivery code card is never empty.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderSnapshot } from "../../../src/api/orders";

const CODE_KEY_PREFIX = "lynia.deliveryCode.";

const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
const mockRotateDeliveryCode = jest.fn();

/** Held open until the test releases it, so the "restore in flight" window is deterministic. */
let releaseCodeRead: ((value: string | null) => void) | null = null;
let rejectCodeRead: ((err: Error) => void) | null = null;
const mockGetItemAsync = jest.fn(async (key: string) => {
  if (key.startsWith(CODE_KEY_PREFIX)) {
    return new Promise<string | null>((resolve, reject) => {
      releaseCodeRead = resolve;
      rejectCodeRead = reject;
    });
  }
  return null;
});

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => ({ id: "order-1" }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: (...args: [string]) => mockGetItemAsync(...args),
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../src/api/orders", () => ({
  getOrder: (...args: [string]) => mockGetOrder(...args),
  cancelOrder: jest.fn(),
  notifyWhenRiderOnline: jest.fn(),
  rateOrder: jest.fn(),
  rotateDeliveryCode: (...args: unknown[]) => mockRotateDeliveryCode(...args),
  raiseOrderPrice: jest.fn(),
  resendOrder: jest.fn(),
}));
jest.mock("../../../src/api/offers", () => ({
  listOffers: async () => [],
  selectOffer: jest.fn(),
}));
jest.mock("../../../src/realtime/use-order-socket", () => ({
  useOrderSocket: () => ({ connected: false }),
}));
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: () => undefined,
}));
jest.mock("../../../src/ui/order/OrderMap", () => ({
  OrderMap: () => null,
}));

import OrderScreen from "../[id]";

/** An assigned (live, deliverable) parcel — the state whose card carries the hand-off code. */
function assignedOrder(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    id: "order-1",
    status: "en_route_dropoff",
    orderType: "parcel",
    agreedFare: "5.00",
    proposedFare: "5.00",
    pickup: { point: { lat: -17.82, lng: 31.05 }, landmark: "Pickup spot" },
    dropoff: { point: { lat: -17.83, lng: 31.06 }, landmark: "Drop-off spot" },
    items: [],
    itemsCollected: null,
    note: null,
    pickupPhotoUrl: null,
    rider: { profileId: "r1", currentLat: null, currentLng: null, updatedAt: null },
    events: [],
    counterpartyPhone: "+263771234567",
    expiresAt: null,
    ridersNearby: null,
    undeliveredReason: null,
    undeliveredAttempts: null,
    deliveryOtpAttempts: 0,
    codeRotatedAt: null,
    cancelReason: null,
    cancelledBy: null,
    rebroadcastedToId: null,
    ...overrides,
  } as OrderSnapshot;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let activeTree: renderer.ReactTestRenderer | null = null;

async function render(): Promise<renderer.ReactTestRenderer> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <OrderScreen />
      </QueryClientProvider>,
    );
  });
  await settle();
  await settle();
  activeTree = tree;
  return tree;
}

function textHits(tree: renderer.ReactTestRenderer, needle: string): number {
  return tree.root.findAll((n) => typeof n.props.children === "string" && n.props.children.includes(needle)).length;
}

const CODE_LABEL = "DELIVERY CODE";

beforeEach(() => {
  releaseCodeRead = null;
  rejectCodeRead = null;
  mockGetOrder.mockReset();
  mockRotateDeliveryCode.mockReset();
  mockGetItemAsync.mockClear();
});

afterEach(() => {
  if (activeTree) {
    act(() => activeTree!.unmount());
    activeTree = null;
  }
});

describe("parcel hand-off code — no false 'code isn't showing' while the device read is in flight (MOB-BOOT-02)", () => {
  it("renders neither code card until the restore settles, instead of asserting the code is missing", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder());

    const tree = await render();

    // The restore is deliberately still pending: no code card yet (After Send, D-53, draws no
    // "missing code" state — the card shows only real digits).
    expect(textHits(tree, CODE_LABEL)).toBe(0);
    // And it must not have re-issued one either — the customer may hold a perfectly good code.
    expect(mockRotateDeliveryCode).not.toHaveBeenCalled();
  });

  it("shows the restored digits once the read lands — and never re-issues", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder());

    const tree = await render();
    await act(async () => {
      releaseCodeRead?.("482913");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(textHits(tree, "482913")).toBeGreaterThan(0);
    expect(mockRotateDeliveryCode).not.toHaveBeenCalled();
  });

  it("issues a fresh code once when the read confirms none is held — the code card is never left empty", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder());

    const tree = await render();
    mockRotateDeliveryCode.mockResolvedValue({ deliveryCode: "553201" });
    await act(async () => {
      releaseCodeRead?.(null);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(mockRotateDeliveryCode).toHaveBeenCalledTimes(1);
    expect(textHits(tree, "553201")).toBeGreaterThan(0);
  });

  it("falls back to issuing a fresh code when the keychain read REJECTS — a gate that never opens would leave no code", async () => {
    // The risk the `codeRestored` gate introduces: if the restore never settles, the card never
    // renders at all, which is strictly worse than the false "isn't showing" it replaced — the
    // customer would have no code AND no way to ask for one. `loadDeliveryCode` swallows native
    // failures and the effect also catches, so a rejection degrades to the recoverable prompt.
    mockGetOrder.mockResolvedValue(assignedOrder());

    const tree = await render();
    mockRotateDeliveryCode.mockResolvedValue({ deliveryCode: "553201" });
    await act(async () => {
      rejectCodeRead?.(new Error("keychain unavailable"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(mockRotateDeliveryCode).toHaveBeenCalledTimes(1);
    expect(textHits(tree, "553201")).toBeGreaterThan(0);
  });
});
