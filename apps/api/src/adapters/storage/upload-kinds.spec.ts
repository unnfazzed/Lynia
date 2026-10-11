import { AttachMerchantDoorProofRequest, MerchantDishRequest, PrescriptionInput, UpdateMerchantDishRequest, UpdateMerchantProfileRequest } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { assertSafeObjectKey, isMintedUploadKey, isOwnedUploadKey, isSafeObjectKey, UnsafeObjectKeyError } from "./upload-kinds";

/** D7 review (2026-10-07): the Azure SDK resolves `dish/me/../../kyc/victim/x.jpg` to the victim's blob,
 *  so a key that merely starts with the caller's namespace is not proof of ownership. */
const UUID = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const TRAVERSALS = [
  `dish/p1/../../kyc/victim/${UUID}.jpg`,
  `dish/p1/./${UUID}.jpg`,
  `/dish/p1/${UUID}.jpg`,
  `dish/p1//${UUID}.jpg`,
  `dish/p1/..\\kyc\\victim.jpg`,
  `dish/p1/%2e%2e/kyc/victim.jpg`,
  `dish/p1/${UUID}.jpg\u0000`,
  `dish/p1/${UUID}.jpg\n`,
];

describe("upload key checks (D7 review)", () => {
  it("isSafeObjectKey refuses traversal, absolute, doubled, backslashed, escaped and control-character keys", () => {
    expect(isSafeObjectKey(`dish/p1/${UUID}.jpg`)).toBe(true);
    expect(isSafeObjectKey(`dish/p1/${UUID}.jpg.thumb.jpg`)).toBe(true);
    for (const key of TRAVERSALS) expect(isSafeObjectKey(key), key).toBe(false);
    expect(() => assertSafeObjectKey(TRAVERSALS[0]!)).toThrow(UnsafeObjectKeyError);
  });

  it("isMintedUploadKey accepts only `<kind>/<owner>/<uuid>.jpg|png` for that owner", () => {
    expect(isMintedUploadKey("dish", "p1", `dish/p1/${UUID}.jpg`)).toBe(true);
    expect(isMintedUploadKey("banner", "p1", `banner/p1/${UUID}.png`)).toBe(true);
    for (const key of TRAVERSALS) expect(isMintedUploadKey("dish", "p1", key), key).toBe(false);
    expect(isMintedUploadKey("dish", "p1", `dish/p2/${UUID}.jpg`)).toBe(false); // someone else's
    expect(isMintedUploadKey("dish", "p1", `banner/p1/${UUID}.jpg`)).toBe(false); // another kind
    expect(isMintedUploadKey("dish", "p1", `dish/p1/sub/${UUID}.jpg`)).toBe(false);
    expect(isMintedUploadKey("dish", "p1", `dish/p1/${UUID}.jpg.thumb.jpg`)).toBe(false); // a thumb is never attachable
    expect(isMintedUploadKey("dish", "p1", `dish/p1/${UUID}.gif`)).toBe(false);
    expect(isMintedUploadKey("dish", "p1", `dish/p1/${UUID.toUpperCase()}.jpg`)).toBe(false);
  });

  it("isOwnedUploadKey (KYC, proof and Rx photos) keeps the one-name-in-my-namespace shape and refuses traversal", () => {
    expect(isOwnedUploadKey("kyc", "r1", "kyc/r1/selfie.jpg")).toBe(true);
    expect(isOwnedUploadKey("kyc", "r1", "kyc/r1/../victim/selfie.jpg")).toBe(false);
    expect(isOwnedUploadKey("kyc", "r1", "kyc/r1/")).toBe(false);
    expect(isOwnedUploadKey("pickup", "r1", "pickup/r1/a/b.jpg")).toBe(false);
  });

  it("the request contracts refuse those keys at the edge", () => {
    const bad = TRAVERSALS[0]!;
    expect(UpdateMerchantProfileRequest.safeParse({ logoUrl: bad }).success).toBe(false);
    expect(UpdateMerchantProfileRequest.safeParse({ coverPhotoUrl: "banner/p1/%2e%2e" }).success).toBe(false);
    expect(MerchantDishRequest.safeParse({ categoryId: UUID, name: "Sadza", priceUsd: 5, photoUrl: bad }).success).toBe(false);
    expect(UpdateMerchantDishRequest.safeParse({ photoUrl: bad }).success).toBe(false);
    expect(PrescriptionInput.safeParse({ photoKeys: [bad], patientName: "T", consent: true }).success).toBe(false);
    expect(AttachMerchantDoorProofRequest.safeParse({ key: bad, reason: "left_at_gate" }).success).toBe(false);
    // A minted key still passes.
    expect(UpdateMerchantDishRequest.safeParse({ photoUrl: `dish/p1/${UUID}.jpg` }).success).toBe(true);
  });
});
