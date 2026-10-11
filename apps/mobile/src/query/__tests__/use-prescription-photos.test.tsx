/**
 * Reviewed list 2026-10-07, the prescription pages on Review (Order flow v2 R8a/R8b):
 *  - U30: a refused camera fell through silently (and the + tile for pages 2–3 only opens the camera), so a
 *    customer who said no to the camera could never add a page. It now opens the gallery. A failed upload
 *    hands its error to the screen, which says the server's reason for a refused mint.
 *  - U29: `clear()` empties the pages (placement refused one of them), back to R8a.
 */
import renderer, { act } from "react-test-renderer";

const mockRequestCamera = jest.fn();
const mockRequestLibrary = jest.fn();
const mockLaunchCamera = jest.fn();
const mockLaunchLibrary = jest.fn();
const mockMint = jest.fn();
const mockPut = jest.fn();

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: (...a: unknown[]) => mockRequestCamera(...a),
  requestMediaLibraryPermissionsAsync: (...a: unknown[]) => mockRequestLibrary(...a),
  launchCameraAsync: (...a: unknown[]) => mockLaunchCamera(...a),
  launchImageLibraryAsync: (...a: unknown[]) => mockLaunchLibrary(...a),
  MediaTypeOptions: { Images: "Images" },
}));
jest.mock("../../api/uploads", () => ({
  requestPrescriptionPhotoUpload: (...a: unknown[]) => mockMint(...a),
  uploadImage: (...a: unknown[]) => mockPut(...a),
}));
jest.mock("../../logic/image-downscale", () => ({ downscaleForUpload: async (s: unknown) => s }));

import { ApiError } from "../../api/client";
import { type PrescriptionPhotos, usePrescriptionPhotos } from "../use-prescription-photos";

const PICKED = { canceled: false, assets: [{ uri: "file:///rx.jpg", width: 1000, height: 1400, mimeType: "image/jpeg" }] };

let latest: PrescriptionPhotos | null = null;
const onError = jest.fn();
function Probe(): null {
  latest = usePrescriptionPhotos(onError);
  return null;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

let tree: renderer.ReactTestRenderer | null = null;
beforeEach(() => {
  jest.clearAllMocks();
  mockRequestCamera.mockResolvedValue({ granted: true });
  mockRequestLibrary.mockResolvedValue({ granted: true });
  mockLaunchCamera.mockResolvedValue(PICKED);
  mockLaunchLibrary.mockResolvedValue(PICKED);
  mockMint.mockResolvedValue({ uploadUrl: "https://upload", key: "rx/u/1.jpg", headers: null });
  mockPut.mockResolvedValue(undefined);
  act(() => {
    tree = renderer.create(<Probe />);
  });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

it("U30: a refused camera opens the gallery instead of doing nothing", async () => {
  mockRequestCamera.mockResolvedValue({ granted: false });
  act(() => latest!.add("camera"));
  await settle();
  expect(mockLaunchCamera).not.toHaveBeenCalled();
  expect(mockLaunchLibrary).toHaveBeenCalledTimes(1);
  expect(latest!.pages).toHaveLength(1);
  expect(latest!.keys).toEqual(["rx/u/1.jpg"]);
});

it("a granted camera still opens the camera", async () => {
  act(() => latest!.add("camera"));
  await settle();
  expect(mockLaunchCamera).toHaveBeenCalledTimes(1);
  expect(mockLaunchLibrary).not.toHaveBeenCalled();
});

it("U30: a failed upload hands its error to the screen (so a refused mint can say why)", async () => {
  const refused = new ApiError(503, "Photo uploads are paused — try again in a few minutes.", "uploads_unavailable");
  mockMint.mockRejectedValue(refused);
  act(() => latest!.add("gallery"));
  await settle();
  expect(onError).toHaveBeenCalledWith(refused);
  expect(latest!.pages).toHaveLength(0);
});

it("U29: clear() drops every page", async () => {
  act(() => latest!.add("gallery"));
  await settle();
  expect(latest!.pages).toHaveLength(1);
  act(() => latest!.clear());
  expect(latest!.pages).toHaveLength(0);
  expect(latest!.keys).toEqual([]);
});
