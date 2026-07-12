// expo-image-manipulator is a native module — mock it like the other expo modules in this suite
// (inline jest.mock, cf. test-build.test.ts's expo-constants) so the helper's decision + fallback
// logic runs in plain Node.
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

import { manipulateAsync } from "expo-image-manipulator";
import {
  computeResizeTarget,
  downscaleForUpload,
  MAX_UPLOAD_DIMENSION,
  UPLOAD_JPEG_QUALITY,
} from "../image-downscale";

const manipulate = manipulateAsync as jest.Mock;

beforeEach(() => manipulate.mockReset());

describe("computeResizeTarget", () => {
  it("caps the LONG edge: width for landscape, height for portrait (aspect ratio preserved)", () => {
    expect(computeResizeTarget(4000, 3000)).toEqual({ width: MAX_UPLOAD_DIMENSION });
    expect(computeResizeTarget(3000, 4000)).toEqual({ height: MAX_UPLOAD_DIMENSION });
    // A square over the cap can constrain either axis; width is the deterministic tie-break.
    expect(computeResizeTarget(2000, 2000)).toEqual({ width: MAX_UPLOAD_DIMENSION });
  });

  it("leaves an already-small image alone — re-encoding it would only degrade it", () => {
    expect(computeResizeTarget(MAX_UPLOAD_DIMENSION, 720)).toBeNull();
    expect(computeResizeTarget(640, 480)).toBeNull();
  });

  it("skips (never upscales) when dimensions are unknown or nonsense", () => {
    expect(computeResizeTarget(undefined, undefined)).toBeNull();
    expect(computeResizeTarget(4000, undefined)).toBeNull();
    expect(computeResizeTarget(0, 3000)).toBeNull();
    expect(computeResizeTarget(-1, 3000)).toBeNull();
    expect(computeResizeTarget(Number.NaN, 3000)).toBeNull();
  });

  it("resizes when only ONE edge exceeds the cap (a long panorama still gets bounded)", () => {
    expect(computeResizeTarget(5000, 800)).toEqual({ width: MAX_UPLOAD_DIMENSION });
  });
});

describe("downscaleForUpload", () => {
  const bigJpeg = { uri: "file:///camera/full.jpg", width: 4000, height: 3000, contentType: "image/jpeg" as const };

  it("resizes + JPEG-compresses an oversized capture and returns the new file as image/jpeg", async () => {
    manipulate.mockResolvedValue({ uri: "file:///cache/small.jpg", width: 1280, height: 960 });
    await expect(downscaleForUpload(bigJpeg)).resolves.toEqual({ uri: "file:///cache/small.jpg", contentType: "image/jpeg" });
    expect(manipulate).toHaveBeenCalledWith(
      bigJpeg.uri,
      [{ resize: { width: MAX_UPLOAD_DIMENSION } }],
      { compress: UPLOAD_JPEG_QUALITY, format: "jpeg" },
    );
  });

  it("a downscaled PNG comes back as image/jpeg — the presign must match the bytes actually PUT", async () => {
    manipulate.mockResolvedValue({ uri: "file:///cache/small.jpg" });
    const res = await downscaleForUpload({ ...bigJpeg, uri: "file:///pick.png", contentType: "image/png" });
    expect(res).toEqual({ uri: "file:///cache/small.jpg", contentType: "image/jpeg" });
  });

  it("passes an already-small image through untouched without invoking the native module", async () => {
    const small = { uri: "file:///small.png", width: 800, height: 600, contentType: "image/png" as const };
    await expect(downscaleForUpload(small)).resolves.toEqual({ uri: small.uri, contentType: "image/png" });
    expect(manipulate).not.toHaveBeenCalled();
  });

  it("falls back to the ORIGINAL file when the manipulator throws — the optimizer never blocks the flow", async () => {
    manipulate.mockRejectedValue(new Error("native module OOM"));
    await expect(downscaleForUpload(bigJpeg)).resolves.toEqual({ uri: bigJpeg.uri, contentType: "image/jpeg" });
  });

  it("uploads the original when dimensions are unknown (no blind resize of an unknown file)", async () => {
    const unknown = { uri: "file:///mystery.jpg", contentType: "image/jpeg" as const };
    await expect(downscaleForUpload(unknown)).resolves.toEqual({ uri: unknown.uri, contentType: "image/jpeg" });
    expect(manipulate).not.toHaveBeenCalled();
  });
});
