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

describe("brief 09 (U29, D-97 R8c–R8e): remove, Undo, Retake", () => {
  function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  async function addPages(n: number): Promise<void> {
    for (let i = 1; i <= n; i++) {
      mockLaunchLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: `file:///p${i}.jpg`, width: 1, height: 1, mimeType: "image/jpeg" }] });
      mockMint.mockResolvedValueOnce({ uploadUrl: "https://upload", key: `rx/u/${i}.jpg`, headers: null });
      act(() => latest!.add("gallery"));
      await settle();
    }
  }

  it("remove drops the page at once; restore puts it back at its old index with its key", async () => {
    await addPages(3);
    const second = latest!.pages[1]!;
    act(() => latest!.remove(second.id));
    expect(latest!.pages.map((p) => p.uri)).toEqual(["file:///p1.jpg", "file:///p3.jpg"]);
    expect(latest!.keys).toEqual(["rx/u/1.jpg", "rx/u/3.jpg"]);
    act(() => latest!.restore(second, 1));
    expect(latest!.pages.map((p) => p.uri)).toEqual(["file:///p1.jpg", "file:///p2.jpg", "file:///p3.jpg"]);
    expect(latest!.keys).toEqual(["rx/u/1.jpg", "rx/u/2.jpg", "rx/u/3.jpg"]);
    // A second Undo is a no-op (the page is back already).
    act(() => latest!.restore(second, 1));
    expect(latest!.pages).toHaveLength(3);
    expect(mockMint).toHaveBeenCalledTimes(3);
  });

  it("removing a page mid-upload cancels it: a late success never resurrects it, a late failure raises no toast", async () => {
    const put = deferred();
    mockPut.mockReturnValueOnce(put.promise);
    act(() => latest!.add("gallery"));
    await settle();
    expect(latest!.uploading).toBe(true);
    const signal = mockPut.mock.calls[0]![3] as AbortSignal;
    expect(signal.aborted).toBe(false);
    act(() => latest!.remove(latest!.pages[0]!.id));
    expect(signal.aborted).toBe(true);
    expect(latest!.pages).toHaveLength(0);
    await act(async () => put.resolve());
    await settle();
    expect(latest!.pages).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it("Undo of a cancelled upload re-uploads it; the old upload's late answer is ignored", async () => {
    const first = deferred();
    mockPut.mockReturnValueOnce(first.promise);
    act(() => latest!.add("gallery"));
    await settle();
    const page = latest!.pages[0]!;
    act(() => latest!.remove(page.id));
    mockMint.mockResolvedValueOnce({ uploadUrl: "https://upload", key: "rx/u/again.jpg", headers: null });
    act(() => latest!.restore(page, 0));
    await settle();
    expect(latest!.keys).toEqual(["rx/u/again.jpg"]);
    // The cancelled PUT fails late (aborted): stale, so neither drops the page nor tells the screen.
    await act(async () => first.reject(new Error("aborted")));
    await settle();
    expect(latest!.pages).toHaveLength(1);
    expect(latest!.keys).toEqual(["rx/u/again.jpg"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("replace retakes a page in place and uploads the new shot", async () => {
    await addPages(2);
    const firstId = latest!.pages[0]!.id;
    mockLaunchCamera.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///retake.jpg", width: 1, height: 1, mimeType: "image/jpeg" }] });
    mockMint.mockResolvedValueOnce({ uploadUrl: "https://upload", key: "rx/u/retake.jpg", headers: null });
    act(() => latest!.replace(firstId, "camera"));
    await settle();
    expect(latest!.pages.map((p) => p.uri)).toEqual(["file:///retake.jpg", "file:///p2.jpg"]);
    expect(latest!.pages[0]!.id).toBe(firstId);
    expect(latest!.keys).toEqual(["rx/u/retake.jpg", "rx/u/2.jpg"]);
  });

  it("a cancelled Retake keeps the page as it was", async () => {
    await addPages(1);
    mockLaunchCamera.mockResolvedValueOnce({ canceled: true, assets: [] });
    act(() => latest!.replace(latest!.pages[0]!.id, "camera"));
    await settle();
    expect(latest!.keys).toEqual(["rx/u/1.jpg"]);
  });
});
