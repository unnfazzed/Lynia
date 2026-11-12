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
  /** The manual-mode count beside the bars (E1's own string is "of 3"). Was "of 6" (KB-02). */
  progressOf4: "of 4",
  // KB-02 (owner 2026-11-12, "streamline it"; ledger D-134, pending the owner's word check):
  /** F1 before the documents are in: what to do, not "In review". */
  todoBody: "Add your ID, your licence and a selfie with your ID. About 2 minutes.",
  /** Bike & documents once all four are in, above the Done button. */
  sent: "Sent for review. Usually a few hours. We’ll notify you.",
  done: "Done",
} as const;
