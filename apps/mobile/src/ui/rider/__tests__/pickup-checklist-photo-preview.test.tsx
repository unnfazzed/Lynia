/**
 * B-O11 (LC lane B, Go-class runtime perf): the pickup-photo preview must render the already-
 * downscaled upload asset (`downscaleForUpload`'s ~1280px/0.7 JPEG output), not the original
 * 3000-4000px camera capture — that capture stays mounted as a preview for the rest of the pickup
 * flow, and the full-resolution bitmap is real avoidable peak-memory pressure on a 1-2GB device.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";

import { PickupChecklist } from "../PickupChecklist";

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchCameraAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file://original-4000px-capture.jpg", width: 4000, height: 3000, mimeType: "image/jpeg" }],
  }),
  MediaTypeOptions: { Images: "Images" },
}));

jest.mock("../../../logic/image-downscale", () => ({
  downscaleForUpload: jest.fn().mockResolvedValue({ uri: "file://downscaled-1280px.jpg", contentType: "image/jpeg" }),
}));

jest.mock("../../../api/uploads", () => ({
  requestPickupPhotoUpload: jest.fn().mockResolvedValue({ uploadUrl: "https://gcs.example/put", key: "obj-key-1" }),
  uploadImage: jest.fn().mockResolvedValue(undefined),
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

describe("PickupChecklist — pickup-photo preview uses the downscaled asset", () => {
  it("renders the downscaled upload uri, not the original camera-capture uri", async () => {
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

    await act(async () => {
      press(findByText(tree, "Add a photo of the parcel (optional)"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const image = tree.root.findByProps({ accessibilityLabel: "Your photo of the parcel" });
    expect(image.props.source.uri).toBe("file://downscaled-1280px.jpg");
    expect(image.props.source.uri).not.toBe("file://original-4000px-capture.jpg");
  });
});
