/**
 * U57: the bell's unread dot used to be read once after boot and never again. It re-reads every 30 s while
 * the screen showing it is in view, and stops when that screen loses focus (tabs stay mounted).
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockGetCount = jest.fn(async () => ({ count: 0 }));
let mockBlur: (() => void) | undefined;
jest.mock("../../api/notifications", () => ({ getNotificationsUnreadCount: () => mockGetCount() }));
jest.mock("../../boot/boot-phase", () => ({ useBootPhase: () => ({ booting: false }) }));
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(() => {
      const off = cb();
      mockBlur = typeof off === "function" ? off : undefined;
    }, []);
  },
}));

import { NOTIFICATIONS_UNREAD_POLL_MS, useNotificationsUnreadCount } from "../use-notifications-unread";

function Probe(): null {
  useNotificationsUnreadCount();
  return null;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("re-reads the count every 30 s while in view, and stops once the screen is hidden", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  expect(mockGetCount).toHaveBeenCalledTimes(1);
  await act(async () => {
    jest.advanceTimersByTime(NOTIFICATIONS_UNREAD_POLL_MS + 10);
  });
  expect(mockGetCount).toHaveBeenCalledTimes(2);
  // The tab is hidden behind another screen: no more reads.
  await act(async () => mockBlur?.());
  await act(async () => {
    jest.advanceTimersByTime(3 * NOTIFICATIONS_UNREAD_POLL_MS);
  });
  expect(mockGetCount).toHaveBeenCalledTimes(2);
  act(() => tree.unmount());
  qc.clear();
});
