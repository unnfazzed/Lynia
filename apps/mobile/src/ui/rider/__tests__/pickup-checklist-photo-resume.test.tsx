/**
 * C-O7 (LC-C09, Lane C optimize): the optional proof-of-pickup photo's capture/upload state used to
 * live only in local component state — an app kill strictly between capture and the attach POST
 * completing silently dropped the in-progress photo with no retry affordance surviving relaunch,
 * unlike the item ticks (pickup-checklist-draft.ts) or the KYC photo (kyc-draft.ts). Fixed by
 * persisting the captured asset to SecureStore BEFORE the downscale/PUT/attach chain fires (mirrors
 * C-O5's "write the marker before the request" pattern), cleared only on a confirmed attach.
 *
 * Simulates the kill by unmounting the first PickupChecklist instance mid-upload (the persisted
 * SecureStore mock backing store is the only thing that "survives" a real app kill) and mounting a
 * fresh instance for the same order — it must offer a one-tap resume with the SAME captured asset,
 * not force a re-shoot.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";

import { PickupChecklist } from "../PickupChecklist";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
}));

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchCameraAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file://original-4000px-capture.jpg", width: 4000, height: 3000, mimeType: "image/jpeg" }],
  }),
  MediaTypeOptions: { Images: "Images" },
}));

const mockDownscaleForUpload = jest.fn().mockResolvedValue({ uri: "file://downscaled-1280px.jpg", contentType: "image/jpeg" });
jest.mock("../../../logic/image-downscale", () => ({
  downscaleForUpload: (...args: unknown[]) => mockDownscaleForUpload(...args),
}));

// Never resolves — simulates a request stalled on a 2G link at the moment of the "kill".
let resolveUpload: (() => void) | null = null;
jest.mock("../../../api/uploads", () => ({
  requestPickupPhotoUpload: jest.fn().mockResolvedValue({ uploadUrl: "https://gcs.example/put", key: "obj-key-1" }),
  uploadImage: jest.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveUpload = resolve;
      }),
  ),
}));

jest.mock("../../../api/orders", () => ({
  attachPickupPhoto: jest.fn().mockResolvedValue(undefined),
}));

const ITEMS = [{ description: "Documents", quantity: 1 }];

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
  mockStore.clear();
  resolveUpload = null;
  mockDownscaleForUpload.mockClear();
});

describe("PickupChecklist — photo capture/upload survives an app kill (C-O7/LC-C09)", () => {
  it("offers a resume with the same captured asset after a kill mid-upload, instead of forcing a re-shoot", async () => {
    let tree1!: renderer.ReactTestRenderer;
    act(() => {
      tree1 = renderer.create(
        <PickupChecklist
          items={ITEMS}
          checkedItems={new Set()}
          collectedCount={0}
          pending={false}
          onToggle={() => {}}
          onConfirm={() => {}}
          orderId="order-1"
        />,
      );
    });
    await flush(); // let the mount-time draft-load effect settle (nothing to restore yet)

    press(findByText(tree1, "Add a photo of the parcel (optional)"));
    await flush(); // capture resolves, uploadPhoto fires and persists the draft, then stalls on uploadImage

    // The upload never resolved — pre-fix, this app-kill-mid-request left zero trace of the attempt.
    expect(resolveUpload).not.toBeNull();
    expect(mockStore.get("lynia.pickupPhotoDraft")).toBeTruthy();

    // Simulate the kill: tear down the first instance entirely.
    act(() => {
      tree1.unmount();
    });

    // A fresh mount for the SAME order (post-relaunch) must restore the resume affordance from the
    // still-persisted SecureStore draft — the store, not JS memory, is what survives a real kill.
    let tree2!: renderer.ReactTestRenderer;
    act(() => {
      tree2 = renderer.create(
        <PickupChecklist
          items={ITEMS}
          checkedItems={new Set()}
          collectedCount={0}
          pending={false}
          onToggle={() => {}}
          onConfirm={() => {}}
          orderId="order-1"
        />,
      );
    });
    await flush();

    findByText(tree2, "We didn't confirm your last photo uploaded — tap to finish adding it.");
    press(findByText(tree2, "Try the photo again"));
    await flush();

    // The resumed retry re-fires the chain with the ORIGINAL captured asset, not a placeholder/blank.
    expect(mockDownscaleForUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "file://original-4000px-capture.jpg", width: 4000, height: 3000, contentType: "image/jpeg" }),
    );
  });

  it("clears the persisted draft once the photo attach actually succeeds", async () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PickupChecklist
          items={ITEMS}
          checkedItems={new Set()}
          collectedCount={0}
          pending={false}
          onToggle={() => {}}
          onConfirm={() => {}}
          orderId="order-1"
        />,
      );
    });
    await flush();

    press(findByText(tree, "Add a photo of the parcel (optional)"));
    await flush();
    expect(mockStore.get("lynia.pickupPhotoDraft")).toBeTruthy();

    // Let the stalled upload complete successfully.
    await act(async () => {
      resolveUpload?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockStore.get("lynia.pickupPhotoDraft")).toBeUndefined();
  });

  it("does not restore a draft left over from a DIFFERENT order", async () => {
    mockStore.set("lynia.pickupPhotoDraft", JSON.stringify({ orderId: "order-999", uri: "file://stale.jpg", contentType: "image/jpeg" }));

    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PickupChecklist
          items={ITEMS}
          checkedItems={new Set()}
          collectedCount={0}
          pending={false}
          onToggle={() => {}}
          onConfirm={() => {}}
          orderId="order-1"
        />,
      );
    });
    await flush();

    expect(tree.root.findAll((n) => n.props.children === "We didn't confirm your last photo uploaded — tap to finish adding it.")).toHaveLength(0);
  });
});
