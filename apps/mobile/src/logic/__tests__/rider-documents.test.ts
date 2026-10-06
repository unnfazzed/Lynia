/**
 * Ledger D-79 (owner 2026-10-06): the pure rules behind Bike & documents and Personal details, and the
 * photo save chain (downscale → mint under kyc/<you>/ → PUT → PATCH /riders/me).
 */
const mockRequestKyc = jest.fn();
const mockUploadImage = jest.fn();
const mockUpdateRider = jest.fn();
const mockDownscale = jest.fn();

jest.mock("../../api/uploads", () => ({
  requestKycPhotoUpload: (...a: unknown[]) => mockRequestKyc(...a),
  uploadImage: (...a: unknown[]) => mockUploadImage(...a),
}));
jest.mock("../../api/riders", () => ({ updateRiderProfile: (...a: unknown[]) => mockUpdateRider(...a) }));
jest.mock("../image-downscale", () => ({ downscaleForUpload: (...a: unknown[]) => mockDownscale(...a) }));
jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images" },
  CameraType: { front: "front", back: "back" },
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: "file:///p.png", width: 3000, height: 4000, mimeType: "image/png" }] })),
}));

import { bikeDocsProgress, bikeVerified, maskNationalId, normalizePlate, parseRiderPhotoDraft, pickRiderPhoto, plateIsValid, plateMatchesFormat, saveRiderPhoto } from "../rider-documents";

describe("First Run v2 E1/E4/E6 rules (D-80)", () => {
  it("E4: plates look like ABC 1234 (an optional space), after normalising", () => {
    for (const ok of ["ABZ 4417", "abz4417", "  abz   4417 "]) expect(plateMatchesFormat(ok)).toBe(true);
    for (const bad of ["AB 44", "ABZ 441", "ABZ4417X", "1234 ABZ", ""]) expect(plateMatchesFormat(bad)).toBe(false);
  });
  it("'Verified' only for an ops-confirmed plate once the server reports plateStatus", () => {
    expect(bikeVerified({ kycStatus: "verified", bikeReg: "ABZ 4417", plateStatus: "verified" })).toBe(true);
    expect(bikeVerified({ kycStatus: "verified", bikeReg: "ABZ 4417", plateStatus: "checking" })).toBe(false);
    expect(bikeVerified({ kycStatus: "verified", bikeReg: "ABZ 4417", plateStatus: "none" })).toBe(false);
    expect(bikeVerified({ kycStatus: "pending", bikeReg: "ABZ 4417", plateStatus: "verified" })).toBe(true);
  });
  it("E1 progress counts the ID check, the photo and a plate on file", () => {
    expect(bikeDocsProgress({ kycStatus: "verified", hasPhoto: false, bikeReg: null })).toEqual({ done: 1, total: 3 });
    expect(bikeDocsProgress({ kycStatus: "verified", hasPhoto: true, bikeReg: "ABZ 4417" })).toEqual({ done: 3, total: 3 });
    expect(bikeDocsProgress(null)).toEqual({ done: 0, total: 3 });
  });
  it("E6: a stored photo draft is parsed defensively", () => {
    expect(parseRiderPhotoDraft(JSON.stringify({ uri: "file:///p.jpg", contentType: "image/jpeg" }))).toEqual({ uri: "file:///p.jpg", contentType: "image/jpeg", width: undefined, height: undefined });
    expect(parseRiderPhotoDraft("{bad")).toBeNull();
    expect(parseRiderPhotoDraft(JSON.stringify({ uri: "", contentType: "image/jpeg" }))).toBeNull();
    expect(parseRiderPhotoDraft(null)).toBeNull();
  });
});

describe("plate rules (as PATCH /riders/me applies them)", () => {
  it("normalises to single spaces, upper-case", () => {
    expect(normalizePlate("  aee   4471 ")).toBe("AEE 4471");
  });
  it("accepts 3–20 characters once trimmed", () => {
    expect(plateIsValid("ab")).toBe(false);
    expect(plateIsValid("  ab  ")).toBe(false);
    expect(plateIsValid("abc")).toBe(true);
    expect(plateIsValid("x".repeat(21))).toBe(false);
  });
});

describe("bikeVerified (review R-8)", () => {
  it("is true only for a verified rider who has a plate", () => {
    expect(bikeVerified({ kycStatus: "verified", bikeReg: "AEE 4471" })).toBe(true);
    expect(bikeVerified({ kycStatus: "verified", bikeReg: null })).toBe(false);
    expect(bikeVerified({ kycStatus: "verified", bikeReg: "  " })).toBe(false);
    expect(bikeVerified({ kycStatus: "pending", bikeReg: "AEE 4471" })).toBe(false);
    expect(bikeVerified(null)).toBe(false);
  });
});

describe("maskNationalId", () => {
  it("shows only the last three characters", () => {
    expect(maskNationalId("63-123456-A-42")).toBe("••••••••A42");
    expect(maskNationalId("ab1")).toBe("AB1");
    expect(maskNationalId(null)).toBe("");
  });
});

describe("pickRiderPhoto", () => {
  it("reports a refused camera permission", async () => {
    expect(await pickRiderPhoto("camera")).toBe("denied");
  });
  it("hands back the gallery pick with its real content type", async () => {
    expect(await pickRiderPhoto("gallery")).toEqual({ uri: "file:///p.png", width: 3000, height: 4000, contentType: "image/png" });
  });
});

describe("saveRiderPhoto", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestKyc.mockResolvedValue({ uploadUrl: "https://put", key: "kyc/p1/x.jpg", headers: { "Content-Type": "image/jpeg", "x-size": "1" } });
    mockUploadImage.mockResolvedValue(undefined);
    mockUpdateRider.mockResolvedValue({ hasPhoto: true, bikeReg: null });
  });

  it("uploads the downscaled JPEG under the minted key, then attaches the key", async () => {
    mockDownscale.mockResolvedValue({ uri: "file:///small.jpg", contentType: "image/jpeg" });
    const out = await saveRiderPhoto({ uri: "file:///p.png", width: 3000, height: 4000, contentType: "image/png" });
    expect(mockRequestKyc).toHaveBeenCalledWith("image/jpeg");
    expect(mockUploadImage).toHaveBeenCalledWith("https://put", "file:///small.jpg", { "Content-Type": "image/jpeg", "x-size": "1" });
    expect(mockUpdateRider).toHaveBeenCalledWith({ photoUrl: "kyc/p1/x.jpg" });
    expect(out).toEqual({ hasPhoto: true, bikeReg: null });
  });

  it("uploads the original when the optimizer fails", async () => {
    mockDownscale.mockRejectedValue(new Error("oom"));
    await saveRiderPhoto({ uri: "file:///p.jpg", contentType: "image/jpeg" });
    expect(mockUploadImage).toHaveBeenCalledWith("https://put", "file:///p.jpg", expect.anything());
  });

  it("never attaches a key whose upload failed", async () => {
    mockDownscale.mockResolvedValue({ uri: "file:///small.jpg", contentType: "image/jpeg" });
    mockUploadImage.mockRejectedValue(new Error("timed out"));
    await expect(saveRiderPhoto({ uri: "file:///p.jpg", contentType: "image/jpeg" })).rejects.toThrow("timed out");
    expect(mockUpdateRider).not.toHaveBeenCalled();
  });
});
