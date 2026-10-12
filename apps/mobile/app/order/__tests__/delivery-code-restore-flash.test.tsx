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
 * screen fetches the code by itself, so the delivery code card is never empty. D2 (owner 2026-10-07): that
 * fetch is a READ (`revealDeliveryCode`, the same code on every device), never a rotation — before D2 it
 * rotated, so opening the order on a second device killed the code the recipient already had (U19).
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderSnapshot } from "../../../src/api/orders";

const CODE_KEY_PREFIX = "lynia.deliveryCode.";

const mockGetOrder = jest.fn<Promise<OrderSnapshot>, [string]>();
const mockRotateDeliveryCode = jest.fn();
const mockRevealDeliveryCode = jest.fn();

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
  revealDeliveryCode: (...args: unknown[]) => mockRevealDeliveryCode(...args),
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
// The screen's "came back to the app" callback, so a test can fire it.
let mockForeground: (() => void) | null = null;
jest.mock("../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: (cb: () => void) => {
    mockForeground = cb;
  },
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

let lastClient: QueryClient | null = null;

async function render(): Promise<renderer.ReactTestRenderer> {
  const client = (lastClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }));
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

/** The code renders as two 3-digit groups (After Send v2); its spoken label carries every digit. */
function codeShown(tree: renderer.ReactTestRenderer, code: string): boolean {
  const spoken = `${CODE_LABEL}, ${code.split("").join(" ")}`;
  return tree.root.findAll((n) => n.props.accessibilityLabel === spoken).length > 0;
}

beforeEach(() => {
  mockForeground = null;
  releaseCodeRead = null;
  rejectCodeRead = null;
  mockGetOrder.mockReset();
  mockRotateDeliveryCode.mockReset();
  mockRevealDeliveryCode.mockReset();
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
    expect(mockRevealDeliveryCode).not.toHaveBeenCalled();
  });

  it("shows the restored digits once the read lands — and never re-issues", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder());

    const tree = await render();
    await act(async () => {
      releaseCodeRead?.("482913");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(codeShown(tree, "482913")).toBe(true);
    expect(mockRotateDeliveryCode).not.toHaveBeenCalled();
    expect(mockRevealDeliveryCode).not.toHaveBeenCalled();
  });

  it("U19: a device with no code (a second phone, the web app) READS the current code — it never rotates it", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder());

    const tree = await render();
    mockRevealDeliveryCode.mockResolvedValue({ deliveryCode: "553201" });
    await act(async () => {
      releaseCodeRead?.(null);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(mockRevealDeliveryCode).toHaveBeenCalledTimes(1);
    expect(mockRotateDeliveryCode).not.toHaveBeenCalled();
    expect(codeShown(tree, "553201")).toBe(true);
  });

  it("falls back to issuing a fresh code when the keychain read REJECTS — a gate that never opens would leave no code", async () => {
    // The risk the `codeRestored` gate introduces: if the restore never settles, the card never
    // renders at all, which is strictly worse than the false "isn't showing" it replaced — the
    // customer would have no code AND no way to ask for one. `loadDeliveryCode` swallows native
    // failures and the effect also catches, so a rejection degrades to the recoverable prompt.
    mockGetOrder.mockResolvedValue(assignedOrder());

    const tree = await render();
    mockRevealDeliveryCode.mockResolvedValue({ deliveryCode: "553201" });
    await act(async () => {
      rejectCodeRead?.(new Error("keychain unavailable"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(mockRevealDeliveryCode).toHaveBeenCalledTimes(1);
    expect(mockRotateDeliveryCode).not.toHaveBeenCalled();
    expect(codeShown(tree, "553201")).toBe(true);
  });
});

describe("delivery code — D2 (U20 failed read, U04 lockout re-issue)", () => {
  it("U20: a failed read keeps the card on 'Getting your code…' with a Try again toast; Try again shows the code", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder());
    mockRevealDeliveryCode.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({ deliveryCode: "553201" });

    const tree = await render();
    await act(async () => {
      releaseCodeRead?.(null);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(mockRevealDeliveryCode).toHaveBeenCalledTimes(1);
    // Before U20 the card vanished on the error (and came back as "Getting your code…" for good).
    expect(textHits(tree, "Getting your code…")).toBeGreaterThan(0);
    const tryAgain = tree.root.findAll((n) => n.props.accessibilityLabel === "Try again" && typeof n.props.onPress === "function");
    expect(tryAgain.length).toBeGreaterThan(0);
    // It doesn't loop on its own: one failure, one call, until something changes or the customer taps.
    await settle();
    expect(mockRevealDeliveryCode).toHaveBeenCalledTimes(1);

    await act(async () => {
      tryAgain[0]!.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(mockRevealDeliveryCode).toHaveBeenCalledTimes(2);
    expect(codeShown(tree, "553201")).toBe(true);
    expect(mockRotateDeliveryCode).not.toHaveBeenCalled();
  });

  it("U04: the biker's tries ran out — the code is re-issued ONCE (the explicit rotate) and the new code replaces the dead one", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder({ deliveryOtpAttempts: 5, codeRotatedAt: "2026-10-07T09:00:00.000Z" }));
    mockRotateDeliveryCode.mockResolvedValue({ deliveryCode: "604117" });

    const tree = await render();
    await act(async () => {
      releaseCodeRead?.("482913");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    await settle();

    expect(mockRotateDeliveryCode).toHaveBeenCalledTimes(1);
    // A locked code is dead: it is never read back to be shown.
    expect(mockRevealDeliveryCode).not.toHaveBeenCalled();
    expect(codeShown(tree, "604117")).toBe(true);
    expect(codeShown(tree, "482913")).toBe(false);
  });

  // D2 review item 4: a re-issue that started while a read was in flight could be overwritten by the read's
  // late answer — the OLD, dead code. The re-issue now waits for the read to settle.
  it("a lock that arrives while the code read is in flight re-issues only after the read settles; the new code wins", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder({ deliveryOtpAttempts: 0, codeRotatedAt: "2026-10-07T09:00:00.000Z" }));
    let releaseReveal: ((v: { deliveryCode: string }) => void) | null = null;
    mockRevealDeliveryCode.mockImplementation(() => new Promise((resolve) => (releaseReveal = resolve)));
    mockRotateDeliveryCode.mockResolvedValue({ deliveryCode: "604117" });

    const tree = await render();
    await act(async () => {
      releaseCodeRead?.(null);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(mockRevealDeliveryCode).toHaveBeenCalledTimes(1);

    // The rider burns the last try while the read is still out.
    const locked = assignedOrder({ deliveryOtpAttempts: 5, codeRotatedAt: "2026-10-07T09:00:00.000Z" });
    mockGetOrder.mockResolvedValue(locked);
    await act(async () => {
      lastClient!.setQueryData(["order", "order-1"], locked);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(mockRotateDeliveryCode).not.toHaveBeenCalled();

    await act(async () => {
      releaseReveal?.({ deliveryCode: "482913" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    await settle();

    expect(mockRotateDeliveryCode).toHaveBeenCalledTimes(1);
    expect(codeShown(tree, "604117")).toBe(true);
    expect(codeShown(tree, "482913")).toBe(false);
  });

  // D2 review item 1: the server caps lockout re-issues per order; past it the app must not offer a retry
  // that can't succeed.
  // D-97 (2.14d) replaced the sticky toast: the card itself says so, with its own Call support.
  it("past the server's re-issue cap: no Try again — the 2.14d limit card and Call support; it doesn't loop", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder({ deliveryOtpAttempts: 5, codeRotatedAt: "2026-10-07T09:00:00.000Z" }));
    const { ApiError } = jest.requireActual("../../../src/api/client") as typeof import("../../../src/api/client");
    mockRotateDeliveryCode.mockRejectedValue(
      new ApiError(409, "Too many wrong tries on this code. Call LyniaGo support to finish this delivery.", "code_reissue_limit"),
    );

    const tree = await render();
    await act(async () => {
      releaseCodeRead?.("482913");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    await settle();

    expect(mockRotateDeliveryCode).toHaveBeenCalledTimes(1);
    expect(textHits(tree, "Too many wrong tries · call us to finish")).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Call support" && typeof n.props.onPress === "function").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Try again" && typeof n.props.onPress === "function")).toHaveLength(0);
    expect(mockRevealDeliveryCode).not.toHaveBeenCalled();
  });

  // Second review F4: a failed re-issue (not the cap) left the lock "handled" while a locked code is never
  // read — the card sat on "Getting your code…" for good. Coming back to the app tries once more.
  it("a failed re-issue is retried when the customer comes back to the app, and the new code shows", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder({ deliveryOtpAttempts: 5, codeRotatedAt: "2026-10-07T09:00:00.000Z" }));
    mockRotateDeliveryCode.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({ deliveryCode: "604117" });

    const tree = await render();
    await act(async () => {
      releaseCodeRead?.("482913");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    await settle();
    expect(mockRotateDeliveryCode).toHaveBeenCalledTimes(1);
    await settle();
    expect(mockRotateDeliveryCode).toHaveBeenCalledTimes(1); // no loop on its own

    await act(async () => {
      mockForeground?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    await settle();

    expect(mockRotateDeliveryCode).toHaveBeenCalledTimes(2);
    expect(codeShown(tree, "604117")).toBe(true);
    expect(mockRevealDeliveryCode).not.toHaveBeenCalled();
  });

  // D-97 (2.14c): the failed re-issue no longer leaves a toast — the card says a new code needs data and,
  // once that automatic fetch has failed, offers "Send a new code".
  it("D-97 2.14c: a failed re-issue shows the needs-data card; Send a new code brings the new code", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder({ deliveryOtpAttempts: 5, codeRotatedAt: "2026-10-07T09:00:00.000Z" }));
    mockRotateDeliveryCode.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({ deliveryCode: "604117" });

    const tree = await render();
    await act(async () => {
      releaseCodeRead?.("482913");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    await settle();

    expect(JSON.stringify(tree.toJSON())).toContain("The old code stopped working. A new one needs data.");
    expect(codeShown(tree, "482913")).toBe(false);
    const sendNew = tree.root.findAll((n) => n.props.accessibilityLabel === "Send a new code" && typeof n.props.onPress === "function");
    expect(sendNew.length).toBeGreaterThan(0);
    await act(async () => {
      sendNew[0]!.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(codeShown(tree, "604117")).toBe(true);
  });

  // D-97 (2.14b): a re-issued code is "New code" until it's shared; sharing it clears the strip.
  it("D-97 2.14b: the re-issued code shows the New code strip until Share code", async () => {
    const { Share } = jest.requireActual("react-native") as typeof import("react-native");
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    mockGetOrder.mockResolvedValue(assignedOrder({ deliveryOtpAttempts: 5, codeRotatedAt: "2026-10-07T09:00:00.000Z" }));
    mockRotateDeliveryCode.mockResolvedValue({ deliveryCode: "604117" });
    // The stale pre-rotation snapshot can re-baseline the stamp, so the next one reads the new code back.
    mockRevealDeliveryCode.mockResolvedValue({ deliveryCode: "604117" });

    const tree = await render();
    await act(async () => {
      releaseCodeRead?.("482913");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    // The server's next snapshot carries the new code's stamp and the reset tries.
    mockGetOrder.mockResolvedValue(assignedOrder({ deliveryOtpAttempts: 0, codeRotatedAt: "2026-10-07T09:20:00.000Z" }));
    await act(async () => {
      mockForeground?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    await settle();

    expect(codeShown(tree, "604117")).toBe(true);
    expect(textHits(tree, "New code · the old one stopped working")).toBeGreaterThan(0);
    const shareBtn = tree.root.findAll((n) => n.props.accessibilityLabel === "Share code" && typeof n.props.onPress === "function");
    await act(async () => {
      shareBtn[0]!.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(shareSpy).toHaveBeenCalled();
    expect(textHits(tree, "New code · the old one stopped working")).toBe(0);
    expect(textHits(tree, "New code · shared")).toBeGreaterThan(0);
    shareSpy.mockRestore();
  });

  // Second review F5: a Try again on a failed read, tapped while a lockout re-issue is in flight, must not
  // land the old (dead) code.
  it("a read answered while a re-issue is in flight is dropped; the re-issued code shows", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder({ deliveryOtpAttempts: 0, codeRotatedAt: "2026-10-07T09:00:00.000Z" }));
    mockRevealDeliveryCode.mockRejectedValueOnce(new Error("timeout"));
    let releaseRotate: ((v: { deliveryCode: string }) => void) | null = null;
    mockRotateDeliveryCode.mockImplementation(() => new Promise((resolve) => (releaseRotate = resolve)));

    const tree = await render();
    await act(async () => {
      releaseCodeRead?.(null);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(mockRevealDeliveryCode).toHaveBeenCalledTimes(1);
    const tryAgain = tree.root.findAll((n) => n.props.accessibilityLabel === "Try again" && typeof n.props.onPress === "function");
    expect(tryAgain.length).toBeGreaterThan(0);

    // The rider burns the last try: the re-issue starts and is still out.
    const locked = assignedOrder({ deliveryOtpAttempts: 5, codeRotatedAt: "2026-10-07T09:00:00.000Z" });
    mockGetOrder.mockResolvedValue(locked);
    await act(async () => {
      lastClient!.setQueryData(["order", "order-1"], locked);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(mockRotateDeliveryCode).toHaveBeenCalledTimes(1);

    // The customer taps the old Try again; the read answers with the old code before the re-issue lands.
    mockRevealDeliveryCode.mockResolvedValueOnce({ deliveryCode: "482913" });
    await act(async () => {
      tryAgain[0]!.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(mockRevealDeliveryCode).toHaveBeenCalledTimes(2);
    expect(codeShown(tree, "482913")).toBe(false);

    await act(async () => {
      releaseRotate?.({ deliveryCode: "604117" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(codeShown(tree, "604117")).toBe(true);
  });

  it("a code that isn't locked is never re-issued, however many snapshots arrive", async () => {
    mockGetOrder.mockResolvedValue(assignedOrder({ deliveryOtpAttempts: 4, codeRotatedAt: "2026-10-07T09:00:00.000Z" }));

    const tree = await render();
    await act(async () => {
      releaseCodeRead?.("482913");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(mockRotateDeliveryCode).not.toHaveBeenCalled();
    expect(codeShown(tree, "482913")).toBe(true);
  });
});
