/**
 * Rider v2 O1–O4 (ledger D-54): the Make-an-offer screen. Pins the SENSITIVE agreed-price seam the old
 * inline compose card carried — "Send offer" calls `makeOffer(orderId, { type, offeredFare, etaMinutes })`
 * (the asking price is an "accept", anything else a "counter"), a sent offer joins Your offers, and
 * "Skip this job" never submits.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { OpenOrder } from "../../../../src/api/orders";
import type { SentOffer } from "../../../../src/logic/rider-bid-draft";

const mockBack = jest.fn();
const mockMakeOffer = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ jobId: "order-1", toKm: "1.2" }),
  usePathname: () => "/rider/offer/order-1",
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../../src/api/offers", () => ({ makeOffer: (...a: unknown[]) => mockMakeOffer(...a) }));

import MakeOfferScreen, { isWellAbove } from "../[jobId]";
import { SENT_OFFERS_KEY, SKIPPED_JOBS_KEY } from "../../../../src/query/use-sent-offers";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

const ORDER: OpenOrder = {
  id: "order-1",
  pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Avondale shops" },
  dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Belgravia" },
  itemDesc: "A parcel",
  suggestedFare: "3.00",
  proposedFare: "3.00",
  distanceKm: 2.4,
  createdAt: new Date().toISOString(),
  customerFirstName: "Rudo",
};

let qc: QueryClient;
let tree: renderer.ReactTestRenderer;
function render(): void {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(["openOrders"], [ORDER]);
  qc.setQueryData(SENT_OFFERS_KEY, []);
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <MakeOfferScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
}
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}
const press = (label: string): void => {
  const n = tree.root.findAll((x) => x.props.label === label && typeof x.props.onPress === "function")[0];
  if (!n) throw new Error(`no button "${label}"`);
  act(() => n.props.onPress());
};
const text = (): string =>
  tree.root
    .findAll((n) => typeof n.type === "string")
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.filter((x) => typeof x === "string").join("") : typeof c === "string" ? c : "";
    })
    .join("|");

afterEach(() => {
  act(() => tree.unmount());
  jest.clearAllMocks();
});

describe("Make an offer (Rider v2 O1)", () => {
  it("draws the sender's asking price and a one-tap Send at that price", () => {
    render();
    expect(text()).toContain("Rudo is asking");
    expect(tree.root.findAll((n) => n.props.label === "Send offer · $3.00").length).toBeGreaterThan(0);
  });

  it("Send at the asking price is an ACCEPT with the default 10-minute ETA, and joins Your offers", async () => {
    mockMakeOffer.mockResolvedValue({});
    render();
    press("Send offer · $3.00");
    await flush();

    expect(mockMakeOffer).toHaveBeenCalledWith("order-1", { type: "accept", offeredFare: 3, etaMinutes: 10 });
    const sent = qc.getQueryData<SentOffer[]>(SENT_OFFERS_KEY) ?? [];
    expect(sent.map((s) => [s.order.id, s.fare, s.etaMinutes])).toEqual([["order-1", "3.00", 10]]);
    expect(mockBack).toHaveBeenCalled();
  });

  it("+ $0.50 and a 15-minute chip make a COUNTER at the shown fare", async () => {
    mockMakeOffer.mockResolvedValue({});
    render();
    press("+ $0.50");
    const chip = tree.root.findAll((n) => n.props.accessibilityLabel === "15 min" && typeof n.props.onPress === "function")[0]!;
    act(() => chip.props.onPress());
    press("Send offer · $3.50");
    await flush();

    expect(mockMakeOffer).toHaveBeenCalledWith("order-1", { type: "counter", offeredFare: 3.5, etaMinutes: 15 });
  });

  it("a failed send keeps the rider here with Try again — nothing joins Your offers", async () => {
    mockMakeOffer.mockRejectedValue(new Error("network down"));
    render();
    press("Send offer · $3.00");
    await flush();

    expect(text()).toContain("Couldn't send your offer. Check your data.");
    expect(qc.getQueryData<SentOffer[]>(SENT_OFFERS_KEY)).toEqual([]);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("Skip this job hides it from the board and never submits", () => {
    render();
    press("Skip this job");
    expect(mockMakeOffer).not.toHaveBeenCalled();
    expect([...(qc.getQueryData<Set<string>>(SKIPPED_JOBS_KEY) ?? [])]).toEqual(["order-1"]);
    expect(mockBack).toHaveBeenCalled();
  });
});

describe("isWellAbove (O2 warn notice)", () => {
  it("warns only past 1.4× the top of the band", () => {
    expect(isWellAbove(420, 3)).toBe(false);
    expect(isWellAbove(421, 3)).toBe(true);
  });
});
