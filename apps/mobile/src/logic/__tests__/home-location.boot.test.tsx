/**
 * `useHomeLocation` under the cold-start splash (S-6, ledger D-64). Home mounts UNDER the splash, so the
 * hook's first-run permission request used to pop the OS location dialog over the brand intro. The ask
 * now waits for the boot to end; a permission that is already granted (no dialog) never waits.
 */
import * as Location from "expo-location";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { BootPhaseProvider, useBootPhase } from "../../boot/boot-phase";
import { resetBootReadinessForTest } from "../../boot/boot-readiness";
import { useHomeLocation } from "../home-location";

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

let endBoot: () => void = () => {};
function Harness(): null {
  endBoot = useBootPhase().endBoot;
  useHomeLocation();
  return null;
}

let tree: ReactTestRenderer | null = null;
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetBootReadinessForTest();
  requestPerm.mockResolvedValue({ status: "denied", granted: false });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

describe("useHomeLocation · the permission ask waits for the splash", () => {
  it("does not ask while booting, and asks the moment the boot ends", async () => {
    getPerm.mockResolvedValue({ status: "undetermined", granted: false, canAskAgain: true });
    await act(async () => {
      tree = create(
        <BootPhaseProvider>
          <Harness />
        </BootPhaseProvider>,
      );
    });
    await settle();
    expect(getPerm).toHaveBeenCalled(); // reading the permission shows nothing — that goes ahead
    expect(requestPerm).not.toHaveBeenCalled();

    await act(async () => endBoot());
    await settle();
    expect(requestPerm).toHaveBeenCalledTimes(1);
  });

  it("a granted permission goes ahead during the boot (no dialog to hold back)", async () => {
    getPerm.mockResolvedValue({ status: "granted", granted: true, canAskAgain: true });
    await act(async () => {
      tree = create(
        <BootPhaseProvider>
          <Harness />
        </BootPhaseProvider>,
      );
    });
    await settle();
    expect(requestPerm).not.toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).toHaveBeenCalled();
  });

  it("outside the boot it asks straight away, as before", async () => {
    getPerm.mockResolvedValue({ status: "undetermined", granted: false, canAskAgain: true });
    await act(async () => {
      tree = create(<Harness />);
    });
    await settle();
    expect(requestPerm).toHaveBeenCalledTimes(1);
  });
});
