/**
 * Biker sign-up v1 (packages/design/handoff/biker-signup-v1, ledger D-135): the five steps one per screen,
 * the step header that counts only required steps, numbers that stay visible, a photo that sends with a bar
 * and moves on by itself, a failed send kept on the phone, Check & send, and the redo after a decline.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
let mockRider: Record<string, unknown>;
let mockIdNumber: string | null = null;
const mockUpdateProfile = jest.fn();
jest.mock("../../../src/api/auth", () => ({
  getMe: async () => ({ profileId: "p1", role: "rider", firstName: "Tendai", lastName: "Moyo", idNumber: mockIdNumber, rider: mockRider }),
  updateProfile: (b: unknown) => mockUpdateProfile(b),
}));
const mockUpdateRider = jest.fn();
jest.mock("../../../src/api/riders", () => ({ updateRiderProfile: (b: unknown) => mockUpdateRider(b) }));
const mockPickDoc = jest.fn();
const mockSaveDoc = jest.fn();
jest.mock("../../../src/logic/manual-kyc", () => ({
  ...jest.requireActual("../../../src/logic/manual-kyc"),
  pickKycDoc: (slot: string, from: string) => mockPickDoc(slot, from),
  saveKycDoc: (slot: string, shot: unknown, onProgress?: (n: number) => void) => mockSaveDoc(slot, shot, onProgress),
}));

const mockRecover = jest.fn(async (_only?: readonly string[]) => null as unknown);
jest.mock("../../../src/logic/pending-photo", () => ({ recoverPendingPhoto: (only?: readonly string[]) => mockRecover(only) }));

import { ApiError } from "../../../src/api/client";
import SignupScreen, { __resetSignupForTest } from "../signup";

const none = { idFront: false, licence: false, selfieId: false };
const all = { idFront: true, licence: true, selfieId: true };
const shot = { uri: "file:///id.jpg", contentType: "image/jpeg" };

const trees: renderer.ReactTestRenderer[] = [];
function render(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <SignupScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  trees.push(tree);
  return tree;
}
const text = (t: renderer.ReactTestRenderer): string => JSON.stringify(t.toJSON());
const has = (t: renderer.ReactTestRenderer, id: string): boolean => t.root.findAll((n) => n.props.testID === id).length > 0;
const tick = async (n = 3): Promise<void> => {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};
const press = async (t: renderer.ReactTestRenderer, id: string): Promise<void> => {
  const node = t.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error(`no pressable ${id}`);
  await act(async () => node.props.onPress());
  await tick();
};
const type = async (t: renderer.ReactTestRenderer, id: string, v: string): Promise<void> => {
  const node = t.root.findAll((n) => n.props.testID === id && typeof n.props.onChangeText === "function")[0]!;
  await act(async () => node.props.onChangeText(v));
};
const label = (t: renderer.ReactTestRenderer): string => (t.root.findAll((n) => n.props.testID === "step-label")[0]?.props.children as string) ?? "";
const bars = (t: renderer.ReactTestRenderer) => ({
  done: t.root.findAll((n) => typeof n.type === "string" && n.props.testID === "step-bar-done").length,
  open: t.root.findAll((n) => typeof n.type === "string" && n.props.testID === "step-bar-open").length,
});
async function loaded(t: renderer.ReactTestRenderer): Promise<void> {
  for (let i = 0; i < 20 && has(t, "signup-loading"); i += 1) await tick(1);
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetSignupForTest();
  mockParams = {};
  mockIdNumber = null;
  mockRider = { kycStatus: "pending", kycMode: "manual", kycDocs: none, licenceNumber: null, kycAttempts: 0 };
});
afterEach(() => {
  trees.splice(0).forEach((t) => act(() => t.unmount()));
});

describe("step 1 · ID number (K1)", () => {
  it("opens on step 1 of 5, formats as typed, refuses a bad number on Next, saves a good one and moves on", async () => {
    mockUpdateProfile.mockImplementation(async (b: { idNumber: string }) => ({ profileId: "p1", firstName: "Tendai", lastName: "Moyo", idNumber: b.idNumber, rider: mockRider }));
    const tree = render();
    await loaded(tree);
    expect(has(tree, "signup-num-idNumber")).toBe(true);
    expect(label(tree)).toBe("1 of 5");
    expect(bars(tree)).toEqual({ done: 1, open: 4 });
    await type(tree, "signup-field-idNumber", "6348291");
    expect(text(tree)).toContain("63-48291");
    await press(tree, "signup-next");
    expect(text(tree)).toContain("Use the format 63-123456A78");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    await type(tree, "signup-field-idNumber", "63482913k07");
    await press(tree, "signup-next");
    expect(mockUpdateProfile).toHaveBeenCalledWith({ firstName: "Tendai", lastName: "Moyo", idNumber: "63-482913K07" });
    expect(has(tree, "signup-guide-idFront")).toBe(true);
    expect(label(tree)).toBe("2 of 5");
  });

  it("an ID on another account: the WhatsApp CTA and 'Change number' (K1-dup)", async () => {
    mockUpdateProfile.mockRejectedValue(new ApiError(409, "taken", "id_in_use"));
    const tree = render();
    await loaded(tree);
    await type(tree, "signup-field-idNumber", "63482913K07");
    await press(tree, "signup-next");
    expect(text(tree)).toContain("This ID is on another account");
    expect(has(tree, "signup-dup-help")).toBe(true);
    await press(tree, "signup-dup-change");
    expect(has(tree, "signup-next")).toBe(true);
  });
});

describe("photo steps (K2–K4)", () => {
  it("guide → camera → 'Can you read it?' → sending with a % → the next step on its own", async () => {
    mockIdNumber = "63482913K07";
    mockPickDoc.mockResolvedValue(shot);
    let finish!: (v: unknown) => void;
    let progress!: (n: number) => void;
    mockSaveDoc.mockImplementation((_s: string, _shot: unknown, onProgress: (n: number) => void) => {
      progress = onProgress;
      return new Promise((r) => (finish = r));
    });
    const tree = render();
    await loaded(tree);
    expect(has(tree, "signup-guide-idFront")).toBe(true);
    for (const k of ["Photo of your", "ID card (front)", "Good light", "All 4 corners", "No glare", "Take photo", "Choose from gallery"]) expect(text(tree)).toContain(k);
    await press(tree, "signup-take");
    expect(mockPickDoc).toHaveBeenCalledWith("idFront", "camera");
    expect(text(tree)).toContain("read it?");
    await press(tree, "signup-use");
    await act(async () => progress(0.62));
    expect(text(tree)).toContain("Sending… 62%");
    await act(async () => finish({ ...none, idFront: true }));
    await tick();
    expect(has(tree, "signup-num-licenceNumber")).toBe(true);
    expect(label(tree)).toBe("3 of 5");
  });

  it("a send that fails keeps the photo and offers Try again, which re-sends it", async () => {
    mockIdNumber = "63482913K07";
    mockPickDoc.mockResolvedValue(shot);
    mockSaveDoc.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ...none, idFront: true });
    const tree = render();
    await loaded(tree);
    await press(tree, "signup-gallery");
    await press(tree, "signup-use");
    await tick();
    expect(text(tree)).toContain("Your photo is saved on this phone");
    await press(tree, "signup-retry");
    await tick();
    expect(mockSaveDoc).toHaveBeenCalledTimes(2);
    expect(mockSaveDoc.mock.calls[1]![1]).toEqual(shot);
  });

  it("camera blocked for good → K-blocked with phone-settings steps and the gallery", async () => {
    mockIdNumber = "63482913K07";
    mockPickDoc.mockResolvedValue("blocked");
    const tree = render();
    await loaded(tree);
    await press(tree, "signup-take");
    expect(has(tree, "signup-blocked")).toBe(true);
    for (const k of ["Camera is", "turned off", "Open phone settings", "Turn on Camera"]) expect(text(tree)).toContain(k);
  });
});

describe("Check & send (K5) and Sent (K6)", () => {
  it("everything in → K5 with both numbers in full; Send for review → K6 'In review'; Done leaves", async () => {
    mockIdNumber = "63482913K07";
    mockRider = { ...mockRider, kycDocs: all, licenceNumber: "482913AB" };
    const tree = render();
    await loaded(tree);
    expect(has(tree, "signup-check")).toBe(true);
    expect(label(tree)).toBe("Check");
    expect(bars(tree)).toEqual({ done: 5, open: 0 });
    for (const k of ["63-482913K07", "482913AB", "Licence photo", "Selfie holding your ID", "Send for review"]) expect(text(tree)).toContain(k);
    await press(tree, "signup-send");
    expect(has(tree, "signup-sent")).toBe(true);
    for (const k of ["We’ll take a look", "In review"]) expect(text(tree)).toContain(k);
    await press(tree, "signup-done");
    expect(mockBack).toHaveBeenCalled();
  });

  it("Edit from K5 returns to K5, the typed number shown with 'Looks right'", async () => {
    mockIdNumber = "63482913K07";
    mockRider = { ...mockRider, kycDocs: all, licenceNumber: "482913AB" };
    const tree = render();
    await loaded(tree);
    await press(tree, "check-edit-licenceNumber");
    expect(has(tree, "signup-num-licenceNumber")).toBe(true);
    expect(text(tree)).toContain("Looks right");
    await press(tree, "signup-next");
    expect(has(tree, "signup-check")).toBe(true);
    expect(mockUpdateRider).not.toHaveBeenCalled();
  });
});

describe("redo after a decline", () => {
  it("licence expired: only the licence number and photo, '1 of 2 to fix', then 'Send again'", async () => {
    mockParams = { redo: "1" };
    mockIdNumber = "63482913K07";
    mockRider = { ...mockRider, kycStatus: "failed", kycDeclineReason: "licence_expired", kycDocs: { ...all, licence: false }, licenceNumber: "482913AB" };
    mockUpdateRider.mockResolvedValue({});
    mockPickDoc.mockResolvedValue(shot);
    mockSaveDoc.mockImplementation(async () => {
      mockRider = { ...mockRider, kycDocs: all };
      return all;
    });
    const tree = render();
    await loaded(tree);
    expect(has(tree, "signup-num-licenceNumber")).toBe(true);
    expect(label(tree)).toBe("1 of 2 to fix");
    expect(bars(tree)).toEqual({ done: 1, open: 1 });
    await type(tree, "signup-field-licenceNumber", "NEW12345");
    await press(tree, "signup-next");
    expect(mockUpdateRider).toHaveBeenCalledWith({ licenceNumber: "NEW12345" });
    expect(label(tree)).toBe("2 of 2 to fix");
    await press(tree, "signup-take");
    await press(tree, "signup-use");
    await tick();
    expect(has(tree, "signup-check")).toBe(true);
    expect(text(tree)).toContain("Send again");
    expect(text(tree)).toContain("New");
  });
});

describe("KB-04 · a photo taken just before Android killed the app", () => {
  it("opens on that photo's 'Can you read it?' preview, and Use photo sends it", async () => {
    mockIdNumber = "63482913K07";
    mockRecover.mockResolvedValueOnce({ target: "licence", shot });
    mockSaveDoc.mockResolvedValue({ ...none, licence: true });
    const tree = render();
    await loaded(tree);
    expect(mockRecover).toHaveBeenCalledWith(["idFront", "licence", "selfieId"]);
    expect(has(tree, "signup-preview-licence")).toBe(true);
    await press(tree, "signup-use");
    await tick();
    expect(mockSaveDoc.mock.calls[0]![0]).toBe("licence");
    expect(mockSaveDoc.mock.calls[0]![1]).toEqual(shot);
  });
});
