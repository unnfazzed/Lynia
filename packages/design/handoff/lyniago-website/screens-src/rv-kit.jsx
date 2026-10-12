/* Rider v2 — shared parts + every user-facing string (R). Builds on sc2-kit.jsx (MapBox, MapPin, Dot, Sq, Notice, lbl, fieldLbl) and as-kit.jsx (AFrame, AHeader, Sheet, Bar, GBtn, SmBtn, AIc, RiderMarker, Countdown, Progress, Avatar, Verified, IconDisc, AToast, Tags, KV). Tokens only. */
(function addIcons() {
  const L = window.lucide && window.lucide.icons; if (!L) return;
  Object.assign(L, {
    Settings: [["path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }], ["circle", { cx: 12, cy: 12, r: 3 }]],
    LogOut: [["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }], ["path", { d: "m16 17 5-5-5-5" }], ["path", { d: "M21 12H9" }]],
    Globe: [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" }], ["path", { d: "M2 12h20" }]],
    FileText: [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M16 13H8" }], ["path", { d: "M16 17H8" }]],
    Lock: [["rect", { x: 3, y: 11, width: 18, height: 11, rx: 2 }], ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }]],
    ArrowLeftRight: [["path", { d: "M8 3 4 7l4 4" }], ["path", { d: "M4 7h16" }], ["path", { d: "m16 21 4-4-4-4" }], ["path", { d: "M20 17H4" }]],
    Siren: [["path", { d: "M7 18v-6a5 5 0 1 1 10 0v6" }], ["path", { d: "M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z" }], ["path", { d: "M21 12h1" }], ["path", { d: "M18.5 4.5 18 5" }], ["path", { d: "M2 12h1" }], ["path", { d: "M12 2v1" }], ["path", { d: "m4.9 4.9.7.7" }]],
    Hourglass: [["path", { d: "M5 22h14" }], ["path", { d: "M5 2h14" }], ["path", { d: "M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22" }], ["path", { d: "M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2" }]],
    Download: [["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }], ["path", { d: "m7 10 5 5 5-5" }], ["path", { d: "M12 15V3" }]],
    Smartphone: [["rect", { x: 5, y: 2, width: 14, height: 20, rx: 2 }], ["path", { d: "M12 18h.01" }]],
    PhoneOff: [["path", { d: "M10.1 13.9a14 14 0 0 0 3.73 2.67 1 1 0 0 0 1.21-.3l.36-.47A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.47.35a1 1 0 0 0-.29 1.23" }], ["path", { d: "M22 2 2 22" }]],
    Delete: [["path", { d: "M10 5a2 2 0 0 0-1.34.52l-5.6 5.03a2 2 0 0 0 0 2.9l5.6 5.03A2 2 0 0 0 10 19h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" }], ["path", { d: "m12 9 6 6" }], ["path", { d: "m18 9-6 6" }]],
  });
})();

/* ───── Every user-facing string. Ships verbatim. Names, prices, places and times are sample data. ───── */
const R = {
  /* shell */
  tabJobs: "Jobs", tabMoney: "Money", tabAccount: "Account", tabHome: "Home", tabOrders: "Orders",
  morning: "Good morning, Tendai", online: "Online", reconnecting: "Reconnecting…", you: "You",
  /* board */
  nearYou: "4 parcels near you", nearYou1: "1 parcel near you", nearest: "Nearest first",
  busy: "Busy now", busyLine: "Busier near Copacabana Rank · 2.1 km from you",
  foodRings: "Food jobs ring full screen. Keep LyniaGo open.",
  parcel: "PARCEL", food: "FOOD", toPickup: "to pickup", trip: "trip", asking: "asking",
  makeOffer: "Make an offer", offerSent: "Offer sent", withdraw: "Withdraw", waitingCustomer: "Waiting for the customer to choose",
  yourOffers: "YOUR OFFERS", nearbyJobs: "NEARBY JOBS",
  emptyT: "Nothing in range yet",
  emptyB: "You'll see parcels here the moment they're posted near you. Jobs that get taken simply leave the list.",
  emptyFood: "Food offers ring full screen when a kitchen near you needs a rider.",
  whyQuiet: "Why no jobs?", whyQuietB: "It's quiet around Samora Machel Ave right now. Most jobs come in 7–9am and 5–7pm.",
  staleB: "Reconnecting… Jobs may be a minute behind. We'll update the list as soon as you're back.",
  loadFail: "Couldn't load nearby jobs. Trying again in 10 s.",
  notifOff: "Notifications are off. You won't get new jobs or food offers.", turnOn: "Turn on",
  picked: "Rudo picked you!", pickedB: "Eastgate Mall → 14 Glenara Ave · $3.20 cash", openJob: "Open job",
  notChosen: "Rudo chose another rider. Your offer is closed.",
  taken: "That parcel was taken by another rider.",
  bidExpired: "Rudo didn't choose in time. Your offer is closed.",
  withdrawn: "Offer withdrawn.", undo: "Undo",
  /* make an offer */
  tOffer: "Make an offer", senderAsking: "Rudo is asking", yourFare: "Your fare", tapType: "Tap the fare to type an amount",
  minus: "− $0.50", plus: "+ $0.50", band: "Riders usually get $2.80–$3.60 for 3.1 km",
  overB: "That's well above what riders usually get. Rudo may pick someone cheaper.",
  thereIn: "You'll be there in", min: "min",
  etaHint: "Be honest. Arriving late is what loses you the next job.",
  oneOffer: "One offer per job. You can withdraw it until Rudo chooses.",
  sendOffer: "Send offer · $3.20", sending: "Sending…", skip: "Skip this job",
  sendFail: "Couldn't send your offer. Check your data.", tryAgain: "Try again",
  /* gates — [title, body] + facts + actions */
  gNotRiderT: "Earn with your bike", gNotRiderB: "Verify your ID and bike once, then take parcel and food jobs near you.", becomeRider: "Become a rider",
  gPendingT: "Your ID is under review", gPendingB: "We're checking your ID and bike photo. Most checks finish within a few hours.", gPendingK: "Sent", gPendingV: "Today, 08:12",
  gUnfinishedT: "Finish verifying your ID", gUnfinishedB: "You started the ID check but didn't finish. It takes about 3 minutes.", finishId: "Finish verifying",
  gFailedT: "We couldn't verify your ID", gFailedB: "The photo of your ID was blurry. Try again in good light, with all four corners showing.", gFailedK: "Tries left", gFailedV: "1 of 2",
  gFailed2T: "We still couldn't verify your ID", gFailed2B: "You've used both tries. Our team will check your documents with you on WhatsApp.",
  gExpiredT: "Your ID has expired", gExpiredB: "Your national ID expired on 30 Sep 2026. Re-verify to keep taking jobs.", reverify: "Re-verify my ID",
  gCantOpenT: "We couldn't open the ID check", gCantOpenB: "The ID check needs a data connection and your camera. Check both, then try again.",
  gGpsT: "Can't find your location", gGpsB: "Jobs are matched by distance, so location must be on while you ride.", openLoc: "Open location settings", gpsOn: "I've turned it on",
  gAreaT: "You're outside the service area", gAreaB: "LyniaGo works in Harare for now. Jobs show again as soon as you're back inside.", gAreaK: "Nearest edge", gAreaV: "Chitungwiza · 4.2 km",
  gCoolT: "You're on a cooldown", gCoolB: "You cancelled 3 jobs in 30 days. You can take jobs again when the timer ends.", gCoolK: "Clears at", gCoolV: "14:20 · 1 h 12 min left",
  gHoldT: "Your account is on hold", gHoldB: "We need to check something on your account before you take jobs. Call us and we'll sort it out.", gHoldK: "Reason", gHoldV: "Customer report under review",
  gSuspT: "Your account is suspended", gSuspB: "You can't take jobs until 8 Oct. Our team sent the details by SMS.", gSuspK: "Until", gSuspV: "8 Oct 2026, 00:00",
  gBanT: "Your account is closed for riding", gBanB: "You can still order food and send parcels as a customer.",
  gTopT: "Top up to keep riding", gTopB: "Your commission balance is below the $2.00 floor. Top up and jobs show again straight away.", gTopK: "Balance", gTopV: "$0.60", gTopK2: "Top up at least", gTopV2: "$1.40",
  goTopUp: "Top up now",
  gUpdateT: "Update LyniaGo to keep riding", gUpdateB: "This version can't take jobs any more. The update is about 18 MB.", update: "Update now",
  callSupport: "Call support", whatsappSupport: "Message support on WhatsApp", customerBridge: "Order food and send parcels",
  /* food offer */
  tFoodOffer: "New food job", foodFrom: "Mama's Kitchen, Avondale", foodTo: "22 King George Rd, Avondale", foodMeta: "1.1 km to pickup · 3.2 km trip",
  foodFare: "Your fare", payKitchen: "Pay the kitchen", collectDoor: "Collect at the door",
  payKitchenB: "You pay the kitchen $12.50 at pickup and collect $15.70 at the door. $12.50 of that goes back to the kitchen.",
  accept: "Accept this job", pass: "Not this one", passHint: "Passing or missing a food offer doesn't affect your standing.",
  expT: "That one went to another rider", expB: "Food offers hold for 60 seconds, then move to the next rider nearby. Passing or missing one doesn't affect your standing.", backBoard: "Back to jobs",
  /* active job — titles */
  tToPickup: "Heading to pickup", tAtPickup: "At pickup", tPhoto: "Pickup photo", tToDrop: "Heading to drop-off", tArriving: "Arriving now", tDone: "Job done",
  tToKitchen: "Heading to the kitchen", tAtKitchen: "At the kitchen", tReturn: "Return the cash",
  stPickup: "Pickup", stCollected: "Collected", stDrop: "Drop-off", stDone: "Done",
  pickupL: "PICKUP", dropL: "DROP-OFF", sender: "Rudo K. · sender", recipient: "Chipo M. · recipient", customer: "Nyasha D. · customer", kitchen: "Mama's Kitchen",
  call: "Call", whatsapp: "WhatsApp", navigate: "Navigate",
  away4: "0.8 km · about 4 min", away12: "3.1 km · about 12 min", here: "You're here",
  atPickupCta: "I'm at pickup", atKitchenCta: "I'm at the kitchen", callKitchen: "Call the kitchen", callRudo: "Call Rudo", collectedCta: "I've collected the parcel", atDropCta: "I'm at the drop-off", confirmCta: "Confirm delivery",
  checkItems: "Check before you leave", item1: "Documents envelope × 1", photoNeed: "Take a pickup photo", photoNeedB: "Shows the parcel as you got it. The customer can see it.",
  takePhoto: "Take photo", retake: "Retake", usePhoto: "Use this photo", photoUploading: "Saving photo…",
  photoFail: "Photo didn't upload. It's saved on your phone; we'll send it when you have data.", photoSaved: "Photo saved",
  needPhoto: "Tick the item and add a photo to continue.",
  problem: "Problem with this job?",
  cashParcel: "Collect $3.20 cash at drop-off. It's yours.",
  yours: "YOURS", owed: "OWED TO KITCHEN", cashNow: "Cash with you now",
  codeT: "Ask Chipo for the delivery code", codeB: "The 6-digit code proves you handed it over. Hand over the parcel only after it's accepted.",
  codeL: "DELIVERY CODE", triesLeft: "Wrong code. 4 tries left.", triesLast: "Wrong code. 1 try left — check every digit with Chipo.",
  lockedT: "Code locked after 5 tries", lockedB: "Ask Rudo to send Chipo a new code. Keep the parcel until it arrives.",
  askResend: "Call Rudo to re-send", newCodeWait: "The new code works here as soon as Rudo sends it.",
  doneT: "Delivered. Nice work.", doneEarn: "You earned", doneCash: "Cash collected · yours", doneComm: "Commission from balance",
  rateSender: "How was Rudo?", rateSkip: "Skip", rateSubmit: "Submit rating", nextJobs: "Back to jobs",
  /* food active */
  kitchenReady: "Order #4471 · ready in about 5 min", payNow: "Pay the kitchen $12.50 now", paidCta: "I've paid and collected the food",
  collectFood: "Collect $15.70 cash at the door", collectFoodB: "$3.20 is yours. $12.50 goes back to the kitchen.",
  returnT: "Return $12.50 to Mama's Kitchen", returnB: "Hand the cash to the counter. They confirm it in their app and this job closes.", returnWait: "Waiting for the kitchen to confirm…",
  /* problem sheet */
  probT: "What's wrong?", probSub: "Your job keeps running while you're here.",
  pReach: "Can't reach the customer", pReachS: "Call, wait, then mark it undelivered",
  pDeliver: "Can't deliver", pDeliverS: "Refused, wrong address, or something else",
  pCancel: "Cancel this job", pCancelS: "Before pickup only. Counts as a strike",
  pDrop: "Drop this job", pDropS: "Food only, before the kitchen hands it over",
  pHelp: "Get help from LyniaGo", pHelpS: "WhatsApp or call our team",
  pReport: "Report the customer", pReportS: "Rude, unsafe, or asked for something odd",
  sos: "Emergency? Call 999", sosS: "Police, ambulance or fire. We'll tell our safety team.",
  close: "Close",
  /* exceptions */
  reachT: "Chipo isn't answering", reachB: "Try twice more. If there's still no answer after 10 minutes, you can mark it undelivered.",
  reachWait: "Waited 6:40 of 10:00", reachCalls: "2 calls · 1 WhatsApp", markUndel: "Mark undelivered", undelHint: "Available after 10 minutes of trying.",
  undelT: "Why can't you deliver?", u1: "Recipient didn't answer", u2: "Recipient refused it", u3: "Wrong address", u4: "Bike broke down", u5: "Other",
  undelNext: "Keep the parcel safe. We'll tell Rudo and help you agree how to return it.", undelSend: "Send", undelPick: "Pick a reason to continue.",
  undelDoneT: "Marked undelivered", undelDoneB: "Rudo has been told. Call to agree how to get the parcel back to them.", undelNoStrike: "This doesn't count against you.",
  cxT: "Cancel this job?", cxB: "Rudo goes back to finding a rider. Cancelling counts as a strike.",
  cxStrike: "1 of 3 strikes used. 3 in 30 days pauses jobs for 24 hours.",
  cxFinal: "You're one strike from a pause. Cancelling now pauses jobs for 24 hours.",
  cxKeep: "Keep the job", cxYes: "Cancel job", cxYesFinal: "Cancel and pause",
  dropT: "Drop this food job?", dropB: "We'll offer it to the next rider. The kitchen hasn't handed the food over yet.", dropYes: "Drop job",
  custCxT: "Rudo cancelled the order", custCxB: "Nothing to do. If you already have the parcel, call Rudo to hand it back.", custCxNoStrike: "This doesn't count against you.",
  offlineJob: "No connection. Your job is saved on this phone — keep riding.",
  offlineLong: "Still offline after 4 min. Your job is safe. The delivery code works without data; it syncs when you're back.",
  offlineCode: "Saved. Syncs when you're back online.",
  restored: "Job restored. You were heading to the drop-off.",
  sosT: "Call 999?", sosB: "This calls the emergency line and tells our safety team where you are.", sosCall: "Call 999", sosCancel: "Not now",
  helpSent: "Our team will call you within 5 minutes. Your job keeps running.",
  /* money */
  earnings: "EARNINGS", today: "Today", week: "This week", jobs6: "6 jobs", jobs31: "31 jobs", earnHint: "Fares you were paid, before commission.",
  balanceL: "COMMISSION BALANCE", balanceB: "10% comes off when a job closes. Below $2.00 you can't take jobs.", balanceB0: "Commission is 0% right now. You keep the full fare.",
  topUp: "Top up", lowB: "Getting low. Top up soon so you don't miss jobs.", floorB: "Below the $2.00 floor. Top up to keep riding.", owesB: "You owe this. Your next top-up clears it first.",
  pendingOk: "Your $5.00 top-up went through while the app was closed.", pendingWait: "Waiting for EcoCash to confirm your $5.00 top-up…", pendingFail: "Your $5.00 top-up didn't go through. Nothing was taken.",
  all: "All", parcels: "Parcels", foodF: "Food",
  history: "HISTORY", todayH: "TODAY", yesterday: "YESTERDAY", loadsMore: "Older entries load as you scroll",
  lFare: "Fare · cash", lComm: "Commission", lTop: "Top-up · EcoCash", lReturned: "Returned to kitchen",
  emptyMoneyT: "No jobs yet today", emptyMoneyB: "Your earnings and commission show here after your first job.",
  /* top up */
  tTopUp: "Top up", tsProvider: "Provider", tsAmount: "Amount", tsPhone: "Phone", tsApprove: "Approve",
  provider: "Pay with", approveOnPhone: "Approve on your phone", amount: "Amount (USD)", amountHint: "Suggested: $5.00 covers about 16 jobs at 10%.",
  phoneL: "Number for the payment prompt", phoneHint: "Prefilled from Settings. Change it if you'd pay from another line.",
  requestCta: "Request $5.00", waitT: "Approve $5.00 on your phone", waitB: "Check for the EcoCash prompt or SMS on +263 77 245 1180 and enter your PIN.", waitLeft: "1:12 left",
  okT: "Top-up done", okB: "$5.00 added. Your balance is $12.60.", backMoney: "Back to Money", again: "Top up again",
  failT: "Top-up didn't go through", failB: "The prompt timed out or was declined. Nothing was taken from your EcoCash.",
  /* account */
  rating: "4.9", jobsDone: "312 jobs", verified: "Verified", custSince: "Customer since Mar 2025", ordersN: "18 orders",
  sideCustomer: "Customer", sideRider: "Rider",
  switchHint: "Rider side: you get jobs. Customer side: you don't.",
  standing: "YOUR STANDING", good: "Good", atRisk: "One strike from a pause",
  acceptance: "Acceptance", acceptanceV: "92%", strikes: "Strikes", strikesV: "1 of 3", ratingK: "Rating", ratingV: "4.9 ★",
  standingB: "Strikes come from cancelling after you accept. 3 in 30 days pauses jobs for 24 hours. Your oldest strike clears on 19 Oct.",
  standingRisk: "2 of 3 strikes. One more cancel in the next 30 days pauses jobs for 24 hours. Your oldest strike clears on 19 Oct.",
  rJobHist: "Job history", rJobHistS: "Jobs you carried, with the fare", rTripHist: "Trip history", rTripHistS: "Orders you placed",
  rNotif: "Notifications", rNotifS: "3 new", rHelp: "Help & support", rHelpS: "WhatsApp or call the safety line", rSettings: "Settings", rSettingsS: "Job alerts, location, top-up number",
  rSettingsC: "Language, payment, privacy",
  becomeT: "Earn with your bike", becomeB: "Take parcel and food jobs near you. You'll need your national ID, your bike and 5 minutes.",
  kycProgT: "Finish verifying your ID", kycProgB: "2 of 3 steps done. Next: your bike photo.",
  kycReviewT: "Your ID is under review", kycReviewB: "Most checks finish within a few hours. We'll SMS you.",
  kycFailT: "We couldn't verify your ID", kycFailB: "The ID photo was blurry. You have 1 try left.",
  kycOkT: "You're verified", kycOkB: "Switch to Rider to start taking jobs.",
  continueKyc: "Continue", startKyc: "Start", tryKyc: "Try again",
  swT: "Stop getting jobs?", swB: "In the customer view you won't get new jobs or food offers. Switch back any time from Account.",
  swGo: "Go to customer view", swStay: "Stay online as a rider",
  swJobT: "Your job keeps running", swJobB: "You're still carrying Eastgate Mall → 14 Glenara Ave. Come back to it from the bar at the top of Home.",
  swJobBack: "Back to my job", swJobBar: "Job in progress · Heading to drop-off",
  /* history */
  tJobHist: "Job history", tTripHist: "Trip history", histWeek: "This week · 31 jobs · $86.20 earned",
  delivered: "Delivered", undelivered: "Undelivered", cancelled: "Cancelled", cancelledYou: "You cancelled", noFare: "No fare",
  tripsEmpty: "Orders you place show here.",
  /* settings */
  tSettings: "Settings", secAccount: "YOUR ACCOUNT", secCustomer: "CUSTOMER", secRider: "RIDER",
  sLang: "Language", sLangV: "English", sPrivacy: "Privacy notice", sTerms: "Terms & conditions", sSignOut: "Sign out", sDelete: "Delete account",
  sDeleteS: "Removes your account and history. Can't be undone.",
  sPay: "Payment", sPayV: "Cash", sNotifC: "Order updates", sNotifCOff: "Off · You won't hear when a rider offers or when your parcel arrives.",
  sAlerts: "Job alerts", sOn: "On", sOff: "Off", sAlertsS: "New-job ping and the food-offer alarm", testPing: "Test ping", testAlarm: "Test alarm",
  sAlertsOff: "Notifications are off. You won't get new jobs.",
  sLoc: "Location", sLocV: "While using", sLocS: "Must be on to receive jobs. Customers see you only during a job.",
  sLocOff: "Location is off. You can't receive jobs.",
  sNav: "Navigation app", sNavS: "Opens for pickups and drop-offs", gmaps: "Google Maps", waze: "Waze",
  sTopNum: "Top-up number", sTopNumV: "EcoCash · +263 77 245 1180",
  sBike: "Bike & documents", sBikeV: "Verified", sBikeS: "ABH 4721 · ID expires Mar 2028",
  sOpenSettings: "Open phone settings",
  /* bike & docs */
  tBike: "Bike & documents", docId: "National ID", docIdV: "Verified · expires 12 Mar 2028", docPhoto: "Rider photo", docPhotoV: "Verified · Aug 2026",
  docBike: "Bike", docBikeV: "Honda CG125 · ABH 4721", docLic: "Licence disc", docLicV: "Expires 30 Nov 2026",
  docSoon: "Your licence disc expires in 60 days. Renew it, then update the photo here.", updatePhoto: "Update photo",
  bikeChange: "Changed bikes? Re-verify with the new plate.", reverifyBike: "Re-verify my bike",
  /* help */
  tHelp: "Help & support", hWa: "Message us on WhatsApp", hWaS: "Usually replies in 10 minutes, 7am–9pm",
  hCall: "Call LyniaGo support", hCallS: "+263 242 700 100 · 7am–9pm", hSafety: "Call the safety line", hSafetyS: "24 hours, for riders in danger",
  hFaq: "Common questions", hF1: "When does commission come off?", hF2: "How do strikes work?", hF3: "What if the customer doesn't pay?",
  /* notifications inbox */
  tNotif: "Notifications",
};

const RD = {
  jobs: [
    { id: 1, a: "Eastgate Mall, CBD", b: "14 Glenara Ave, Avenues", to: "0.8 km", trip: "3.1 km", p: "$3.00", item: "Documents envelope", x: .30, y: .34 },
    { id: 2, a: "Fife Ave Shops", b: "Belgravia Shopping Centre", to: "1.4 km", trip: "2.6 km", p: "$2.50", item: "Shoebox × 2", x: .68, y: .22 },
    { id: 3, a: "Copacabana Rank, CBD", b: "Mbare Musika", to: "2.1 km", trip: "4.8 km", p: "$4.00", item: "Phone charger", x: .18, y: .70 },
    { id: 4, a: "Avondale Shops", b: "Mt Pleasant Business Park", to: "2.9 km", trip: "5.2 km", p: "$4.50", item: "Laptop bag", x: .82, y: .62 },
  ],
};

/* ───── geometry ───── */
const MT = 104, TAB = 60, RHDR = 77;

function RStatus({ bg = "var(--bg)" }) {
  return <div style={{ height: 24, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 12, fontWeight: 600, background: bg }} className="lynia-tabular"><span style={{ flex: 1 }}>09:41</span><span>3G 84%</span></div>;
}
function Conn({ state = "on" }) {
  if (state === "re") return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}><ASpin c="var(--muted)" s={12} />{R.reconnecting}</span>;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--accent-text)" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 0 3px #fff" }}></span>{R.online}</span>;
}
const Sun = ({ night }) => night ? <svg width="40" height="40" viewBox="0 0 64 64"><path d="M40 12a20 20 0 1 0 12 30A16 16 0 0 1 40 12Z" fill="var(--highlight)" /></svg>
  : <svg width="40" height="40" viewBox="0 0 64 64"><circle cx="32" cy="32" r="13" fill="var(--highlight)" /><g stroke="var(--highlight)" strokeWidth="4.5" strokeLinecap="round"><path d="M32 9v6M32 49v6M9 32h6M49 32h6M16 16l4.5 4.5M43.5 43.5 48 48M48 16l-4.5 4.5M20.5 43.5 16 48" /></g></svg>;
/* 8c mint top card for tab roots. Sub-row: honest connection state (no control) + detected location on Jobs. */
function MintTop({ W, conn = "on", loc, customer, name }) {
  const sm = W < 340;
  return <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: MT, background: "var(--accent-wash)", zIndex: 20 }}>
    <RStatus bg="var(--accent-wash)" />
    <div style={{ padding: "10px 12px 0 16px", display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: sm ? 18 : 22, fontWeight: 700, lineHeight: "28px", letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name || R.morning}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, height: 20, whiteSpace: "nowrap", overflow: "hidden" }}>
          {customer ? null : <Conn state={conn} />}
          {loc ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 13, fontWeight: 600, color: "var(--accent-text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{customer ? null : <span style={{ color: "var(--muted)" }}>·</span>}<AIc n="MapPin" s={13} c="var(--accent-text)" />{loc}</span> : null}
        </div>
      </div>
      {sm ? null : <Sun />}
      <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", flex: "none" }}><AIc n="Bell" s={19} c="var(--accent-text)" /><span style={{ position: "absolute", top: 10, right: 11, width: 8, height: 8, borderRadius: "50%", background: "var(--highlight)", border: "1.5px solid var(--bg)" }}></span></span>
    </div>
  </div>;
}
function TabBar({ tab = 0, customer }) {
  const t = customer ? [[R.tabHome, "Home"], [R.tabOrders, "Receipt"], [R.tabAccount, "User"]] : [[R.tabJobs, "Bike"], [R.tabMoney, "Wallet"], [R.tabAccount, "User"]];
  return <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: TAB, background: "var(--bg)", borderTop: "1px solid var(--line)", display: "flex", zIndex: 30, boxSizing: "border-box" }}>
    {t.map(([l, ic], i) => <div key={l} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, color: i === tab ? "var(--accent-text)" : "var(--muted)", fontSize: 12, fontWeight: i === tab ? 700 : 600 }}>
      <span style={{ width: 52, height: 26, borderRadius: 13, background: i === tab ? "var(--accent-wash)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}><AIc n={ic} s={20} c={i === tab ? "var(--accent-text)" : "var(--muted)"} /></span>{l}</div>)}
  </div>;
}
/* Scroll region; offset fakes a scrolled position for long screens. */
function Body({ top = MT, bottom = TAB, offset = 0, pad = "16px 16px 24px", gap = 12, bg, children }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top, bottom, overflow: "hidden", background: bg }}><div style={{ padding: pad, marginTop: -offset, display: "flex", flexDirection: "column", gap }}>{children}</div></div>;
}
/* Pinned CTA bar that can sit above the tab bar. */
function RBar({ bottom = 0, hint, row, children }) {
  return <div style={{ position: "absolute", left: 0, right: 0, bottom, background: "var(--bg)", padding: "10px 16px 12px", boxShadow: "var(--shadow-sheet)", zIndex: 25, display: "flex", flexDirection: "column", gap: 8 }}>
    {hint ? <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", lineHeight: "18px", textWrap: "pretty" }}>{hint}</div> : null}
    {row ? <div style={{ display: "flex", gap: 8 }}>{children}</div> : children}
  </div>;
}
const Lbl = ({ children, c, style }) => <div style={{ ...lbl, color: c || "var(--muted)", ...style }}>{children}</div>;
const JTag = ({ t }) => <span style={{ height: 20, display: "inline-flex", alignItems: "center", padding: "0 7px", borderRadius: 6, background: t === "food" ? "var(--surface)" : "var(--accent-wash)", color: t === "food" ? "var(--ink)" : "var(--accent-text)", border: t === "food" ? "1px solid var(--line)" : "none", boxSizing: "border-box", fontSize: 11, fontWeight: 700, letterSpacing: ".04em", flex: "none" }}>{t === "food" ? R.food : R.parcel}</span>;
const Stop = ({ k, name, s = 15, w = 600 }) => <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: s, fontWeight: w, lineHeight: "20px", minWidth: 0 }}>{k === "a" ? <Dot s={10} /> : <Sq s={10} />}<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span></div>;

/* Board job card. sel = matches the highlighted pin; offer = your sent offer. */
function JobCard({ j, sel, offer }) {
  return <div style={{ border: sel ? "2px solid var(--accent-text)" : "1px solid var(--line)", borderRadius: 12, padding: sel ? 11 : 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--bg)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <JTag t="parcel" /><span style={{ fontSize: 13, fontWeight: 600, flex: 1, whiteSpace: "nowrap" }} className="lynia-tabular">{j.to} <span style={{ color: "var(--muted)", fontWeight: 400 }}>{R.toPickup}</span></span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}><span style={{ fontSize: 20, fontWeight: 700, lineHeight: "24px" }} className="lynia-tabular">{offer ? "$3.20" : j.p}</span><span style={{ fontSize: 11, color: "var(--muted)", lineHeight: "14px" }}>{offer ? R.offerSent.toLowerCase() : R.asking}</span></span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><Stop k="a" name={j.a} s={14} /><Stop k="b" name={j.b} s={14} /></div>
    <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: "16px" }} className="lynia-tabular">{j.trip} {R.trip} · {j.item}</div>
    {offer ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink)" }}><ASpin c="var(--accent-text)" s={14} />{R.waitingCustomer}</span><SmBtn label={R.withdraw} icon="X" /></div>
      : <div style={{ display: "flex" }}><SmBtn kind="fill" flex={1} label={R.makeOffer} /></div>}
  </div>;
}

/* Board map: job pins (green pickup dot + fare pill), busy zones, "You". */
function BoardMap({ W, top, h, jobs = RD.jobs, sel = 0, zones = true, quiet }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top, height: h, overflow: "hidden" }}>
    <MapBox W={W} H={h}>
      {zones ? [[.18, .66, 62, quiet ? null : R.busy], [.84, .58, 44, null]].map(([x, y, r, l], i) => <div key={i} style={{ position: "absolute", left: x * W - r, top: y * h - r, width: r * 2, height: r * 2, borderRadius: "50%", background: "color-mix(in oklab, var(--accent) 16%, transparent)", border: "1.5px dashed var(--accent)", boxSizing: "border-box", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>{l ? <span style={{ marginBottom: -10, background: "var(--accent-text)", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: "var(--radius-pill)", padding: "2px 8px", whiteSpace: "nowrap" }}>{l}</span> : null}</div>) : null}
      {jobs.map((j, i) => <div key={j.id} style={{ position: "absolute", left: j.x * W, top: j.y * h, transform: "translate(-50%,-11px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, zIndex: i === sel ? 5 : 4 }}>
        <span style={{ width: i === sel ? 24 : 20, height: i === sel ? 24 : 20, borderRadius: "50%", background: "var(--accent)", border: "3px solid #fff", boxShadow: i === sel ? "0 0 0 3px var(--accent-text), var(--shadow-card)" : "var(--shadow-card)", boxSizing: "border-box" }}></span>
        <span style={{ background: i === sel ? "var(--ink)" : "var(--bg)", color: i === sel ? "#fff" : "var(--ink)", borderRadius: "var(--radius-pill)", padding: "2px 8px", fontSize: 12, fontWeight: 700, boxShadow: "var(--shadow-card)" }} className="lynia-tabular">{j.p}</span>
      </div>)}
      <RiderMarker x={W * .5} y={h * .48} label={R.you} />
    </MapBox>
  </div>;
}

/* Rider-side step track (same anatomy as After Send). */
function RSteps({ cur, labels = [R.stPickup, R.stCollected, R.stDrop, R.stDone] }) {
  return <div style={{ display: "flex" }}>{labels.map((l, i) => {
    const done = i < cur, now = i === cur;
    return <div key={l} style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
      {i > 0 ? <span style={{ position: "absolute", top: 8, left: 0, right: "50%", height: 3, background: i <= cur ? "var(--accent)" : "var(--line)" }}></span> : null}
      {i < labels.length - 1 ? <span style={{ position: "absolute", top: 8, left: "50%", right: 0, height: 3, background: i < cur ? "var(--accent)" : "var(--line)" }}></span> : null}
      <span style={{ position: "relative", width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, boxSizing: "border-box", background: done || now ? "var(--accent-text)" : "var(--surface)", color: done || now ? "#fff" : "var(--muted)", border: done || now ? "none" : "1px solid var(--line)", boxShadow: now ? "0 0 0 4px var(--accent-wash)" : "none" }}>{done ? <AIc n="Check" s={12} c="#fff" sw={3} /> : i + 1}</span>
      <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: now ? 700 : 600, color: now ? "var(--ink)" : done ? "var(--accent-text)" : "var(--muted)", whiteSpace: "nowrap" }}>{l}</span>
    </div>;
  })}</div>;
}
/* Job map: pickup/drop-off/route + "You". stage: pickup (dotted line to pickup) | drop (on route) | at (at drop-off) */
function JobMap({ W, top = RHDR, sheetTop, stage = "pickup", paused }) {
  const h = sheetTop - top + 18, a = [.28, .3], b = [.76, .62];
  const you = stage === "pickup" ? [.62 * W, .16 * h] : stage === "atA" ? [a[0] * W + 16, a[1] * h + 22] : stage === "at" ? [b[0] * W - 18, b[1] * h - 24] : [.54 * W, .5 * h];
  return <div style={{ position: "absolute", left: 0, right: 0, top, height: h, overflow: "hidden" }}>
    <MapBox W={W} H={h} a={a} b={b} route>
      {stage === "pickup" ? <svg width={W} height={h} style={{ position: "absolute", inset: 0, zIndex: 2 }}><path d={`M${you[0]} ${you[1]} Q ${you[0] - 30} ${a[1] * h - 10}, ${a[0] * W} ${a[1] * h}`} fill="none" stroke="var(--ink)" strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" /></svg> : null}
      <RiderMarker x={you[0]} y={you[1]} label={paused ? A.lastSeen : R.you} paused={paused} />
    </MapBox>
  </div>;
}
/* Current-stop card: the one thing the rider needs now. */
function StopCard({ k = "a", name, who, dist, here, food }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ height: 26, display: "flex", alignItems: "center" }}>{k === "a" ? <Dot s={14} /> : <Sq s={14} />}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Lbl>{k === "a" ? R.pickupL : R.dropL}{food ? " · " + food : ""}</Lbl>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: "26px", textWrap: "pretty" }}>{name}</div>
        <div style={{ fontSize: 14, color: here ? "var(--accent-text)" : "var(--muted)", fontWeight: here ? 700 : 400, marginTop: 2 }} className="lynia-tabular">{here ? R.here : dist}</div>
      </div>
    </div>
    <div style={{ fontSize: 13, color: "var(--muted)" }}>{who}</div>
    <div style={{ display: "flex", gap: 8 }}><SmBtn flex={1} label={R.call} icon="Phone" /><SmBtn flex={1} label={R.whatsapp} icon="MessageCircle" />{here ? null : <SmBtn flex={1} label={R.navigate} icon="Navigation" />}</div>
  </div>;
}
const ProblemLink = () => <div style={{ display: "flex", justifyContent: "center", borderTop: "1px solid var(--line)", paddingTop: 4 }}><span style={{ height: 44, display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}><AIc n="CircleAlert" s={16} c="var(--muted)" />{R.problem}<AIc n="ChevronRight" s={16} c="var(--muted)" /></span></div>;
function CashSplit({ yours = "$3.20", owed = "$12.50", title }) {
  return <div style={{ background: "var(--surface)", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
    {title ? <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div> : null}
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: 1 }}><Lbl c="var(--accent-text)">{R.yours}</Lbl><div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent-text)" }} className="lynia-tabular">{yours}</div></div>
      <div style={{ width: 1, background: "var(--line)" }}></div>
      <div style={{ flex: 1, paddingLeft: 4 }}><Lbl>{R.owed}</Lbl><div style={{ fontSize: 20, fontWeight: 700 }} className="lynia-tabular">{owed}</div></div>
    </div>
  </div>;
}
const CashLine = ({ text, icon = "Banknote" }) => <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 600, lineHeight: "20px" }}><AIc n={icon} s={18} c="var(--accent-text)" /><span style={{ textWrap: "pretty" }}>{text}</span></div>;

/* Gate (blocking state): why · what to do · when it clears. Sits in the tab-root body. */
function Gate({ W, H, icon, tone, title, body, facts, factTone, primary, ghost, bridge, conn, tabless }) {
  const btns = [primary, ghost, bridge].filter(Boolean).length;
  const bot = (tabless ? 0 : TAB);
  const barHt = 22 + btns * 52 + (btns - 1) * 8;
  return <AFrame W={W} H={H}>
    <MintTop W={W} conn={conn} />
    <div style={{ position: "absolute", left: 0, right: 0, top: MT, bottom: bot + barHt, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "0 24px", textAlign: "center" }}>
      <IconDisc n={icon} tone={tone} s={72} />
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: "28px", textWrap: "balance" }}>{title}</div>
      <div style={{ fontSize: 15, lineHeight: "22px", color: "var(--muted)", textWrap: "pretty" }}>{body}</div>
      {facts ? <div style={{ alignSelf: "stretch", background: factTone === "danger" ? "var(--danger-wash)" : "var(--surface)", borderRadius: 12, padding: "4px 14px", textAlign: "left" }}>{facts.map(([k, v], i) => <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "8px 0", borderTop: i ? "1px solid var(--line)" : "none" }}><span style={{ fontSize: 13, color: factTone === "danger" ? "var(--danger-ink)" : "var(--muted)", flex: "none" }}>{k}</span><span style={{ flex: 1, textAlign: "right", fontSize: 15, fontWeight: 700, color: factTone === "danger" ? "var(--danger-ink)" : "var(--ink)" }} className="lynia-tabular">{v}</span></div>)}</div> : null}
    </div>
    <RBar bottom={bot}>{primary ? <GBtn label={primary[0]} icon={primary[1]} /> : null}{ghost ? <GBtn ghost label={ghost[0]} icon={ghost[1]} /> : null}{bridge ? <GBtn ghost label={R.customerBridge} icon="ArrowLeftRight" /> : null}</RBar>
    {tabless ? null : <TabBar tab={0} />}
  </AFrame>;
}

/* List row (Account, Settings). */
function Row({ icon, label, sub, value, danger, chev = true, first, tone, children }) {
  const fg = danger ? "var(--danger)" : "var(--ink)";
  return <div style={{ minHeight: 56, display: "flex", alignItems: "center", gap: 12, padding: "8px 12px 8px 14px", borderTop: first ? "none" : "1px solid var(--line)", boxSizing: "border-box" }}>
    {icon ? <span style={{ width: 36, height: 36, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: danger ? "var(--danger-wash)" : tone === "ok" ? "var(--accent-wash)" : "var(--surface)" }}><AIc n={icon} s={18} c={danger ? "var(--danger-ink)" : tone === "ok" ? "var(--accent-text)" : "var(--muted)"} /></span> : null}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: fg, lineHeight: "20px" }}>{label}</div>
      {sub ? <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: "16px", marginTop: 2, textWrap: "pretty" }}>{sub}</div> : null}
      {children}
    </div>
    {value ? <span style={{ fontSize: 13, fontWeight: 600, color: tone === "warn" ? "var(--danger-ink)" : tone === "ok" ? "var(--accent-text)" : "var(--muted)", background: tone === "warn" ? "var(--danger-wash)" : "transparent", borderRadius: "var(--radius-pill)", padding: tone === "warn" ? "2px 8px" : 0, whiteSpace: "nowrap", flex: "none" }}>{value}</span> : null}
    {chev ? <AIc n="ChevronRight" s={18} c="var(--muted)" /> : null}
  </div>;
}
const Card = ({ children, style }) => <div style={{ border: "1px solid var(--line)", borderRadius: 16, background: "var(--bg)", overflow: "hidden", ...style }}>{children}</div>;

/* Segmented control — 48 px, the loudest control where it appears. */
function Seg({ opts, on = 0, h = 48, icons }) {
  return <div style={{ display: "flex", background: "var(--surface)", borderRadius: "var(--radius-pill)", padding: 3, border: "1px solid var(--line)", height: h, boxSizing: "border-box" }}>
    {opts.map((o, i) => <span key={o} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: "var(--radius-pill)", background: i === on ? "var(--cta-fill)" : "transparent", color: i === on ? "#fff" : "var(--ink)", fontSize: 15, fontWeight: 700 }}>{icons ? <AIc n={icons[i]} s={17} c={i === on ? "#fff" : "var(--muted)"} /> : null}{o}</span>)}
  </div>;
}

function IdentityCard({ customer, sm }) {
  return <Card><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 12px 12px 14px", minHeight: 72 }}>
    <Avatar photo s={52} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><span style={{ fontSize: 17, fontWeight: 700 }}>Tendai Moyo</span>{customer ? null : <Verified />}</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }} className="lynia-tabular">{customer ? <>+263 77 245 1180</> : <><AIc n="Star" s={13} c="var(--ink)" fill="var(--ink)" />{R.rating} · {R.jobsDone}</>}</div>
    </div>
    <AIc n="ChevronRight" s={18} c="var(--muted)" />
  </div></Card>;
}

/* Reliability card: acceptance, strikes, plain-words pause rule. risk = one strike from a pause. */
function Standing({ risk }) {
  const used = risk ? 2 : 1;
  return <div style={{ border: risk ? "1px solid var(--danger)" : "1px solid var(--line)", borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Lbl style={{ flex: 1 }}>{R.standing}</Lbl><span style={{ height: 24, display: "inline-flex", alignItems: "center", gap: 4, padding: "0 10px", borderRadius: "var(--radius-pill)", background: risk ? "var(--danger-wash)" : "var(--accent-wash)", color: risk ? "var(--danger-ink)" : "var(--accent-text)", fontSize: 12, fontWeight: 700 }}><AIc n={risk ? "TriangleAlert" : "ShieldCheck"} s={13} c={risk ? "var(--danger-ink)" : "var(--accent-text)"} />{risk ? R.atRisk : R.good}</span></div>
    <div style={{ display: "flex", gap: 8 }}>
      {[[R.acceptance, risk ? "84%" : R.acceptanceV], [R.ratingK, R.ratingV]].map(([k, v]) => <div key={k} style={{ flex: 1, background: "var(--surface)", borderRadius: 12, padding: "8px 10px" }}><div style={{ fontSize: 12, color: "var(--muted)" }}>{k}</div><div style={{ fontSize: 18, fontWeight: 700 }} className="lynia-tabular">{v}</div></div>)}
      <div style={{ flex: 1, background: risk ? "var(--danger-wash)" : "var(--surface)", borderRadius: 12, padding: "8px 10px" }}><div style={{ fontSize: 12, color: risk ? "var(--danger-ink)" : "var(--muted)" }}>{R.strikes}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 7 }}>{[0, 1, 2].map(i => <span key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i < used ? (risk ? "var(--danger)" : "var(--ink)") : "var(--line)" }}></span>)}</div>
        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, color: risk ? "var(--danger-ink)" : "var(--ink)" }} className="lynia-tabular">{used} of 3</div></div>
    </div>
    <div style={{ fontSize: 13, lineHeight: "19px", color: "var(--ink)", textWrap: "pretty" }}>{risk ? R.standingRisk : R.standingB}</div>
  </div>;
}

/* Modal bottom sheet over a dimmed screen. */
function MSheet({ title, body, children, buttons, icon, iconTone }) {
  return <><div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", zIndex: 40 }}></div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 41, background: "var(--bg)", borderRadius: "16px 16px 0 0", padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
      <Grabber />
      {icon ? <IconDisc n={icon} tone={iconTone} s={56} /> : null}
      {title ? <div style={{ fontSize: 20, fontWeight: 700, lineHeight: "26px", textWrap: "pretty", marginTop: -4 }}>{title}</div> : null}
      {body ? <div style={{ fontSize: 15, lineHeight: "22px", color: "var(--muted)", textWrap: "pretty", marginTop: -4 }}>{body}</div> : null}
      {children}
      {buttons ? <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>{buttons}</div> : null}
    </div></>;
}

/* 6-box code entry. */
function CodeBoxes({ W, digits = "", err, locked, offline }) {
  const sm = W < 340, w = sm ? 36 : 42, h = sm ? 50 : 56;
  return <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>{[0, 1, 2, 3, 4, 5].map(i => {
    const d = digits[i], focus = !err && !locked && i === digits.length;
    return <span key={i} style={{ width: w, height: h, marginLeft: i === 3 ? 8 : 0, borderRadius: 10, boxSizing: "border-box", border: err ? "2px solid var(--danger)" : focus ? "2px solid var(--accent-text)" : "1.5px solid var(--line)", background: locked ? "var(--surface)" : "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: locked ? "var(--muted)" : "var(--ink)" }} className="lynia-tabular">{locked ? <AIc n="Lock" s={16} c="var(--muted)" /> : d || (focus ? <span style={{ width: 2, height: 26, background: "var(--accent-text)" }}></span> : "")}</span>;
  })}</div>;
}
function Numpad({ W }) {
  const k = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 216, background: "var(--line)", padding: "8px 6px 12px", boxSizing: "border-box", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, zIndex: 40 }}>
    {k.map((c, i) => <span key={i} style={{ background: c ? "var(--bg)" : "transparent", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 600, boxShadow: c ? "0 1px 0 rgba(20,24,27,.15)" : "none" }}>{c === "⌫" ? <AIc n="Delete" s={22} c="var(--ink)" /> : c}</span>)}
  </div>;
}
const Err = ({ text }) => <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "var(--danger)", textAlign: "center" }}><AIc n="CircleAlert" s={14} c="var(--danger)" />{text}</div>;

/* Money ledger row. amt "+$3.20" green / "−$0.32" ink. */
function LRow({ icon, title, meta, amt, first }) {
  const pos = amt[0] === "+";
  return <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56, borderTop: first ? "none" : "1px solid var(--line)", padding: "6px 0" }}>
    <span style={{ width: 36, height: 36, borderRadius: "50%", background: pos ? "var(--accent-wash)" : "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><AIc n={icon} s={17} c={pos ? "var(--accent-text)" : "var(--muted)"} /></span>
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div><div style={{ fontSize: 12, color: "var(--muted)" }} className="lynia-tabular">{meta}</div></div>
    <span style={{ fontSize: 15, fontWeight: 700, color: pos ? "var(--accent-text)" : "var(--ink)" }} className="lynia-tabular">{amt}</span>
  </div>;
}
const Chips = ({ list, on = 0 }) => <div style={{ display: "flex", gap: 8 }}>{list.map((c, i) => <span key={c} style={{ height: 44, display: "inline-flex", alignItems: "center", padding: "0 16px", borderRadius: "var(--radius-pill)", background: i === on ? "var(--accent-wash)" : "var(--bg)", border: i === on ? "1.5px solid var(--accent-text)" : "1px solid var(--line)", color: i === on ? "var(--accent-text)" : "var(--ink)", fontSize: 13, fontWeight: 700, boxSizing: "border-box" }}>{c}</span>)}</div>;

Object.assign(window, { R, RD, MT, TAB, RHDR, RStatus, Conn, Sun, MintTop, TabBar, Body, RBar, Lbl, JTag, Stop, JobCard, BoardMap, RSteps, JobMap, StopCard, ProblemLink, CashSplit, CashLine, Gate, Row, Card, Seg, IdentityCard, Standing, MSheet, CodeBoxes, Numpad, Err, LRow, Chips });
