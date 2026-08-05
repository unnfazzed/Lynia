/**
 * C-O8 (LC-C11): the become-a-rider KYC form's photo capture only committed `photoUri`/`photoKey`
 * to the durable draft on a SUCCESSFUL upload — an app kill strictly between firing the presigned-
 * URL PUT and it resolving left the draft exactly as it was before the attempt, forcing a full
 * re-shoot on relaunch instead of the one-tap "Try again" resume a network-only failure already
 * gets. Fixed by persisting the captured asset (`pendingPhoto`) to the draft BEFORE the downscale/
 * PUT chain fires, mirroring C-O5/C-O7's "write the marker before the request" pattern.
 *
 * Simulates the kill by unmounting the first BecomeRiderScreen instance mid-upload (the persisted
 * SecureStore mock backing store is the only thing that "survives" a real app kill) and mounting a
 * fresh instance — it must offer a one-tap resume with the SAME captured asset, not force a re-shoot.
 */
import React from "react";
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
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "dismiss" }),
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
const mockDownscaleForUpload = jest.fn().mockResolvedValue({ uri: "file://downscaled-1280px.jpg", contentType: "image/jpeg" });
jest.mock("../../../src/logic/image-downscale", () => ({
  downscaleForUpload: (...args: unknown[]) => mockDownscaleForUpload(...args),
}));

// Never resolves — simulates a request stalled on a 2G link at the moment of the "kill".
let resolveUpload: (() => void) | null = null;
jest.mock("../../../src/api/uploads", () => ({
  requestKycPhotoUpload: jest.fn().mockResolvedValue({ uploadUrl: "https://gcs.example/put", key: "obj-key-1" }),
  uploadImage: jest.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveUpload = resolve;
      }),
  ),
}));
jest.mock("../../../src/api/riders", () => ({
  becomeRider: jest.fn(),
  completeProfile: jest.fn(),
}));

import BecomeRiderScreen from "../become";

function storedDraft(): { pendingPhoto: unknown; photoKey: unknown } {
  const raw = secureStore["lynia.kycDraft.v1"];
  if (!raw) throw new Error("no draft persisted");
  return JSON.parse(raw) as { pendingPhoto: unknown; photoKey: unknown };
}

function findByText(tree: renderer.ReactTestRenderer, text: string): renderer.ReactTestInstance {
  const node = tree.root.findAll((n) => n.props.children === text)[0];
  if (!node) throw new Error(`no node with text "${text}"`);
  return node;
}

function press(node: renderer.ReactTestInstance): void {
  let n: typeof node | null = node;
  while (n && typeof n.props.onPress !== "function") n = n.parent;
  n?.props.onPress();
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  secureStore = {};
  resolveUpload = null;
  mockReplace.mockClear();
  mockSetItemAsync.mockClear();
  mockGetItemAsync.mockClear();
  mockDeleteItemAsync.mockClear();
  mockDownscaleForUpload.mockClear();
});

describe("BecomeRiderScreen — KYC photo upload survives an app kill (C-O8/LC-C11)", () => {
  it("offers a resume with the same captured asset after a kill mid-upload, instead of forcing a re-shoot", async () => {
    let tree1!: renderer.ReactTestRenderer;
    act(() => {
      tree1 = renderer.create(<BecomeRiderScreen />);
    });
    await flush(); // let the mount-time draft-load effect settle (nothing to restore yet)

    press(findByText(tree1, "Take photo"));
    await flush(); // capture resolves and lands on the `photo_preview` review step
    press(findByText(tree1, "Use this photo"));
    await flush(); // doUpload fires and persists pendingPhoto, then stalls on uploadImage

    // The upload never resolved — pre-fix, this app-kill-mid-request left zero trace of the attempt.
    expect(resolveUpload).not.toBeNull();
    expect(storedDraft().pendingPhoto).toMatchObject({ uri: "file://original-4000px-capture.jpg", width: 4000, height: 3000 });

    // Simulate the kill: tear down the first instance entirely.
    act(() => {
      tree1.unmount();
    });

    // A fresh mount (post-relaunch) must restore the resume affordance from the still-persisted
    // SecureStore draft — the store, not JS memory, is what survives a real kill.
    let tree2!: renderer.ReactTestRenderer;
    act(() => {
      tree2 = renderer.create(<BecomeRiderScreen />);
    });
    await flush();

    findByText(tree2, "We didn't confirm your last photo uploaded — tap \"Try again\" to finish adding it.");
    press(findByText(tree2, "Try again"));
    await flush();

    // The resumed retry re-fires the chain with the ORIGINAL captured asset, not a placeholder/blank.
    expect(mockDownscaleForUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "file://original-4000px-capture.jpg", width: 4000, height: 3000, contentType: "image/jpeg" }),
    );

    // tree2 is still mid-stalled-upload here; unmount so the 4.5s slow-upload timer's effect cleanup
    // runs — left mounted, the REAL timer fires during a later suite in the same worker and crashes it.
    act(() => {
      tree2.unmount();
    });
  });

  it("clears the persisted pendingPhoto once the upload actually succeeds", async () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<BecomeRiderScreen />);
    });
    await flush();

    press(findByText(tree, "Take photo"));
    await flush(); // `photo_preview` review step
    press(findByText(tree, "Use this photo"));
    await flush();
    expect(storedDraft().pendingPhoto).toBeTruthy();

    // Let the stalled upload complete successfully.
    await act(async () => {
      resolveUpload?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storedDraft().pendingPhoto).toBeNull();
    expect(storedDraft().photoKey).toBe("obj-key-1");

    act(() => {
      tree.unmount();
    });
  });
});
