/* LyniaGo — RIDER journey flow-map: canvas layout, arrows, band labels, cluster zones, gap flags
   (with severity), and pan/zoom. Consumes window.RJ (screen renderers). Mounts to #root. */

const RJ = window.RJ;
const DSc = window.LyniaDesignSystem_94c56a;
const { Icon: Ic } = DSc;

/* ── geometry ── */
const COLW = 430, X0 = 150, PHONE_H = 640, TILE_W = 336, TITLE_H = 34, ANNO_GAP = 12;
const X = (c) => X0 + c * COLW;
const B = { B0: 120, B1: 1020, B2: 1920, B3: 2820, B4: 3720, B4b: 4620, B5: 5520, B5b: 6480, B6: 7440, B7: 8400, B8: 9420, B9: 10560, B10: 11700 };
const CANVAS_W = 3260, CANVAS_H = 12760;

/* ── nodes ── */
const N = {};
function node(id, col, band, badge, title, anno, bg) { N[id] = { id, x: X(col), y: band, col, band, badge, title, anno, bg }; }
// Act 0 — first run & sign in
node("splash", 0, B.B0, "0·1", "Splash", { p: "Brand launch moment while the app boots.", s: "Loading (2s, dove lift-in)", c: "— auto-advances" }, "var(--accent)");
node("onboard", 1, B.B0, "0·2", "Onboarding · rider", { p: "Sell the rider promise in 3 slides — earn on your bike, name your fare, cash on delivery. First install only.", s: "Slide 2 of 3 · skippable", c: "Next / Get started" });
node("login", 2, B.B0, "0·3", "Phone sign-in", { p: "Same phone-first auth as the customer app — one number, one account.", s: "Empty → typing", c: "Send code" });
node("otp", 3, B.B0, "0·4", "SMS OTP", { p: "Verify the 6-digit code delivered by SMS.", s: "Awaiting 6 digits", c: "Verify" });
node("role_select", 4, B.B0, "0·5", "Choose your role", { p: "The fork — sign-in is identical to the customer up to here. A signed-in user says whether they want to send parcels or ride. One account, switchable later.", s: "Rider selected", c: "Continue as a rider" });
node("perm_loc", 5, B.B0, "0·6", "Permission · location", { p: "Prime GPS before the OS dialog — shows parcels near you and navigates to pickups.", s: "Pre-permission", c: "Allow location" });
node("perm_notif", 6, B.B0, "0·7", "Permission · notifications", { p: "Prime push so new-order pings and 'you were picked' alerts land.", s: "Pre-permission", c: "Turn on notifications" });
// Act 1 — KYC / become a rider
node("kyc_intro", 0, B.B1, "1·1", "Become a rider", { p: "Entry gate — a verified ID + bike is required before going online. Empty-state CTA.", s: "Not started", c: "Become a rider" });
node("kyc_form", 1, B.B1, "1·2", "KYC form + consent", { p: "Name, national ID, bike registration, rider photo, and a plain-language consent block naming the partner (Didit) and what's collected. Pre-filled from account registration for customer-first users — no double entry. (S12)", s: "Filled · valid", c: "Submit for verification" });
node("kyc_pending", 2, B.B1, "1·3", "Verification pending", { p: "ID check is with Didit, in-app (SDK capture + selfie liveness). Rider waits — usually under a minute; no action needed.", s: "Pending", c: "— waits (no action)" });
node("kyc_verified", 3, B.B1, "1·4", "Verified", { p: "ID + bike approved. The one moment that unlocks going online.", s: "Verified", c: "Go online" });
node("kyc_failed", 4, B.B1, "1·b1", "Verification failed", { p: "Blurry photo / glare / mismatch. Honest reason + one retry, support if it persists. (Edge)", s: "Failed", c: "Try again" });
node("kyc_expired", 5, B.B1, "1·b2", "ID expired (later)", { p: "A previously-verified rider whose document lapsed — blocked from going online until they re-verify. (Edge)", s: "Blocked · re-verify", c: "Re-verify my ID" });
// Act 2 — online & board
node("rider_offline", 0, B.B2, "2·1", "Rider · offline", { p: "Default dashboard after verifying. Big go-online toggle; nothing visible until online.", s: "Offline", c: "Go online" });
node("online_empty", 1, B.B2, "2·2", "Online · no orders", { p: "Online but quiet corridor. Reassures 'first in line' + names the busy hours instead of a dead screen.", s: "Online · empty board", c: "— wait for orders" });
node("board", 2, B.B2, "2·3", "Order board", { p: "Live list of nearby parcels — route, items, distance and asking price per card.", s: "Online · 3 orders", c: "Make an offer" });
node("missed_order", 3, B.B2, "2·b1", "Order taken first", { p: "A parcel the rider eyed was accepted by someone else — muted notice, card greys out, board moves on. (Edge)", s: "Race · order gone", c: "— pick another" });
// Act 3 — make an offer
node("offer_compose", 0, B.B3, "3·1", "Make an offer", { p: "Segmented control: accept the asking price in one tap, OR counter with your own fare + ETA. One offer per order.", s: "Counter mode", c: "Send counter-offer" });
node("offer_sent", 1, B.B3, "3·2", "Offer sent · waiting", { p: "Locked in at this price while the customer decides — a live countdown mirrors the customer's 90s auction window. A declined counter stays live at your price until the window closes (one round, no counter-back). Board stays open.", s: "Bid pending · 0:47 left", c: "— await decision" });
node("picked", 2, B.B3, "3·3", "Customer picked you", { p: "The win state — customer selected this rider. One tap opens the active job. If the customer cancels in the moments before you confirm, the job closes with the 'customer cancelled' notice (4·b5) — never a dead screen. (S3)", s: "Selected", c: "Open job" });
node("not_chosen", 3, B.B3, "3·b1", "Not chosen", { p: "Customer picked another rider. Never framed as failure — you're still online and first for the next. (Edge)", s: "Bid lost", c: "— back to board" });
node("bid_expired", 5, B.B3, "3·b2", "Auction expired · no pick", { p: "The customer's 90s window closed without anyone picked — distinct from losing to another rider. If they re-broadcast at a new price it appears as a fresh board card. (Edge · S1)", s: "Window closed", c: "— watch the board" });
// Act 4 — the active job
node("job_assigned", 0, B.B4, "4·1", "Job · assigned", { p: "Review items, sender's note, and both contact numbers (revealed for the live ride). Confirm to start.", s: "Assigned", c: "Confirm the job" });
node("job_pickup", 1, B.B4, "4·2", "En route to pickup", { p: "Live map + rider stepper (rider labels). Navigate to the sender.", s: "En route pickup", c: "Arrived at pickup" });
node("job_verify", 2, B.B4, "4·3", "Verify items at pickup", { p: "The rider sees the sender's item list and ticks each one off — confirming exactly what's collected before riding on. Recipient still verifies delivery with the code.", s: "Ticking items", c: "Confirm 3 items collected" });
node("job_collect", 3, B.B4, "4·4", "Parcel collected", { p: "Collection confirmed; parcel is now on the bike. Head to the drop-off.", s: "Picked up", c: "Head to drop-off" });
node("job_dropoff", 4, B.B4, "4·5", "En route to drop-off", { p: "Approaching the recipient; the hand-off code entry is ready below the map.", s: "En route drop-off", c: "Enter delivery code" });
node("job_handoff", 5, B.B4, "4·6", "Delivery-OTP hand-off", { p: "Ask the recipient for the 6-digit code and enter it — the proof that closes the delivery.", s: "Confirming hand-off", c: "Confirm delivery" });
node("job_delivered", 6, B.B4, "4·7", "Delivered", { p: "Hand-off confirmed. Fare recorded to earnings; optional rate-the-sender (flag a no-show or cash problem) makes feedback two-way. 'You're free for the next job.' (S10)", s: "Delivered", c: "Back to board" });
// Act 4 — branches & failures
node("job_bail", 0, B.B4b, "4·b3", "Rider cancels (bail)", { p: "Rider can't finish — cancel-with-reason re-broadcasts the order at the same price. Only available BEFORE pickup; once the parcel's collected, finish the job or mark it undeliverable (breakdown is a recorded reason). Warns it dents the reliability score. (Edge · P0 · S4)", s: "Cancelling job", c: "Confirm cancellation" });
node("job_offline", 1, B.B4b, "4·b4", "Connection lost mid-job", { p: "Socket drops while on a job (any stage) — muted 'live paused', job saved locally, keeps riding and syncs on reconnect. The customer's tracking shows the same muted pause; both sides escalate to a notice after ~2 min dark. (Edge · S8)", s: "Reconnecting", c: "— auto-recovers" });
node("undelivered", 4, B.B4b, "4·b2", "Not delivered (terminal)", { p: "Recipient unreachable / refused / wrong address / rider breakdown, after 3 tries. Rider records the reason — it's shown on the customer's terminal screen. Parcel stays with the rider, settled off-platform. (Edge · P1 · S6)", s: "Undeliverable", c: "Back to board" });
node("handoff_wrong", 5, B.B4b, "4·b1", "Wrong code · lockout", { p: "Code doesn't match — inline error with attempts remaining; locks after 5. 'Ask customer to re-send' pings the sender, who re-issues from their order screen (a button they already have). (Edge · S7)", s: "Wrong code", c: "Ask customer to re-send" });
node("job_cancelled", 6, B.B4b, "4·b5", "Customer cancelled", { p: "The customer exercised cancel-anytime mid-job. Before pickup: you're simply free, back to the board. After pickup (shown): the parcel is on your bike — hand it back directly with the sender, settled off-platform. Doesn't touch your reliability score. (Edge · P0 · S5)", s: "Job ended by customer", c: "Back to board" });
// Act 5 — earnings
node("earnings", 0, B.B5, "5·1", "Earnings", { p: "Lean by design: total agreed-&-delivered, a trip list, and the off-platform cash disclaimer. A record of work — not a wallet.", s: "With trips", c: "— review only" });
node("earnings_new", 1, B.B5, "5·2", "Earnings · new rider", { p: "Zero trips — $0.00 with a warm 'your first fare starts here' rather than an empty ledger. (Edge)", s: "Empty · new", c: "Go online" });
// Act 5b — commission wallet (post-flip reveal, plan §2 wallet)
node("wallet", 0, B.B5b, "5b·1", "Wallet", { nw: 1, p: "The dedicated commission wallet, opened from the Earnings 'Commission balance ›' row (server-flag gated until the flip). Balance hero uses --surface with an icon tile — deliberately distinct from the green earnings hero (one green money hero per app). Show-the-math receipts + honest-copy card.", s: "Positive · $4.85", c: "Top up", ic: "banknote, package", a: "Receipt rows carry full-sentence labels; money is tabular", ref: "earnings (5·1) row" });
node("topup_amount", 1, B.B5b, "5b·2", "Top up · amount", { nw: 1, p: "Amount entry — min $5 enforced inline, quick-amount chips, a phone-number field (pre-filled with the rider's registered line, editable — this is the number the prompt is pushed to), then the rail selector. EcoCash / InnBucks / O'mari all push a prompt to that number, so there's one flow, not a manual branch. The screen's one primary CTA.", s: "$10 · O'mari", c: "Request $10.00 via O'mari", ic: "— rail badges", a: "Labels above inputs; chips & rails ≥44px; phone validated to local 07x format", ref: "wallet (5b·1)" });
node("topup_wait", 2, B.B5b, "5b·3", "Payment prompt · wait", { nw: 1, p: "The one sanctioned wait animation — a 90-second countdown while the chosen rail's prompt sits on the rider's phone. The screen names the rail + the number; calm copy + a cancel affordance; a timeout returns 'the request expired — no money moved. Try again.'", s: "Approving · 62s", c: "— await approval", ic: "— countdown ring", a: "Countdown is role=status; ring crossfades to danger in the last 20s", ref: "customer auction timer" });
node("topup_success", 3, B.B5b, "5b·4", "Top up · success", { nw: 1, p: "Credit cleared: balance ticks up and the new top-up row appears at the top of the ledger, labelled with the rail used.", s: "+$10.00 · confirmed", c: "Back to wallet", ic: "check, banknote", a: "Single ≥44px action", ref: "kyc_verified (1·4) tone" });
node("wallet_low", 4, B.B5b, "5b·b1", "Wallet · low / owed", { nw: 1, p: "Negative / below-floor variant: the hero switches to --danger-wash with the amount in ink (never red text on white), a below-floor chip, and the owed caption. The number netts against the next top-up.", s: "Owed · −$0.30", c: "Top up", ic: "banknote", a: "Danger is a wash, never red text; amount stays ink", ref: "gate_commission (A5)" });
node("topup_declined", 5, B.B5b, "5b·b2", "Top up · declined", { nw: 1, p: "Prompt was answered but the payment failed — distinct from the expired/timeout path. Honest reason-copy names the rail ('no money left your EcoCash; balance too low or you declined on the phone'). One 'Try again' action returns to the amount step. No money moved.", s: "Declined · no money moved", c: "Try again", ic: "circle-alert", a: "Reuses the EmptyState template; calm not alarming — icon in muted, not red", ref: "topup_wait (5b·3)" });
// Persistent — account
node("profile", 0, B.B6, "A·1", "Account", { p: "Identity, rating, verified badge; entry to bike/docs, trips, earnings, sign-out.", s: "Default", c: "Bike & documents" });
node("bike_docs", 1, B.B6, "A·2", "Bike & documents", { p: "The verified ID, bike registration and rider photo, each with a status pill. Read-only; changes route to support.", s: "All verified", c: "— (support to edit)" });
node("history", 2, B.B6, "A·3", "Trip history", { p: "Every parcel delivered, with fare, rating and status (incl. a 'not delivered' terminal).", s: "List", c: "— (tap a trip)" });
node("settings", 3, B.B6, "A·4", "Settings", { p: "Bike & documents, notifications, language, payment (cash), sign-out.", s: "Default", c: "— (row actions)" });
node("help", 4, B.B6, "A·5", "Help & support", { p: "Rider-framed topics (undeliverable, wrong code, account); live help routes to WhatsApp.", s: "Default", c: "Chat on WhatsApp" });
// System / edge
node("offline", 0, B.B7, "S·1", "Offline banner", { p: "Global muted banner over any screen when the socket drops — shown here over the board.", s: "Offline", c: "— auto-recovers" });
node("on_hold", 1, B.B7, "S·2", "Account on hold", { p: "Suspended pending review (e.g. repeated cancels/complaints) — blocks riding. Retrofitted (plan §2·A): 'Contact support' is now a real tel: call row (+263 77 883 1938), not dead text — same exit the A-band gate states inherit.", s: "Blocking", c: "Call Lynia support" });
node("force_update", 2, B.B7, "S·3", "Force update", { p: "Hard version gate — must update to keep riding.", s: "Blocking", c: "Update now" }, "var(--accent)");
node("no_gps", 3, B.B7, "S·4", "Location off / no GPS", { p: "GPS unavailable — can't go online; offers settings.", s: "Blocking (recoverable)", c: "Open location settings" });
node("generic_error", 4, B.B7, "S·5", "Generic error", { p: "Catch-all load failure; reassures the active job is safe.", s: "Error", c: "Try again" });
// NEW · Go-online gate states (plan §2 · A1–A4) — one reason-keyed EmptyState template (gates.ts)
node("gate_out_of_area", 0, B.B8, "A1", "Gate · out of area", { nw: 1, p: "Rider tapped Go online outside the Harare service corridor (fix R10, isOutOfServiceArea). Same dashboard, offline pill, reason-keyed EmptyState. Refreshing re-checks position against SERVICE_CORRIDOR.", s: "Refused · out_of_area", c: "Refresh status", h: "1st title · 2nd Refresh action · 3rd why-copy", ic: "circle-alert", a: "Title is the screen-reader heading; action 52px", ref: "no_gps (S·4) + customer no_riders (2·b1)" });
node("gate_cooldown", 1, B.B8, "A2", "Gate · cooldown", { nw: 1, p: "Refused with reason `cooldown` after a recent cancellation — short, self-healing. Copy matches gates.ts ONLINE_GATE_COPY verbatim in tone: calm, no blame, a clear retry.", s: "Refused · cooldown", c: "Try again", h: "1st title · 2nd Try-again action · 3rd why-copy", ic: "clock", a: "Retry announces remaining wait if refused again", ref: "on_hold (S·2)" });
node("gate_banned", 2, B.B8, "A3", "Gate · account closed", { nw: 1, p: "Reason `banned` — permanent, shipped in code (PR #98) with no mockup. Final but not punitive: states the fact, offers the mistake-path. The support call row is the mandatory exit — a dead end without one is the #1 failure this cluster fixes.", s: "Refused · banned (terminal)", c: "Call Lynia support", h: "1st title · 2nd support call row · 3rd why-copy", ic: "triangle-alert, phone", a: "Call row ≥44px with visible number; Sign out ≥44px", ref: "kyc_failed (1·b1)" });
node("gate_kyc_locked", 3, B.B8, "A4", "Gate · verification locked", { nw: 1, p: "Fix R4: isKycLocked — 2 failed ID checks exhausts self-resubmit; today's UI shows only a useless Refresh. Support finishes verification together with the rider — the lock is a hand-off, not a punishment.", s: "Refused · kyc lock", c: "Call Lynia support", h: "1st title · 2nd support call row · 3rd why-copy", ic: "triangle-alert, phone", a: "Call row ≥44px with visible number", ref: "kyc_failed (1·b1)" });
node("gate_commission", 4, B.B8, "A5", "Gate · top up to keep riding", { nw: 1, p: "commission_low_balance refusal — balance below the $2 floor blocks going online. Joins the gate family (same layout/voice as cooldown/on-hold): status → reason → the EXACT amount needed → one CTA deep-linking into the Wallet top-up. Clears to a quiet 'you're back online' once a credit lifts the floor. Never fires at 0%.", s: "Refused · commission_low_balance", c: "Top up $1.15", h: "1st title · 2nd amount callout + CTA · 3rd reassurance", ic: "banknote", a: "Reads status → reason → amount → action in one pass; calm (mint), not punitive", ref: "wallet (5b·1) · rider_offline (2·1)" });
// NEW · Trust & safety (plan §2 · B1–B3) — aligns the UI shipped in PR #98 to safety.ts
node("sos_idle", 0, B.B9, "B1·1", "SOS · live-job control", { nw: 1, p: "Same shared SOS control as the customer map, pinned over the job map on every live stage — table-stakes for an in-person cash hand-off. Tapping opens the confirm sheet; it never dials by itself.", s: "Idle · live job", c: "Tap SOS", h: "1st SOS pill · 2nd recipient call row · 3rd stepper", ic: "phone · SOS is a text pill, no new glyph", a: "≥44px, aria-label “Emergency — call for help”, one-handed reach (top-right)", ref: "job_dropoff (4·5)" });
node("sos_confirm", 1, B.B9, "B1·2", "SOS · confirm", { nw: 1, p: "Deliberate second step (shared sheet — customer B1·2). Confirming shows the numbers immediately and best-effort logs the SOS with job + location; the log never gates the numbers.", s: "Confirm sheet", c: "Show emergency numbers", h: "1st confirm button · 2nd explainer · 3rd cancel", ic: "triangle-alert", a: "56px confirm; Cancel ≥44px", ref: "customer SOS B1·2" });
node("sos_contacts", 2, B.B9, "B1·3", "SOS · contacts", { nw: 1, p: "SosContacts tel: rows — Call-999 dominant, Lynia safety line second. The offline/error state is drawn once on the customer map (B1·4) — identical here: numbers render even when the log call fails.", s: "Contacts shown", c: "Call 999", h: "1st Call-999 row · 2nd safety line · 3rd alerted note", ic: "phone, arrow-right, check", a: "Call row 76px, aria “Emergency — call for help”; plain tel: links", ref: "customer SOS B1·3/B1·4" });
node("report", 3, B.B9, "B2·1", "Report + block customer", { nw: 1, p: "Post-job report of the counterparty from the delivered/rate-the-sender screen. Matches reportUser: reason + optional block — a blocked customer's requests never reach this rider's board again.", s: "Reason picked · block on", c: "Send report", h: "1st reason list · 2nd block toggle · 3rd details", ic: "user, banknote, circle-alert, inbox, check", a: "Reason rows ≥44px; block toggle labelled, not colour-only", ref: "Undelivered reason list (4·b2)" });
node("report_done", 4, B.B9, "B2·2", "Report sent", { nw: 1, p: "ReportResult { id, blocked } → calm terminal: anonymity stated, block confirmed, straight back to the board.", s: "Confirmation", c: "Back to board", h: "1st title · 2nd reassurance · 3rd back", ic: "check", a: "Single ≥44px action", ref: "not_chosen (3·b1) tone" });
node("job_help", 5, B.B9, "B3·1", "Get help with this job", { nw: 1, p: "Job-level help from the rider job screen — distinct from account Help (A·5, WhatsApp): job context attached, files an Issue via raiseIssue (type + description).", s: "Issue type picked", c: "Send to Lynia", h: "1st issue-type list · 2nd job context · 3rd details", ic: "phone, banknote, map-pin, package, circle-alert", a: "Type rows ≥44px", ref: "help (A·5) — contrast on purpose" });
node("job_help_sent", 6, B.B9, "B3·2", "Issue logged", { nw: 1, p: "RaisedIssue { id, status } → confirmation with issue id + open status pill; follow-up on WhatsApp. Conflicts resolve to clean copy (“this order already closed”), never a raw error.", s: "Submitted · open", c: "Back to job", h: "1st we've-got-it · 2nd issue id + status · 3rd back", ic: "check", a: "Status pill carries text, not colour-only", ref: "kyc_verified (1·4)" });
// NEW · KYC rider-photo states (plan §2 · E) — extends the KycForm photo row
node("photo_capture", 0, B.B10, "E·1", "Rider photo · capture", { nw: 1, p: "Camera stage for the RIDER PORTRAIT (D3 — the vendor SDK photographs the document itself; this photo is for the admin reviewer, and the fallback when KYC_MODE=manual): portrait oval guide + the three face-framing rules. Entry: the photo row on kyc_form (1·2).", s: "Camera open", c: "Take photo (shutter)", h: "1st oval guide · 2nd shutter · 3rd rules line", ic: "x (close) · both close and shutter are controls, not glyphs", a: "Shutter 68px aria “Take photo”; close --target-min aria “Close” (N-02 — it is the only exit from a full-bleed camera); white-on-ink contrast", ref: "kyc_form (1·2)" });
node("photo_preview", 1, B.B10, "E·2", "Rider photo · preview", { nw: 1, p: "Self-check before upload — blur/shadow is what makes a portrait unusable for the reviewer, so the rider filters it here instead of burning one of two attempts. Retake keeps the current saved photo.", s: "Reviewing", c: "Use this photo", h: "1st photo · 2nd clarity question · 3rd use/retake", ic: "— (photo placeholder)", a: "Actions ≥ --target-min; question is the heading", ref: "kyc_failed reasons (1·b1)" });
node("photo_uploading", 2, B.B10, "E·3", "Rider photo · uploading", { nw: 1, p: "Non-blocking upload inside the form: visible progress, the rest of the form stays editable, Submit disabled until the photo lands. Slow networks are the norm here — never a full-screen spinner.", s: "Uploading · 60%", c: "— keep filling the form", h: "1st progress row · 2nd form fields · 3rd disabled submit", ic: "id-card", a: "Progress is role=status with percent text, not colour-only", ref: "kyc_form (1·2)" });
node("photo_failed", 3, B.B10, "E·4", "Rider photo · upload failed", { nw: 1, p: "Recoverable failure (fix P3): retry in place, and the retake-preserve rule stated outright — the last good photo is only replaced once a new one uploads. A failed retry never wipes anything.", s: "Failed · recoverable", c: "Try again", h: "1st failure row + retry · 2nd keep-current option · 3rd preserve note", ic: "circle-alert, check", a: "Error tied to the photo row; both actions ≥ --target-min", ref: "handoff_wrong recovery (4·b1)" });

/* ── edges ──  kind: flow | trans | ret | branch | err · route: h | rail | railB | railup | drop | lift */
const E = [
  ["splash", "onboard", "flow", "h"], ["onboard", "login", "flow", "h"], ["login", "otp", "flow", "h"],
  ["otp", "role_select", "flow", "h"], ["role_select", "perm_loc", "flow", "h", "Earn as a rider"], ["perm_loc", "perm_notif", "flow", "h"],
  ["perm_notif", "kyc_intro", "trans", "rail", "First launch complete"],
  ["kyc_intro", "kyc_form", "flow", "h", "Become a rider"], ["kyc_form", "kyc_pending", "flow", "h", "Submit"],
  ["kyc_pending", "kyc_verified", "flow", "h", "Passes"],
  ["kyc_pending", "kyc_failed", "err", "drop", "Check fails"],
  ["kyc_failed", "kyc_form", "ret", "lift", "Try again"],
  ["kyc_verified", "kyc_expired", "err", "drop", "Document later lapses"],
  ["kyc_expired", "kyc_form", "ret", "lift", "Re-verify"],
  ["kyc_verified", "rider_offline", "trans", "rail", "Go online"],
  ["rider_offline", "board", "flow", "h", "Go online"],
  ["board", "online_empty", "branch", "drop", "Board clears"],
  ["online_empty", "board", "ret", "lift", "Order arrives"],
  ["board", "missed_order", "err", "drop", "Taken first"],
  ["missed_order", "board", "ret", "lift", "Pick another"],
  ["board", "offer_compose", "flow", "h", "Make an offer"],
  ["offer_compose", "offer_sent", "flow", "h", "Send offer"],
  ["offer_sent", "picked", "flow", "h", "Customer picks you"],
  ["offer_sent", "not_chosen", "err", "drop", "Picks another"],
  ["offer_sent", "bid_expired", "err", "drop", "Window closes"],
  ["not_chosen", "board", "ret", "lift", "Back to board"],
  ["bid_expired", "board", "ret", "lift", "Watch the board"],
  ["picked", "job_assigned", "trans", "rail", "Open job"],
  ["job_assigned", "job_pickup", "flow", "h", "Confirm"],
  ["job_pickup", "job_verify", "flow", "h", "At pickup"],
  ["job_verify", "job_collect", "flow", "h", "Items verified"],
  ["job_collect", "job_dropoff", "flow", "h"],
  ["job_dropoff", "job_handoff", "flow", "h"],
  ["job_handoff", "job_delivered", "flow", "h", "Code matches"],
  ["job_handoff", "handoff_wrong", "err", "drop", "Wrong code"],
  ["handoff_wrong", "job_handoff", "ret", "lift", "Re-issued"],
  ["job_dropoff", "undelivered", "err", "drop", "Can't deliver"],
  ["job_assigned", "job_bail", "err", "drop", "Rider cancels (pre-pickup)"],
  ["job_collect", "job_cancelled", "err", "drop", "Customer cancels"],
  ["job_pickup", "job_offline", "branch", "drop", "Connection drops"],
  ["job_delivered", "rider_offline", "ret", "railup", "Free for next job"],
  ["job_delivered", "earnings", "trans", "railB", "Fare recorded"],
  ["earnings", "earnings_new", "branch", "h", "New rider"],
  ["earnings", "wallet", "trans", "rail", "Commission balance ›"],
  ["wallet", "topup_amount", "flow", "h", "Top up"],
  ["wallet", "wallet_low", "branch", "drop", "Low / owed"],
  ["topup_amount", "topup_wait", "flow", "h", "Request prompt"],
  ["topup_wait", "topup_success", "flow", "h", "Approved"],
  ["topup_wait", "topup_declined", "branch", "drop", "Declined"],
  ["topup_success", "wallet", "ret", "lift", "Balance updated"],
  ["profile", "bike_docs", "flow", "h", "Bike & documents"],
  ["sos_idle", "sos_confirm", "flow", "h", "Tap SOS"],
  ["sos_confirm", "sos_contacts", "flow", "h", "Show numbers"],
  ["report", "report_done", "flow", "h", "Send report"],
  ["job_help", "job_help_sent", "flow", "h", "Send to Lynia"],
  ["photo_capture", "photo_preview", "flow", "h", "Take photo"],
  ["photo_preview", "photo_uploading", "flow", "h", "Use this photo"],
  ["photo_uploading", "photo_failed", "err", "h", "Connection drops"],
];

/* ── clusters (zone rects) ── */
const ZONES = [
  { x: X(0) - 26, y: B.B6 - 74, w: COLW * 4 + TILE_W + 52, label: "PERSISTENT · Account & support — reachable any time from the account avatar & settings" },
  { x: X(0) - 26, y: B.B7 - 74, w: COLW * 4 + TILE_W + 52, label: "SYSTEM & EDGE · overlays that can interrupt any screen" },
];

/* ── band labels ── */
const LABELS = [
  [B.B0, "ACT 0 · First run & sign in", "First install only — one phone-first account for both roles; returning riders land on the dashboard."],
  [B.B1, "ACT 1 · Become a rider (KYC)", "Verify a national ID + register a bike (Didit partner, consent recorded). A verified rider is the gate to going online."],
  [B.B2, "ACT 2 · Go online & the board", "One tap online; a live board of nearby parcels with route, items, distance and asking price."],
  [B.B3, "ACT 3 · Make an offer", "Accept the asking price in one tap, or counter with your own fare + ETA. One offer per order, one counter round — the customer accepts or declines, no counter-back."],
  [B.B4, "ACT 4 · The active job", "Confirm → navigate to pickup → collect → navigate to drop-off → enter the recipient's 6-digit code → delivered."],
  [B.B4b, "↳ Job branches & failures", null],
  [B.B5, "ACT 5 · Earnings", "A lean record of work done — total agreed & delivered, trip list, and the off-platform cash disclaimer. Not a wallet."],
  [B.B5b, "ACT 5b · Commission wallet (post-flip reveal)", "Ships hidden behind a server flag until the 5% flip. Balance hero (surface — distinct from the green earnings hero) → Top up (the one primary CTA) → show-the-math receipts → honest-copy card. Top-up: amount + rail → the 90s EcoCash USSD wait → success, or a manual instruction card for InnBucks / O'mari."],
  [B.B8, "NEW · Go-online gate states (plan §2 · A1–A5)", "ONE reason-keyed EmptyState template — icon / title / message / actions as props, exactly how gates.ts models OnlineGateReason (add out_of_area + banned to the union and each variant falls out for free). Every dead end has a real exit: Contact support is a tappable tel: call row (+263 77 883 1938), also retrofitted onto the existing on-hold screen (S·2). The commission_low_balance gate (A5) joins the same family, deep-linking into the Wallet top-up (5b)."],
  [B.B9, "NEW · Trust & safety — SOS, report, get help (plan §2 · B1–B3)", "Aligns the UI shipped in PR #98 to the real contracts in safety.ts. The SOS confirm/contacts sheet is one shared component with the customer map (offline/error state drawn there, B1·4). Decisions final (5 Jul): 999 · +263 77 883 1938 · tel: for support."],
  [B.B10, "NEW · KYC ID-photo states (plan §2 · E)", "Extends the KycForm “Photo added — retake” row into a full loop: capture → preview → upload, with a recoverable failure. A retake never wipes the last good photo."],
];

/* ── gap flags (not-yet-designed, with severity) ── */
const GAPS = [
  [4, B.B2, "P2", "Demand / heat-map hint", "No guidance on where to position for orders — riders guess the busy corridors. A simple demand hint would cut idle time."],
  [4, B.B2, "P3", "Scheduled availability / shifts", "Online is all-or-nothing now — no way to set hours, get reminded for peak windows, or reserve a shift.", B.B2 + 300],
  [4, B.B3, "P2", "Multi-job queue", "One offer / one job at a time — no way to line up the next parcel while finishing the current one."],
  [3, B.B4b, "P2", "Ratings & reliability dashboard", "The reliability score is mentioned (bail warning) but never shown — no acceptance rate, cancels, or rating trend the rider can see."],
  [2, B.B5, "P3", "Rider payout / cash-out", "Earnings are cash, off-platform — there's no in-app payout or mobile-money cash-out. (The commission wallet, Act 5b, is the inverse: riders fund it to pay commission; it isn't a payout balance.)"],
  [3, B.B5, "P3", "Incentives & bike-leasing hook", "No peak-hour bonuses, streaks, or the bike-leasing / credit upsell that the longer-term superapp vision rests on."],
];

/* ── anchors & routing ── */
function anchor(n, side, off = 0) {
  const cx = n.x + TILE_W / 2, top = n.y + TITLE_H, cy = top + PHONE_H / 2, bot = top + PHONE_H;
  if (side === "r") return [n.x + TILE_W, cy];
  if (side === "l") return [n.x, cy];
  if (side === "t") return [cx + off, top];
  return [cx + off, bot];
}
function pointsFor(from, to, route) {
  const A = N[from], Z = N[to];
  if (route === "h") { const a = anchor(A, "r"), b = anchor(Z, "l"); return [a, b]; }
  if (route === "drop") { const a = anchor(A, "b", -24), b = anchor(Z, "t", -24); const my = (a[1] + b[1]) / 2; return [a, [a[0], my], [b[0], my], b]; }
  if (route === "lift") { const a = anchor(A, "t", 24), b = anchor(Z, "b", 24); const my = (a[1] + b[1]) / 2; return [a, [a[0], my], [b[0], my], b]; }
  if (route === "rail") { const a = anchor(A, "b"), b = anchor(Z, "t"); const rx = 84; return [a, [a[0], a[1] + 40], [rx, a[1] + 40], [rx, b[1] - 40], [b[0], b[1] - 40], b]; }
  if (route === "railB") { const a = anchor(A, "b"), b = anchor(Z, "t"); const rx = 122; return [a, [a[0], a[1] + 40], [rx, a[1] + 40], [rx, b[1] - 40], [b[0], b[1] - 40], b]; }
  if (route === "railup") { const a = anchor(A, "t"), b = anchor(Z, "b"); const rx = 44; return [a, [a[0], a[1] - 40], [rx, a[1] - 40], [rx, b[1] + 40], [b[0], b[1] + 40], b]; }
  return [anchor(A, "r"), anchor(Z, "l")];
}
const STYLE = {
  flow: { c: "#006630", w: 3, d: "0" }, trans: { c: "#006630", w: 3.5, d: "0" },
  branch: { c: "#b07d00", w: 2.5, d: "7 6" }, err: { c: "#c0392b", w: 2.5, d: "7 6" },
  ret: { c: "#5b6670", w: 2, d: "3 6" },
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
      <Phone h={PHONE_H} bg={n.bg}>{RJ[n.id]()}</Phone>
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
const SEV = { P0: "#c0392b", P1: "#c0392b", P2: "#b07d00", P3: "#8a929a" };
function GapFlag({ col, band, sev, title, body, yTop }) {
  return (
    <div style={{ position: "absolute", left: X(col), top: yTop != null ? yTop : band + TITLE_H + 40, width: 320, background: "var(--highlight-wash)", border: "1.5px dashed var(--highlight-border)", borderRadius: 12, padding: "12px 14px", fontFamily: "var(--font-sans)", boxShadow: "0 6px 18px rgba(20,24,27,.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", color: "#8a6a00", background: "var(--highlight)", borderRadius: 5, padding: "2px 7px" }}>⚑ GAP</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: SEV[sev] || "#8a929a", borderRadius: 5, padding: "2px 7px" }}>{sev}</span>
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
      {ZONES.map((z, i) => (
        <div key={i} style={{ position: "absolute", left: z.x, top: z.y, width: z.w, height: TITLE_H + PHONE_H + ANNO_GAP + 96 + 60, background: "rgba(255,255,255,.55)", border: "1.5px dashed var(--line)", borderRadius: 20 }}>
          <div style={{ padding: "12px 18px", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, letterSpacing: ".02em", color: "var(--muted)" }}>{z.label}</div>
        </div>
      ))}
      {LABELS.map(([y, t, s], i) => (
        <div key={i} style={{ position: "absolute", left: X(0), top: y - 66, width: COLW * 5, fontFamily: "var(--font-sans)" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em" }}>{t}</div>
          {s ? <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{s}</div> : null}
        </div>
      ))}
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
      {GAPS.map((g, i) => <GapFlag key={i} col={g[0]} band={g[1]} sev={g[2]} title={g[3]} body={g[4]} yTop={g[5]} />)}
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
  const load = () => { try { const v = JSON.parse(localStorage.getItem("lynia-rider-journey-view")); if (v && v.scale) return v; } catch (e) {} return fitView(); };
  const [view, setView] = React.useState(load);
  const drag = React.useRef(null);
  React.useEffect(() => { try { localStorage.setItem("lynia-rider-journey-view", JSON.stringify(view)); } catch (e) {} }, [view]);
  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (!drag.current) return; setView((v) => ({ ...v, tx: drag.current.tx + (e.clientX - drag.current.x), ty: drag.current.ty + (e.clientY - drag.current.y) })); };
  const onUp = () => { drag.current = null; };
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
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: HEADER_H, background: "var(--bg)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 16, padding: "0 18px", zIndex: 50, boxSizing: "border-box" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="26" height="26" viewBox="0 0 96 96" aria-hidden="true"><polygon points="28,6 58,32 38,42" fill="var(--accent)" /><polygon points="90,26 14,52 48,60" fill="var(--accent)" /><polygon points="90,26 48,60 42,84" fill="var(--accent-700)" /></svg>
          <span style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600, fontSize: 18, color: "var(--ink)" }}>Lynia<span style={{ color: "var(--accent-700)" }}>Go</span></span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Rider journey — screen map</span>
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
