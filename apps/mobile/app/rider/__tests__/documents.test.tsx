/**
 * Rider v2 S5 (Bike & documents), ledger D-54; D-79 (owner 2026-10-06) adds the photo and the plate.
 * S6 (Help & support) is gone: the row opens WhatsApp (D-60).
 */
import renderer, { act } from "react-test-renderer";
import { Linking } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
jest.mock("../../../src/config", () => ({ supportWhatsAppUrl: () => "https://wa.me/263770000000" }));
let mockRider: Record<string, unknown>;
jest.mock("../../../src/api/auth", () => ({
  getMe: async () => ({ profileId: "p1", role: "rider", firstName: "Tendai", rider: mockRider }),
}));
const mockUpdateRider = jest.fn();
jest.mock("../../../src/api/riders", () => ({ updateRiderProfile: (b: unknown) => mockUpdateRider(b) }));
const mockPick = jest.fn();
const mockSavePhoto = jest.fn();
jest.mock("../../../src/logic/rider-documents", () => ({
  ...jest.requireActual("../../../src/logic/rider-documents"),
  pickRiderPhoto: (from: string) => mockPick(from),
  saveRiderPhoto: (shot: unknown) => mockSavePhoto(shot),
}));

import DocumentsScreen from "../documents";

const trees: renderer.ReactTestRenderer[] = [];
function render(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}><DocumentsScreen /></QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  trees.push(tree);
  return tree;
}
const text = (t: renderer.ReactTestRenderer): string =>
  t.root
    .findAll((n) => typeof n.type === "string")
    .map((n) => (typeof n.props.children === "string" ? n.props.children : ""))
    .join("|");
/** A row's accessible label: "label, sub, value" (RRow). */
const rowLabel = (t: renderer.ReactTestRenderer, startsWith: string): string | undefined =>
  t.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith(startsWith) && typeof n.props.onPress === "function")[0]?.props.accessibilityLabel;
const pressRow = async (t: renderer.ReactTestRenderer, startsWith: string): Promise<void> => {
  const row = t.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith(startsWith) && typeof n.props.onPress === "function")[0]!;
  await act(async () => row.props.onPress());
};
const press = async (t: renderer.ReactTestRenderer, label: string): Promise<void> => {
  const btn = t.root.findAll((n) => n.props.label === label && typeof n.props.onPress === "function")[0]!;
  await act(async () => {
    btn.props.onPress();
    await new Promise((r) => setTimeout(r, 0));
  });
};

/** Ticks until `getMe` has resolved and the rows are drawn (a cold first render can take a few). */
async function loaded(tree: renderer.ReactTestRenderer): Promise<void> {
  for (let i = 0; i < 20 && !text(tree).includes("National ID"); i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

let openURL: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockRider = { kycStatus: "verified", bikeReg: "ABH 4721", hasPhoto: true };
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});
afterEach(() => {
  openURL.mockRestore();
  while (trees.length) {
    const t = trees.pop()!;
    act(() => t.unmount());
  }
});

describe("S5 Bike & documents", () => {
  it("lists ID, photo and bike; the plate is 'Verified' for a verified rider who has one", async () => {
    const tree = render();
    await loaded(tree);
    const t = text(tree);
    for (const s of ["Bike & documents", "National ID", "Rider photo", "Bike", "ABH 4721", "Verified", "Changed bikes? Re-verify with the new plate."]) expect(t).toContain(s);
    expect(rowLabel(tree, "Bike")).toBe("Bike, ABH 4721, Verified");
    // The photo is the rider's own upload: never "Verified", always changeable.
    expect(rowLabel(tree, "Rider photo")).toBe("Rider photo, Change");
  });

  it("no 'Verified' on the Bike row without a plate (review R-8) — an 'Add plate' action instead", async () => {
    mockRider = { kycStatus: "verified", bikeReg: null, hasPhoto: true };
    const tree = render();
    await loaded(tree);
    expect(rowLabel(tree, "Bike")).toBe("Bike, Add plate");
  });

  it("a rider with no photo sees 'Not added yet' and 'Add photo' (D-62 / D-79)", async () => {
    mockRider = { kycStatus: "verified", bikeReg: "ABH 4721", hasPhoto: false };
    const tree = render();
    await loaded(tree);
    expect(text(tree)).toContain("Not added yet");
    expect(rowLabel(tree, "Rider photo")).toBe("Rider photo, Not added yet, Add photo");
  });

  it("adds a plate from the sheet, normalised", async () => {
    mockRider = { kycStatus: "verified", bikeReg: null, hasPhoto: true };
    mockUpdateRider.mockResolvedValue({ hasPhoto: true, bikeReg: "AEE 4471" });
    const tree = render();
    await loaded(tree);
    await pressRow(tree, "Bike");
    expect(text(tree)).toContain("Your bike's number plate");
    const field = tree.root.findAll((n) => n.props.accessibilityLabel === "Number plate" && typeof n.props.onChangeText === "function")[0]!;
    await act(async () => field.props.onChangeText(" aee  4471"));
    await press(tree, "Save");
    expect(mockUpdateRider).toHaveBeenCalledWith({ bikeReg: "AEE 4471" });
  });

  it("a too-short plate can't be saved", async () => {
    const tree = render();
    await loaded(tree);
    await pressRow(tree, "Bike");
    const field = tree.root.findAll((n) => n.props.accessibilityLabel === "Number plate" && typeof n.props.onChangeText === "function")[0]!;
    await act(async () => field.props.onChangeText("ab"));
    const save = tree.root.findAll((n) => n.props.label === "Save" && typeof n.props.onPress === "function")[0]!;
    expect(save.props.disabled).toBe(true);
  });

  it("adds a photo from the gallery and saves it", async () => {
    mockRider = { kycStatus: "verified", bikeReg: "ABH 4721", hasPhoto: false };
    const shot = { uri: "file:///p.jpg", contentType: "image/jpeg" };
    mockPick.mockResolvedValue(shot);
    mockSavePhoto.mockResolvedValue({ hasPhoto: true, bikeReg: "ABH 4721" });
    const tree = render();
    await loaded(tree);
    await pressRow(tree, "Rider photo");
    await press(tree, "Choose from gallery");
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    expect(mockPick).toHaveBeenCalledWith("gallery");
    expect(mockSavePhoto).toHaveBeenCalledWith(shot);
  });

  it("Re-verify my bike asks support on WhatsApp, with the plate written out", async () => {
    const tree = render();
    await loaded(tree);
    const btn = tree.root.findAll((n) => n.props.label === "Re-verify my bike" && typeof n.props.onPress === "function")[0]!;
    act(() => btn.props.onPress());
    expect(openURL).toHaveBeenCalledWith(expect.stringContaining("https://wa.me/263770000000?text="));
    expect(decodeURIComponent(openURL.mock.calls[0]![0] as string)).toContain("ABH 4721");
  });

  it("has no licence row (licences aren't collected)", async () => {
    const tree = render();
    await loaded(tree);
    expect(text(tree)).not.toMatch(/licen[cs]e/i);
  });
});
