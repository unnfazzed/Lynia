/* LyniaGo Restaurants — journey maps for the three actors. Happy path across the top of each act,
   exception branches hanging beneath the step they fork from. Static; mounts to #root. */

const { Icon: MIcon } = window.LyniaDesignSystem_94c56a;

/* node: [id, label, note]  ·  branch: [tone, trigger, label, note]
   tone: warn (recoverable) | fail (terminal) | info (system) */
const CUSTOMER = {
  label: "Customer", tint: "var(--accent)", device: "Expo app · Android-first",
  lede: "One tile away on a single home screen. Same tracker grammar, same delivery code, new money rules.",
  acts: [
    ["One home, both services", [
      ["0·1", "Home · service tiles", "Address + search, service tile grid (Send · Food · Pharmacy soon), a live-order card per running job — ride or food — then restaurants near you."],
    ], [
      ["info", "third vertical ships", "One more tile", "Pharmacies fills the reserved tile; navigation and layout are untouched."],
    ]],
    ["Discover", [
      ["1·1", "Restaurant list", "Corridor-scoped, distance-sorted; closed shops visible with hours."],
      ["2·1", "Menu", "Out-of-stock dishes greyed, never hidden."],
    ], [
      ["warn", "no kitchen open", "Nothing open", "Icon + one sentence + notify-me. Steer to Send as the second action."],
      ["warn", "network down", "Offline list", "Serve the last cached list, stamped with its time. Retry inline."],
      ["warn", "closes while browsing", "Closed interrupt", "One modal, cart preserved, two ways out."],
    ]],
    ["Cart & checkout", [
      ["3·1", "Cart", "Arrival window promised, food + per-km fee itemised, upsell and add-more in reach."],
      ["3·2", "Note for the kitchen", "Free text per dish (leg not breast) or for the whole order; quick chips seed it. Never changes the price."],
      ["4·1", "Pay method", "CASH default; WALLET forced above the first-order cap. Cancellation cost stated."],
    ], [
      ["warn", "item sells out", "Re-total", "Remove, banner, new total. Never silently re-price."],
      ["warn", "price changed", "Accept new total", "Old → new shown; an explicit tap is required."],
      ["warn", "under $4.00", "Small-order fee", "Gap named in dollars, with the add-more route — never a dead button."],
      ["warn", "first order > $15", "Cash disabled", "Reason on the disabled row: the rider fronts the money. Wallet is pre-selected."],
      ["warn", "offline", "Draft kept locally", "Place button disabled, PII-free draft persisted, auto-retry every 10s."],
    ]],
    ["Merchant decides", [
      ["5·1", "Waiting", "3-minute accept cap, counted down on screen."],
      ["5·3", "Pay now (WALLET)", "Push + screen + manual rail (number, exact amount, reference). 10-minute window."],
      ["5·6", "Waiting to confirm", "Merchant matches the reference against their own statement before anyone cooks."],
    ], [
      ["fail", "no accept in 3 min", "Auto-cancelled", "Nothing cooked, nothing paid. Re-order in one tap."],
      ["warn", "one item missing", "Partial accept", "Customer approves the shorter order in 60s; the difference is refunded or simply not paid."],
      ["fail", "merchant rejects", "Reason shown", "Wallet: refund pending → refunded with the merchant's reference stored on the order."],
      ["fail", "window expires", "Order expired", "Never dispatched, kitchen never told to cook."],
      ["warn", "prompt fails", "Pay by USSD", "Manual reference entry; a wrong or short amount is rejected and refunded, never guessed at."],
    ]],
    ["Dispatch & track", [
      ["6·1", "Prep countdown", "Accepted + prep minutes, rider search running."],
      ["6·2", "Rider secured", "The kitchen's cook signal — surfaced to the customer too."],
      ["6·3", "On the way", "The shared tracker, live map, code always on screen."],
    ], [
      ["fail", "no rider in 6 min", "NO_RIDER", "Apology + retry + steer. Merchant never cooked; nothing charged."],
      ["warn", "rider drops the job", "Re-finding a rider", "Tracker steps back one, reason named, food keeps cooking; the merchant's prep clock pauses."],
      ["warn", "socket drops", "Live paused", "Muted chip, last-confirmed timestamp, code still readable offline."],
      ["warn", "customer cancels", "Pre-pickup only", "Free before collection; blocked after, with the reason stated up front."],
      ["info", "app killed", "Resume", "Reopen lands on the live order with a 'picking up where you left off' strip."],
    ]],
    ["Hand-off", [
      ["7·1", "Code + cash", "6-digit code read at the door; exact cash amount beside it."],
      ["7·2", "Rate", "Two-sided: the food and the rider, same pattern as Send."],
    ], [
      ["fail", "nobody answers", "Delivery failed", "8-minute wait + 2 logged calls, then goods return. Timeline shown as evidence."],
    ]],
  ],
};

const MERCHANT = {
  label: "Merchant", tint: "var(--ink)", device: "Next.js web · cheap Android tablet, Chrome",
  lede: "Two money screens (the queue and the pickup confirm) and a hard rule: never cook before 'rider secured'.",
  acts: [
    ["Get on shift", [
      ["M0·1", "Phone + OTP", "The sign-in tap is also the browser audio unlock — stated in copy."],
      ["M0·2", "Setup checklist", "Menu, hours, merchant payment numbers, alarm test."],
    ], [
      ["info", "tablet reboots", "Resume signed in", "Session restored, live orders re-listed, one tap re-arms the alarm."],
    ]],
    ["A new order lands", [
      ["M1·3", "NEW ORDER", "Full-screen takeover + looping alarm + wake lock. Alarm stops only on accept/reject."],
      ["M2·1", "Accept + prep time", "Prep chips 10/15/20/30/45; item-level 'don't have it' instead of rejecting the lot."],
      ["M1·4", "Kitchen board", "New / Cooking / Ready columns, one clock per order once more than one is live."],
    ], [
      ["warn", "two land at once", "Queued, not stacked", "One decision at a time; the next order's clock starts when the first is answered."],
      ["fail", "wifi drops", "CONNECTION LOST", "Red bar, mutating actions disabled, auto-reconnect counter, 'keep cooking what's accepted'."],
      ["warn", "order arrives offline", "Backfilled on reconnect", "Banner names the count and pauses their accept clocks while dark."],
      ["fail", "merchant rejects", "Reason picker", "The reason writes the customer's apology copy. Wallet-paid → refund step first."],
    ]],
    ["Cook", [
      ["M2·3", "Do not cook yet", "Amber holding screen while dispatch searches."],
      ["M2·4", "Rider secured", "Screen turns green: fire the kitchen. Prep ring counts down."],
      ["M2·5", "Mark ready", "Food packed, waiting on the counter."],
    ], [
      ["fail", "no rider", "Cancelled for you", "Never cooked; doesn't count against acceptance rate."],
      ["warn", "secured rider cancels", "Re-dispatch, clock paused", "Amber takeover: keep cooking / stop and hold / cancel. Cooked food is covered if nobody takes it."],
    ]],
    ["Pickup confirm", [
      ["M3·1", "CASH · count it", "Amount at 82px. Confirm = 'I counted $13.00', not 'OK'. Rider reads the 4-digit pickup code."],
      ["M3·2", "WALLET · reference", "Merchant types ref + amount; expected amount displayed to block short payment."],
    ], [
      ["fail", "amount short", "Release blocked", "Gap named in dollars; refund-and-reject offered instead."],
      ["warn", "rider no-show", "Send another rider", "Timeline logged; cooked food recorded on the statement."],
      ["fail", "reject after payment", "Refund with reference", "Merchant sends the money back and enters their own reference before rejecting."],
    ]],
    ["Run the shop", [
      ["M5·1", "Shop profile", "Cover banner, logo, blurb, cuisine tags, price level — edited against a live customer preview, live on save."],
      ["M4·1", "Menu by category", "Merchant-defined categories; dishes are added into one. One-tap out-of-stock with an auto-reset window."],
      ["M4·2", "Categories", "Rename, reorder, time-limit (Breakfast 07:00–11:00), hide, delete-when-empty — the customer's menu tabs mirror this list."],
      ["M4·9", "Statement", "0% now, with the accrual shown so the future rate is never a surprise."],
      ["M4·10", "End of day", "Cash to count, mobile money taken, one thing to fix tomorrow."],
    ], [
      ["info", "no categories yet", "Structure first", "A dish can't exist outside a category — the empty menu asks for one, with four one-tap starting points."],
      ["warn", "dish has no photo", "Saved as a draft", "Every dish needs one photo to go live; the draft is visible to the kitchen only, with one button to fix it."],
      ["warn", "upload offline", "Queued on the tablet", "The file is kept and retried; the existing banner stays live meanwhile."],
    ]],
  ],
};

const RIDER = {
  label: "Rider", tint: "var(--accent-700)", device: "Same Expo app · rider role",
  lede: "Auto-dispatch, not bidding. Every CASH job is the rider's own money at risk, so the float rule is visible.",
  acts: [
    ["The offer", [
      ["R1·1", "Offer card", "60s bar. CASH/WALLET tag huge; fee, legs, distance and a route map in one glance."],
      ["R1·3", "Headroom", "Declared float minus money tied up in live orders."],
    ], [
      ["fail", "goods > headroom", "CASH blocked", "Greyed accept + the arithmetic: food $24, headroom $20, short $4."],
      ["warn", "expires mid-read", "Passed on", "No penalty; moves to the next nearest rider."],
    ]],
    ["Restaurant leg", [
      ["R2·1", "Navigate", "Real corridor route; prep clock and the amount to front are pinned."],
      ["R2·2", "Pay the merchant", "Mirror of the merchant's confirm — both parties acknowledge $13.00."],
      ["R2·3", "Collect", "Tick the bags; missing item raised before leaving."],
    ], [
      ["warn", "food not ready", "Wait state", "Prep clock keeps running; call the kitchen from the job screen."],
      ["warn", "rider drops it", "Before pickup only", "Reason picker + consequence: three drops in a week pauses offers."],
      ["fail", "drop after collecting", "Blocked", "Money already fronted and food on the bike: call, support, or the return leg — never abandon."],
    ]],
    ["Customer leg", [
      ["R3·1", "Navigate", "Collect-at-door amount visible the whole ride."],
      ["R3·2", "Code + cash", "6-digit code, then count $15.50. Code is the only proof of delivery."],
      ["R3·3", "Delivered", "Earnings tick up; headroom released."],
    ], [
      ["warn", "wrong code", "3 tries, then lock", "Same lockout grammar as Send; support takes over."],
      ["warn", "disputes the amount", "Show the breakdown", "Food + fee itemised on the rider's screen to settle it at the door."],
      ["info", "phone dies", "Job restored", "Customer saw 'live paused', not 'cancelled'. Confirmed payments survive."],
    ]],
    ["When the door doesn't open", [
      ["R4·1", "8-minute wait", "Structured timer + 2 logged calls; the log is the evidence."],
      ["R4·2", "Return leg", "Its own navigation back to the restaurant; the fee is still paid."],
      ["R4·3", "Hand back", "Merchant returns the $13.00 fronted; both sides confirm the number again."],
    ], [
      ["fail", "merchant refuses hand-back", "Support joins", "Rider does not leave the food; the dispute is opened from the job."],
    ]],
  ],
};

const TONE = {
  warn: ["var(--highlight-wash)", "var(--highlight-ink)", "var(--highlight)"],
  fail: ["var(--danger-wash)", "var(--danger-ink)", "var(--danger)"],
  info: ["var(--surface)", "var(--muted)", "var(--line)"],
};

function Node({ id, label, note, tint }) {
  return (
    <div style={{ width: 214, background: "var(--bg)", borderRadius: 14, boxShadow: "var(--shadow-card)", padding: 13, borderTop: `3px solid ${tint}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "var(--accent-text)", borderRadius: 4, padding: "2px 5px", fontVariantNumeric: "tabular-nums" }}>{id}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>{note}</div>
    </div>
  );
}

function Branch({ tone, trigger, label, note }) {
  const [bg, fg, bar] = TONE[tone] || TONE.info;
  return (
    <div style={{ width: 214, background: bg, borderRadius: 12, padding: 11, borderLeft: `3px solid ${bar}` }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: fg, textTransform: "uppercase" }}>if {trigger}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: fg, marginTop: 3, lineHeight: 1.45 }}>{note}</div>
    </div>
  );
}

function Act({ title, nodes, branches, tint, last }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".05em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 10 }}>{title}</div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {nodes.map(([id, label, note], i) => (
            <div key={id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <Node id={id} label={label} note={note} tint={tint} />
              {i < nodes.length - 1 ? <span style={{ alignSelf: "center", color: "var(--muted)", fontSize: 16, marginTop: 20 }}>→</span> : null}
            </div>
          ))}
        </div>
        {branches.length ? (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--line)", display: "flex", flexWrap: "wrap", gap: 12, maxWidth: nodes.length * 236 }}>
            {branches.map((b) => <Branch key={b[2]} tone={b[0]} trigger={b[1]} label={b[2]} note={b[3]} />)}
          </div>
        ) : null}
      </div>
      {!last ? <div style={{ width: 2, alignSelf: "stretch", background: "var(--line)", marginTop: 24 }} /> : null}
    </div>
  );
}

function ActorMap({ actor }) {
  return (
    <section style={{ padding: "30px 40px 10px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, paddingBottom: 12, borderBottom: "2px solid var(--line)", marginBottom: 22 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: actor.tint }} />
        <h2 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: "-.02em" }}>{actor.label}</h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>{actor.device}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: "var(--muted)", maxWidth: 520, textAlign: "right", lineHeight: 1.5 }}>{actor.lede}</span>
      </div>
      <div style={{ display: "flex", gap: 18, overflowX: "auto", paddingBottom: 20, alignItems: "flex-start" }}>
        {actor.acts.map(([title, nodes, branches], i) => (
          <Act key={title} title={title} nodes={nodes} branches={branches} tint={actor.tint} last={i === actor.acts.length - 1} />
        ))}
      </div>
    </section>
  );
}

function Legend() {
  const item = (bg, bar, label) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: bg, borderLeft: `3px solid ${bar}` }} />{label}
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", padding: "0 40px 4px" }}>
      {item("var(--bg)", "var(--accent)", "Happy path")}
      {item("var(--highlight-wash)", "var(--highlight)", "Recoverable branch")}
      {item("var(--danger-wash)", "var(--danger)", "Terminal branch")}
      {item("var(--surface)", "var(--line)", "System / resume")}
      <span style={{ fontSize: 12, color: "var(--muted)" }}>Badges match the screen IDs in the gallery.</span>
    </div>
  );
}

function App() {
  return (
    <div>
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "var(--bg)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 18, padding: "0 24px", height: 60 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="26" height="26" viewBox="0 0 96 96" aria-hidden="true"><polygon points="28,6 58,32 38,42" fill="var(--accent)" /><polygon points="90,26 14,52 48,60" fill="var(--accent)" /><polygon points="90,26 48,60 42,84" fill="var(--accent-700)" /></svg>
          <span style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600, fontSize: 18 }}>Lynia<span style={{ color: "var(--accent-700)" }}>Go</span></span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Restaurants — journey maps</span>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Happy path + every exception the lifecycle allows</span>
        <span style={{ flex: 1 }} />
        <a href="Restaurants Vertical.html" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 700, color: "var(--accent-text)", textDecoration: "none", padding: "6px 12px", borderRadius: 999, background: "var(--accent-wash)" }}>
          All screens<MIcon name="arrow-right" size={13} color="var(--accent-text)" />
        </a>
      </header>
      <div style={{ height: 18 }} />
      <Legend />
      <ActorMap actor={CUSTOMER} />
      <ActorMap actor={MERCHANT} />
      <ActorMap actor={RIDER} />
      <div style={{ height: 30 }} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
