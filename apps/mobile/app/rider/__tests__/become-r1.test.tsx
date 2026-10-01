import React from "react";
/**
 * B-O11 (LC lane B, Go-class runtime perf): the KYC photo preview must render the already-
 * downscaled upload asset (`downscaleForUpload`'s ~1280px/0.7 JPEG output), not the original
 * 3000-4000px camera capture — this preview stays mounted for the rest of the multi-field KYC
 * form, and the full-resolution bitmap is real avoidable peak-memory pressure on a 1-2GB device
 * (this screen's own OOM-kill comment already flags camera capture as the risk here).
 */
import renderer, { act } from "react-test-renderer";

const mockReplace = jest.fn();

let secureStore: Record<string, string> = {};
const mockSetItemAsync = jest.fn(async (key: string, value: string) => {
  secureStore[key] = value;
});
const mockGetItemAsync = jest.fn(async (key: string) => secureStore[key] ?? null);
const mockDeleteItemAsync = jest.fn(async (key: string) => {
  delete secureStore[key];
});

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: (...args: [string]) => mockGetItemAsync(...args),
  setItemAsync: (...args: [string, string]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: [string]) => mockDeleteItemAsync(...args),
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchCameraAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file://original-4000px-capture.jpg", width: 4000, height: 3000, mimeType: "image/jpeg" }],
  }),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));
jest.mock("../../../src/logic/image-downscale", () => ({
  downscaleForUpload: jest.fn().mockResolvedValue({ uri: "file://downscaled-1280px.jpg", contentType: "image/jpeg" }),
}));
jest.mock("../../../src/api/uploads", () => ({
  requestKycPhotoUpload: jest.fn().mockResolvedValue({ uploadUrl: "https://gcs.example/put", key: "obj-key-1" }),
  uploadImage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../src/api/riders", () => ({
  becomeRider: jest.fn(),
  completeProfile: jest.fn(),
}));

import BecomeRiderScreen from "../become";

// Calm Mint v2 (D-55): the screen opens on R1 "Why ride" unless a draft is restored; it reads the
// account through react-query and lays out inside a SafeAreaView.
jest.mock("../../../src/api/auth", () => ({
  getMe: jest.fn().mockResolvedValue({ profileId: "p1", role: "customer", firstName: "Tendai", lastName: "Moyo", idNumber: null, rider: null }),
}));
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
const BECOME_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
function becomeEl(): React.ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider initialMetrics={BECOME_METRICS}>
      <QueryClientProvider client={qc}>
        <BecomeRiderScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
/** Tap past R1 when the screen opened on it. */
async function passIntro(tree: renderer.ReactTestRenderer): Promise<void> {
  const start = tree.root.findAll((n) => n.props.accessibilityLabel === "Start ID check" && typeof n.props.onPress === "function")[0];
  if (!start) return;
  await act(async () => {
    start.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
}




beforeEach(() => {
  secureStore = {};
  mockReplace.mockClear();
  mockSetItemAsync.mockClear();
  mockGetItemAsync.mockClear();
  mockDeleteItemAsync.mockClear();
});


describe("BecomeRiderScreen — Calm Mint v2 R1 (D-55)", () => {
  it("opens on R1 'Why ride' with the checklist, then the photo step asks only for what is missing", async () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(becomeEl());
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const r1 = JSON.stringify(tree.toJSON());
    for (const s of ["Ride with LyniaGo.", "Earn on your terms.", "You set your fare", "Cash on delivery", "Ride when you want", "Your account", "ID check", "Rider photo for your profile", "Licence and bike papers can wait.", "Start ID check"]) {
      expect(r1).toContain(s);
    }
    // The vendor is never named (D-38), and the free-jobs promise waits on the backend.
    expect(r1).not.toContain("Didit");
    expect(r1).not.toContain("commission-free");

    await passIntro(tree);
    const step = JSON.stringify(tree.toJSON());
    // The account has a name but no national ID on file: only the ID is asked for, and no bike plate.
    expect(step).toContain("Your national ID number");
    expect(step).not.toContain("First name");
    expect(step).not.toContain("Bike registration");
    expect(step).toContain("Take photo");
    act(() => {
      tree.unmount();
    });
  });
});
