/**
 * P18 (customer review 2026-10-07): Shops / Pharmacy search sent `GET /shops/search` on every keystroke. It now
 * waits for a 300 ms pause, like the restaurant search (`useDebounced`, `SEARCH_DEBOUNCE_MS`).
 */
import renderer, { act } from "react-test-renderer";
import { TextInput } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.useFakeTimers();

const TEST_METRICS = { frame: { x: 0, y: 0, width: 360, height: 720 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const mockSearchArgs: string[] = [];

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }) }));
jest.mock("../../../logic/home-location", () => ({ useHomeLocation: () => ({ label: "12 Lanark Rd", point: { lat: -17.8, lng: 31.05 }, source: "gps", locating: false, denied: false }) }));
jest.mock("../../../net/use-reachable", () => ({ useReachable: () => true }));
jest.mock("../../../query/use-shops", () => ({
  useShopSearch: (_service: string, q: string) => {
    mockSearchArgs.push(q);
    return { data: undefined, isFetching: false };
  },
}));

import { ShopSearchScreen } from "../ShopSearchScreen";

it("asks for the typed query once it holds still for 300 ms — not once per keystroke", () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <ShopSearchScreen service="pharmacy" />
      </SafeAreaProvider>,
    );
  });
  const input = tree.root.findByType(TextInput);
  for (const text of ["p", "pa", "par", "para", "parac"]) {
    act(() => input.props.onChangeText(text));
    act(() => jest.advanceTimersByTime(100));
  }
  expect(new Set(mockSearchArgs)).toEqual(new Set([""]));
  act(() => jest.advanceTimersByTime(300));
  expect(mockSearchArgs[mockSearchArgs.length - 1]).toBe("parac");
  expect(new Set(mockSearchArgs)).toEqual(new Set(["", "parac"]));
  act(() => tree.unmount());
});
