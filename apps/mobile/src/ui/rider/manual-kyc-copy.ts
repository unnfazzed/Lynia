/**
 * Manual KYC copy (ledger D-122, owner 2026-11-04). Rows, guide lines, the F1 pill and the decline reasons
 * were approved verbatim in the design review; the licence-details, upload-warning and push strings are new
 * in PR 1 and are listed in the same ledger entry for the owner's approval. "Biker", never "rider" (D-101).
 */
export const MK = {
  idFront: "ID card (front)",
  licence: "Driver's licence",
  selfieId: "Selfie holding your ID",
  sub: "For your ID check",
  guideDoc: "Lay it flat, all four corners in view, no glare.",
  guideSelfie: "Hold your ID next to your face.",
  addDocs: "Add your documents",
  // New in PR 1 (ledger D-122, pending the owner's sign-off on the exact words):
  licenceDetails: "Licence details",
  licenceDetailsSub: "Number and expiry date",
  licenceNumber: "Licence number",
  licenceExpiry: "Expiry date",
  licenceExpiryPh: "DD/MM/YYYY",
  licenceExpiryBad: "Use the format DD/MM/YYYY",
  licenceNumberBad: "Enter your licence number",
  licenceExpired: "This licence has expired",
  nationalIdSheet: "Your national ID number",
  save: "Save",
  /** The manual-mode count beside the bars (E1's own string is "of 3"). */
  progressOf6: "of 6",
} as const;
