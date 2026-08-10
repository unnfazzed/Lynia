/* LyniaGo — customer journey flow-map: canvas layout, arrows, band labels, cluster zones, gap flags,
   and pan/zoom. Consumes window.LJ (screen renderers). Mounts to #root. */

const LJ = window.LJ;
const DSc = window.LyniaDesignSystem_94c56a;
const { Icon: Ic } = DSc;

/* ── geometry ── */
const COLW = 430, X0 = 150, PHONE_H = 640, TILE_W = 336, TITLE_H = 34, ANNO_GAP = 12;
const X = (c) => X0 + c * COLW;
const B = { B0: 120, B1: 1020, B2s: 1920, B2b: 2820, B3s: 3720, B3b: 4620, B4: 5520, B5: 6480, B6: 7420, B7: 8440, B8: 9580 };
const CANVAS_W = 4000, CANVAS_H = 10740;

/* ── nodes ── */
const N = {};
function node(id, col, band, badge, title, anno, bg) { N[id] = { id, x: X(col), y: band, col, band, badge, title, anno, bg }; }
// Act 0 — first run
node("splash", 0, B.B0, "0·1", "Splash", { p: "Brand launch moment while the app boots.", s: "Loading (2s, dove lift-in)", c: "— auto-advances" }, "var(--accent)");
node("onboard", 1, B.B0, "0·2", "Onboarding carousel (3 slides)", { p: "Three slides: food from kitchens near you, name-your-price sending, then the promise both share — one app, one code at the door, more services soon. First install only.", s: "Slide 1 of 3 · skippable", c: "Next / Get started" });
node("login", 2, B.B0, "0·3", "Phone login", { p: "Capture the phone number to send an OTP.", s: "Empty → typing", c: "Send code" });
node("otp", 3, B.B0, "0·4", "SMS OTP", { p: "Verify the 6-digit code delivered by SMS. Extended (C-OTP): a Resend-code affordance now sits under Verify — the cooldown / resent / locked states are drawn in the C band below.", s: "Awaiting 6 digits · resend idle", c: "Verify" });
node("role_select", 4, B.B0, "0·5", "Choose your role", { p: "One account, two roles — chosen first. 'Use LyniaGo' (order food, send parcels, more services soon) continues below; 'Earn as a rider' exits to the Rider journey map (KYC takes over there). Switch anytime.", s: "Customer selected", c: "Continue as a customer" });
node("register", 5, B.B0, "0·6", "Profile registration", { p: "After choosing to send parcels: full name + national ID, stored on the account record — NOT verified (no KYC). Phone pre-filled from OTP. Riders KYC separately.", s: "First sign-up", c: "Continue" });
node("perm_loc", 6, B.B0, "0·7", "Permission · location", { p: "Prime GPS before the OS dialog — sets pickup, matches riders.", s: "Pre-permission", c: "Allow location" });
node("perm_notif", 7, B.B0, "0·8", "Permission · notifications", { p: "Prime push so offers & arrival alerts land.", s: "Pre-permission", c: "Turn on notifications" });
node("home_launcher", 8, B.B0, "0·9", "Home", { p: "The root screen after first run — the same home the Food journey uses (DS AppHome): green brand header + floating search, service tiles (Send · Food · Pharmacy), a live-order card per running job — rides and food alike — then restaurants near you. Send opens the map composer.", s: "Live food + ride on the home", c: "Tap Send" });
// Act 1 — compose (search-first addressing)
node("home_empty", 0, B.B1, "1·1", "Send composer · no address", { p: "Reached from the launcher's Send tile. Two address rows (Pickup / Drop-off) sit above the map — tap either to search.", s: "Empty · sheet peek", c: "Tap Where to?" });
node("addr_search", 1, B.B1, "1·2", "Address search", { p: "Type an address or landmark; Google Places returns matches. Saved (Home/Work), recents, current location, or set-on-map.", s: "Typing · live results", c: "Pick a place" });
node("addr_map_confirm", 2, B.B1, "1·3", "Confirm pin on map", { p: "Refine the exact point by dragging the pin; add a building/landmark note. The point stores lat/lng + place_id.", s: "Adjusting pin", c: "Confirm drop-off" });
node("home_pins", 3, B.B1, "1·4", "Send · both set", { p: "Both addresses resolved & Google-linked. Fill item, price and both phone numbers.", s: "Required path filled", c: "Broadcast (enabling)" });
node("home_expanded", 4, B.B1, "1·5", "Send · sheet expanded", { p: "Optional declared value; ready to broadcast.", s: "Complete · valid", c: "Broadcast request" });
node("disclaimer", 5, B.B1, "1·6", "Broadcast disclaimer", { p: "Accept-to-continue gate: sending is at your own risk, Lynia isn't liable for non-delivery, and isn't involved in payment or disputes. Consent recorded.", s: "Must accept", c: "Agree & broadcast" });
// Act 2 — auction
node("auction_finding", 0, B.B2s, "2·1", "Auction · finding", { p: "Order broadcast; 90s window open, pinging nearby riders.", s: "Open · no offers yet", c: "Cancel order" });
node("auction_live", 1, B.B2s, "2·2", "Auction · offers live", { p: "Riders' offers stream in; sort & pick. RECOMMENDED = best blend.", s: "3 bidding · sorted best", c: "Choose this rider" });
node("auction_counter", 2, B.B2s, "2·3", "Counter-offer review", { p: "A rider countered your price. Compare your ask vs their offer and accept or decline. Declining keeps their offer in the list AT THEIR COUNTERED PRICE until the window closes — one round, no counter-back. (S2)", s: "1 counter · +$0.50", c: "Accept / Decline" });
node("no_riders", 0, B.B2b, "2·b1", "No riders online", { p: "No supply in the corridor — price won't help. Offer to notify.", s: "Empty (supply)", c: "Notify me / Back" });
node("select_race", 1, B.B2b, "2·b2", "Rider just taken", { p: "Chosen rider was grabbed by another customer — muted roll-back.", s: "Race · retry", c: "Choose another" });
node("auction_expired", 2, B.B2b, "2·b3", "Auction expired", { p: "90s closed with no offer taken. Nudge price and re-broadcast.", s: "Expired", c: "Nudge & re-broadcast" });
// Act 3 — track
node("track_code", 0, B.B3s, "3·1", "Tracking · code issued", { p: "Rider assigned. Share the hand-off code with the recipient — re-issue a fresh one any time if it's lost or the rider's entry locks (the rider can ping you to re-send). (S7)", s: "Assigned", c: "Cancel order" });
node("track_active", 1, B.B3s, "3·2", "Tracking · live", { p: "Live rider on the map; the 7-step timeline is a direct projection of the rider's job stages (one shared status machine — the two views can't drift). Call the rider. Google Maps route sync. (S9)", s: "En route to drop-off", c: "Call rider" });
node("rider_cancelled", 0, B.B3b, "3·b0", "Rider cancelled → re-broadcast", { p: "Rider bailed after assignment — possible only BEFORE pickup (once collected, riders can't cancel; a breakdown lands as 'not delivered' with the reason). Auto re-broadcasts at the same price. (P0 / F-01 · S4)", s: "Re-broadcasting", c: "Cancel order" });
node("undelivered", 4, B.B3b, "3·b5", "Not delivered (terminal)", { p: "Terminal 'not delivered' state showing the reason the rider recorded — unreachable / refused / wrong address / rider breakdown — and the attempt count. Parcel settled off-platform, at the customer's risk. (P0 / F-02 · S6)", s: "Not delivered", c: "Send a new request" });
node("track_paused", 1, B.B3b, "3·b1", "Live paused", { p: "Connection dropped on EITHER side — yours or the rider's — muted 'reconnecting', never a red alarm. Escalates to a 'call your rider' notice if dark past ~2 min (matches the rider's job_offline). (S8)", s: "Reconnecting (transient)", c: "— auto-recovers" });
node("cancel", 2, B.B3b, "3·b2", "Cancel · reason", { p: "Cancel at ANY point (per decision). Free before pickup; after pickup the rider is notified ('customer cancelled') and the parcel is handed back directly — own risk, off-platform. (S5)", s: "Confirming cancel", c: "Confirm cancellation" });
node("cancelled", 3, B.B3b, "3·b3", "Cancelled", { p: "Terminal cancelled state with the reason recorded.", s: "Cancelled", c: "Send a new request" });
// Act 4 — close
node("delivered_rate", 0, B.B4, "4·1", "Delivered · rate", { p: "Hand-off confirmed by OTP. Rate the rider 1–5 stars.", s: "Delivered", c: "Tap a star" });
node("completed", 1, B.B4, "4·2", "Completed", { p: "Loop closed. Thank-you + route back to send another.", s: "Completed", c: "Send another parcel" });
// Persistent — account
node("profile", 0, B.B5, "A·1", "Account", { p: "Identity, session, entry to trips & sign-out.", s: "Default", c: "Trip history" });
node("history", 1, B.B5, "A·2", "Trip history", { p: "Every parcel sent, with fare, rating & status.", s: "List", c: "— (tap a trip)" });
node("notifications", 2, B.B5, "A·3", "Notifications", { p: "Offers, arrival & delivery updates, account news.", s: "With items", c: "— (tap to open)" });
node("notif_empty", 3, B.B5, "A·4", "Notifications · empty", { p: "First-run / all-read empty state.", s: "Empty", c: "— none" });
node("help", 4, B.B5, "A·5", "Help & support", { p: "Topic list; live help routes to WhatsApp.", s: "Default", c: "Chat on WhatsApp" });
node("settings", 5, B.B5, "A·6", "Settings", { p: "Profile, notifications, language, payment, sign-out.", s: "Default", c: "— (row actions)" });
// System / edge
node("offline", 0, B.B6, "S·1", "Offline banner", { p: "Global muted banner over any screen when the socket drops.", s: "Offline", c: "— auto-recovers" });
node("on_hold", 1, B.B6, "S·2", "Account on hold", { p: "Account paused pending review. Retrofitted (plan §2·A): 'Contact support' is now a real tel: call row (+263 77 883 1938), not dead text — every blocking state keeps an exit.", s: "Blocking", c: "Call Lynia support" });
node("force_update", 2, B.B6, "S·3", "Force update", { p: "Hard version gate — must update to continue.", s: "Blocking", c: "Update now" }, "var(--accent)");
node("no_gps", 3, B.B6, "S·4", "Location off / no GPS", { p: "GPS unavailable — offer settings or manual address.", s: "Blocking (recoverable)", c: "Open location settings" });
node("generic_error", 4, B.B6, "S·5", "Generic error", { p: "Catch-all load failure; reassures the order is safe.", s: "Error", c: "Try again" });
// NEW · Trust & safety (plan §2 · B1–B3) — aligns the UI shipped in PR #98 to safety.ts
node("sos_idle", 0, B.B7, "B1·1", "SOS · live-trip control", { nw: 1, p: "The emergency control, pinned over the live map on every active trip (both roles — same control on the rider's job map). Entry: track_code → delivered, any live state. Tapping SOS opens the confirm sheet — it never dials by itself.", s: "Idle · live trip", c: "Tap SOS", h: "1st SOS pill · 2nd rider call row · 3rd timeline", ic: "phone (rows) · SOS is a text pill, no new glyph", a: "≥44px target, aria-label “Emergency — call for help”, danger/white contrast 5.9:1", ref: "track_active (3·2)" }, undefined);
node("sos_confirm", 1, B.B7, "B1·2", "SOS · confirm", { nw: 1, p: "Deliberate second step so a pocket-tap can't fire an alert. Confirming shows the numbers immediately and best-effort logs the SOS (POST /orders/:id/sos with trip + location) — the log never gates the numbers.", s: "Confirm sheet", c: "Show emergency numbers", h: "1st confirm button · 2nd explainer · 3rd cancel", ic: "triangle-alert", a: "56px confirm button; sheet title announced first; Cancel ≥44px", ref: "disclaimer sheet (1·6)" });
node("sos_contacts", 2, B.B7, "B1·3", "SOS · contacts", { nw: 1, p: "The two tel: rows from the SosContacts contract (emergencyNumber + safetyLine). Call-emergency is the single dominant element — sized for a panicked one-handed user. Numbers final: 999 · +263 77 883 1938.", s: "Contacts shown · log OK", c: "Call 999", h: "1st Call-999 row · 2nd safety line · 3rd alerted note", ic: "phone, arrow-right, check", a: "Call row 76px, aria “Emergency — call for help”; both rows are plain tel: links", ref: "CallRow (3·1/3·2)" });
node("sos_error", 3, B.B7, "B1·4", "SOS · log failed (offline)", { nw: 1, p: "Offline-first hard requirement: the /sos log call failed (no data), but the tel: rows still render — numbers are hard-coded client-side and phone calls don't need the app. A safety control never dead-ends on the network.", s: "Error · offline", c: "Call 999 (still works)", h: "1st Call-999 row · 2nd safety line · 3rd no-connection note", ic: "phone, wifi-off", a: "Identical targets to B1·3; error note is role=status, not an alert sound", ref: "offline banner (S·1)" });
node("report", 4, B.B7, "B2·1", "Report + block rider", { nw: 1, p: "Post-trip report of the counterparty (both roles), entered from the delivered/rating screen. Matches reportUser: reason + optional block flag — blocking prevents any future rematch.", s: "Reason picked · block on", c: "Send report", h: "1st reason list · 2nd block toggle · 3rd details field", ic: "bike, user, banknote, circle-alert, check", a: "Reason rows ≥44px; toggle is a labelled checkbox, not colour-only", ref: "Undelivered reason list (3·b5)" });
node("report_done", 5, B.B7, "B2·2", "Report sent", { nw: 1, p: "ReportResult { id, blocked } → calm terminal. States reviewer anonymity and that the block is in force — then releases back to the trip.", s: "Confirmation", c: "Done", h: "1st title · 2nd reassurance copy · 3rd done", ic: "check", a: "Title read as heading; single ≥44px action", ref: "EmptyState (2·b3)" });
node("trip_help", 6, B.B7, "B3·1", "Get help with this trip", { nw: 1, p: "Order-level help from the customer order screen — deliberately distinct from account Help (A·5, WhatsApp): the order context is attached up top and it files an Issue via raiseIssue (type + description).", s: "Issue type picked", c: "Send to Lynia", h: "1st issue-type list · 2nd order context · 3rd details", ic: "package, inbox, banknote, user, circle-alert", a: "Type rows ≥44px; order context readable by screen reader before the list", ref: "help (A·5) — contrast on purpose" });
node("trip_help_sent", 7, B.B7, "B3·2", "Issue logged", { nw: 1, p: "RaisedIssue { id, status } → confirmation with the issue id + an open status pill; follow-up lands on WhatsApp. R1-style conflicts resolve to clean copy (“this order already closed”), never a raw error.", s: "Submitted · open", c: "Back to order", h: "1st we've-got-it · 2nd issue id + status · 3rd back", ic: "check", a: "Status pill has text, not colour-only; action ≥44px", ref: "kyc_verified card (rider 1·4)" });
// NEW · OTP resend states (C) + rider-went-dark escalation (D)
node("otp_cooldown", 0, B.B8, "C·1", "OTP · resend cooldown", { nw: 1, p: "Resend pressed → a visible 60s cooldown with a live timer. Verify stays available for a code that's still on its way — the timer throttles resends, it never blocks entry.", s: "Counting down · 0:42", c: "— wait, or Verify", h: "1st code field · 2nd timer · 3rd back", ic: "clock", a: "Timer is role=status (polite); disabled resend still announced with the wait time", ref: "otp (0·4)" });
node("otp_resent", 1, B.B8, "C·2", "OTP · code re-sent", { nw: 1, p: "Fresh code re-issued server-side — new code AND attempt counter reset (the eng-review requirement, so a resend can't land in a locked record). Quiet confirmation; cooldown restarts.", s: "Resend sent", c: "Verify the new code", h: "1st sent banner · 2nd code field · 3rd timer", ic: "check, clock", a: "Banner is role=status; focus returns to the code field", ref: "offer_sent notice (rider 3·2)" });
node("otp_locked", 2, B.B8, "C·3", "OTP · expired / locked", { nw: 1, p: "Code expired (10 min) or 5 wrong tries — the recovery state, never a dead end: one primary action issues a fresh code and resets attempts. Recovery copy final.", s: "Expired / locked", c: "Send a fresh code", h: "1st field error · 2nd recovery copy · 3rd fresh-code button", ic: "— (field error state)", a: "Error tied to the input via aria-describedby; recovery button ≥44px", ref: "handoff_wrong (rider 4·b1)" });
node("track_dark", 3, B.B8, "D·1", "Rider went dark · escalated", { nw: 1, p: "Escalation of track_paused once the rider's position is stale past ~2 min: muted rider marker, a warning banner (never a red alarm), and Call-your-rider promoted to the dominant CTA. SOS stays pinned on the map.", s: "Stale > 2 min", c: "Call Tendai M.", h: "1st Call CTA · 2nd warning banner · 3rd muted map", ic: "triangle-alert, phone", a: "Banner role=status; Call button 52px primary; marker mute not colour-only (pause chip)", ref: "track_paused (3·b1)" });

/* ── edges ── */
// kind: flow | trans | ret | branch | err | reach   ·  route: h | rail | railup | drop | lift
const E = [
  ["splash", "onboard", "flow", "h"], ["onboard", "login", "flow", "h"], ["login", "otp", "flow", "h"],
  ["otp", "role_select", "flow", "h"], ["role_select", "register", "flow", "h", "Customer"],
  ["register", "perm_loc", "flow", "h"], ["perm_loc", "perm_notif", "flow", "h"],
  ["perm_notif", "home_launcher", "flow", "h", "First launch complete"],
  ["home_launcher", "home_empty", "trans", "rail", "Tap Send"],
  ["home_empty", "addr_search", "flow", "h", "Tap an address row"], ["addr_search", "addr_map_confirm", "flow", "h", "Pick a place"],
  ["addr_map_confirm", "home_pins", "flow", "h", "Confirm location"], ["home_pins", "home_expanded", "flow", "h"],
  ["home_expanded", "disclaimer", "flow", "h", "Broadcast"],
  ["disclaimer", "auction_finding", "trans", "rail", "Agree & broadcast"],
  ["auction_finding", "auction_live", "flow", "h"],
  ["auction_live", "auction_counter", "branch", "h", "Rider counters"],
  ["auction_counter", "auction_live", "ret", "lift", "Decline → offers"],
  ["auction_counter", "track_code", "trans", "railB", "Accept counter"],
  ["auction_finding", "no_riders", "branch", "drop", "No riders online"],
  ["auction_live", "select_race", "branch", "drop", "Recommended taken"],
  ["auction_live", "auction_expired", "err", "drop", "90s window closes"],
  ["select_race", "auction_live", "ret", "lift", "Choose another"],
  ["auction_expired", "auction_finding", "ret", "lift", "Nudge & re-broadcast"],
  ["auction_live", "track_code", "trans", "rail", "Choose this rider"],
  ["track_code", "track_active", "flow", "h"],
  ["track_code", "rider_cancelled", "err", "drop", "Rider cancels"],
  ["track_active", "undelivered", "err", "drop", "Can't deliver"],
  ["track_active", "track_paused", "branch", "drop", "Connection drops"],
  ["track_code", "cancel", "err", "drop", "Cancel order"],
  ["track_active", "cancel", "err", "drop", "Cancel any time"],
  ["track_active", "rider_cancelled", "err", "drop", "Rider bails pre-pickup"],
  ["cancel", "track_code", "ret", "lift", "Keep order"],
  ["cancel", "cancelled", "err", "h"],
  ["track_active", "delivered_rate", "trans", "rail", "Parcel delivered"],
  ["delivered_rate", "completed", "flow", "h"],
  ["completed", "home_launcher", "ret", "railup", "Back home — send another"],
  ["profile", "history", "flow", "h"],
  ["sos_idle", "sos_confirm", "flow", "h", "Tap SOS"],
  ["sos_confirm", "sos_contacts", "flow", "h", "Show numbers"],
  ["sos_contacts", "sos_error", "err", "h", "Log call fails"],
  ["report", "report_done", "flow", "h", "Send report"],
  ["trip_help", "trip_help_sent", "flow", "h", "Send to Lynia"],
  ["otp_cooldown", "otp_resent", "flow", "h", "Timer ends → resend"],
  ["otp_resent", "otp_locked", "err", "h", "Expires / 5 wrong tries"],
];

/* ── clusters (zone rects) ── */
const ZONES = [
  { x: X(0) - 26, y: B.B5 - 74, w: COLW * 5 + TILE_W + 52, label: "PERSISTENT · Account & support — reachable any time from the account avatar & the bell" },
  { x: X(0) - 26, y: B.B6 - 74, w: COLW * 4 + TILE_W + 52, label: "SYSTEM & EDGE · overlays that can interrupt any screen" },
];

/* ── band labels ── */
const LABELS = [
  [B.B0, "ACT 0 · First run", "First install only — register a name + ID (stored, not KYC'd), pick a role, prime permissions. 'Earn as a rider' exits to the Rider journey map."],
  [B.B1, "ACT 1 · Compose a parcel", "Search-first addressing: type or pick pickup & drop-off, confirm the pin, name your price, add both phones."],
  [B.B2s, "ACT 2 · The offer auction", "You name the price; nearby riders counter once; you pick. 90-second window."],
  [B.B2b, "↳ Auction branches & empty states", null],
  [B.B3s, "ACT 3 · Track the delivery", "Hand-off code, live 7-step timeline, call the rider."],
  [B.B3b, "↳ Tracking branches", null],
  [B.B4, "ACT 4 · Close the loop", "Confirm delivery by OTP, rate the rider, back to send another."],
  [B.B7, "NEW · Trust & safety — SOS, report, get help (plan §2 · B1–B3)", "Shipped in code (PR #98) with no mockup — these align the UI to the real contracts in safety.ts. Decisions final (5 Jul): 999 emergency · +263 77 883 1938 Lynia safety line · contact-support = tel: call. SOS entry: the pill on any live-trip map · report entry: delivered/rate (4·1) · get-help entry: any order screen."],
  [B.B8, "NEW · OTP resend states (C) + rider-went-dark escalation (D)", "C extends the existing 0·4 “Check your messages” screen — the idle resend affordance is retrofitted in place up there; these are the cooldown / resent / locked states. D escalates 3·b1 after ~2 min of stale position."],
];

/* ── gap flags (not-yet-designed) ── */
const GAPS = [
  [6, B.B1, "Manage saved places", "Home & Work show in search, but there's no screen to add, rename or delete saved addresses.", B.B1 + 74],
  [6, B.B1, "Scheduled / later delivery", "Send is immediate only — no 'deliver at 3pm' or recurring drops.", B.B1 + 218],
  [3, B.B2s, "Multi-order list & switcher", "One live order at a time — no way to run or view several sends at once."],
  [3, B.B3s, "Edit an order in flight", "After broadcast you can only cancel — not change drop-off, price or items."],
  [4, B.B3s, "Proof of delivery", "Nothing beyond the OTP hand-off — no delivery photo or shareable receipt."],
  [3, B.B4, "Tip / re-book a rider", "No tipping, and no 're-book Tendai' from a past trip."],
  [5, B.B6, "In-app chat + localisation", "Help routes to WhatsApp (by decision); English only — Shona/Ndebele deferred."],
];

/* ── anchors & routing ── */
function anchor(n, side, off = 0) {
  const cx = n.x + TILE_W / 2, top = n.y + TITLE_H, cy = top + PHONE_H / 2, bot = top + PHONE_H;
  if (side === "r") return [n.x + TILE_W, cy];
  if (side === "l") return [n.x, cy];
  if (side === "t") return [cx + off, top];
  return [cx + off, bot]; // b
}
function pointsFor(from, to, route) {
  const A = N[from], Z = N[to];
  if (route === "h") { const a = anchor(A, "r"), b = anchor(Z, "l"); return [a, b]; }
  if (route === "drop") { const a = anchor(A, "b", -24), b = anchor(Z, "t", -24); const my = (a[1] + b[1]) / 2; return [a, [a[0], my], [b[0], my], b]; }
  if (route === "lift") { const a = anchor(A, "t", 24), b = anchor(Z, "b", 24); const my = (a[1] + b[1]) / 2; return [a, [a[0], my], [b[0], my], b]; }
  if (route === "rail") { const a = anchor(A, "b"), b = anchor(Z, "t"); const rx = 84; return [a, [a[0], a[1] + 40], [rx, a[1] + 40], [rx, b[1] - 40], [b[0], b[1] - 40], b]; }
  if (route === "railB") { const a = anchor(A, "b"), b = anchor(Z, "t"); const rx = 122; return [a, [a[0], a[1] + 40], [rx, a[1] + 40], [rx, b[1] - 40], [b[0], b[1] - 40], b]; }
  if (route === "railup") { const a = anchor(A, "t"), b = anchor(Z, "b"); const rx = 44; return [a, [a[0], a[1] - 40], [rx, a[1] - 40], [rx, b[1] + 40], [b[0], b[1] + 40], b]; }
  if (route === "reachrail") { const a = anchor(A, "b", 40), b = anchor(Z, "t", 40); const rx = 2660; return [a, [a[0], a[1] + 30], [rx, a[1] + 30], [rx, b[1] - 30], [b[0], b[1] - 30], b]; }
  return [anchor(A, "r"), anchor(Z, "l")];
}
const STYLE = {
  flow: { c: "#006630", w: 3, d: "0" }, trans: { c: "#006630", w: 3.5, d: "0" },
  branch: { c: "#b07d00", w: 2.5, d: "7 6" }, err: { c: "#c0392b", w: 2.5, d: "7 6" },
  ret: { c: "#5b6670", w: 2, d: "3 6" }, reach: { c: "#8a929a", w: 2, d: "2 7" },
};
function path(pts) { return "M " + pts.map((p) => p[0] + " " + p[1]).join(" L "); }
function head(pts, color) {
  const p = pts[pts.length - 1], q = pts[pts.length - 2];
  const ang = Math.atan2(p[1] - q[1], p[0] - q[0]);
  const s = 9;
  const p1 = [p[0] - s * Math.cos(ang - 0.42), p[1] - s * Math.sin(ang - 0.42)];
  const p2 = [p[0] - s * Math.cos(ang + 0.42), p[1] - s * Math.sin(ang + 0.42)];
  return <polygon points={`${p[0]},${p[1]} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`} fill={color} />;
}
function labelPos(pts) {
  const i = Math.max(0, Math.floor(pts.length / 2) - 1);
  const a = pts[i], b = pts[i + 1] || pts[i];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/* ── tile pieces ── */
function Phone({ h, bg, children }) {
  return (
    <div style={{ width: TILE_W, height: h, borderRadius: 30, border: "8px solid #14181b", overflow: "hidden", position: "relative", background: bg || "var(--surface)", boxShadow: "0 14px 40px rgba(20,24,27,.22)" }}>
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 100, height: 20, background: "#14181b", borderRadius: "0 0 12px 12px", zIndex: 30 }} />
      <div style={{ height: "100%", overflow: "hidden", background: bg || "var(--surface)" }}>{children}</div>
    </div>
  );
}
function Tile({ n }) {
  return (
    <div style={{ position: "absolute", left: n.x, top: n.y, width: TILE_W, fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--on-accent)", background: "var(--accent-text)", borderRadius: 6, padding: "2px 7px", fontVariantNumeric: "tabular-nums" }}>{n.badge}</span>
        {n.anno.nw ? <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".05em", color: "#8a6a00", background: "var(--highlight)", borderRadius: 5, padding: "2px 6px" }}>NEW</span> : null}
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em" }}>{n.title}</span>
      </div>
      <Phone h={PHONE_H} bg={n.bg}>{LJ[n.id]()}</Phone>
      <div style={{ width: TILE_W, marginTop: ANNO_GAP, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", boxShadow: "var(--shadow-card)", boxSizing: "border-box" }}>
        <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.45 }}>{n.anno.p}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", background: "var(--surface)", borderRadius: 999, padding: "3px 8px" }}>STATE · {n.anno.s}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, fontSize: 12, fontWeight: 600, color: "var(--accent-text)" }}>
          <Ic name="arrow-right" size={13} color="var(--accent-text)" /> {n.anno.c}
        </div>
        {n.anno.h || n.anno.ic || n.anno.a || n.anno.ref ? (
          <div style={{ marginTop: 9, paddingTop: 8, borderTop: "1px dashed var(--line)", display: "flex", flexDirection: "column", gap: 3 }}>
            {n.anno.h ? <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}><b style={{ color: "var(--ink)", fontWeight: 700 }}>Hierarchy</b> · {n.anno.h}</div> : null}
            {n.anno.ic ? <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}><b style={{ color: "var(--ink)", fontWeight: 700 }}>Icons</b> · {n.anno.ic}</div> : null}
            {n.anno.a ? <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}><b style={{ color: "var(--ink)", fontWeight: 700 }}>A11y</b> · {n.anno.a}</div> : null}
            {n.anno.ref ? <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}><b style={{ color: "var(--ink)", fontWeight: 700 }}>Ref</b> · {n.anno.ref}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
function GapFlag({ col, band, title, body, yTop }) {
  return (
    <div style={{ position: "absolute", left: X(col), top: yTop != null ? yTop : band + TITLE_H + 40, width: 320, background: "var(--highlight-wash)", border: "1.5px dashed var(--highlight-border)", borderRadius: 12, padding: "12px 14px", fontFamily: "var(--font-sans)", boxShadow: "0 6px 18px rgba(20,24,27,.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", color: "#8a6a00", background: "var(--highlight)", borderRadius: 5, padding: "2px 7px" }}>⚑ GAP</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--highlight-ink)" }}>{title}</span>
      </div>
      <div style={{ fontSize: 12.5, color: "#7a6420", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

/* ── canvas ── */
function Canvas() {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: CANVAS_W, height: CANVAS_H }}>
      {/* zones behind cluster bands */}
      {ZONES.map((z, i) => (
        <div key={i} style={{ position: "absolute", left: z.x, top: z.y, width: z.w, height: TITLE_H + PHONE_H + ANNO_GAP + 96 + 60, background: "rgba(255,255,255,.55)", border: "1.5px dashed var(--line)", borderRadius: 20 }}>
          <div style={{ padding: "12px 18px", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, letterSpacing: ".02em", color: "var(--muted)" }}>{z.label}</div>
        </div>
      ))}
      {/* band labels */}
      {LABELS.map(([y, t, s], i) => (
        <div key={i} style={{ position: "absolute", left: X(0), top: y - 66, width: COLW * 5, fontFamily: "var(--font-sans)" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>{t}</div>
          {s ? <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{s}</div> : null}
        </div>
      ))}
      {/* arrows */}
      <svg width={CANVAS_W} height={CANVAS_H} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "visible" }}>
        {E.map(([f, t, kind, route, label], i) => {
          const pts = pointsFor(f, t, route);
          const st = STYLE[kind];
          const lp = label ? labelPos(pts) : null;
          return (
            <g key={i}>
              <path d={path(pts)} fill="none" stroke={st.c} strokeWidth={st.w} strokeDasharray={st.d} strokeLinejoin="round" strokeLinecap="round" />
              {head(pts, st.c)}
              {label ? (
                <g transform={`translate(${lp[0]},${lp[1]})`}>
                  <rect x={-(label.length * 3.5 + 8)} y={-11} width={label.length * 7 + 16} height={22} rx={11} fill="#fff" stroke={st.c} strokeWidth="1" opacity="0.96" />
                  <text x={0} y={4} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="11.5" fontWeight="700" fill={st.c}>{label}</text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
      {/* gap flags */}
      {GAPS.map((g, i) => <GapFlag key={i} col={g[0]} band={g[1]} title={g[2]} body={g[3]} yTop={g[4]} />)}
      {/* tiles */}
      {Object.values(N).map((n) => <Tile key={n.id} n={n} />)}
    </div>
  );
}

/* ── pan / zoom shell ── */
const HEADER_H = 60;
function fitView() {
  const w = window.innerWidth, h = window.innerHeight - HEADER_H;
  const s = Math.min(w / CANVAS_W, h / CANVAS_H) * 0.96;
  return { scale: s, tx: (w - CANVAS_W * s) / 2, ty: HEADER_H + 16 };
}
function App() {
  const load = () => { try { const v = JSON.parse(localStorage.getItem("lynia-journey-view")); if (v && v.scale) return v; } catch (e) {} return fitView(); };
  const [view, setView] = React.useState(load);
  const drag = React.useRef(null);
  React.useEffect(() => { try { localStorage.setItem("lynia-journey-view", JSON.stringify(view)); } catch (e) {} }, [view]);
  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (!drag.current) return; setView((v) => ({ ...v, tx: drag.current.tx + (e.clientX - drag.current.x), ty: drag.current.ty + (e.clientY - drag.current.y) })); };
  const onUp = (e) => { drag.current = null; };
  const onWheel = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0016);
      const ns = Math.min(2.4, Math.max(0.05, v.scale * factor));
      const k = ns / v.scale;
      return { scale: ns, tx: mx - (mx - v.tx) * k, ty: my - (my - v.ty) * k };
    });
  };
  const zoom = (f) => setView((v) => {
    const w = window.innerWidth / 2, h = (window.innerHeight + HEADER_H) / 2;
    const ns = Math.min(2.4, Math.max(0.05, v.scale * f)), k = ns / v.scale;
    return { scale: ns, tx: w - (w - v.tx) * k, ty: h - (h - v.ty) * k };
  });
  const legend = [
    ["#006630", "solid", "Main flow"], ["#006630", "solid", "Act transition"],
    ["#b07d00", "dash", "Branch"], ["#c0392b", "dash", "Error path"],
    ["#5b6670", "dot", "Return / loop"], ["#f2b705", "gap", "Gap · not designed"],
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "#e7ebed", fontFamily: "var(--font-sans)", overflow: "hidden" }}>
      {/* header */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: HEADER_H, background: "var(--bg)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 16, padding: "0 18px", zIndex: 50, boxSizing: "border-box" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="26" height="26" viewBox="0 0 96 96" aria-hidden="true"><polygon points="28,6 58,32 38,42" fill="var(--accent)" /><polygon points="90,26 14,52 48,60" fill="var(--accent)" /><polygon points="90,26 48,60 42,84" fill="var(--accent-700)" /></svg>
          <span style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600, fontSize: 18, color: "var(--ink)" }}>Lynia<span style={{ color: "var(--accent-700)" }}>Go</span></span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Customer journey — screen map</span>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginLeft: 8 }}>
          {legend.map(([c, k, l], i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>
              {k === "gap"
                ? <span style={{ width: 16, height: 10, borderRadius: 3, background: "var(--highlight-wash)", border: "1.5px dashed var(--highlight-border)" }} />
                : <span style={{ width: 20, height: 0, borderTop: `${k === "solid" ? 3 : 2}px ${k === "dot" ? "dotted" : k === "dash" ? "dashed" : "solid"} ${c}` }} />}
              {l}
            </span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {[["−", () => zoom(1 / 1.25)], ["+", () => zoom(1.25)], ["Fit", () => setView(fitView())]].map(([l, fn], i) => (
            <button key={i} onClick={fn} style={{ minWidth: 38, height: 34, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
      </div>
      {/* viewport */}
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onWheel={onWheel}
        style={{ position: "absolute", top: HEADER_H, left: 0, right: 0, bottom: 0, overflow: "hidden", cursor: "grab", touchAction: "none" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, transformOrigin: "0 0", transform: `translate(${view.tx}px,${view.ty}px) scale(${view.scale})` }}>
          <Canvas />
        </div>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
