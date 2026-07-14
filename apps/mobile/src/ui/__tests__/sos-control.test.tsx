/**
 * SosControl location capture. The rider job screen has always passed its own tracked point
 * (`riderPoint`), so a rider's SOS carries a location. The customer order screen — and a rider
 * viewing their own trip through the SAME screen — never passed one, so every SOS raised from there
 * went out with no location at all: ops had nothing to go on for the sender's half of SOS events.
 * The fix: when the caller doesn't supply a live point, fall back to a best-effort OS last-known fix
 * (permission-check only, never prompts, never delays the alert).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Location from "expo-location";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { raiseSos } from "../../api/safety";
import { SosControl } from "../safety";

jest.mock("../../api/safety", () => ({
  raiseSos: jest.fn(),
}));

jest.mock("expo-location", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));

const raiseSosMock = raiseSos as jest.Mock;
const getPermMock = Location.getForegroundPermissionsAsync as jest.Mock;
const getLastKnownMock = Location.getLastKnownPositionAsync as jest.Mock;

let currentTree: renderer.ReactTestRenderer | null = null;

function renderSos(props: { orderId: string; lat?: number | null; lng?: number | null }): renderer.ReactTestRenderer {
  const qc = new QueryClient();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={qc}>
        <SosControl {...props} />
      </QueryClientProvider>,
    );
  });
  currentTree = tree;
  return tree;
}

function tapSos(tree: renderer.ReactTestRenderer): void {
  const trigger = tree.root.findAll((n) => n.props.accessibilityLabel === "Emergency SOS")[0]!;
  act(() => trigger.props.onPress());
}

/** Observer notifications are scheduled through setTimeout(0) (notifyManager) — flush them, same as
 * live-tracking-isolation.test.tsx. Also drains the microtask chain the location lookup runs on. */
const flush = (): Promise<void> => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
  raiseSosMock.mockReset().mockResolvedValue({ emergencyNumber: "999", safetyLine: "+263000" });
  getPermMock.mockReset();
  getLastKnownMock.mockReset();
});

afterEach(() => {
  currentTree?.unmount();
  currentTree = null;
});

describe("SosControl location capture", () => {
  it("uses the caller-supplied live point as-is (rider job screen) without touching device location", async () => {
    const tree = renderSos({ orderId: "o1", lat: -17.8, lng: 31.05 });
    tapSos(tree);
    await flush();
    expect(raiseSosMock).toHaveBeenCalledWith("o1", { lat: -17.8, lng: 31.05 });
    expect(getPermMock).not.toHaveBeenCalled();
  });

  it("falls back to the OS last-known fix when no live point is supplied and permission is granted", async () => {
    getPermMock.mockResolvedValue({ status: "granted" });
    getLastKnownMock.mockResolvedValue({ coords: { latitude: -17.82, longitude: 31.06 } });
    const tree = renderSos({ orderId: "o2" });
    tapSos(tree);
    await flush();
    expect(getPermMock).toHaveBeenCalled();
    expect(getLastKnownMock).toHaveBeenCalled();
    expect(raiseSosMock).toHaveBeenCalledWith("o2", { lat: -17.82, lng: 31.06 });
  });

  it("never requests permission — only checks — and raises with no location when denied", async () => {
    getPermMock.mockResolvedValue({ status: "denied" });
    const tree = renderSos({ orderId: "o3" });
    tapSos(tree);
    await flush();
    expect(getLastKnownMock).not.toHaveBeenCalled();
    expect(raiseSosMock).toHaveBeenCalledWith("o3", { lat: undefined, lng: undefined });
  });

  it("still raises the SOS even if the location lookup throws — the alert is never gated on it", async () => {
    getPermMock.mockRejectedValue(new Error("native module unavailable"));
    const tree = renderSos({ orderId: "o4" });
    tapSos(tree);
    await flush();
    expect(raiseSosMock).toHaveBeenCalledWith("o4", { lat: undefined, lng: undefined });
  });

  it("still raises with no location when there is no cached fix (getLastKnownPositionAsync → null)", async () => {
    getPermMock.mockResolvedValue({ status: "granted" });
    getLastKnownMock.mockResolvedValue(null);
    const tree = renderSos({ orderId: "o5" });
    tapSos(tree);
    await flush();
    expect(raiseSosMock).toHaveBeenCalledWith("o5", { lat: undefined, lng: undefined });
  });
});
