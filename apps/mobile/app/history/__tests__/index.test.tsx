/**
 * Job history (Rider v2 C12, ledger D-54). Pins that the rider sees only jobs they carried (with the
 * fare, or "No fare"), that the list stays virtualized (B-O1: a ScrollView + `.map()` over 50 rows
 * mounted every row at once), and that the customer's Trip history (C13) is retired — Orders is the
 * customer's only history (Orders v2, ledger D-63).
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
const manyRiderRows = Array.from({ length: 30 }, (_, i) => row(100 + i, "rider"));
let mockRows = baseRows;

let mockSide = "rider";
const mockPush = jest.fn();
const mockRedirect = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ side: mockSide }),
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
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
    // Empty states v2 (D-78): plain text "This week · 1 job · $3.20", the figures in ink.
    expect(t.root.findAll((n) => Array.isArray(n.props.children) && n.props.children[0] === "This week · ").length).toBeGreaterThan(0);
    expect(s).toContain("1 job · $3.20");
    expect(s).not.toContain("earned");
    expect(s).toContain("No fare");
  });

  it("rider with no jobs: the summary reads 0 and the list shows 'No jobs this week'", () => {
    mockSide = "rider";
    mockRows = baseRows.filter((r) => !r.id.startsWith("rider-"));
    const t = render();
    const list = t.root.findByType(SectionList);
    let empty!: renderer.ReactTestRenderer;
    act(() => {
      empty = renderer.create(list.props.ListEmptyComponent as Parameters<typeof renderer.create>[0]);
    });
    const e = text(empty);
    expect(e).toContain("No jobs this week");
    expect(e).toContain("Finished jobs show here.");
    expect(text(t)).toContain("0 jobs · $0.00");
    mockRows = baseRows;
  });

  it("rider: a long list stays virtualized", () => {
    mockSide = "rider";
    mockRows = [...baseRows, ...manyRiderRows];
    const t = render();
    expect(ids(t)).toHaveLength(32);
    expect(ids(t).every((id) => id.startsWith("rider-"))).toBe(true);
    mockRows = baseRows;
  });

  it("customer: Trip history is retired — any other side lands on the Orders tab (D-63)", () => {
    mockSide = "customer";
    const t = render();
    expect(mockRedirect).toHaveBeenCalledWith("/orders");
    expect(t.root.findAllByType(SectionList)).toHaveLength(0);
  });

  it("a carried food job opens the one order screen (D-59)", () => {
    const press = (t: renderer.ReactTestRenderer, id: string): void => {
      const list = t.root.findByType(SectionList);
      const item = (list.props.sections as { data: OrderHistoryRow[] }[]).flatMap((s) => s.data).find((r) => r.id === id)!;
      const el = list.props.renderItem({ item, index: 0 });
      act(() => el.props.onPress());
    };
    mockRows = [...baseRows, food(row(98, "rider"))];
    mockSide = "rider";
    press(render(), "rider-1");
    expect(mockPush).toHaveBeenLastCalledWith("/order/rider-1");
    press(render(), "rider-98-food");
    expect(mockPush).toHaveBeenLastCalledWith("/order/rider-98-food");
    mockRows = baseRows;
  });
});
