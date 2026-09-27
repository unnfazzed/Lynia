/**
 * D-41: the iPhone app ships customer-only. This pins the switch itself (against the REAL platform
 * check — jest.setup.js mocks it on for the rest of the suite) and the route gate that backs up every
 * hidden entry point.
 */
import { Platform } from "react-native";
import renderer, { act } from "react-test-renderer";

const mockReplace = jest.fn();
let mockSegments: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => mockSegments,
}));

import { riderModeAvailable } from "../rider-mode";
import { RiderRouteGate, isRiderRouteSegment } from "../rider-route-gate";

const actual = jest.requireActual<typeof import("../rider-mode")>("../rider-mode");

function withOS(os: typeof Platform.OS, check: () => void): void {
  const original = Platform.OS;
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  try {
    check();
  } finally {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  }
}

describe("riderModeAvailable (the real platform switch)", () => {
  it("is off on iOS and on everywhere else", () => {
    withOS("ios", () => expect(actual.riderModeAvailable()).toBe(false));
    withOS("android", () => expect(actual.riderModeAvailable()).toBe(true));
    // The parity lane renders screens through react-native-web; it must keep seeing rider mode.
    withOS("web", () => expect(actual.riderModeAvailable()).toBe(true));
  });
});

describe("isRiderOnlyRoute", () => {
  it("matches the rider app and the commission wallet, and nothing that merely starts with the letters", () => {
    for (const path of ["/rider", "/rider/job", "/rider/food-offer", "/rider?tab=money", "/wallet/top-up"]) {
      expect(actual.isRiderOnlyRoute(path)).toBe(true);
    }
    for (const path of ["/home", "/order/o1", "/food/order/o1", "/riders-near-you", "/wallets", "/"]) {
      expect(actual.isRiderOnlyRoute(path)).toBe(false);
    }
  });
});

describe("RiderRouteGate", () => {
  function mountAt(segments: string[]): void {
    mockSegments = segments;
    act(() => {
      renderer.create(<RiderRouteGate />);
    });
  }

  beforeEach(() => mockReplace.mockClear());

  it("sends a rider route home on the customer-only iPhone app", () => {
    jest.mocked(riderModeAvailable).mockReturnValue(false);
    mountAt(["rider", "(tabs)"]);
    expect(mockReplace).toHaveBeenCalledWith("/home");
    mockReplace.mockClear();
    mountAt(["wallet", "top-up"]);
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("leaves customer routes alone on iOS", () => {
    jest.mocked(riderModeAvailable).mockReturnValue(false);
    mountAt(["(tabs)", "home"]);
    mountAt(["order", "[id]"]);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("is inert wherever rider mode exists", () => {
    mountAt(["rider", "(tabs)"]);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("recognises only the rider and wallet route segments", () => {
    expect(isRiderRouteSegment("rider")).toBe(true);
    expect(isRiderRouteSegment("wallet")).toBe(true);
    expect(isRiderRouteSegment("(tabs)")).toBe(false);
    expect(isRiderRouteSegment(undefined)).toBe(false);
  });
});
