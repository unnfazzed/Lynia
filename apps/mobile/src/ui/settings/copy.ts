/**
 * Settings strings the First Run v2 handoff DRAWS but its `copy.ts` doesn't carry (`design/fr-states.js`
 * D1 / PC11 / P15, ledger D-81) — verbatim from the drawing. The rows the owner kept that the handoff
 * doesn't draw (Privacy, Terms, Payment, Navigation app, Top-up number, Delete account, Test ping / alarm;
 * D-81 §2 #1) keep their Rider v2 words (`RIDER_COPY`).
 */
export const ST = {
  title: "Settings",
  you: "YOU",
  alerts: "ALERTS",
  jobAlerts: "Job alerts",
  jobAlertsSub: "Ping and food-offer alarm",
  location: "Location",
  locationSub: "Needed for jobs",
  locationOff: "Off · You can’t receive jobs",
  orderUpdates: "Order updates",
  battery: "Battery saver",
  batterySub: "Keep trips running",
  language: "Language",
  english: "English",
  signOut: "Sign out",
} as const;

/** D1's "1 to add" on Bike & documents: how many optional items (photo, plate) are still missing. */
export const toAdd = (n: number): string => `${n} to add`;
