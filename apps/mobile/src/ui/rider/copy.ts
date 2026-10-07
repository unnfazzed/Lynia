/**
 * Every user-facing string on the rider side (and the joint Account / Settings screens) — the Rider v2
 * handoff's `R` object (`packages/design/handoff/rider-v2/design/rv-kit.jsx`, ledger D-54), verbatim.
 * The handoff's sample values (Tendai, Rudo, Chipo, $3.20, 0.8 km, 14:20 …) become the formatters in
 * `RF` below; the wording around them is unchanged. Components read strings from here only.
 */
import { serviceTownsLabel } from "@lynia/shared";
import { KY } from "../firstrun/copy";

export const RIDER_COPY = {
  /* shell */
  tabJobs: "Jobs",
  tabMoney: "Money",
  tabAccount: "Account",
  tabHome: "Home",
  tabOrders: "Orders",
  online: "Online",
  reconnecting: "Reconnecting…",
  you: "You",
  /* board */
  nearest: "Nearest first",
  busy: "Busy now",
  foodRings: "Food jobs ring full screen. Keep LyniaGo open.",
  parcel: "PARCEL",
  food: "FOOD",
  /** Undrawn (owner 2026-10-01, ledger D-54 §4): a business's booking on the board. */
  shop: "SHOP",
  toPickup: "to pickup",
  trip: "trip",
  asking: "asking",
  makeOffer: "Make an offer",
  offerSent: "Offer sent",
  withdraw: "Withdraw",
  waitingCustomer: "Waiting for the customer to choose",
  yourOffers: "YOUR OFFERS",
  nearbyJobs: "NEARBY JOBS",
  emptyT: "Nothing in range yet",
  emptyB: "You'll see parcels here the moment they're posted near you. Jobs that get taken simply leave the list.",
  emptyFood: "Food offers ring full screen when a kitchen near you needs a rider.",
  whyQuiet: "Why no jobs?",
  staleB: "Reconnecting… Jobs may be a minute behind. We'll update the list as soon as you're back.",
  loadFail: "Couldn't load nearby jobs. Trying again in 10 s.",
  notifOff: "Notifications are off. You won't get new jobs or food offers.",
  turnOn: "Turn on",
  openJob: "Open job",
  taken: "That parcel was taken by another rider.",
  withdrawn: "Offer withdrawn.",
  undo: "Undo",
  /* make an offer */
  /** Not drawn: stands in for the sender's name when the API sends none (ledger D-54 §4). */
  theSender: "The sender",
  /** Undrawn fallbacks (ledger D-54 §4): the order carries no recipient name, and a job may carry no
   *  sender name — the handoff's sample names are replaced by the role, never invented. */
  recipientRole: "Recipient",
  theRecipient: "the recipient",
  theCustomer: "The customer",
  kitchen: "The kitchen",
  /** Undrawn (ledger D-54 §4): the collect label at a kitchen that is not paid up front (B2 draws only
   *  the upfront "I've paid and collected the food"), and the pickup code the kitchen reads out. */
  collectedFood: "I've collected the food",
  /** Order flow v2 RD2a (ledger D-59): `O.rd.code` at a kitchen; the code is six digits since BRIEF §16. */
  pickupCodeL: "Ask the kitchen for the pickup code",
  /** Order flow v2 RD1b (ledger D-59, README "JobTag adds SHOP and PHARMACY"). */
  pharmacy: "PHARMACY",
  /** Order flow v2 RD4a/RD4b, the door card (`O.rd.door1`, `O.rd.door3`, `O.rd.codeTries`). */
  door1: "Hand over the order",
  door3: "Enter the delivery code",
  codeTries: "5 tries",
  tOffer: "Make an offer",
  yourFare: "Your fare",
  tapType: "Tap the fare to type an amount",
  minus: "− $0.50",
  plus: "+ $0.50",
  thereIn: "You'll be there in",
  min: "min",
  etaHint: "Be honest. Arriving late is what loses you the next job.",
  sending: "Sending…",
  skip: "Skip this job",
  sendFail: "Couldn't send your offer. Check your data.",
  tryAgain: "Try again",
  /* gates */
  /*
   * The KYC gates (Rider v2 G1–G7: not a rider, pending, unfinished, failed, failed twice, expired, can't
   * open) are retired: First Run v2 F1–F8 (`KY`, src/ui/firstrun/copy.ts) draw every ID-check outcome and
   * G1 sends a non-rider to R1 (ledger D-82). The non-KYC gates below stay.
   */
  gGpsT: "Can't find your location",
  gGpsB: "Jobs are matched by distance, so location must be on while you ride.",
  openLoc: "Open location settings",
  gpsOn: "I've turned it on",
  gAreaT: "You're outside the service area",
  // Owner 2026-10-02 (ledger D-61): the served towns are named, replacing "LyniaGo works in Harare for now."
  gAreaB: `LyniaGo works in ${serviceTownsLabel()}. Jobs show again as soon as you're back inside.`,
  gAreaK: "Nearest edge",
  gCoolT: "You're on a cooldown",
  gCoolB: "You cancelled 3 jobs in 30 days. You can take jobs again when the timer ends.",
  gCoolK: "Clears at",
  gHoldT: "Your account is on hold",
  gHoldB: "We need to check something on your account before you take jobs. Call us and we'll sort it out.",
  gHoldK: "Reason",
  gSuspT: "Your account is suspended",
  gSuspK: "Until",
  gBanT: "Your account is closed for riding",
  gBanB: "You can still order food and send parcels as a customer.",
  gTopT: "Top up to keep riding",
  gTopK: "Balance",
  gTopK2: "Top up at least",
  goTopUp: "Top up now",
  gUpdateT: "Update LyniaGo to keep riding",
  gUpdateB: "This version can't take jobs any more. The update is about 18 MB.",
  update: "Update now",
  callSupport: "Call support",
  whatsappSupport: "Message support on WhatsApp",
  customerBridge: "Order food and send parcels",
  /* food offer */
  tFoodOffer: "New food job",
  /** Order flow v2 RD1a/RD1b (ledger D-59): the offer header per service, as of-screens-mrg.js `offer` draws it. */
  tShopOffer: "New shop job",
  tPharmacyOffer: "New pharmacy job",
  /** Order flow v2 RD4c's drawn CTA (of-screens-mrg.js), not keyed in `O`. */
  nextPhoto: "Next · take a photo",
  foodFare: "Your fare",
  payKitchen: "Pay the kitchen",
  collectDoor: "Collect at the door",
  accept: "Accept this job",
  pass: "Not this one",
  passHint: "Passing or missing a food offer doesn't affect your standing.",
  expT: "That one went to another rider",
  expB: "Food offers hold for 60 seconds, then move to the next rider nearby. Passing or missing one doesn't affect your standing.",
  backBoard: "Back to jobs",
  /* active job */
  tToPickup: "Heading to pickup",
  tAtPickup: "At pickup",
  tPhoto: "Pickup photo",
  tToDrop: "Heading to drop-off",
  tArriving: "Arriving now",
  /** Order flow v2 RD4a/RD4b (ledger D-59): the door stage's header, as of-screens-mrg.js draws it. */
  tAtDrop: "At the drop-off",
  tDone: "Job done",
  tToKitchen: "Heading to the kitchen",
  tAtKitchen: "At the kitchen",
  tReturn: "Return the cash",
  stPickup: "Pickup",
  stCollected: "Collected",
  stDrop: "Drop-off",
  stDone: "Done",
  pickupL: "PICKUP",
  dropL: "DROP-OFF",
  call: "Call",
  whatsapp: "WhatsApp",
  navigate: "Navigate",
  here: "You're here",
  atPickupCta: "I'm at pickup",
  atKitchenCta: "I'm at the kitchen",
  callKitchen: "Call the kitchen",
  collectedCta: "I've collected the parcel",
  atDropCta: "I'm at the drop-off",
  confirmCta: "Confirm delivery",
  checkItems: "Check before you leave",
  photoNeed: "Take a pickup photo",
  photoNeedB: "Shows the parcel as you got it. The customer can see it.",
  takePhoto: "Take photo",
  retake: "Retake",
  usePhoto: "Use this photo",
  photoUploading: "Saving photo…",
  photoFail: "Photo didn't upload. It's saved on your phone; we'll send it when you have data.",
  photoSaved: "Photo saved",
  needPhoto: "Tick the item and add a photo to continue.",
  problem: "Problem with this job?",
  yours: "YOURS",
  owed: "OWED TO KITCHEN",
  cashNow: "Cash with you now",
  codeL: "DELIVERY CODE",
  lockedT: "Code locked after 5 tries",
  doneT: "Delivered. Nice work.",
  doneEarn: "You earned",
  doneCash: "Cash collected · yours",
  doneComm: "Commission from balance",
  rateSkip: "Skip",
  rateSubmit: "Submit rating",
  nextJobs: "Back to jobs",
  paidCta: "I've paid and collected the food",
  returnB: "Hand the cash to the counter. They confirm it in their app and this job closes.",
  returnWait: "Waiting for the kitchen to confirm…",
  /* problem sheet */
  probT: "What's wrong?",
  probSub: "Your job keeps running while you're here.",
  pReach: "Can't reach the customer",
  pReachS: "Call, wait, then mark it undelivered",
  pDeliver: "Can't deliver",
  pDeliverS: "Refused, wrong address, or something else",
  pCancel: "Cancel this job",
  pCancelS: "Before pickup only. Counts as a strike",
  pDrop: "Drop this job",
  pDropS: "Food only, before the kitchen hands it over",
  pHelp: "Get help from LyniaGo",
  pHelpS: "WhatsApp or call our team",
  pReport: "Report the customer",
  pReportS: "Rude, unsafe, or asked for something odd",
  sos: "Emergency? Call 999",
  sosS: "Police, ambulance or fire. We'll tell our safety team.",
  close: "Close",
  /* exceptions */
  /** D-59 (order-flow-v2 README "Rider v2 … no-show wait copy 10 → 8 min"): the server's no-show window. */
  reachB: "Try twice more. If there's still no answer after 8 minutes, you can mark it undelivered.",
  markUndel: "Mark undelivered",
  undelHint: "Available after 8 minutes of trying.",
  undelT: "Why can't you deliver?",
  undelReasons: ["Recipient didn't answer", "Recipient refused it", "Wrong address", "Bike broke down", "Other"],
  undelSend: "Send",
  undelPick: "Pick a reason to continue.",
  undelDoneT: "Marked undelivered",
  undelNoStrike: "This doesn't count against you.",
  cxT: "Cancel this job?",
  cxFinal: "You're one strike from a pause. Cancelling now pauses jobs for 24 hours.",
  cxKeep: "Keep the job",
  cxYes: "Cancel job",
  cxYesFinal: "Cancel and pause",
  dropT: "Drop this food job?",
  dropB: "We'll offer it to the next rider. The kitchen hasn't handed the food over yet.",
  dropYes: "Drop job",
  custCxNoStrike: "This doesn't count against you.",
  offlineJob: "No connection. Your job is saved on this phone — keep riding.",
  offlineLong: "Still offline after 4 min. Your job is safe. The delivery code works without data; it syncs when you're back.",
  offlineCode: "Saved. Syncs when you're back online.",
  sosT: "Call 999?",
  sosB: "This calls the emergency line and tells our safety team where you are.",
  sosCall: "Call 999",
  sosCancel: "Not now",
  helpSent: "Our team will call you within 5 minutes. Your job keeps running.",
  /* money */
  earnings: "EARNINGS",
  today: "Today",
  week: "This week",
  earnHint: "Fares you were paid, before commission.",
  balanceL: "COMMISSION BALANCE",
  balanceB0: "Commission is 0% right now. You keep the full fare.",
  topUp: "Top up",
  lowB: "Getting low. Top up soon so you don't miss jobs.",
  owesB: "You owe this. Your next top-up clears it first.",
  all: "All",
  parcels: "Parcels",
  foodF: "Food",
  history: "HISTORY",
  todayH: "TODAY",
  yesterday: "YESTERDAY",
  loadsMore: "Older entries load as you scroll",
  lFare: "Fare · cash",
  lComm: "Commission",
  lReturned: "Returned to kitchen",
  /** Drawn in the mock's ledger sample rows (rv-money.jsx LEDGER). */
  fromBalance: "From balance",
  lParcel: "Parcel",
  lFood: "Food",
  toBalance: "To balance",
  emptyMoneyT: "No jobs yet today",
  emptyMoneyB: "Your earnings and commission show here after your first job.",
  /* top up */
  tTopUp: "Top up",
  tsProvider: "Provider",
  tsAmount: "Amount",
  tsPhone: "Phone",
  tsApprove: "Approve",
  provider: "Pay with",
  approveOnPhone: "Approve on your phone",
  amount: "Amount (USD)",
  phoneL: "Number for the payment prompt",
  phoneHint: "Prefilled from Settings. Change it if you'd pay from another line.",
  okT: "Top-up done",
  backMoney: "Back to Money",
  again: "Top up again",
  failT: "Top-up didn't go through",
  /* account */
  verified: "Verified",
  sideCustomer: "Customer",
  sideRider: "Rider",
  switchHint: "Rider side: you get jobs. Customer side: you don't.",
  standing: "YOUR STANDING",
  good: "Good",
  atRisk: "One strike from a pause",
  acceptance: "Acceptance",
  strikes: "Strikes",
  ratingK: "Rating",
  rJobHist: "Job history",
  rJobHistS: "Jobs you carried, with the fare",
  rTripHist: "Trip history",
  rTripHistS: "Orders you placed",
  rNotif: "Notifications",
  rHelp: "Help & support",
  rHelpS: "WhatsApp or call the safety line",
  rSettings: "Settings",
  rSettingsS: "Job alerts, location, top-up number",
  rSettingsC: "Language, payment, privacy",
  /*
   * The customer Account's Become-a-rider card while a check is under way (D-54 C-states). Its "none" state is
   * First Run v2 G2's violet card (`KY.become*`); the bodies below are the D-82 copy pass (I): `KY`'s times
   * ("about 2 min", "usually under a minute", "usually a few hours") and an in-app notification, never SMS.
   */
  kycProgT: "Finish verifying your ID",
  kycProgB: KY.unfBody,
  kycReviewT: "Your ID is under review",
  /** The automated check is with the vendor. */
  kycCheckingB: KY.checkBody,
  /** Held for a person, or manual (ops) review. */
  kycReviewB: KY.reviewBody,
  kycFailT: "We couldn't verify your ID",
  kycLockedT: "We still couldn't verify your ID",
  kycLockedB: KY.lockedBody,
  kycOkT: "You're verified",
  kycOkB: "Switch to Rider to start taking jobs.",
  continueKyc: "Continue",
  tryKyc: "Try again",
  swT: "Stop getting jobs?",
  swB: "In the customer view you won't get new jobs or food offers. Switch back any time from Account.",
  swGo: "Go to customer view",
  swStay: "Stay online as a rider",
  swJobT: "Your job keeps running",
  swJobBack: "Back to my job",
  /* history */
  tJobHist: "Job history",
  tTripHist: "Trip history",
  delivered: "Delivered",
  undelivered: "Undelivered",
  cancelled: "Cancelled",
  cancelledYou: "You cancelled",
  noFare: "No fare",
  tripsEmpty: "Orders you place show here.",
  /* settings */
  tSettings: "Settings",
  secAccount: "YOUR ACCOUNT",
  secCustomer: "CUSTOMER",
  secRider: "RIDER",
  sLang: "Language",
  sLangV: "English",
  sPrivacy: "Privacy notice",
  sTerms: "Terms & conditions",
  sSignOut: "Sign out",
  sDelete: "Delete account",
  sDeleteS: "Removes your account and history. Can't be undone.",
  sPay: "Payment",
  sPayV: "Cash",
  sNotifC: "Order updates",
  sNotifCOff: "Off · You won't hear when a rider offers or when your parcel arrives.",
  sAlerts: "Job alerts",
  sOn: "On",
  sOff: "Off",
  sAlertsS: "New-job ping and the food-offer alarm",
  testPing: "Test ping",
  testAlarm: "Test alarm",
  sAlertsOff: "Notifications are off. You won't get new jobs.",
  sLoc: "Location",
  sLocV: "While using",
  sLocS: "Must be on to receive jobs. Customers see you only during a job.",
  sLocOff: "Location is off. You can't receive jobs.",
  sNav: "Navigation app",
  sNavS: "Opens for pickups and drop-offs",
  gmaps: "Google Maps",
  waze: "Waze",
  sTopNum: "Top-up number",
  sBike: "Bike & documents",
  sBikeV: "Verified",
  sOpenSettings: "Open phone settings",
  /** Not drawn: the Top-up number edit sheet's button (ledger D-54 §4). */
  save: "Save",
  /* bike & docs */
  tBike: "Bike & documents",
  docId: "National ID",
  docPhoto: "Rider photo",
  /** D-62 (owner 2026-10-02): the photo is optional; app-authored until the add-photo screen is drawn. */
  docPhotoNone: "Not added yet",
  docBike: "Bike",
  bikeChange: "Changed bikes? Re-verify with the new plate.",
  reverifyBike: "Re-verify my bike",
  /* D-79 (owner 2026-10-06): adding the photo and plate that R1/R3 say can wait. Not drawn. */
  docPhotoAdd: "Add photo",
  docPhotoChange: "Change",
  docPhotoBody: "A clear, recent photo of your face, on its own.",
  docPhotoGallery: "Choose from gallery",
  docPhotoDenied: "Allow camera and photo access in your phone's settings, then try again.",
  docPhotoErr: "Couldn't save your photo. Check your connection and try again.",
  docBikeAdd: "Add plate",
  docBikeSheet: "Your bike's number plate",
  docBikeLabel: "Number plate",
  docBikeHint: "As it's written on the plate, like AEE 4471.",
  docBikeErr: "Couldn't save your plate. Check your connection and try again.",
  /* D-79 (owner 2026-10-06): Personal details. Row label and sub are the handoff's (mint2.js Account). */
  sPersonal: "Personal details",
  sPersonalS: "Name, phone, optional ID",
  tPersonal: "Personal details",
  pdIdLabel: "National ID (optional)",
  pdIdNote: "Only if you want to add it. We keep it private and only use it to confirm who you are.",
  pdIdVerifiedNote: "This came from your ID check. To change it, contact support.",
  pdIdRemove: "To remove your national ID, contact support.",
  pdLoadErr: "Couldn't load your details. Check your connection and try again.",
  pdSaveErr: "Couldn't save your details. Check your connection and try again.",
  /* help */
  tHelp: "Help & support",
  hWa: "Message us on WhatsApp",
  hWaS: "Usually replies in 10 minutes, 7am–9pm",
  hCall: "Call LyniaGo support",
  hSafety: "Call the safety line",
  hSafetyS: "24 hours, for riders in danger",
  hFaq: "Common questions",
  hF1: "When does commission come off?",
  hF2: "How do strikes work?",
  hF3: "What if the customer doesn't pay?",
  tNotif: "Notifications",
} as const;

/** "$3.20" — two decimals, no thousands separator (fares and balances stay small). */
export const usd = (n: number): string => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
/** Credits read "+$3.20" (green), debits "−$0.32" (ink, U+2212). */
export const signedUsd = (n: number): string => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(2)}`;
export const km = (n: number): string => `${n.toFixed(1)} km`;
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
/** "14:20" in the phone's local time. */
export const hhmm = (d: Date): string => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "19 Oct" */
export const dayMonth = (d: Date): string => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
/** "30 Sep 2026" */
export const dayMonthYear = (d: Date): string => `${dayMonth(d)} ${d.getFullYear()}`;
/** "Mar 2028" */
export const monthYear = (d: Date): string => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
/** "1 h 12 min" / "12 min" */
export const hMin = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
};

/** The handoff's sample-valued strings, as formatters. */
export const RF = {
  greeting: (phrase: string, name?: string | null): string => (name ? `${phrase}, ${name}` : phrase),
  nearYou: (n: number): string => (n === 1 ? "1 parcel near you" : `${n} parcels near you`),
  /** Undrawn: the count when the board mixes parcels with food or shop jobs (owner 2026-10-01). */
  jobsNearYou: (n: number): string => (n === 1 ? "1 job near you" : `${n} jobs near you`),
  busyLine: (place: string, kmAway: number): string => `Busier near ${place} · ${km(kmAway)} from you`,
  /** Owner 2026-10-02 (ledger D-60): the handoff's "Most jobs come in 7–9am and 5–7pm." is cut. */
  whyQuietB: (place: string): string => `It's quiet around ${place} right now.`,
  picked: (customer: string): string => `${customer} picked you!`,
  pickedB: (from: string, to: string, fare: number): string => `${from} → ${to} · ${usd(fare)} cash`,
  notChosen: (customer: string): string => `${customer} chose another rider. Your offer is closed.`,
  bidExpired: (customer: string): string => `${customer} didn't choose in time. Your offer is closed.`,
  senderAsking: (customer: string): string => `${customer} is asking`,
  band: (lo: number, hi: number, tripKm: number): string => `Riders usually get ${usd(lo)}–${usd(hi)} for ${km(tripKm)}`,
  overB: (customer: string): string => `That's well above what riders usually get. ${customer} may pick someone cheaper.`,
  oneOffer: (customer: string): string => `One offer per job. You can withdraw it until ${customer} chooses.`,
  sendOffer: (fare: number): string => `Send offer · ${usd(fare)}`,
  pickupTrip: (toPickupKm: number, tripKm: number): string => `${km(toPickupKm)} to pickup · ${km(tripKm)} trip`,
  tripItem: (tripKm: number | null, item: string): string => (tripKm != null ? `${km(tripKm)} trip · ${item}` : item),
  etaChip: (m: number): string => `${m} min`,
  /* gates */
  gCoolV: (until: Date, now: Date): string => `${hhmm(until)} · ${hMin(until.getTime() - now.getTime())} left`,
  gSuspB: (until: Date | null): string =>
    // D-82 §4 (owner 2026-10-06): the server sends no SMS on a suspension — it sends a push and pins an
    // "Account paused" row with the reason in Notifications (admin-riders.service suspend, notifications-feed).
    until ? `You can't take jobs until ${dayMonth(until)}. The details are in your notifications.` : "You can't take jobs right now. The details are in your notifications.",
  gSuspV: (until: Date): string => `${dayMonthYear(until)}, ${hhmm(until)}`,
  gTopB: (floor: number): string => `Your commission balance is below the ${usd(floor)} floor. Top up and jobs show again straight away.`,
  /* food offer */
  foodMeta: (toPickupKm: number | null, tripKm: number | null): string =>
    [toPickupKm != null ? `${km(toPickupKm)} to pickup` : null, tripKm != null ? `${km(tripKm)} trip` : null].filter(Boolean).join(" · "),
  payKitchenB: (pay: number, collect: number): string =>
    `You pay the kitchen ${usd(pay)} at pickup and collect ${usd(collect)} at the door. ${usd(pay)} of that goes back to the kitchen.`,
  left: (s: number): string => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")} left`,
  /* active job */
  away: (distKm: number, mins: number): string => `${km(distKm)} · about ${mins} min`,
  who: (name: string, role: "sender" | "recipient" | "customer"): string => `${name} · ${role}`,
  callName: (name: string): string => `Call ${name}`,
  cashParcel: (fare: number): string => `Collect ${usd(fare)} cash at drop-off. It's yours.`,
  codeT: (recipient: string): string => `Ask ${recipient} for the delivery code`,
  codeB: "The 6-digit code proves you handed it over. Hand over the parcel only after it's accepted.",
  triesLeft: (n: number): string => `Wrong code. ${n} tries left.`,
  triesLast: (recipient: string): string => `Wrong code. 1 try left — check every digit with ${recipient}.`,
  lockedB: (sender: string, recipient: string): string => `Ask ${sender} to send ${recipient} a new code. Keep the parcel until it arrives.`,
  askResend: (sender: string): string => `Call ${sender} to re-send`,
  newCodeWait: (sender: string): string => `The new code works here as soon as ${sender} sends it.`,
  rateSender: (name: string): string => `How was ${name}?`,
  payNow: (pay: number): string => `Pay the kitchen ${usd(pay)} now`,
  collectFood: (collect: number): string => `Collect ${usd(collect)} cash at the door`,
  collectFoodB: (yours: number, owed: number): string => `${usd(yours)} is yours. ${usd(owed)} goes back to the kitchen.`,
  returnT: (owed: number, kitchen: string): string => `Return ${usd(owed)} to ${kitchen}`,
  /** Order flow v2 RD4a/RD4b (ledger D-59): `O.rd.door2`, `O.rd.door2Btn`, `O.rd.door3Sub`, and the door
   *  card's drawn sub-lines ("Handed over 12:46", "Both confirmed 12:47" in of-screens-mrg.js `rdDoor`). */
  door2: (collect: number): string => `Collect ${usd(collect)} cash`,
  door2Btn: (collect: number): string => `I received ${usd(collect)}`,
  door3Sub: (customer: string): string => `${customer} says it after you both confirm the cash`,
  handedOver: (at: string): string => `Handed over ${at}`,
  bothConfirmed: (at: string): string => `Both confirmed ${at}`,
  /** Order flow v2 RD3's drawn sub-line under "I saw the original prescription" (of-screens-mrg.js). */
  rxName: (name: string): string => `Name on it: ${name}`,
  kitchenReady: (orderNo: string, mins: number | null): string => (mins != null && mins > 0 ? `Order #${orderNo} · ready in about ${mins} min` : `Order #${orderNo}`),
  /* exceptions */
  reachT: (name: string): string => `${name} isn't answering`,
  reachWait: (elapsedS: number): string => `Waited ${Math.floor(elapsedS / 60)}:${String(elapsedS % 60).padStart(2, "0")} of 8:00`,
  reachCalls: (calls: number, wa: number): string => `${plural(calls, "call", "calls")} · ${wa} WhatsApp`,
  undelNext: (sender: string): string => `Keep the parcel safe. We'll tell ${sender} and help you agree how to return it.`,
  undelDoneB: (sender: string): string => `${sender} has been told. Call to agree how to get the parcel back to them.`,
  cxB: (customer: string): string => `${customer} goes back to finding a rider. Cancelling counts as a strike.`,
  cxStrike: (used: number, max: number): string => `${used} of ${max} strikes used. ${max} in 30 days pauses jobs for 24 hours.`,
  custCxT: (customer: string): string => `${customer} cancelled the order`,
  custCxB: (customer: string): string => `Nothing to do. If you already have the parcel, call ${customer} to hand it back.`,
  restored: (stageLine: string): string => `Job restored. You were ${stageLine}.`,
  /* money */
  jobs: (n: number): string => plural(n, "job", "jobs"),
  parcelsN: (n: number): string => plural(n, "parcel", "parcels"),
  foodN: (n: number): string => `${n} food`,
  balanceB: (ratePct: number, floor: number): string => `${ratePct}% comes off when a job closes. Below ${usd(floor)} you can't take jobs.`,
  floorB: (floor: number): string => `Below the ${usd(floor)} floor. Top up to keep riding.`,
  pendingOk: (amt: number): string => `Your ${usd(amt)} top-up went through while the app was closed.`,
  pendingWait: (provider: string, amt: number): string => `Waiting for ${provider} to confirm your ${usd(amt)} top-up…`,
  pendingFail: (amt: number): string => `Your ${usd(amt)} top-up didn't go through. Nothing was taken.`,
  cashOnly: (amt: number): string => `Cash with you now: ${usd(amt)}. It's all yours.`,
  lTop: (provider: string): string => `Top-up · ${provider}`,
  lMeta: (kind: string, time: string): string => `${kind} · ${time}`,
  /* top up */
  amountHint: (amount: number, ratePct: number, avgFare: number | null): string =>
    ratePct > 0 && avgFare != null && avgFare > 0
      ? `Suggested: ${usd(amount)} covers about ${Math.max(1, Math.floor(amount / ((avgFare * ratePct) / 100)))} jobs at ${ratePct}%.`
      : `Suggested: ${usd(amount)}.`,
  requestCta: (amount: number): string => `Request ${usd(amount)}`,
  waitT: (amount: number): string => `Approve ${usd(amount)} on your phone`,
  waitB: (provider: string, phone: string): string => `Check for the ${provider} prompt or SMS on ${phone} and enter your PIN.`,
  okB: (amount: number, balance: number | null): string =>
    balance != null ? `${usd(amount)} added. Your balance is ${usd(balance)}.` : `${usd(amount)} added.`,
  failB: (provider: string): string => `The prompt timed out or was declined. Nothing was taken from your ${provider}.`,
  /* account */
  ratingLine: (rating: number | null, jobs: number): string =>
    rating != null ? `${rating.toFixed(1)} · ${plural(jobs, "job", "jobs")}` : plural(jobs, "job", "jobs"),
  acceptanceV: (pct: number | null): string => (pct != null ? `${Math.round(pct)}%` : "—"),
  ratingV: (r: number | null): string => (r != null ? `${r.toFixed(1)} ★` : "—"),
  strikesV: (used: number, max: number): string => `${used} of ${max}`,
  standingB: (max: number, clears: Date | null): string =>
    `Strikes come from cancelling after you accept. ${max} in 30 days pauses jobs for 24 hours.${clears ? ` Your oldest strike clears on ${dayMonth(clears)}.` : ""}`,
  standingRisk: (used: number, max: number, clears: Date | null): string =>
    `${used} of ${max} strikes. One more cancel in the next 30 days pauses jobs for 24 hours.${clears ? ` Your oldest strike clears on ${dayMonth(clears)}.` : ""}`,
  rNotifS: (n: number): string => (n > 0 ? `${n} new` : "All caught up"),
  kycFailB: (left: number): string => `The ID photo was blurry. You have ${plural(left, "try", "tries")} left.`,
  /** Undrawn (R-6; ledger D-54 §4): the Account card's body for a known decline reason (`kycFailB` stays the default). */
  kycFailWhyB: (reason: string, left: number): string => `${reason}. You have ${plural(left, "try", "tries")} left.`,
  swJobB: (from: string, to: string): string => `You're still carrying ${from} → ${to}. Come back to it from the bar at the top of Home.`,
  swJobBar: (stage: string): string => `Job in progress · ${stage}`,
  /* history */
  histWeek: (jobs: number, earned: number): string => `This week · ${plural(jobs, "job", "jobs")} · ${usd(earned)} earned`,
  /* settings */
  sTopNumV: (provider: string, phone: string): string => `${provider} · ${phone}`,
  sBikeS: (plate: string, idExpires: Date | null): string => (idExpires ? `${plate} · ID expires ${monthYear(idExpires)}` : plate),
  hCallS: (phone: string): string => `${phone} · 7am–9pm`,
};

/**
 * First Run v2 F (ledger D-82): the two `KY` strings that carry data. `KY.expBody` is drawn with a sample date
 * ("Expired 2 Oct 2026. Re-verify to keep riding.") — the date is the rider's, and until the server serves it
 * (NEEDS BACKEND `kycExpiredAt`, D-82 §4) the sentence after it stands alone. F3's title is "Almost there,"
 * + the rider's first name.
 */
export const KYF = {
  expBody: (d: Date | null): string => (d ? KY.expBody.replace(/^Expired [^.]+\./, `Expired ${dayMonthYear(d)}.`) : KY.expBody.replace(/^Expired [^.]+\.\s*/, "")),
  unfName: (firstName: string | null | undefined): string => firstName?.trim() ?? "",
};
