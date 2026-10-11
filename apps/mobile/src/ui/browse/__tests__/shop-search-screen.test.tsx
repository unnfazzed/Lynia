/**
 * U55 (reviewed list 2026-10-07): Shops / Pharmacy search (Browse v2 X3, ledger D-58).
 *  - "Search all pharmacies" from a store's no-match opened the section search empty: `?q=` now seeds the
 *    field, as the restaurant search's `initialQuery` does.
 *  - A failed search (5xx, 503, a timeout while online) drew nothing under the field: it is now the
 *    section's B11 error (browse-v2 `B.svc[*].err` + empty-states-v2 `browse.error`) with Try again.
 */
import renderer, { act } from "react-test-renderer";
import { Text, TextInput } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.useFakeTimers();

const TEST_METRICS = { frame: { x: 0, y: 0, width: 360, height: 720 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
let mockParams: { q?: string } = {};
const mockSearchArgs: string[] = [];
let mockSearch: { data: unknown; isFetching: boolean; isError: boolean } = { data: undefined, isFetching: false, isError: false };
const mockRefetch = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../../logic/home-location", () => ({ useHomeLocation: () => ({ label: "12 Lanark Rd", point: { lat: -17.8, lng: 31.05 }, source: "gps", locating: false, denied: false }) }));
jest.mock("../../../net/use-reachable", () => ({ useReachable: () => true }));
jest.mock("../../../query/use-shops", () => ({
  useShopSearch: (_service: string, q: string) => {
    mockSearchArgs.push(q);
    return { ...mockSearch, refetch: mockRefetch };
  },
}));

import { ShopSearchScreen } from "../ShopSearchScreen";

let tree: renderer.ReactTestRenderer | null = null;
function mount(): renderer.ReactTestRenderer {
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <ShopSearchScreen service="pharmacy" />
      </SafeAreaProvider>,
    );
  });
  return tree!;
}
function texts(t: renderer.ReactTestRenderer): string[] {
  return t.root.findAllByType(Text).map((n) => [n.props.children].flat(Infinity).filter((c) => typeof c === "string").join(""));
}

beforeEach(() => {
  mockParams = {};
  mockSearchArgs.length = 0;
  mockSearch = { data: undefined, isFetching: false, isError: false };
  mockRefetch.mockClear();
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
});

it("?q= seeds the field and searches it straight away", () => {
  mockParams = { q: "amoxi" };
  const t = mount();
  expect(t.root.findByType(TextInput).props.value).toBe("amoxi");
  expect(mockSearchArgs[0]).toBe("amoxi");
  expect(texts(t)).not.toContain("Search pharmacies");
});

it("without ?q= it opens on the idle state", () => {
  const t = mount();
  expect(t.root.findByType(TextInput).props.value).toBe("");
  expect(texts(t)).toContain("Search pharmacies");
});

it("a failed search is the section's error with Try again, not a blank screen", () => {
  mockParams = { q: "amoxi" };
  mockSearch = { data: undefined, isFetching: false, isError: true };
  const t = mount();
  const all = texts(t);
  expect(all).toContain("Couldn’t load pharmacies");
  expect(all).toContain("Nothing was lost.");
  const retry = t.root.findAll((n) => typeof n.props.onPress === "function" && n.props.accessibilityLabel === "Try again")[0]!;
  act(() => retry.props.onPress());
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
