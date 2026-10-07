/**
 * Rider audit 2026-10-07: the pickup photo hook.
 *  - PJ-H1: a shot that couldn't go up (no data at the pickup) is re-sent the moment data is back.
 *  - B3: a refused camera clears once the rider turns it on in the phone's settings and comes back.
 */
import renderer, { act } from "react-test-renderer";
import { onlineManager } from "@tanstack/react-query";
import { AppState } from "react-native";

const mockRequestUpload = jest.fn();
const mockUploadImage = jest.fn();
const mockAttach = jest.fn();
const mockRequestCamera = jest.fn();
const mockGetCamera = jest.fn();
let mockDraft: string | null = null;

jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => mockDraft,
  setItemAsync: async (_k: string, v: string) => {
    mockDraft = v;
  },
  deleteItemAsync: async () => {
    mockDraft = null;
  },
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: (...a: unknown[]) => mockRequestCamera(...a),
  getCameraPermissionsAsync: (...a: unknown[]) => mockGetCamera(...a),
  launchCameraAsync: jest.fn(async () => {
    throw new Error("no camera app");
  }),
  MediaTypeOptions: { Images: "Images" },
}));
jest.mock("../../api/uploads", () => ({
  requestPickupPhotoUpload: (...a: unknown[]) => mockRequestUpload(...a),
  uploadImage: (...a: unknown[]) => mockUploadImage(...a),
}));
jest.mock("../../api/orders", () => ({ attachPickupPhoto: jest.fn() }));

import { type PickupPhoto, usePickupPhoto } from "../use-pickup-photo";
import { PICKUP_PHOTO_DRAFT_KEY } from "../../logic/pickup-photo-draft";

let latest: PickupPhoto | null = null;
function Probe(): null {
  latest = usePickupPhoto("order-1", null, (...a: [string, string]) => mockAttach(...a));
  return null;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

let tree: renderer.ReactTestRenderer | null = null;
let appStateListener: ((s: string) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockDraft = null;
  latest = null;
  onlineManager.setOnline(true);
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, fn: (s: string) => void) => {
    appStateListener = fn;
    return { remove: () => undefined };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  onlineManager.setOnline(true);
});

describe("usePickupPhoto", () => {
  it("PJ-H1: re-sends a queued shot when data comes back", async () => {
    expect(PICKUP_PHOTO_DRAFT_KEY).toBeTruthy();
    mockDraft = JSON.stringify({ orderId: "order-1", uri: "file:///shot.jpg", width: 10, height: 10, contentType: "image/jpeg" });
    mockRequestUpload.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ uploadUrl: "https://u", key: "pickup/r1/k.jpg", headers: null });
    mockUploadImage.mockResolvedValue(undefined);
    mockAttach.mockResolvedValue({});
    await act(async () => {
      tree = renderer.create(<Probe />);
    });
    await settle();
    expect(mockRequestUpload).toHaveBeenCalledTimes(1);
    expect(latest!.uploaded).toBe(false);

    act(() => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await settle();
    await settle();
    expect(mockAttach).toHaveBeenCalledWith("order-1", "pickup/r1/k.jpg");
    expect(latest!.uploaded).toBe(true);
  });

  it("B3: denied clears on return from settings, and a camera that won't open doesn't throw", async () => {
    mockRequestCamera.mockResolvedValue({ granted: false });
    await act(async () => {
      tree = renderer.create(<Probe />);
    });
    act(() => latest!.take());
    await settle();
    expect(latest!.denied).toBe(true);

    mockGetCamera.mockResolvedValue({ granted: true });
    act(() => appStateListener?.("active"));
    await settle();
    expect(latest!.denied).toBe(false);

    // Granted now, but the OS can't open a camera: no unhandled rejection, no preview.
    mockRequestCamera.mockResolvedValue({ granted: true });
    act(() => latest!.take());
    await settle();
    expect(latest!.preview).toBeNull();
  });
});
