/**
 * Job history / Trip history (Rider v2 C12/C13, ledger D-54). Pins the split by side — the rider sees
 * only jobs they carried (with the fare, or "No fare"), the customer only orders they placed — and that
 * the list stays virtualized (B-O1: a ScrollView + `.map()` over 50 rows mounted every row at once).
 */
import renderer, { act } from "react-test-renderer";
import { SectionList } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { OrderHistoryRow } from "../../../src/api/orders";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
const now = new Date();
const row = (i: number, role: "customer" | "rider", status: OrderHistoryRow["status"] = "delivered"): OrderHistoryRow => ({
  id: `${role}-${i}`,
  orderType: "parcel",
  merchantName: null,
  role,
  pickup: { point: { lat: 0, lng: 0 }, landmark: `Pickup ${i}` },
  dropoff: { point: { lat: 0, lng: 0 }, landmark: `Drop ${i}` },
  itemDesc: "Documents",
  note: null,
  proposedFare: "3.00",
  agreedFare: "3.20",
  status,
  createdAt: now.toISOString(),
  rating: null,
  counterpartyName: null,
});
const food = (r: OrderHistoryRow): OrderHistoryRow => ({ ...r, id: `${r.id}-food`, orderType: "merchant", merchantName: "Sadza Republic" });
const baseRows = [...Array.from({ length: 30 }, (_, i) => row(i, "customer")), row(1, "rider"), row(2, "rider", "cancelled")];
let mockRows = baseRows;

let mockSide = "rider";
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ side: mockSide }),
}));
jest.mock("../../../src/query/use-history-feed", () => ({
  useHistoryFeed: () => ({ rows: mockRows, showingStale: false, isFetching: false, isError: false, hasLiveData: true, refetch: jest.fn() }),
}));

import HistoryScreen from "../index";

const trees: renderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (trees.length) {
    const t = trees.pop()!;
    act(() => t.unmount());
  }
});
const text = (t: renderer.ReactTestRenderer): string =>
  t.root.findAll((n) => typeof n.props.children === "string").map((n) => n.props.children as string).join("\n");

function render(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <HistoryScreen />
      </SafeAreaProvider>,
    );
  });
  trees.push(tree);
  return tree;
}
const ids = (t: renderer.ReactTestRenderer): string[] =>
  (t.root.findByType(SectionList).props.sections as { data: OrderHistoryRow[] }[]).flatMap((s) => s.data.map((r) => r.id));

describe("history split by side", () => {
  it("rider: only the jobs they carried, with the week summary and 'No fare' on a cancelled job", () => {
    mockSide = "rider";
    const t = render();
    expect(ids(t)).toEqual(["rider-1", "rider-2"]);
    const s = text(t);
    expect(s).toContain("Job history");
    expect(s).toContain("This week · 1 job · $3.20 earned");
    expect(s).toContain("No fare");
  });

  it("customer: only the orders they placed, virtualized", () => {
    mockSide = "customer";
    const t = render();
    expect(ids(t)).toHaveLength(30);
    expect(ids(t).every((id) => id.startsWith("customer-"))).toBe(true);
    expect(text(t)).toContain("Trip history");
  });

  it("a placed food order opens the food tracker; a carried food job stays on the order screen", () => {
    const press = (t: renderer.ReactTestRenderer, id: string): void => {
      const list = t.root.findByType(SectionList);
      const item = (list.props.sections as { data: OrderHistoryRow[] }[]).flatMap((s) => s.data).find((r) => r.id === id)!;
      const el = list.props.renderItem({ item, index: 0 });
      act(() => el.props.onPress());
    };
    mockRows = [...baseRows, food(row(99, "customer")), food(row(98, "rider"))];
    mockSide = "customer";
    press(render(), "customer-99-food");
    expect(mockPush).toHaveBeenLastCalledWith("/food/order/customer-99-food");
    press(render(), "customer-0");
    expect(mockPush).toHaveBeenLastCalledWith("/order/customer-0");
    mockSide = "rider";
    press(render(), "rider-98-food");
    expect(mockPush).toHaveBeenLastCalledWith("/order/rider-98-food");
    mockRows = baseRows;
  });
});
