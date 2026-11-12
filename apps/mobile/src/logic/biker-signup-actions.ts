import type { QueryClient } from "@tanstack/react-query";
import { getMe, updateProfile, type Me } from "../api/auth";
import { ApiError } from "../api/client";
import { updateRiderProfile } from "../api/riders";
import { formatNationalId } from "./national-id";
import { saveKycDoc } from "./manual-kyc";
import { typeLicenceNumber, type PhotoItem } from "./biker-signup";
import type { UploadImageSource } from "./image-downscale";

/**
 * Biker sign-up v1 (D-135): the writes the flow makes. The UI calls these, never the API (mobile-ui-no-api).
 * Each one lands its answer in the cached `me`, so the board and the flow read the new state at once.
 */
export type SaveNumberResult = "ok" | "dup" | "failed";

/** K1: the national ID number (PATCH /auth/me; 409 `id_in_use` → K1-dup). */
export async function saveSignupIdNumber(qc: QueryClient, raw: string): Promise<SaveNumberResult> {
  const me = qc.getQueryData<Me>(["me"]) ?? (await getMe().catch(() => undefined));
  try {
    const next = await updateProfile({ firstName: me?.firstName ?? "", lastName: me?.lastName ?? "", idNumber: formatNationalId(raw) });
    qc.setQueryData(["me"], next);
    return "ok";
  } catch (e) {
    return e instanceof ApiError && e.code === "id_in_use" ? "dup" : "failed";
  }
}

/** K3-num: the licence number (PATCH /riders/me; 409 `licence_in_use` → K3-num-dup). */
export async function saveSignupLicenceNumber(qc: QueryClient, raw: string): Promise<SaveNumberResult> {
  const licenceNumber = typeLicenceNumber(raw);
  try {
    await updateRiderProfile({ licenceNumber });
    qc.setQueryData<Me>(["me"], (cur) => (cur?.rider ? { ...cur, rider: { ...cur.rider, licenceNumber } } : cur));
    void qc.invalidateQueries({ queryKey: ["me"] });
    return "ok";
  } catch (e) {
    return e instanceof ApiError && e.code === "licence_in_use" ? "dup" : "failed";
  }
}

/** K2/K3/K4 "Use photo": upload one document photo with progress, then record it in the cached `me`. */
export async function sendSignupPhoto(qc: QueryClient, item: PhotoItem, shot: UploadImageSource, onProgress: (fraction: number) => void): Promise<"ok" | "failed" | "refused"> {
  try {
    const docs = await saveKycDoc(item, shot, onProgress);
    if (docs) qc.setQueryData<Me>(["me"], (cur) => (cur?.rider ? { ...cur, rider: { ...cur.rider, kycDocs: docs } } : cur));
    void qc.invalidateQueries({ queryKey: ["me"] });
    return "ok";
  } catch (e) {
    return e instanceof ApiError && (e.status === 422 || e.status === 400) ? "refused" : "failed";
  }
}
