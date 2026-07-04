/* LyniaGo — RIDER journey flow-map: canvas layout, arrows, band labels, cluster zones, gap flags
   (with severity), and pan/zoom. Consumes window.RJ (screen renderers). Mounts to #root. */

const RJ = window.RJ;
const DSc = window.LyniaDesignSystem_94c56a;
const { Icon: Ic } = DSc;

/* ── geometry ── */
const COLW = 430, X0 = 150, PHONE_H = 640, TILE_W = 336, TITLE_H = 34, ANNO_GAP = 12;
const X = (c) => X0 + c * COLW;
const B = { B0: 120, B1: 1020, B2: 1920, B3: 2820, B4: 3720, B4b: 4620, B5: 5520, B6: 6480, B7: 7440 };
const CANVAS_W = 3260, CANVAS_H = 8400;

/* ── nodes ── */
const N = {};
function node(id, col, band, badge, title, anno, bg) { N[id] = { id, x: X(col), y: band, col, band, badge, title, anno, bg }; }
// Act 0 — first run & sign in
node("splash", 0, B.B0, "0·1", "Splash", { p: "Brand launch moment while the app boots.", s: "Loading (2s, dove lift-in)", c: "— auto-advances" }, "var(--accent)");
node("onboard", 1, B.B0, "0·2", "Onboarding · rider", { p: "Sell the rider promise in 3 slides — earn on your bike, name your fare, cash on delivery. First install only.", s: "Slide 2 of 3 · skippable", c: "Next / Get started" });
node("login", 2, B.B0, "0·3", "Phone sign-in", { p: "Same phone-first auth as the customer app — one number, one account.", s: "Empty → typing", c: "Send code" });
node("otp", 3, B.B0, "0·4", "WhatsApp OTP", { p: "Verify the 6-digit code delivered over WhatsApp.", s: "Awaiting 6 digits", c: "Verify" });
node("role_select", 4, B.B0, "0·5", "Choose your role", { p: "The fork — sign-in is identical to the customer up to here. A signed-in user says whether they want to send parcels or ride. One account, switchable later.", s: "Rider selected", c: "Continue as a rider" });
node("perm_loc", 5, B.B0, "0·6", "Permission · location", { p: "Prime GPS before the OS dialog — shows parcels near you and navigates to pickups.", s: "Pre-permission", c: "Allow location" });
node("perm_notif", 6, B.B0, "0·7", "Permission · notifications", { p: "Prime push so new-order pings and 'you were picked' alerts land.", s: "Pre-permission", c: "Turn on notifications" });
// Act 1 — KYC / become a rider
node("kyc_intro", 0, B.B1, "1·1", "Become a rider", { p: "Entry gate — a verified ID + bike is required before going online. Empty-state CTA.", s: "Not started", c: "Become a rider" });
node("kyc_form", 1, B.B1, "1·2", "KYC form + consent", { p: "Name, national ID, bike registration, rider photo, and a plain-language consent block naming the partner (Didit) and what's collected. Pre-filled from account registration for customer-first users — no double entry. (S12)", s: "Filled · valid", c: "Submit for verification" });
node("kyc_pending", 2, B.B1, "1·3", "Verification pending", { p: "ID check is with Didit (selfie liveness in-browser). Rider waits — usually under a minute.", s: "Pending", c: "Continue in browser" });
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
// Persistent — account
node("profile", 0, B.B6, "A·1", "Account", { p: "Identity, rating, verified badge; entry to bike/docs, trips, earnings, sign-out.", s: "Default", c: "Bike & documents" });
node("bike_docs", 1, B.B6, "A·2", "Bike & documents", { p: "The verified ID, bike registration and rider photo, each with a status pill. Read-only; changes route to support.", s: "All verified", c: "— (support to edit)" });
node("history", 2, B.B6, "A·3", "Trip history", { p: "Every parcel delivered, with fare, rating and status (incl. a 'not delivered' terminal).", s: "List", c: "— (tap a trip)" });
node("settings", 3, B.B6, "A·4", "Settings", { p: "Bike & documents, notifications, language, payment (cash), sign-out.", s: "Default", c: "— (row actions)" });
node("help", 4, B.B6, "A·5", "Help & support", { p: "Rider-framed topics (undeliverable, wrong code, account); live help routes to WhatsApp.", s: "Default", c: "Chat on WhatsApp" });
// System / edge
node("offline", 0, B.B7, "S·1", "Offline banner", { p: "Global muted banner over any screen when the socket drops — shown here over the board.", s: "Offline", c: "— auto-recovers" });
node("on_hold", 1, B.B7, "S·2", "Account on hold", { p: "Suspended pending review (e.g. repeated cancels/complaints) — blocks riding, hands back a support action.", s: "Blocking", c: "Contact support" });
node("force_update", 2, B.B7, "S·3", "Force update", { p: "Hard version gate — must update to keep riding.", s: "Blocking", c: "Update now" }, "var(--accent)");
node("no_gps", 3, B.B7, "S·4", "Location off / no GPS", { p: "GPS unavailable — can't go online; offers settings.", s: "Blocking (recoverable)", c: "Open location settings" });
node("generic_error", 4, B.B7, "S·5", "Generic error", { p: "Catch-all load failure; reassures the active job is safe.", s: "Error", c: "Try again" });

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
  ["profile", "bike_docs", "flow", "h", "Bike & documents"],
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
];

/* ── gap flags (not-yet-designed, with severity) ── */
const GAPS = [
  [4, B.B2, "P2", "Demand / heat-map hint", "No guidance on where to position for orders — riders guess the busy corridors. A simple demand hint would cut idle time."],
  [4, B.B2, "P3", "Scheduled availability / shifts", "Online is all-or-nothing now — no way to set hours, get reminded for peak windows, or reserve a shift.", B.B2 + 300],
  [4, B.B3, "P2", "Multi-job queue", "One offer / one job at a time — no way to line up the next parcel while finishing the current one."],
  [3, B.B4b, "P2", "Ratings & reliability dashboard", "The reliability score is mentioned (bail warning) but never shown — no acceptance rate, cancels, or rating trend the rider can see."],
  [2, B.B4b, "P1", "Rider SOS / report", "No emergency control or report-a-customer on a live job — table-stakes for an in-person cash hand-off."],
  [2, B.B5, "P3", "In-app payout / mobile money", "Cash-only by decision — but EcoCash is the dominant rail. No wallet, payout, or reconciliation. Roadmap: the superapp finance spine."],
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
