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
