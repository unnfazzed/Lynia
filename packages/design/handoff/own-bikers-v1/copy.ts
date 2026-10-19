/* Own bikers v1 — every user-facing string, verbatim. Generated from ob-copy.js.
   NEW = didn't exist before. Invites are shared links (no SMS), owner decision 2026-10-19.
   Functions take sample values (names, amounts, counts, dates) as parameters. */

export const OB = {
  merchant: {
    acctName: "Chicken Inn Avondale", // NEW
    acctSub: "Rumbi · Owner · 2 branches", // NEW
    acctSubStaff: "Kuda · Staff · Avondale", // NEW
    grpOrders: "ORDERS & PEOPLE",
    takingOrders: "Taking orders",
    takingOrdersV: "Auto-accept off",
    team: "Team",
    teamV: "1 invite open",
    ownBikers: "Own bikers", // NEW
    ownBikersV: "4 bikers · 1 invite open", // NEW
    ownBikersPaused: "Paused", // NEW
    ownBikersStaffV: "4 bikers", // NEW
    grpHelp: "HELP",
    help: "Help & support",
    helpV: "WhatsApp",
    signOut: "Sign out",
    rosterTitle: "Own bikers", // NEW
    thisWeek: "This week: 23 rides · $34.50", // NEW
    grpBikers: "YOUR BIKERS", // NEW
    grpInvites: "INVITES", // NEW
    stOnJob: "On a job", // NEW
    stOnline: "Online", // NEW
    stOffline: "Offline", // NEW
    cashWith: a=>`Cash with them ${a}`, // NEW
    cancels: n=>`${n} cancels this week`, // NEW
    invSigningUp: "Signing up", // NEW
    invWaitingId: "Waiting for ID check", // NEW
    invNotOpened: "Link not opened yet", // NEW
    sentAgo: d=>`Shared ${d} ago`, // NEW
    shareAgain: "Share again", // NEW
    revoke: "Revoke", // NEW
    inviteExpired: "Link expired", // NEW
    newLink: "New link", // NEW
    inviteBiker: "Invite a biker", // NEW
    call: "Call", // NEW
    homeBranch: "Home branch", // NEW
    cashHeld: "Cash with them", // NEW
    cancelsWeek: "Cancels this week", // NEW
    none: "None", // NEW
    removeBiker: "Remove from my bikers", // NEW
    removeT: n=>`Remove ${n} from your bikers?`, // NEW
    removeB: n=>`${n} stops getting jobs from Chicken Inn straight away. Any cash they hold is still owed to you.`, // NEW
    removeCashB: (n,a)=>`${n} still has ${a} of your cash. Get it back before you remove them.`, // NEW
    removeYes: "Remove", // NEW
    keep: "Keep", // NEW
    staffLock: "Only the owner can invite or remove bikers.", // NEW
    emptyT: "Invite your bikers", // NEW
    emptyB: "They'll get jobs from your shop only.", // NEW
    grpPreferred: "FROM YOUR PREFERRED RIDERS", // NEW
    dismiss: "Dismiss", // NEW
    invite: "Invite", // NEW
    invited: "Invited", // NEW
    inviteT: "Invite a biker", // NEW
    inviteB: "You get an invite link to share. They open it, sign up with this phone number, pass the ID check, then join your bikers.", // NEW
    phone: "Phone", // NEW
    phoneHelp: "Only this number can use the link.", // NEW
    name: "Name", // NEW
    namePh: "e.g. Kuda", // NEW
    createLink: "Get invite link", // NEW
    creating: "Getting link…", // NEW
    linkReady: n=>`Invite link for ${n}`, // NEW
    linkSub: "Works for 7 days, for this number only.", // NEW
    shareWa: "Share on WhatsApp", // NEW
    copyLink: "Copy link", // NEW
    copied: "Link copied", // NEW
    alreadyInvited: "Already invited · same link", // NEW
    inviteAnother: "Invite another", // NEW
    done: "Done", // NEW
    cantCreate: "Couldn't get a link", // NEW
    cantReach: "Can't reach LyniaGo", // NEW
    tryAgain: "Try again",
    waText: "Hi Kuda, join Chicken Inn Avondale’s bikers on LyniaGo:", // NEW
    readyBanner: n=>`${n} is ready`, // NEW
    bookFirst: "Book your first delivery", // NEW
    notifTitle: "Notifications", // NEW
    notifJoined: n=>`${n} joined your bikers`, // NEW
    notifJoinedSub: "Avondale · just now", // NEW
    bookTitle: "Book a biker", // NEW
    bookCardSub: "For sales you made by phone or WhatsApp", // NEW
    segMine: "My bikers", // NEW
    segMineN: n=>`My bikers · ${n} online`, // NEW
    segAny: "Any biker", // NEW
    mineOnline: n=>`${n} of your bikers online`, // NEW
    goingTo: "Going to",
    goingToV: "Pin the buyer sent · Avondale West", // NEW
    buyerPhone: "Buyer's phone",
    whatsGoing: "What’s going · $12.00", // NEW
    add: "Add",
    collects: a=>`Biker collects ${a}`, // NEW
    collectsSub: "and brings it back to you",
    ringMine: "Ring my bikers", // NEW
    fare: "Fare you offer",
    fareHint: "Bikers usually get $2–3", // NEW
    findAny: a=>`Find a biker · ${a}`, // NEW
    ringing: n=>`${n} of your bikers online · ringing…`, // NEW
    ringingSub: "The first to accept takes it.", // NEW
    left: t=>`${t} left`, // NEW
    cancel: "Cancel", // NEW
    noneTook: "None of your bikers took it", // NEW
    noneTookB: "We rang them 3 times over 2 minutes.", // NEW
    sendAny: "Send to any biker", // NEW
    tryMine: "Try my bikers again", // NEW
    noneOnline: "None of your bikers are online", // NEW
    noneOnlineB: "Send it to any biker nearby instead.", // NEW
    pausedT: "Own bikers paused", // NEW
    pausedB: "Talk to LyniaGo to turn them back on.", // NEW
    contact: "Contact LyniaGo", // NEW
    onTheWay: "ON THE WAY", // NEW
    booked: "BOOKED", // NEW
    app: "APP", // NEW
    cashBackApp: "Cash back from Tendai: food $12.00 + delivery $2.00 = $14.00", // NEW
    cashBackPhone: n=>`Cash back from ${n}: $12.00`, // NEW
    cashBackLbl: "CASH BACK TO YOU",
    bringsBy: (n,t)=>`${n} brings it back by ${t}, after delivery`, // NEW
    gotCash: a=>`I got ${a} · after delivery`, // NEW
    money: "Money",
    today: "Today",
    week: "This week",
    salesHdr: "SALES · 41 ORDERS · 28 SEP–4 OCT", // NEW
    grpFleet: "FLEET RIDES", // NEW
    bill: (wk,a,due)=>`Fleet bill · ${wk} · ${a} · Due ${due}`, // NEW
    billUnpaid: "Unpaid", // NEW
    billPaid: "Paid", // NEW
    billOverdue: "Overdue", // NEW
    billOverdueSub: n=>`${n} days overdue · Talk to LyniaGo to pay`, // NEW
    branchAv: "Avondale · 15 rides · $22.50", // NEW
    branchBo: "Borrowdale · 8 rides · $12.00", // NEW
    credit: "Credit · #B190 · wrong fee · −$1.50", // NEW
    noFleet: "No fleet rides this week", // NEW
    loading: "Loading your bikers…", // NEW
    loadFailT: "Couldn't load your bikers", // NEW
    loadFailB: "Check your connection, then try again.", // NEW
    offlineToast: "You're offline. This list may be out of date.", // NEW
    moneyFailT: "Couldn't load fleet rides", // NEW
    cachedWeek: "Offline · showing this week as of 12:40", // NEW
  },
  biker: {
    morning: "Good afternoon, Tendai", // NEW
    morningNew: "Good afternoon, Kuda", // NEW
    online: "Online",
    reconnecting: "Reconnecting…",
    tabJobs: "Jobs",
    tabMoney: "Money",
    tabAccount: "Account",
    invitedWait: "Chicken Inn Avondale invited you · finish your ID check to join", // NEW
    joinT: "Chicken Inn Avondale wants you on their bikers", // NEW
    joinB: "Jobs from Chicken Inn only. No fare, no top-up.", // NEW
    join: "Join", // NEW
    notNow: "Not now", // NEW
    joining: "Joining…", // NEW
    push: "Chicken Inn Avondale is waiting for you", // NEW
    pushApp: "LyniaGo · now", // NEW
    refStaff: "You work at Chicken Inn Avondale. Ask them to add you as a biker from a different account.", // NEW
    refFleet: "Leave Pizza Inn first.", // NEW
    refEnded: "This invite has ended. Ask Chicken Inn Avondale for a new one.", // NEW
    refNet: "Couldn't join. Check your connection.", // NEW
    gPendingT: "Your ID is under review",
    gPendingB: "We're checking your ID and bike photo. Most checks finish within a few hours.",
    nearYou: "4 parcels near you",
    fleetJobs: "Chicken Inn jobs", // NEW
    fleetJobsN: n=>`${n} Chicken Inn jobs`, // NEW
    fleetTag: "Chicken Inn job", // NEW
    toPickup: "to pickup",
    trip: "trip",
    ringsHint: "Chicken Inn jobs ring full screen. Keep LyniaGo open.", // NEW
    emptyT: "No Chicken Inn jobs right now", // NEW
    staleB: "Reconnecting… Jobs may be a minute behind. We'll update the list as soon as you're back.",
    loadFail: "Couldn't load Chicken Inn jobs. Trying again in 10 s.", // NEW
    pausedT: "Chicken Inn's deliveries are paused", // NEW
    pausedB: "Ask Chicken Inn for details.", // NEW
    offerT: "New Chicken Inn job", // NEW
    from: "Chicken Inn Avondale", // NEW
    to: "22 King George Rd, Avondale", // NEW
    meta: "0.4 km to pickup · 3.2 km trip", // NEW
    collectDoor: "Collect at the door", // NEW
    collectDoorB: "All of it goes back to Chicken Inn Avondale.", // NEW
    accept: "Accept this job", // NEW
    pass: "Not this one", // NEW
    passHint: "Passing or missing a job doesn't affect you.", // NEW
    expT: "That one went to another biker", // NEW
    expB: "Chicken Inn jobs hold for 60 seconds, then go to the next biker.", // NEW
    backJobs: "Back to jobs", // NEW
    tToKitchen: "Heading to Chicken Inn", // NEW
    tToDrop: "Heading to drop-off", // NEW
    tReturn: "Return the cash", // NEW
    pickupL: "PICKUP",
    dropL: "DROP-OFF",
    stPickup: "Pickup",
    stCollected: "Collected",
    stDrop: "Drop-off",
    stDone: "Done",
    call: "Call",
    whatsapp: "WhatsApp",
    navigate: "Navigate",
    away: "0.4 km · about 2 min", // NEW
    awayDrop: "3.2 km · about 12 min", // NEW
    customer: "Nyasha D. · customer", // NEW
    orderReady: "Order #B204 · ready in about 3 min", // NEW
    atKitchen: "I'm at the kitchen", // NEW
    atDrop: "I'm at the drop-off", // NEW
    collectLine: "Collect $14.00 cash at the door", // NEW
    bringLine: "Bring $14.00 back to Chicken Inn Avondale", // NEW
    problem: "Problem with this job?",
    returnB: "Hand the cash to the counter. They confirm it in their app and this job closes.",
    returnWait: "Waiting for Chicken Inn to confirm…", // NEW
    doneT: "Delivered. Nice work.",
    returnLead: "Return $14.00 to Chicken Inn Avondale", // NEW
    nothingReturn: "Nothing to return", // NEW
    nothingReturnB: "This order was paid before delivery.", // NEW
    nextJobs: "Back to jobs",
    cashHero: "Cash with you · owed to Chicken Inn Avondale", // NEW
    cashHeroB: "Hand it to the counter after each job.", // NEW
    history: "HISTORY",
    todayH: "TODAY",
    hCollected: "Collected · #B204", // NEW
    hReturned: "Returned to Chicken Inn", // NEW
    cxT: "Cancel this job?",
    cxB: "This tells Chicken Inn Avondale.", // NEW
    cxKeep: "Keep the job",
    cxYes: "Cancel job",
    acctRow: "Chicken Inn bikers", // NEW
    acctRowV: "Avondale", // NEW
    leaveT: "Leave Chicken Inn's bikers?", // NEW
    leaveB: "You'll become a public biker and need a commission top-up to take jobs.", // NEW
    leave: "Leave", // NEW
    stay: "Stay", // NEW
    leaveBlocked: "You can leave after this delivery.", // NEW
    pubT: "You're a public biker now", // NEW
    pubB: "Chicken Inn has stopped using Own bikers. You can take jobs from anyone near you.", // NEW
    pub1T: "Parcels and food near you", // NEW
    pub1B: "Jobs from shops, kitchens and customers across Harare.", // NEW
    pub2T: "You keep the fare", // NEW
    pub2B: "You set or accept a fare. Commission comes off when a job closes.", // NEW
    pub3T: "Top up to start", // NEW
    pub3B: "Keep at least $2.00 commission balance to take jobs.", // NEW
    pubCta: "See jobs near me", // NEW
  },
  admin: {
    nav: "Own bikers", // NEW
    title: "Own bikers", // NEW
    sub: "3 fleets · fee per ride billed weekly", // NEW
    live: "● live", // NEW
    cols: ["Owner","Branches","Bikers","This week","Unpaid","Days overdue","Status"], // NEW
    stOverdue: "Overdue", // NEW
    stUnpaid: "Unpaid", // NEW
    stPaid: "Paid", // NEW
    stPaused: "Paused", // NEW
    overdueN: n=>`${n} days overdue`, // NEW
    fee: "Fee per ride", // NEW
    save: "Save", // NEW
    pause: "Pause", // NEW
    unpause: "Unpause", // NEW
    disable: "Disable", // NEW
    bills: "Weekly bills", // NEW
    markPaid: "Mark paid", // NEW
    adjust: "Adjust", // NEW
    adjAmount: "Amount", // NEW
    adjReason: "Reason (required)", // NEW
    adjRide: "Which ride", // NEW
    pauseT: "Pause Chicken Inn's Own bikers?", // NEW
    pauseB: n=>`Chicken Inn's ${n} bikers stop getting jobs. Their 'Book a biker' falls back to Any biker.`, // NEW
    disableT: "Disable Chicken Inn's Own bikers?", // NEW
    disableB: n=>`Chicken Inn's ${n} bikers become public bikers. Their 'Book a biker' falls back to Any biker. Unpaid bills stay open.`, // NEW
    reasonCode: "Reason code", // NEW
    note: "Note for the audit log", // NEW
    audit: "Recorded in the audit log with your name.", // NEW
    cancel: "Cancel",
    tile: "Own bikers live: 3 fleets · 14 bikers online · 2 overdue", // NEW
    emptyT: "No fleets yet", // NEW
    emptyB: "Merchants who invite their own bikers show here.", // NEW
    errT: "Couldn't load fleets.", // NEW
    tryAgain: "Try again",
    offline: "Offline · showing data from 14:02. Changes are paused until you reconnect.", // NEW
  },
} as const;
