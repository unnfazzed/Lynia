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
  // The licence-details row, the ID-number sheet and D-134's sign-up list are retired by Biker sign-up v1
  // (D-135); its strings live in signup-copy.ts.
} as const;
