/**
 * Own bikers v1 (2026-10-19, ledger D-117) · the biker's strings, verbatim from
 * packages/design/handoff/own-bikers-v1/copy.ts (`OB.biker`). The handoff writes its sample data into some strings
 * ("Chicken Inn Avondale", "Pizza Inn", "$14.00", "#B204", "0.4 km"); here those are parameters, the words around
 * them unchanged. Every fleet screen names the biker's home branch (owner decision P7-1), so the handoff's short
 * "Chicken Inn" and long "Chicken Inn Avondale" are both `shop`. User-facing copy says "biker" (D-101).
 */

export const OBB = {
  // OB-R1–R3 · joining.
  /** `invitedWait` "Chicken Inn Avondale invited you · finish your ID check to join". */
  invitedWait: (shop: string) => `${shop} invited you · finish your ID check to join`,
  /** `joinT` "Chicken Inn Avondale wants you on their bikers". */
  joinT: (shop: string) => `${shop} wants you on their bikers`,
  /** `joinB` "Jobs from Chicken Inn only. No fare, no top-up." */
  joinB: (shop: string) => `Jobs from ${shop} only. No fare, no top-up.`,
  join: "Join",
  notNow: "Not now",
  joining: "Joining…",
  /** `push` "Chicken Inn Avondale is waiting for you". */
  push: (shop: string) => `${shop} is waiting for you`,
  refNet: "Couldn't join. Check your connection.",
  gPendingT: "Your ID is under review",
  gPendingB: "We're checking your ID and bike photo. Most checks finish within a few hours.",

  // OB-R4–R6 · the fleet board.
  /** `fleetJobs` "Chicken Inn jobs". */
  fleetJobs: (shop: string) => `${shop} jobs`,
  /** `fleetTag` "Chicken Inn job". */
  fleetTag: (shop: string) => `${shop} job`,
  toPickup: "to pickup",
  trip: "trip",
  /** `ringsHint` "Chicken Inn jobs ring full screen. Keep LyniaGo open." */
  ringsHint: (shop: string) => `${shop} jobs ring full screen. Keep LyniaGo open.`,
  /** `emptyT` "No Chicken Inn jobs right now". */
  emptyT: (shop: string) => `No ${shop} jobs right now`,
  staleB: "Reconnecting… Jobs may be a minute behind. We'll update the list as soon as you're back.",
  /** `loadFail` "Couldn't load Chicken Inn jobs. Trying again in 10 s." */
  loadFail: (shop: string) => `Couldn't load ${shop} jobs. Trying again in 10 s.`,
  /** `pausedT` "Chicken Inn's deliveries are paused". */
  pausedT: (shop: string) => `${shop}'s deliveries are paused`,
  /** `pausedB` "Ask Chicken Inn for details." */
  pausedB: (shop: string) => `Ask ${shop} for details.`,
  /** The card's meta line ("3.2 km trip · Collect $14.00"; "1.8 km trip · Paid already"), drawn by the frames. */
  collectMeta: (amount: string) => `Collect ${amount}`,
  paidAlready: "Paid already",

  // OB-R7 · the offer.
  /** `offerT` "New Chicken Inn job". */
  offerT: (shop: string) => `New ${shop} job`,
  /** `meta` "0.4 km to pickup · 3.2 km trip". */
  meta: (toPickup: string | null, trip: string | null) => [toPickup ? `${toPickup} to pickup` : null, trip ? `${trip} trip` : null].filter(Boolean).join(" · "),
  collectDoor: "Collect at the door",
  /** `collectDoorB` "All of it goes back to Chicken Inn Avondale." */
  collectDoorB: (shop: string) => `All of it goes back to ${shop}.`,
  accept: "Accept this job",
  pass: "Not this one",
  passHint: "Passing or missing a job doesn't affect you.",
  expT: "That one went to another biker",
  /** `expB` "Chicken Inn jobs hold for 60 seconds, then go to the next biker." The hold is the server's round. */
  expB: (shop: string, seconds: number) => `${shop} jobs hold for ${seconds} seconds, then go to the next biker.`,
  backJobs: "Back to jobs",

  // OB-R8 · the job.
  /** `tToKitchen` "Heading to Chicken Inn". */
  tToKitchen: (shop: string) => `Heading to ${shop}`,
  tToDrop: "Heading to drop-off",
  tReturn: "Return the cash",
  /** `collectLine` "Collect $14.00 cash at the door". */
  collectLine: (amount: string) => `Collect ${amount} cash at the door`,
  /** `bringLine` "Bring $14.00 back to Chicken Inn Avondale". */
  bringLine: (amount: string, shop: string) => `Bring ${amount} back to ${shop}`,
  returnB: "Hand the cash to the counter. They confirm it in their app and this job closes.",
  /** `returnWait` "Waiting for Chicken Inn to confirm…". */
  returnWait: (shop: string) => `Waiting for ${shop} to confirm…`,

  // OB-R9 · done.
  doneT: "Delivered. Nice work.",
  /** `returnLead` "Return $14.00 to Chicken Inn Avondale". */
  returnLead: (amount: string, shop: string) => `Return ${amount} to ${shop}`,
  nothingReturn: "Nothing to return",
  nothingReturnB: "This order was paid before delivery.",
  nextJobs: "Back to jobs",

  // OB-R10 · Money.
  /** `cashHero` "Cash with you · owed to Chicken Inn Avondale". */
  cashHero: (shop: string) => `Cash with you · owed to ${shop}`,
  cashHeroB: "Hand it to the counter after each job.",
  history: "HISTORY",
  todayH: "TODAY",
  /** `hCollected` "Collected · #B204". */
  hCollected: (ref: string) => `Collected · ${ref}`,
  /** `hReturned` "Returned to Chicken Inn". */
  hReturned: (shop: string) => `Returned to ${shop}`,

  // OB-R11 · cancel.
  cxT: "Cancel this job?",
  /** `cxB` "This tells Chicken Inn Avondale." */
  cxB: (shop: string) => `This tells ${shop}.`,
  cxKeep: "Keep the job",
  cxYes: "Cancel job",

  // OB-R12 · Account and leaving.
  /** `acctRow` "Chicken Inn bikers". */
  acctRow: (shop: string) => `${shop} bikers`,
  /** `leaveT` "Leave Chicken Inn's bikers?" */
  leaveT: (shop: string) => `Leave ${shop}'s bikers?`,
  leaveB: "You'll become a public biker and need a commission top-up to take jobs.",
  leave: "Leave",
  stay: "Stay",
  leaveBlocked: "You can leave after this delivery.",

  // OB-R13 · public biker now.
  pubT: "You're a public biker now",
  /** `pubB` "Chicken Inn has stopped using Own bikers. You can take jobs from anyone near you." */
  pubB: (shop: string) => `${shop} has stopped using Own bikers. You can take jobs from anyone near you.`,
  pub1T: "Parcels and food near you",
  pub1B: "Jobs from shops, kitchens and customers across Harare.",
  pub2T: "You keep the fare",
  pub2B: "You set or accept a fare. Commission comes off when a job closes.",
  pub3T: "Top up to start",
  /** `pub3B` "Keep at least $2.00 commission balance to take jobs." */
  pub3B: (floor: string) => `Keep at least ${floor} commission balance to take jobs.`,
  pubCta: "See jobs near me",
} as const;
