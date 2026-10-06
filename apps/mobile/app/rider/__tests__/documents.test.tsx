/**
 * Bike & documents — First Run v2 E1–E6 (`packages/design/handoff/first-run-v2` README §2 E, ledger D-82;
 * replaces Rider v2 S5, D-54 / D-79). Pins: the "N of 3" progress and the three rows with "+ Add"; no
 * Re-verify button and no licence; E2a camera/gallery → E2b guide → E2c preview → E2d upload → E5/E6; the
 * E4 plate sheet's format and its instant "Checking"; "Verified" only for what was actually checked.
 */
import renderer, { act } from "react-test-renderer";
import { BackHandler } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { tokens } from "@lynia/shared/tokens";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
let mockRider: Record<string, unknown>;
jest.mock("../../../src/api/auth", () => ({
  getMe: async () => ({ profileId: "p1", role: "rider", firstName: "Tendai", lastName: "Moyo", rider: mockRider }),
}));
const mockUpdateRider = jest.fn();
jest.mock("../../../src/api/riders", () => ({ updateRiderProfile: (b: unknown) => mockUpdateRider(b) }));
const mockPick = jest.fn();
const mockSavePhoto = jest.fn();
const mockDraft = { value: null as unknown };
jest.mock("../../../src/logic/rider-documents", () => ({
  ...jest.requireActual("../../../src/logic/rider-documents"),
  pickRiderPhoto: (from: string) => mockPick(from),
  saveRiderPhoto: (shot: unknown, onProgress?: (n: number) => void) => mockSavePhoto(shot, onProgress),
  loadRiderPhotoDraft: async () => mockDraft.value,
  saveRiderPhotoDraft: async (shot: unknown) => {
    mockDraft.value = shot;
  },
  clearRiderPhotoDraft: async () => {
    mockDraft.value = null;
  },
}));

import DocumentsScreen, { ADD_PILL_HEIGHT } from "../documents";

const trees: renderer.ReactTestRenderer[] = [];
function render(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <DocumentsScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  trees.push(tree);
  return tree;
}
const text = (t: renderer.ReactTestRenderer): string => JSON.stringify(t.toJSON());
const byId = (t: renderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === "function")[0];
const has = (t: renderer.ReactTestRenderer, id: string): boolean => t.root.findAll((n) => n.props.testID === id).length > 0;
const tick = async (n = 3): Promise<void> => {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};
const press = async (t: renderer.ReactTestRenderer, id: string): Promise<void> => {
  await act(async () => byId(t, id)!.props.onPress());
  await tick();
};
async function loaded(tree: renderer.ReactTestRenderer): Promise<void> {
  for (let i = 0; i < 20 && !text(tree).includes("National ID"); i += 1) await tick(1);
}
const bars = (t: renderer.ReactTestRenderer) => ({
  done: t.root.findAll((n) => typeof n.type === "string" && n.props.testID === "bar-done").length,
  open: t.root.findAll((n) => typeof n.type === "string" && n.props.testID === "bar-open").length,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDraft.value = null;
  mockRider = { kycStatus: "verified", bikeReg: null, hasPhoto: false, plateStatus: "none" };
});
afterEach(() => {
  while (trees.length) {
    const t = trees.pop()!;
    act(() => t.unmount());
  }
});

describe("E1 · new rider", () => {
  it("draws the title, '1 of 3', the three rows with '+ Add' and the footnote — no Re-verify, no licence", async () => {
    const tree = render();
    await loaded(tree);
    const s = text(tree);
    for (const k of ["Bike & documents", "1", "of 3", "National ID", "Verified", "Rider photo", "Customers see it on their job", "Bike plate", "e.g. ABC 1234", "Optional. You can take jobs now."]) expect(s).toContain(k);
    expect(bars(tree)).toEqual({ done: 1, open: 2 });
    expect(has(tree, "add-photo")).toBe(true);
    expect(has(tree, "add-plate")).toBe(true);
    expect(s).not.toMatch(/Re-verify/);
    expect(s).not.toMatch(/licen[cs]e/i);
  });

  it("the '+ Add' pill is the tap-target token tall (the kit was fixed to 44, D-82 §4)", async () => {
    expect(ADD_PILL_HEIGHT).toBe(tokens.touchTargetMin);
    const tree = render();
    await loaded(tree);
    const pill = tree.root.findAll((n) => n.props.testID === "add-photo" && typeof n.props.style === "function")[0]!;
    expect(pill.props.style({ pressed: false }).minHeight).toBe(44);
  });

  it("an unverified rider's ID row says nothing — 'Verified' only for what was checked", async () => {
    mockRider = { kycStatus: "pending", bikeReg: null, hasPhoto: false };
    const tree = render();
    await loaded(tree);
    expect(text(tree)).not.toContain('"Verified"');
    expect(bars(tree)).toEqual({ done: 0, open: 3 });
  });
});

describe("E2 · photo", () => {
  const shot = { uri: "file:///p.jpg", contentType: "image/jpeg" };

  it("E2a → E2b: 'Take a photo' opens the dark capture guide; its shutter opens the camera; E2c previews it", async () => {
    mockPick.mockResolvedValue(shot);
    const tree = render();
    await loaded(tree);
    await press(tree, "add-photo");
    expect(text(tree)).toContain("Add a photo");
    await press(tree, "photo-camera");
    expect(has(tree, "capture-guide")).toBe(true);
    const s = text(tree);
    for (const k of ["Face the", "camera", "Good light", "No helmet or cap", "Plain background"]) expect(s).toContain(k);
    await press(tree, "guide-shutter");
    expect(mockPick).toHaveBeenCalledWith("camera");
    expect(has(tree, "documents-preview")).toBe(true);
    expect(text(tree)).toContain("Use photo");
    expect(text(tree)).toContain("Retake");
  });

  it("E2d: 'Use photo' uploads with a progress bar and 'Uploading…', then counts the photo", async () => {
    mockPick.mockResolvedValue(shot);
    let finish!: (v: unknown) => void;
    let progress!: (n: number) => void;
    mockSavePhoto.mockImplementation((_s: unknown, onProgress: (n: number) => void) => {
      progress = onProgress;
      return new Promise((r) => (finish = r));
    });
    const tree = render();
    await loaded(tree);
    await press(tree, "add-photo");
    await press(tree, "photo-gallery");
    expect(mockPick).toHaveBeenCalledWith("gallery");
    await press(tree, "photo-use");
    expect(mockSavePhoto).toHaveBeenCalledWith(shot, expect.any(Function));
    expect(mockDraft.value).toEqual(shot); // kept on the phone before the upload runs (E6)
    await act(async () => progress(0.6));
    expect(text(tree)).toContain("Uploading…");
    await act(async () => finish({ hasPhoto: true, bikeReg: null, plateStatus: "none" }));
    await tick();
    expect(text(tree)).not.toContain("Uploading…");
    expect(mockDraft.value).toBeNull();
  });

  it("E6: an upload that fails keeps the photo and offers 'Try again', which re-sends the same shot", async () => {
    mockPick.mockResolvedValue(shot);
    mockSavePhoto.mockRejectedValueOnce(new Error("Network request failed")).mockResolvedValueOnce({ hasPhoto: true, bikeReg: null });
    const tree = render();
    await loaded(tree);
    await press(tree, "add-photo");
    await press(tree, "photo-gallery");
    await press(tree, "photo-use");
    expect(has(tree, "documents-failed")).toBe(true);
    const s = text(tree);
    for (const k of ["Upload", "didn’t finish", "Your photo is saved on this phone. Try again when you’re online.", "Try again"]) expect(s).toContain(k);
    expect(mockDraft.value).toEqual(shot);
    await press(tree, "photo-retry");
    expect(mockSavePhoto).toHaveBeenLastCalledWith(shot, expect.any(Function));
    expect(mockDraft.value).toBeNull();
  });

  it("E6 survives a relaunch: a photo left on the phone opens on 'Try again'; Back returns to the list", async () => {
    mockDraft.value = shot;
    const tree = render();
    await loaded(tree);
    await tick();
    expect(has(tree, "documents-failed")).toBe(true);
    await act(async () => {
      (BackHandler as unknown as { mockPressBack?: () => void }).mockPressBack?.();
    });
  });
});

describe("E4 · plate", () => {
  it("refuses a plate that isn't ABC 1234", async () => {
    const tree = render();
    await loaded(tree);
    await press(tree, "add-plate");
    const field = tree.root.findAll((n) => n.props.testID === "plate-field" && typeof n.props.onChangeText === "function")[0]!;
    await act(async () => field.props.onChangeText("ab 44"));
    await press(tree, "plate-save");
    expect(text(tree)).toContain("Plates look like ABC 1234");
    expect(mockUpdateRider).not.toHaveBeenCalled();
  });

  it("saves instantly: the row shows the plate with a 'Checking' pill before the server answers, '2 of 3'", async () => {
    let answer!: (v: unknown) => void;
    mockUpdateRider.mockImplementation(() => new Promise((r) => (answer = r)));
    const tree = render();
    await loaded(tree);
    await press(tree, "add-plate");
    const field = tree.root.findAll((n) => n.props.testID === "plate-field" && typeof n.props.onChangeText === "function")[0]!;
    await act(async () => field.props.onChangeText(" abz 4417"));
    await press(tree, "plate-save");
    expect(mockUpdateRider).toHaveBeenCalledWith({ bikeReg: "ABZ 4417" });
    const s = text(tree);
    for (const k of ["ABZ 4417", "Checking", "Checking your new plate. Keep riding meanwhile."]) expect(s).toContain(k);
    expect(bars(tree)).toEqual({ done: 2, open: 1 });
    await act(async () => answer({ hasPhoto: false, bikeReg: "ABZ 4417", plateStatus: "checking" }));
  });

  it("a failed save puts the row back", async () => {
    mockUpdateRider.mockRejectedValue(new Error("offline"));
    const tree = render();
    await loaded(tree);
    await press(tree, "add-plate");
    const field = tree.root.findAll((n) => n.props.testID === "plate-field" && typeof n.props.onChangeText === "function")[0]!;
    await act(async () => field.props.onChangeText("ABZ4417"));
    await press(tree, "plate-save");
    await tick();
    expect(has(tree, "add-plate")).toBe(true);
  });
});

describe("E5 · all set", () => {
  it("everything on file → the hero, 'You're all set', Change / Edit; the photo is never 'Verified'", async () => {
    mockRider = { kycStatus: "verified", bikeReg: "ABZ 4417", hasPhoto: true, plateStatus: "verified" };
    const tree = render();
    await loaded(tree);
    expect(has(tree, "documents-all-set")).toBe(true);
    const s = text(tree);
    for (const k of ["You’re", "all set", "TM", "Change", "ABZ 4417", "Edit"]) expect(s).toContain(k);
    // ID "Verified" + the ops-confirmed plate's "Verified" — two, not three.
    expect(s.match(/"Verified"/g)?.length).toBe(2);
    expect(s).not.toContain("Optional. You can take jobs now.");
  });

  it("a plate still being checked keeps its 'Checking' pill and says nothing about verified", async () => {
    mockRider = { kycStatus: "verified", bikeReg: "ABZ 4417", hasPhoto: true, plateStatus: "checking" };
    const tree = render();
    await loaded(tree);
    const s = text(tree);
    expect(s).toContain("Checking");
    expect(s.match(/"Verified"/g)?.length).toBe(1);
  });
});
