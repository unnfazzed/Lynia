/**
 * Customer onboarding copy — Calm Mint v2 (`packages/design/handoff/calm-mint-v2-2026-10`,
 * `shared.js` `O` and `mint2.js` `OB`; README §3), verbatim. A string the handoff does not draw is
 * marked with the ledger entry that sanctions it (docs/DESIGN-DEVIATIONS.md D-55).
 */
export const OB = {
  // C1 · Welcome
  welcomeH1: "Parcels and food",
  welcomeH1Accent: "across town.",
  facts: ["Cash or mobile money", "A code at the door, every delivery", "Live tracking to your gate"] as const,
  continueWithNumber: "Continue with your number",
  wantToEarn: "Want to earn?",
  rideWithLynia: "Ride with LyniaGo",

  // C2 / C3 · Phone
  phoneTitle: "What’s your number?",
  phoneSub: "We’ll send a 6-digit code on WhatsApp.",
  phoneLabel: "Phone number",
  phonePrefix: "+263",
  phoneHelp: "Starts with 71, 73, 77 or 78.",
  phoneShort: "That number looks short. Zimbabwe mobiles have 9 digits after +263.",
  /** D-55: C3 draws only the too-short case; a 9-digit number on the wrong prefix gets this. */
  phoneNotMobile: "That doesn’t look like a mobile number. Zimbabwe mobiles start with 71, 73, 77 or 78.",
  sendCode: "Send code",
  agreePrefix: "By continuing you agree to the ",
  terms: "Terms",
  and: " and ",
  privacy: "Privacy policy",

  // C4 · Code
  codeTitle: "Enter the code",
  /** "Sent on WhatsApp to +263 77 245 1180." — D-55 (and D-40): "by SMS" when Bird fell back to SMS. */
  sentTo: (channel: "whatsapp" | "sms"): string => (channel === "whatsapp" ? "Sent on " : "Sent by "),
  channelName: (channel: "whatsapp" | "sms"): string => (channel === "whatsapp" ? "WhatsApp" : "SMS"),
  change: "Change",
  resendIn: (clock: string): string => `Resend in ${clock}`,
  resendOnWhatsApp: "Resend on WhatsApp",
  autoNote: "Fills in by itself when the message arrives. We check it automatically.",
  wrongCode: "That code isn’t right. Check the message and try again.",
  expired: "That code has expired",
  sendNewCode: "Send a new code",
  /** D-55: QA builds pre-fill the code (no message is sent), so the drawn "Sent on …" would be false. */
  testBuild: "Test build: code pre-filled.",

  // C5 · Name
  nameTitle: "What should riders call you?",
  nameSub: "Your name shows on your rider’s screen and your receipts.",
  firstName: "First name",
  surname: "Surname",
  verified: "Verified",
  noIdNote: "No ID needed. If an order ever needs one, we’ll ask then. You can add it in Account.",
  startUsing: "Start using LyniaGo",
  /** D-55: the C5 draft-restore line (kept from the shipped screen — a half-filled form survives a kill). */
  draftRestored: "We saved what you’d filled in — pick up where you left off.",
} as const;

/**
 * Rider onboarding copy — Calm Mint v2 R1–R3 (`shared.js` `O.rider` / `O.pending`, `mint2.js`
 * `OB.verified`), verbatim. D-55 marks what is held back until the backend serves it.
 */
export const RO = {
  // R1 · Why ride + what you need
  h1: "Ride with LyniaGo.",
  h1Accent: "Earn on your terms.",
  chips: ["You set your fare", "Cash on delivery", "Ride when you want"] as const,
  stepAccount: "Your account",
  /** D-55 (D-38 stands): the handoff draws "ID check with Didit"; the app never names the vendor. */
  stepId: "ID check",
  stepIdTime: "~2 min",
  done: "Done",
  /** The full drawn note's first two sentences — shown once the server serves the free-jobs rule (D-70). */
  noteFree: "No top-up to start. Your first jobs are commission-free.",
  /**
   * Owner 2026-10-02 (D-62): the photo is optional and waits with the papers. Drawn: "Licence and bike papers can
   * wait." First Run v2 BRIEF 13 (D-80): the licence is dropped from all copy — nothing collects one.
   */
  notePapers: "Your photo and bike papers can wait.",
  startIdCheck: "Start ID check",

  // R2 · ID pending
  setupTitle: "Rider setup",
  checking: "Checking",
  /** D-55 (D-38 stands): the handoff draws "Didit is checking your ID". */
  diditChecking: "We\u2019re checking your ID",
  diditCheckingB: "Usually under a minute. We’ll notify you, so you can leave this screen.",
  stepIdShort: "ID check",
  inReview: "In review",
  stepGoOnline: "Go online",
  next: "Next",
  fixNote: "If something needs fixing, we’ll tell you exactly what. Nothing is lost if you close the app.",
  sendWhileWait: "Send a parcel while you wait",

  // R3 · Verified
  verifiedTitle: (first: string | null): string => (first ? `You’re verified, ${first}` : "You’re verified"),
  verifiedSub: "You can go online and take jobs now.",
  goOnline: "Go online",
  /** Owner 2026-10-02 (D-62). Drawn: "Add licence and bike papers later in Account". No licence (D-80, BRIEF 13). */
  papersLater: "Add your photo and bike papers later in Account",
} as const;
