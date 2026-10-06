/**
 * First Run v2 PC1–PC7 — the customer location ask (src/logic/location-ask.ts) and its sheet
 * (CustomerLocationSheet), wired the way Home wires them (src/ui/home/LocationAsk.tsx). Ledger D-82.
 */
import renderer, { act } from "react-test-renderer";
import { AppState, Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
type P = Record<string, unknown>;
let mockGet: P;
let mockReq: P;
let mockGps = true;
const mockEnable = jest.fn(async () => {
  mockGps = true;
});
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: async () => mockGet,
  requestForegroundPermissionsAsync: async () => {
    mockGet = mockReq;
    return mockReq;
  },
  hasServicesEnabledAsync: async () => mockGps,
  enableNetworkProviderAsync: () => mockEnable(),
}));
// The PC4 search is the shipped AddressSearch; its own behaviour is tested elsewhere.
jest.mock("../../AddressSearch", () => ({ AddressSearch: () => null }));
const mockToast = jest.fn();
jest.mock("../../Toast", () => ({ useToast: () => ({ show: mockToast }) }));

import { locationStep } from "../../../logic/location-ask";
import { useLocationAskSheet } from "../../home/LocationAsk";
import { grantedToast } from "../CustomerLocationSheet";

const UNDET = { status: "undetermined", granted: false, canAskAgain: true };
const GRANTED = { status: "granted", granted: true, canAskAgain: true };
const COARSE = { ...GRANTED, android: { accuracy: "coarse" } };
const DENIED = { status: "denied", granted: false, canAskAgain: true };
const BLOCKED = { status: "denied", granted: false, canAskAgain: false };
const PLACE = { label: "12 Samora Machel Ave", lat: -17.83, lng: 31.05 };

const mockDetect = jest.fn(async () => PLACE as typeof PLACE | null);
const mockSearch = jest.fn();
let start: () => void = () => undefined;
function Harness(): React.ReactElement {
  const ask = useLocationAskSheet({ useCurrentLocation: mockDetect, setManualPlace: jest.fn() }, mockSearch);
  start = ask.start;
  return ask.sheet;
}

let tree: renderer.ReactTestRenderer | null = null;
let appStateCb: ((s: string) => void) | null = null;
beforeEach(() => {
  jest.clearAllMocks();
  mockGet = UNDET;
  mockReq = GRANTED;
  mockGps = true;
  mockDetect.mockResolvedValue(PLACE);
  jest.spyOn(Linking, "openSettings").mockImplementation(async () => undefined);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_e, cb) => {
    appStateCb = cb as (s: string) => void;
    return { remove: () => undefined } as never;
  });
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
});
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => undefined);
}
async function mountAndStart(): Promise<void> {
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <Harness />
      </SafeAreaProvider>,
    );
  });
  await act(async () => start());
  await settle();
}
const sheetStep = (): string | undefined => {
  const modal = tree!.root.findAll((n) => n.props.transparent === true && "visible" in n.props)[0];
  if (!modal?.props.visible) return undefined;
  return tree!.root.findAll((n) => typeof n.props.testID === "string" && n.props.testID.startsWith("pc-sheet-"))[0]?.props.testID.slice(9);
};
const text = (): string => JSON.stringify(tree!.toJSON());
async function press(id: string): Promise<void> {
  const n = tree!.root.findAll((x) => x.props.testID === id && typeof x.props.onPress === "function")[0]!;
  await act(async () => n.props.onPress());
  await settle();
}

it("locationStep maps the phone's state to the sheet (README §2A)", () => {
  expect(locationStep("undetermined", true)).toBe("explain");
  expect(locationStep("coarse", true)).toBe("approx");
  expect(locationStep("denied", true)).toBe("denied");
  expect(locationStep("blocked", true)).toBe("blocked");
  expect(locationStep("granted", false)).toBe("gps");
  expect(locationStep("granted", true)).toBe("detect");
});

it("PC1 → Use my location → the Android dialog → precise → PC7: header filled + the toast", async () => {
  await mountAndStart();
  expect(sheetStep()).toBe("explain");
  expect(text()).toContain("Deliver to");
  expect(text()).toContain("your door");
  await press("pc1-cta");
  expect(mockDetect).toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith("Delivering to 12 Samora Machel Ave", "success");
  expect(sheetStep()).toBeUndefined();
});

it("approximate → PC3; keeping it on the upgrade dialog uses the approximate fix", async () => {
  mockReq = COARSE;
  await mountAndStart();
  await press("pc1-cta");
  expect(sheetStep()).toBe("approx");
  expect(text()).toContain("precise location");
  await press("pc3-cta");
  expect(mockDetect).toHaveBeenCalled();
});

it("deny once → PC4 (type your address)", async () => {
  mockReq = DENIED;
  await mountAndStart();
  await press("pc1-cta");
  expect(sheetStep()).toBe("denied");
  expect(text()).toContain("Type your address");
});

it("blocked → PC5 steps; Open phone settings, then back with it on → PC7", async () => {
  mockGet = BLOCKED;
  await mountAndStart();
  expect(sheetStep()).toBe("blocked");
  expect(text()).toContain("Allow only while using · Precise on");
  await press("pc5-cta");
  expect(Linking.openSettings).toHaveBeenCalled();
  mockGet = GRANTED;
  await act(async () => appStateCb?.("active"));
  await settle();
  expect(mockDetect).toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalled();
});

it("granted but GPS off → PC6; Turn on location → Google's dialog → PC7", async () => {
  mockGet = GRANTED;
  mockGps = false;
  await mountAndStart();
  expect(sheetStep()).toBe("gps");
  await press("pc6-cta");
  expect(mockEnable).toHaveBeenCalled();
  expect(mockDetect).toHaveBeenCalled();
});

it("already granted: no sheet at all, straight to the fix and PC7", async () => {
  mockGet = GRANTED;
  await mountAndStart();
  expect(sheetStep()).toBeUndefined();
  expect(mockToast).toHaveBeenCalled();
});

it("Type an address closes the sheet and opens the H5 search", async () => {
  await mountAndStart();
  await press("pc-alt");
  expect(mockSearch).toHaveBeenCalled();
});

it("granted but no fix → the search instead of waiting on nothing", async () => {
  mockGet = GRANTED;
  mockDetect.mockResolvedValue(null);
  await mountAndStart();
  expect(mockSearch).toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
});

it("PC7's toast swaps the handoff's sample address for the resolved one", () => {
  expect(grantedToast("5 Fife Ave")).toBe("Delivering to 5 Fife Ave");
});
