/**
 * `useHomeLocation` never asks (First Run v2, ledger D-80, BRIEF 1–2). Home mounts under the cold-start
 * splash, and S-6 once moved the OS location dialog to "after the boot"; since D-80 it doesn't open at
 * mount at all — only PC1's own button opens it (src/logic/location-ask.ts). A granted (or approximate)
 * permission still fixes a position straight away, splash or not.
 */
import * as Location from "expo-location";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { BootPhaseProvider } from "../../boot/boot-phase";
import { resetBootReadinessForTest } from "../../boot/boot-readiness";
import { type HomeLocationApi, useHomeLocation } from "../home-location";

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => {
    throw new Error("no fix");
  }),
  reverseGeocodeAsync: jest.fn(async () => []),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

const getPerm = Location.getForegroundPermissionsAsync as jest.Mock;
const requestPerm = Location.requestForegroundPermissionsAsync as jest.Mock;

let api: HomeLocationApi | null = null;
function Harness(): null {
  api = useHomeLocation();
  return null;
}

let tree: ReactTestRenderer | null = null;
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => undefined);
}
async function mount(underSplash: boolean): Promise<void> {
  await act(async () => {
    tree = create(underSplash ? <BootPhaseProvider><Harness /></BootPhaseProvider> : <Harness />);
  });
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  resetBootReadinessForTest();
  requestPerm.mockResolvedValue({ status: "denied", granted: false });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
  api = null;
});

describe("useHomeLocation · reads the permission, never asks", () => {
  it.each([true, false])("an undetermined permission is never requested at mount (under the splash: %s)", async (underSplash) => {
    getPerm.mockResolvedValue({ status: "undetermined", granted: false, canAskAgain: true });
    await mount(underSplash);
    expect(getPerm).toHaveBeenCalled();
    expect(requestPerm).not.toHaveBeenCalled();
    expect(api?.source).toBe("none"); // the row stays on its prompt, so H6 offers PC1
    expect(api?.denied).toBe(false);
  });

  it("a granted permission fixes a position, even during the boot", async () => {
    getPerm.mockResolvedValue({ status: "granted", granted: true, canAskAgain: true });
    await mount(true);
    expect(requestPerm).not.toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).toHaveBeenCalled();
  });

  it("approximate counts as usable (PC3 asks to upgrade it, from its own button)", async () => {
    getPerm.mockResolvedValue({ status: "granted", granted: true, canAskAgain: true, android: { accuracy: "coarse" } });
    await mount(false);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalled();
  });

  it("only a permission the OS won't ask again reads as denied", async () => {
    getPerm.mockResolvedValue({ status: "denied", granted: false, canAskAgain: false });
    await mount(false);
    expect(api?.denied).toBe(true);
    expect(requestPerm).not.toHaveBeenCalled();
  });

  it("'Use my current location' never asks either — the ask is PC1's", async () => {
    getPerm.mockResolvedValue({ status: "undetermined", granted: false, canAskAgain: true });
    await mount(false);
    let out: unknown = "unset";
    await act(async () => {
      out = await api!.useCurrentLocation();
    });
    expect(out).toBeNull();
    expect(requestPerm).not.toHaveBeenCalled();
  });
});
