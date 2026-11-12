/** KB-04: a photo taken just before Android killed the app is handed back, with the photo it was for. */
const store: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => store[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    store[k] = v;
  },
  deleteItemAsync: async (k: string) => {
    delete store[k];
  },
}));
const mockPending = jest.fn();
jest.mock("expo-image-picker", () => ({ getPendingResultAsync: () => mockPending() }));

import { clearPick, markPickStarted, PENDING_PHOTO_KEY, peekPendingTarget, recoverPendingPhoto } from "../pending-photo";

const asset = { uri: "file:///shot.jpg", width: 1200, height: 900, mimeType: "image/jpeg" };

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  mockPending.mockReset();
});

describe("pending photo", () => {
  it("nothing in flight: no marker, and the picker is never asked", async () => {
    expect(await peekPendingTarget()).toBeNull();
    expect(await recoverPendingPhoto()).toBeNull();
    expect(mockPending).not.toHaveBeenCalled();
  });

  it("a launch killed by Android hands back its photo with the slot it was for, once", async () => {
    await markPickStarted("licence");
    expect(await peekPendingTarget()).toBe("licence");
    mockPending.mockResolvedValue({ canceled: false, assets: [asset] });
    expect(await recoverPendingPhoto()).toEqual({ target: "licence", shot: { uri: asset.uri, width: 1200, height: 900, contentType: "image/jpeg" } });
    expect(store[PENDING_PHOTO_KEY]).toBeUndefined();
    expect(await recoverPendingPhoto()).toBeNull();
  });

  it("a picker that returned normally leaves nothing to recover", async () => {
    await markPickStarted("idFront");
    await clearPick();
    expect(await recoverPendingPhoto()).toBeNull();
  });

  it("a cancelled or failed pending result is dropped, and the marker cleared", async () => {
    await markPickStarted("selfieId");
    mockPending.mockResolvedValue({ code: "E", message: "x" });
    expect(await recoverPendingPhoto()).toBeNull();
    expect(store[PENDING_PHOTO_KEY]).toBeUndefined();
  });

  it("a screen only takes the photos it can show; a stale marker (30 min+) is ignored", async () => {
    await markPickStarted("riderPhoto");
    expect(await recoverPendingPhoto(["idFront", "licence", "selfieId"])).toBeNull();
    expect(await peekPendingTarget()).toBe("riderPhoto");
    await markPickStarted("idFront", Date.now() - 31 * 60 * 1000);
    expect(await peekPendingTarget()).toBeNull();
  });
});
