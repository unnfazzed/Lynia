// Biker sign-up v1 — packages/design/handoff/biker-signup-v1/copy.ts (ledger D-135).
/**
 * Biker sign-up (manual review) strings. Shipped here verbatim, except "rider" reads "biker" (D-101): `signup-copy.test.ts` checks every value against `bikerWording(handoff)`.
 * Write "rider"; the app renders "biker" (D-101). Never name the review vendor.
 * `// was: …` = replaces a shipped string (BD / KY / MK). `// unchanged` = reused as shipped. No comment = new.
 * Retired: MK.licenceDetails, licenceDetailsSub, licenceExpiry, licenceExpiryPh, licenceExpiryBad, licenceExpired, progressOf4, todoBody, nationalIdSheet.
 */
export const KS = {
  becomeA: "Earn with",
  becomeB: "your bike",
  becomeBody: "Five quick steps. About 2 minutes.", // was: "Just an ID check. About 2 min."
  becomeCta: "Start",
  introA: "Become a biker", // K0, and the board before anything is sent. was (board): KY.reviewA "Our team is"
  introB: "in 5 steps",
  introBody: "About 2 minutes. Have your ID card and licence with you.",
  st1: "Your ID number",
  st2: "ID card (front)", // unchanged
  st3: "Your licence number",
  st4: "Licence photo", // was: "Driver’s licence"
  st5: "Selfie holding your ID", // unchanged
  privacy: "Only our team sees these photos.",
  start: "Start",
  of: "of",
  fix: "to fix",
  idA: "Your",
  idB: "ID number",
  idBody: "It’s on the front of your ID card.",
  idLabel: "National ID number", // was: "Your national ID number"
  idPh: "63-123456A78",
  next: "Next",
  looksRight: "Looks right",
  idErr: "Use the format 63-123456A78", // unchanged
  dupA: "This ID is on another account",
  dupBody: "One ID, one account. Message us and we’ll sort it.", // unchanged
  dupCta: "Message us on WhatsApp", // unchanged
  dupAlt: "Change number",
  lnA: "Your",
  lnB: "licence number",
  lnBody: "It’s printed on the front of your driver’s licence.",
  lnLabel: "Licence number", // unchanged
  lnPh: "As on your licence",
  lnErr: "Check the number on your licence", // was: "Enter your licence number"
  lnDupA: "This licence is on another account",
  lnDupBody: "One licence, one account. Message us and we’ll sort it.",
  docA: "Photo of your",
  docB: "ID card (front)",
  licA: "Photo of your",
  licB: "driver’s licence",
  guideDoc: "Lay it flat, all four corners in view, no glare.", // unchanged
  selA: "Selfie",
  selB: "holding your ID",
  guideSelfie: "Hold your ID next to your face.", // unchanged
  tipLight: "Good light",
  tipCorners: "All 4 corners",
  tipGlare: "No glare",
  tipHelmet: "No helmet or cap",
  tipIdFace: "ID photo facing out",
  takePhoto: "Take photo",
  takeSelfie: "Take selfie",
  gallery: "Choose from gallery", // unchanged
  galleryShort: "Gallery",
  camDoc: "Fit your card in the frame",
  camSelfie: "Face and ID in the frame",
  hintStill: "Hold still",
  hintCloser: "Move closer",
  hintDark: "Too dark. Find more light",
  prevA: "Can you",
  prevB: "read it?",
  prevBody: "The text is sharp and nothing is cut off.",
  prevSelA: "Are your face",
  prevSelB: "and ID clear?",
  prevSelBody: "Your whole face and the ID photo are in view.",
  use: "Use photo", // unchanged
  upA: "Sending", // unchanged
  upB: "your photo", // unchanged
  retake: "Retake", // unchanged
  sending: "Sending…", // was: "Uploading…"
  sendingBody: "A few seconds. Keep the app open.",
  failBox: "Didn’t send. Your photo is saved on this phone.", // was: "Your photo is saved on this phone. Try again when you’re online."
  retry: "Try again", // unchanged
  blockA: "Camera is",
  blockB: "turned off",
  blockBody: "Turn it on in your phone settings, then come back.",
  bStep1: "Open phone settings",
  bStep2: "Tap Permissions",
  bStep3: "Turn on Camera",
  openSettings: "Open phone settings", // unchanged
  checkA: "Check",
  checkB: "and send",
  checkBody: "Make sure every photo is clear.",
  edit: "Edit",
  sendCta: "Send for review",
  sendAgain: "Send again",
  newTag: "New",
  sentA: "Sent.",
  sentB: "We’ll take a look",
  sentBody: "Usually a few hours. We’ll notify you.", // was: "Sent for review. Usually a few hours. We’ll notify you."
  done: "Done", // unchanged
  halfA: "Almost there,", // unchanged
  halfBody: "2 of 5 done. About a minute left.", // was: "Finish your ID check. About 2 minutes."
  cont: "Continue", // was: "Finish ID check"
  nextTag: "Next",
  doneTag: "Done",
  dPhotoA: "Your ID photo",
  dPhotoB: "was hard to read",
  dPhotoBody: "Retake just this one. The rest is fine.",
  dPhotoCta: "Retake ID photo",
  dLicA: "Your licence",
  dLicB: "has expired",
  dLicBody: "Add your current licence number and photo. The rest is fine.",
  dLicCta: "Add current licence",
  dSelA: "Your face",
  dSelB: "wasn’t clear",
  dSelBody: "Retake your selfie in good light. The rest is fine.",
  dSelCta: "Retake selfie",
  redo: "Redo",
  ok: "OK",
  help: "Help on WhatsApp", // unchanged
  okA: "You’re",
  okB: "verified",
  okBody: "You can go online and take jobs.",
  okCta: "Continue",
  x1A: "Add a",
  x1B: "biker photo",
  x1Body: "Customers see it on their job. Optional.",
  skip: "Skip for now",
  x2A: "Your",
  x2B: "bike plate",
  x2Label: "Bike plate",
  x2Ph: "ABC 1234",
  x2Help: "Optional. You can add it later in Settings.",
  x2Err: "Plates look like ABC 1234", // unchanged
  savePlate: "Save plate", // unchanged
} as const;
