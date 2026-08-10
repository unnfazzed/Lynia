/* Lynia mobile app — interactive screen flow. Customer journey (login → OTP → send → auction →
   track → rate) with a role toggle into the rider side (online → board → offer → job). Fake data;
   recreation of the real Expo screens. */

const K = window.LyniaKit;
const D = window.LyniaDesignSystem_94c56a;
const { Button, Card, Field, StatusPill, Stepper, EmptyState, Heading, Sub, Label, SkeletonList, Icon, OfflineBanner, ServiceTiles, BrandHeader, LiveOrderCard, ReorderRail, RestaurantCard } = D;
const AppHome = D.AppHome || (() => <div style={{ padding: 20, fontSize: 12, color: "var(--muted)" }}>Home needs a design-system rebuild (AppHome missing from the bundle).</div>);

const RIDERS = [
  { id: "r1", name: "Tendai M.", rating: "4.8", trips: 132, eta: 6, fare: "2.50" },
  { id: "r2", name: "Kudzai N.", rating: "4.9", trips: 88, eta: 9, fare: "2.20" },
  { id: "r3", name: "Farai R.", rating: "new", trips: 3, eta: 5, fare: "3.00" },
];
const STEP_FLOW = ["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered", "completed"];
const TRIPS = [
  { id: "t1", from: "Eastgate", to: "Avenues", date: "2 Jul", role: "Sent", fare: "3.36", status: "completed", rating: 5 },
  { id: "t2", from: "Avondale", to: "CBD", date: "1 Jul", role: "Delivered", fare: "2.50", status: "completed", rating: 5 },
  { id: "t3", from: "Borrowdale", to: "Msasa", date: "30 Jun", role: "Delivered", fare: "4.00", status: "completed", rating: 4 },
  { id: "t4", from: "CBD", to: "Belvedere", date: "29 Jun", role: "Sent", fare: "1.50", status: "expired", rating: 0 },
];
const now = () => new Date().toISOString();
const RECEIPTS = [
  { title: "Delivery to Avondale", meta: "Tue 14:02 · 5% of $3.00", amount: "\u2212$0.15", credit: false },
  { title: "Delivery to Msasa", meta: "Tue 11:40 · 5% of $2.40", amount: "\u2212$0.12", credit: false },
  { title: "EcoCash top-up", meta: "Tue 09:10 · ref 8821", amount: "+$5.00", credit: true },
  { title: "Delivery to Mount Pleasant", meta: "Mon 16:20 · 5% of $4.20", amount: "\u2212$0.21", credit: false },
];

function App() {
  const [role, setRole] = React.useState("customer");
  const [small, setSmall] = React.useState(false); // 320px entry-phone preview
  const [walletReveal, setWalletReveal] = React.useState(true); // server reveal flag (OV#5): wallet row + route hidden until the flip comms window
  const [walletBalance, setWalletBalance] = React.useState(4.85); // rider commission balance
  const [topupStep, setTopupStep] = React.useState(null); // null | amount | wait | timeout | declined | success
  const [topupAmount, setTopupAmount] = React.useState("10.00");
  const [topupPhone, setTopupPhone] = React.useState("077 234 5678"); // registered line, editable
  const [topupRail, setTopupRail] = React.useState("ecocash");
  const [topupSeconds, setTopupSeconds] = React.useState(90);
  const [topupOrigin, setTopupOrigin] = React.useState("wallet"); // wallet | gate
  const RATE = 5; // server-driven commission rate shown in copy
  const money = (n) => (n < 0 ? "\u2212$" : "$") + Math.abs(n).toFixed(2);
  const [ridersOnline, setRidersOnline] = React.useState(true); // demo supply switch (D3)
  const [net, setNet] = React.useState("online"); // demo connectivity for OfflineBanner (E3)
  const [deliveryCode, setDeliveryCode] = React.useState("418207"); // shared code (E5)
  const [notifyArmed, setNotifyArmed] = React.useState(false); // D3 "notify me"
  // customer
  const [view, setView] = React.useState("splash");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [items, setItems] = React.useState([{ desc: "", qty: 1 }]);
  const updateItem = (i, patch) => setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => (arr.length >= 8 ? arr : [...arr, { desc: "", qty: 1 }]));
  const removeItem = (i) => setItems((arr) => (arr.length <= 1 ? arr : arr.filter((_, j) => j !== i)));
  const filledItems = items.filter((it) => it.desc.trim().length > 0);
  const [note, setNote] = React.useState("");
  const [fare, setFare] = React.useState("");
  const [pickup, setPickup] = React.useState("");
  const [drop, setDrop] = React.useState("");
  const [rcptPhone, setRcptPhone] = React.useState("");
  const [senderPhone, setSenderPhone] = React.useState("");
  const [declared, setDeclared] = React.useState("");
  // DT5 map-anchored home: full-bleed map + pin target + bottom sheet snap state
  const [pickupPt, setPickupPt] = React.useState(null);
  const [dropPt, setDropPt] = React.useState(null);
  const [target, setTarget] = React.useState("pickup");
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // search-first addressing (2026 review): the address-search + pin-confirm sub-screens
  const [addrScreen, setAddrScreen] = React.useState(null); // null | "pickup" | "drop"
  const [addrQuery, setAddrQuery] = React.useState("");
  const [confirmRole, setConfirmRole] = React.useState(null); // null | "pickup" | "drop"
  // pre-broadcast liability disclaimer + auction counter-offer
  const [disclaimerOpen, setDisclaimerOpen] = React.useState(false);
  const [disclaimerAgreed, setDisclaimerAgreed] = React.useState(false);
  const [counterDeclined, setCounterDeclined] = React.useState(false);
  // post-OTP registration + resend affordance
  const [regFullName, setRegFullName] = React.useState("");
  const [regId, setRegId] = React.useState("");
  const [otpResent, setOtpResent] = React.useState(false);
  const [offers, setOffers] = React.useState([]);
  const [sort, setSort] = React.useState("best");
  const [order, setOrder] = React.useState(null); // {status, events, rider, fare}
  const [score, setScore] = React.useState(0);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const timers = React.useRef([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  React.useEffect(() => clearTimers, []);

  // Top-up EcoCash USSD countdown — the one sanctioned wait animation; expires to the timeout state.
  React.useEffect(() => {
    if (topupStep !== "wait") return;
    if (topupSeconds <= 0) { setTopupStep("timeout"); return; }
    const t = setTimeout(() => setTopupSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [topupStep, topupSeconds]);

  /* Fake reverse geocode — a landmark per map quadrant (the real app reverse-geocodes). */
  function geocode(pt) {
    if (pt.x < 50 && pt.y < 50) return "Eastgate Mall, CBD";
    if (pt.x >= 50 && pt.y < 50) return "Avondale Shops";
    if (pt.x < 50 && pt.y >= 50) return "Mbare Musika";
    return "14 Glenara Ave, Avenues";
  }
  /* Tap-to-pin (DT5): place the active pin, auto-fill its landmark, auto-advance pickup → drop. */
  function placePin(pt) {
    if (target === "pickup") {
      setPickupPt(pt);
      setPickup(geocode(pt));
      if (dropPt == null) setTarget("drop");
    } else {
      setDropPt(pt);
      setDrop(geocode(pt));
    }
  }
  function useMyLocation() {
    const pt = { x: 24, y: 30 };
    setPickupPt(pt);
    setPickup("Your location · CBD");
    if (dropPt == null) setTarget("drop");
  }
  /* Search-first: set one point from the address-search / pin-confirm sub-screens. */
  function setPoint(role, pt, label) {
    if (role === "pickup") { setPickupPt(pt); setPickup(label); setTarget("drop"); }
    else { setDropPt(pt); setDrop(label); }
  }

  /* ── Customer: broadcast → stream offers ── */
  const OFFER_WINDOW_MS = 90_000; // contract: contracts.ts OFFER_WINDOW_MS
  const URGENT_MS = 20_000;       // last-20s amber urgency (order/[id].tsx)
  const [selectNotice, setSelectNotice] = React.useState(null); // E4 rolled-back select
  const [auctionEnd, setAuctionEnd] = React.useState(null);
  const [remainingMs, setRemainingMs] = React.useState(null);
  function broadcast() {
    setSelectNotice(null);
    // D3: no supply → the no-riders-online state, not a dead auction. Price won't help here.
    if (!ridersOnline) {
      setNotifyArmed(false);
      setView("noriders");
      return;
    }
    setOffers([]);
    setCounterDeclined(false);
    setOrder({ status: "open_for_offers", events: [], rider: null, fare });
    setView("auction");
    const end = Date.now() + OFFER_WINDOW_MS;
    setAuctionEnd(end);
    setRemainingMs(OFFER_WINDOW_MS);
    clearTimers();
    [[900, RIDERS[0]], [2100, RIDERS[1]], [3400, RIDERS[2]]].forEach(([ms, r]) => {
      timers.current.push(setTimeout(() => setOffers((prev) => [...prev, r]), ms));
    });
  }
  // Tick the auction clock down from the 90s window while it's live (open, not yet chosen/expired).
  React.useEffect(() => {
    if (view !== "auction" || auctionEnd == null) return;
    const tick = () => setRemainingMs(Math.max(0, auctionEnd - Date.now()));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [view, auctionEnd]);
  function chooseRider(r) {
    // E4: a race — the recommended rider (r1) may have just been taken by another customer.
    // Roll back with a MUTED notice (not error-red) and drop them from the list; the retry succeeds.
    if (r.id === "r1" && selectNotice == null) {
      setSelectNotice("That rider was just taken — choose another.");
      setOffers((prev) => prev.filter((o) => o.id !== "r1"));
      return;
    }
    clearTimers();
    setSelectNotice(null);
    setDeliveryCode(String(Math.floor(100000 + Math.random() * 900000)));
    const events = [{ status: "assigned", createdAt: now() }];
    setOrder({ status: "assigned", events, rider: r, fare: r.fare });
    setScore(0);
    setView("tracking");
  }
  function advanceCustomer() {
    setOrder((o) => {
      const idx = STEP_FLOW.indexOf(o.status);
      if (idx >= STEP_FLOW.length - 2) return o;
      const next = STEP_FLOW[idx + 1];
      return { ...o, status: next, events: [...o.events, { status: next, createdAt: now() }] };
    });
  }
  function submitRating(n) {
    setScore(n);
    timers.current.push(setTimeout(() => setOrder((o) => ({ ...o, status: "completed", events: [...o.events, { status: "completed", createdAt: now() }] })), 700));
  }
  const rankedOffers = React.useMemo(() => {
    const arr = [...offers];
    if (sort === "cheapest") arr.sort((a, b) => +a.fare - +b.fare);
    else if (sort === "fastest") arr.sort((a, b) => a.eta - b.eta);
    else if (sort === "rated") arr.sort((a, b) => (b.rating === "new" ? -1 : +b.rating) - (a.rating === "new" ? -1 : +a.rating));
    else {
      // best-match: real blended rank (D4) from the shared model.
      const order = K.rankOffers(arr.map((o) => ({
        offeredFare: +o.fare,
        ratingAvg: o.rating === "new" ? 0 : +o.rating,
        ratingCount: o.rating === "new" ? 0 : o.trips,
        etaMinutes: o.eta,
      })));
      return order.map((i) => arr[i]);
    }
    return arr;
  }, [offers, sort]);

  // Splash → login after a beat (tap skips). Reduce-motion users see it static via CSS.
  React.useEffect(() => {
    if (view !== "splash") return;
    const t = setTimeout(() => setView("login"), 2000);
    return () => clearTimeout(t);
  }, [view]);

  /* ── Rider state ── */
  const [online, setOnline] = React.useState(false);
  const [job, setJob] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [bidIds, setBidIds] = React.useState(() => new Set()); // E6: orders this rider already bid on
  const [boardNotice, setBoardNotice] = React.useState(null);  // E6: "offer sent" confirmation
  const [pendingJob, setPendingJob] = React.useState(null);    // E6: selected-by-customer active job banner
  const [rFare, setRFare] = React.useState("");
  const [rEta, setREta] = React.useState("");
  const [rCode, setRCode] = React.useState("");
  const [otpAttempts, setOtpAttempts] = React.useState(0);
  const [otpError, setOtpError] = React.useState(null);
  const otpLocked = otpAttempts >= 5;
  // KYC gate: 'none' | 'form' | 'pending' | 'verified' | 'failed'
  const [kyc, setKyc] = React.useState("none");
  const [kFirst, setKFirst] = React.useState("");
  const [kLast, setKLast] = React.useState("");
  const [kId, setKId] = React.useState("");
  const [kBike, setKBike] = React.useState("");
  const [kPhoto, setKPhoto] = React.useState(false);
  const [kTouched, setKTouched] = React.useState(false);
  const idValid = /^\d{8,12}$/.test(kId.trim());
  const idError = kTouched && kId.trim().length > 0 && !idValid ? "Enter the 8\u201312 digits on your ID card." : undefined;
  const kycCanSubmit = kFirst.trim() && kLast.trim() && idValid && kBike.trim().length >= 3 && kPhoto;
  function submitKyc() {
    setKTouched(true);
    if (!(kFirst.trim() && kLast.trim() && idValid && kBike.trim().length >= 3 && kPhoto)) return;
    setKyc("pending");
    timers.current.push(setTimeout(() => setKyc("verified"), 1500));
  }
  const BOARD = [
    { id: "o1", from: "Avondale", to: "CBD", items: [{ desc: "Small package", qty: 1 }], km: "2.4", fare: "2.50", note: "Ask for Rita at reception; parcel is fragile." },
    { id: "o2", from: "Borrowdale", to: "Msasa", items: [{ desc: "Documents", qty: 3 }, { desc: "USB drive", qty: 1 }], km: "6.1", fare: "4.00", note: "" },
  ];
  const itemSummary = (its) => {
    if (!its || its.length === 0) return "Parcel";
    if (its.length === 1) return `${its[0].qty > 1 ? its[0].qty + " \u00d7 " : ""}${its[0].desc}`;
    const n = its.reduce((s, i) => s + i.qty, 0);
    return `${its.length} kinds \u00b7 ${n} items`;
  };
  function takeJob() {
    // E6 one round per rider: send the offer, hide the order from the board, and wait. The rider
    // does NOT go straight into a job — a job only starts if the customer selects them (simulated
    // here as an active-job banner after a beat).
    const o = selected;
    setBidIds((prev) => new Set(prev).add(o.id));
    setBoardNotice("Offer sent — you'll be notified if the customer picks you.");
    setSelected(null); setRFare(""); setREta("");
    timers.current.push(setTimeout(() => {
      setBoardNotice(null);
      setPendingJob({ status: "assigned", events: [{ status: "assigned", createdAt: now() }], fare: rFare || o.fare, order: o });
    }, 2600));
  }
  function advanceRider(to) {
    setJob((j) => ({ ...j, status: to, events: [...j.events, { status: to, createdAt: now() }] }));
  }
  function confirmDelivery() {
    if (otpLocked) return;
    // E5: validate against the shared code; wrong → 401-style retry; 5 wrong → 403 lockout.
    if (rCode.trim() !== deliveryCode) {
      const n = otpAttempts + 1;
      setOtpAttempts(n);
      setOtpError(n >= 5
        ? "Too many attempts — ask the customer to re-issue the delivery code."
        : `Wrong code — ${5 - n} ${5 - n === 1 ? "try" : "tries"} left. Ask the recipient to read it again.`);
      setRCode("");
      return;
    }
    setOtpError(null);
    setOtpAttempts(0);
    setJob((j) => ({ ...j, status: "delivered", events: [...j.events, { status: "delivered", createdAt: now() }] }));
    setRCode("");
  }

  /* ── Role switcher (header ghost) ── */
  const RoleSwitch = (
    <button onClick={() => setRole(role === "customer" ? "rider" : "customer")} style={{
      border: "1px solid var(--line)", background: "var(--bg)", borderRadius: "var(--radius-pill)",
      padding: "6px 12px", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 700, color: "var(--muted)", cursor: "pointer",
    }}>{role === "customer" ? "Rider →" : "← Customer"}</button>
  );

  /* ===== COMMISSION WALLET (shared across roles) ===== */
  function renderWallet() {
    const bal = walletBalance, neg = bal < 0;
    const belowFloor = bal < 2, gettingLow = !belowFloor && bal < 3;
    return (
      <ScreenPad>
        <TopRow>
          <Heading style={{ marginBottom: 0 }}>Wallet</Heading>
          <div style={{ flex: 1 }} />
          <StatusPill status="Online" tone="online" dot />
        </TopRow>
        <Sub>Your prepaid commission balance.</Sub>
        <div style={{ background: neg ? "var(--danger-wash)" : "var(--bg)", borderRadius: 16, padding: 18, boxShadow: "var(--shadow-card)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: neg ? "var(--bg)" : "var(--accent-wash)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="banknote" size={22} color={neg ? "var(--danger-ink)" : "var(--accent-text)"} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: neg ? "var(--danger-ink)" : "var(--muted)" }}>Commission balance</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "var(--ink)", lineHeight: 1.05, marginTop: 1, letterSpacing: "-0.02em" }} className="lynia-tabular">{money(bal)}</div>
            </div>
          </div>
          <div style={{ height: 1, background: neg ? "rgba(143,36,24,.16)" : "var(--line)", margin: "14px 0" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, color: neg ? "var(--danger-ink)" : "var(--muted)", lineHeight: 1.4 }}>{neg ? money(bal) + " owed · your next top-up covers this" : "Commission: " + RATE + "% per delivery"}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: neg ? "var(--danger-ink)" : "var(--accent-text)", background: neg ? "var(--bg)" : "var(--accent-wash)", borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{neg ? "Owed" : "Prepaid float"}</span>
          </div>
        </div>
        {belowFloor || gettingLow ? (
          <div style={{ background: belowFloor ? "var(--danger-wash)" : "var(--accent-wash)", borderRadius: 12, padding: "12px 14px", marginTop: 12, fontSize: 13, color: belowFloor ? "var(--danger-ink)" : "var(--accent-text)", lineHeight: 1.4 }}>
            {belowFloor ? "You're below the $2.00 balance you need to go online — top up to keep riding." : "Balance is getting low. Top up soon so you can keep riding."}
          </div>
        ) : null}
        <div style={{ marginTop: 16 }}><Button label="Top up" onClick={() => { setTopupOrigin("wallet"); setTopupStep("amount"); setTopupSeconds(90); setView("topup"); }} /></div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "22px 0 8px" }}>Recent activity</div>
        <Card style={{ padding: "2px 16px" }}>
          {RECEIPTS.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < RECEIPTS.length - 1 ? "1px solid var(--line)" : "none" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: r.credit ? "var(--accent-wash)" : "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={r.credit ? "banknote" : "package"} size={18} color={r.credit ? "var(--accent-text)" : "var(--muted)"} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{r.title}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{r.meta}</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: r.credit ? "var(--accent-text)" : "var(--ink)" }} className="lynia-tabular">{r.amount}</div>
            </div>
          ))}
        </Card>
        <div style={{ background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", borderRadius: 16, padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--highlight-ink)", marginBottom: 5 }}>How your commission works</div>
          <div style={{ fontSize: 12, color: "var(--highlight-ink)", lineHeight: 1.55 }}>Lynia takes {RATE}% of each delivery you complete — from a prepaid balance, never your cash in hand. Every deduction shows up here beside the ride it came from.</div>
        </div>
        <Button label="Back to earnings" variant="ghost" onClick={() => setView("earnings")} />
      </ScreenPad>
    );
  }

  function renderTopup() {
    const amt = parseFloat(topupAmount) || 0;
    const err = topupAmount !== "" ? (amt < 5 ? "Minimum top-up is $5.00" : amt > 50 ? "Top-up limit is $50.00 at a time" : "") : "";
    const RAILS = [
      { id: "ecocash", name: "EcoCash", logo: "../../assets/brand/rails/ecocash.png", logoW: 48, logoH: 28, note: "Approve on your phone" },
      { id: "innbucks", name: "InnBucks", logo: "../../assets/brand/rails/innbucks.png", logoW: 52, logoH: 28, tileBg: "#13294B", note: "Approve on your phone" },
      { id: "omari", name: "O'mari", logo: "../../assets/brand/rails/omari.png", logoW: 48, logoH: 30, note: "Approve on your phone" },
    ];
    const railObj = RAILS.find((r) => r.id === topupRail) || RAILS[0];
    const fmtPhone = (raw) => { const d = (raw || "").replace(/\D/g, "").slice(0, 10); return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(" "); };
    const phoneDigits = (topupPhone || "").replace(/\D/g, "");
    const phoneOk = phoneDigits.length === 10 && phoneDigits.startsWith("07");
    const phoneErr = topupPhone.trim() !== "" && !phoneOk ? "Enter a valid mobile number, e.g. 077 123 4567" : "";
    const goBack = () => { setTopupStep(null); setView(topupOrigin === "gate" ? "home" : "wallet"); if (topupOrigin === "gate") setRole("rider"); };
    if (topupStep === "wait") {
      const C = 326.7, off = C * (1 - topupSeconds / 90), danger = topupSeconds <= 20;
      return (
        <ScreenPad>
          <button onClick={() => setTopupStep("amount")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--muted)", display: "inline-flex", alignItems: "center" }}><span style={{ fontSize: 17, lineHeight: 1, marginRight: 2 }}>‹</span>Top up</button>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 30 }}>
            <div style={{ position: "relative", width: 132, height: 132 }}>
              <svg width={132} height={132} viewBox="0 0 132 132" style={{ transform: "rotate(-90deg)" }}>
                <circle cx={66} cy={66} r={52} fill="none" stroke="var(--line)" strokeWidth={8} />
                <circle cx={66} cy={66} r={52} fill="none" stroke={danger ? "var(--danger)" : "var(--accent)"} strokeWidth={8} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1s linear" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">{topupSeconds}</span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>seconds</span>
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", marginTop: 24 }}>Check your phone</div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6, maxWidth: 260, lineHeight: 1.5 }}>Approve the {railObj.name} prompt on <span style={{ fontWeight: 600, color: "var(--ink)" }} className="lynia-tabular">{topupPhone}</span>. We'll credit your balance the moment it clears.</div>
            <div style={{ fontSize: 13, color: "var(--accent-text)", fontWeight: 600, marginTop: 16 }} className="lynia-tabular">{money(amt)} · {railObj.name}</div>
            <div style={{ width: "100%", marginTop: 28 }}>
              <Button label="▶ Simulate approval" onClick={() => { setWalletBalance((b) => +(b + amt).toFixed(2)); setTopupStep("success"); }} />
              <Button label="▶ Simulate decline" variant="ghost" onClick={() => setTopupStep("declined")} />
              <Button label="Cancel request" variant="ghost" onClick={() => setTopupStep("amount")} />
            </div>
          </div>
        </ScreenPad>
      );
    }
    if (topupStep === "timeout") {
      return (
        <ScreenPad>
          <TopRow><Heading style={{ marginBottom: 0 }}>Top up</Heading><div style={{ flex: 1 }} /></TopRow>
          <Card style={{ padding: "8px 16px 16px" }}>
            <EmptyState icon="clock" title="The request expired" message="No money moved. You can try the top-up again.">
              <Button label="Try again" onClick={() => { setTopupSeconds(90); setTopupStep("amount"); }} />
            </EmptyState>
          </Card>
          <Button label="Back to wallet" variant="ghost" onClick={goBack} />
        </ScreenPad>
      );
    }
    if (topupStep === "declined") {
      return (
        <ScreenPad>
          <TopRow><Heading style={{ marginBottom: 0 }}>Top up</Heading><div style={{ flex: 1 }} /></TopRow>
          <Card style={{ padding: "8px 16px 16px" }}>
            <EmptyState icon="circle-alert" title="The payment was declined" message={`No money left your ${railObj.name}. This usually means the ${railObj.name} balance was too low, or the request was declined on your phone.`}>
              <Button label="Try again" onClick={() => { setTopupSeconds(90); setTopupStep("amount"); }} />
            </EmptyState>
          </Card>
          <Button label="Back to wallet" variant="ghost" onClick={goBack} />
        </ScreenPad>
      );
    }
    if (topupStep === "success") {
      return (
        <ScreenPad>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 36 }}>
            <div style={{ width: 88, height: 88, borderRadius: 999, background: "var(--accent-wash)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="check" size={44} color="var(--accent-text)" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", marginTop: 16 }} className="lynia-tabular">{money(amt)} added</div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>New balance <span style={{ fontWeight: 600, color: "var(--ink)" }} className="lynia-tabular">{money(walletBalance)}</span></div>
            <div style={{ width: "100%", marginTop: 24 }}>
              <Card style={{ padding: "2px 16px", marginBottom: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-wash)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="banknote" size={18} color="var(--accent-text)" /></div>
                  <div style={{ flex: 1, textAlign: "left" }}><div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{railObj.name} top-up</div><div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Just now · ref 9042</div></div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--accent-text)" }} className="lynia-tabular">+{money(amt)}</div>
                </div>
              </Card>
            </div>
            <div style={{ width: "100%", marginTop: 20 }}><Button label={topupOrigin === "gate" ? "Back online" : "Back to wallet"} onClick={goBack} /></div>
          </div>
        </ScreenPad>
      );
    }
    if (topupStep === "manual") {
      return null;
    }
    // amount entry (default)
    return (
      <ScreenPad>
        <TopRow><Heading style={{ marginBottom: 0 }}>Top up</Heading><div style={{ flex: 1 }} /></TopRow>
        <Sub>Add to your commission balance. This money can only be spent on commission.</Sub>
        <Field label="Amount (USD)" value={topupAmount} onChange={setTopupAmount} inputMode="decimal" error={err} hint="Between $5.00 and $50.00 per top-up" />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {[5, 10, 20].map((v) => { const on = amt === v; return (
            <button key={v} onClick={() => setTopupAmount(v.toFixed(2))} style={{ flex: 1, height: 44, borderRadius: 999, border: on ? "1.5px solid var(--accent)" : "1px solid var(--line)", background: on ? "var(--accent-wash)" : "var(--bg)", color: on ? "var(--accent-text)" : "var(--ink)", fontSize: 15, fontWeight: on ? 700 : 600, cursor: "pointer", fontFamily: "var(--font-sans)" }} className="lynia-tabular">{money(v)}</button>
          ); })}
        </div>
        <div style={{ marginTop: 16 }}><Field label="Phone number" value={topupPhone} onChange={(v) => setTopupPhone(fmtPhone(v))} inputMode="tel" error={phoneErr} hint="This number gets the payment prompt — change it if you're paying from another line." /></div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "22px 0 8px" }}>Pay with</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {RAILS.map((r) => { const on = topupRail === r.id; return (
            <button key={r.id} onClick={() => setTopupRail(r.id)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12, border: on ? "1.5px solid var(--accent)" : "1px solid var(--line)", background: on ? "var(--accent-wash)" : "var(--bg)", cursor: "pointer" }}>
              <span style={{ width: 58, height: 36, borderRadius: 8, background: r.tileBg || "#fff", border: r.tileBg ? "none" : "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><img src={r.logo} alt={r.name} style={{ maxWidth: r.logoW, maxHeight: r.logoH, objectFit: "contain", display: "block" }} /></span>
              <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{r.name}</span><span style={{ display: "block", fontSize: 12, color: on ? "var(--accent-text)" : "var(--muted)", marginTop: 1 }}>{r.note}</span></span>
              <span style={{ width: 20, height: 20, borderRadius: 999, border: on ? "6px solid var(--accent)" : "1.5px solid var(--line)", background: "var(--bg)", flexShrink: 0 }} />
            </button>
          ); })}
        </div>
        <div style={{ marginTop: 20 }}><Button label={"Request " + money(amt) + " via " + railObj.name} disabled={amt < 5 || amt > 50 || !phoneOk} onClick={() => { setTopupSeconds(90); setTopupStep("wait"); }} /></div>
        <Button label="Cancel" variant="ghost" onClick={goBack} />
      </ScreenPad>
    );
  }

  /* ================= CUSTOMER ================= */
  function renderCustomer() {
    // search-first addressing sub-screens (overlay the home map)
    if (confirmRole) return (
      <AddrConfirm
        role={confirmRole}
        onBack={() => { const r = confirmRole; setConfirmRole(null); setAddrScreen(r); }}
        onConfirm={({ pt, label }) => { setPoint(confirmRole, pt, label); setConfirmRole(null); setAddrScreen(null); setAddrQuery(""); }}
      />
    );
    if (addrScreen) return (
      <AddrSearch
        role={addrScreen} query={addrQuery} onQuery={setAddrQuery}
        onBack={() => { setAddrScreen(null); setAddrQuery(""); }}
        onPickResult={({ pt, label }) => { setPoint(addrScreen, pt, label); setAddrScreen(null); setAddrQuery(""); }}
        onUseLocation={() => { if (addrScreen === "pickup") useMyLocation(); else setPoint("drop", { x: 76, y: 70 }, "Your location · Avenues"); setAddrScreen(null); setAddrQuery(""); }}
        onSetOnMap={() => { setConfirmRole(addrScreen); setAddrScreen(null); }}
      />
    );
    if (view === "splash") return (
      <div onClick={() => setView("login")} style={{ height: "100%", background: "var(--accent)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, cursor: "pointer" }}>
      {/* Static by design: CSS animations don't advance in this preview environment (see verifier note);
          the real app's launch motion (dove lift-in) is device-gated — spec: 700ms rise+rotate, reduced-motion aware. */}
        <svg width="112" height="112" viewBox="0 0 96 96" aria-hidden="true">
          <polygon points="28,6 58,32 38,42" fill="#fff" />
          <polygon points="90,26 14,52 48,60" fill="#fff" />
          <polygon points="90,26 48,60 42,84" fill="#fff" opacity=".62" />
          <path d="M90 26 L48 60 M70.5 30.2 L81.5 43.8" stroke="var(--accent)" strokeWidth="2.4" fill="none" />
        </svg>
        <div style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600, fontSize: 32, color: "#fff" }}>LyniaGo</div>
      </div>
    );
    if (view === "login") return (
      <ScreenPad>
        <Lockup />
        <Heading>Welcome to Lynia</Heading>
        <Sub>We'll SMS a one-time code to this number.</Sub>
        <Field label="Phone number" value={phone} onChange={setPhone} inputMode="tel" placeholder="+263 77 000 0000" />
        <Button label="Send code" onClick={() => setView("otp")} disabled={phone.trim().length < 6} />
        <div style={{ marginTop: 8 }}>{RoleSwitch}</div>
      </ScreenPad>
    );
    if (view === "otp") return (
      <ScreenPad>
        <Heading>Check your messages</Heading>
        <Sub>We sent a 6-digit code to {phone || "your phone"} by SMS.</Sub>
        <Field label="6-digit code" value={code} onChange={setCode} inputMode="numeric" placeholder="000000" hint="SMS can take a minute on a busy network." />
        <Button label="Verify" onClick={() => setView("role_select")} disabled={code.trim().length !== 6} />
        {otpResent ? (
          <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, fontSize: 13.5, fontWeight: 600, color: "var(--accent-text)" }}>
            <Icon name="check" size={15} color="var(--accent-text)" /> Code re-sent by SMS.
          </div>
        ) : (
          <button onClick={() => setOtpResent(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, width: "100%", background: "none", border: "none", fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 600, color: "var(--accent-text)", cursor: "pointer" }}>Didn't get it? Resend code</button>
        )}
        <Button label="Back" variant="ghost" onClick={() => { setView("login"); setOtpResent(false); }} />
      </ScreenPad>
    );
    if (view === "role_select") return (
      <RoleSelectScreen
        onCustomer={() => setView("register")}
        onRider={() => { setRole("rider"); setView("home"); }}
      />
    );
    if (view === "register") return (
      <RegisterScreen
        fullName={regFullName} onFullName={setRegFullName}
        idNum={regId} onIdNum={setRegId}
        phone={phone}
        onContinue={() => setView("home")}
      />
    );
    if (view === "home") {
      /* 2a launcher home — one shared home for Express + Food (HOME-2A-MERGE-PLAN Phase 1).
         Send tile → the map composer (view "send"); Food tile is the vertical's entry (static in
         this kit — the Restaurants screens live in explorations/restaurants/). */
      const liveOrder = order && order.status !== "completed" && order.status !== "cancelled" ? order : null;
      const stepIdx = liveOrder ? Math.max(0, STEP_FLOW.indexOf(liveOrder.status)) : 0;
      const STEP_LABEL = { assigned: "Rider assigned", confirmed: "Rider confirmed", en_route_pickup: "Rider heading to pickup", picked_up: "Parcel picked up", en_route_dropoff: "On the way", delivered: "Delivered" };
      return (
        <AppHome
          scroll
          address="12 Lanark Rd, Belgravia"
          aside={RoleSwitch}
          onProfile={() => setView("profile")}
          onSearch={() => setView("send")}
          onService={(id) => { if (id === "express") setView("send"); }}
          live={liveOrder ? [{ id: liveOrder.id, title: STEP_LABEL[liveOrder.status] || "Order running", meta: (liveOrder.rider ? liveOrder.rider.name + " · " : "") + "$" + liveOrder.fare, step: stepIdx, onClick: () => setView("tracking") }] : []}
          restaurants={[
            { name: "Sadza Republic", rating: "4.7", ratingCount: 210, eta: "25–35", fee: "1.50" },
            { name: "Huku House", rating: "4.5", ratingCount: 96, eta: "30–40", fee: "2.00" },
            { name: "Café Msasa", rating: "4.8", ratingCount: 44, eta: "35–45", fee: "2.50" },
          ]}
        />
      );
    }
    if (view === "send") {
      // Suggested fare = base $1.50 + $0.60/km (pricing.ts). Demo route ≈ 3.1 km ⇒ $3.36.
      const routeKm = pickupPt && dropPt ? 3.1 : null;
      const suggested = routeKm != null ? (1.5 + 0.6 * routeKm) : null;
      const phoneOk = (p) => p.trim().replace(/[^\d+]/g, "").length >= 6;
      const canSubmit = pickupPt != null && dropPt != null && filledItems.length > 0 && +fare > 0 && phoneOk(senderPhone) && phoneOk(rcptPhone);
      const missing = [
        pickupPt == null || dropPt == null ? "pickup & drop-off pins" : null,
        filledItems.length === 0 ? "an item" : null,
        !(+fare > 0) ? "a price" : null,
        !phoneOk(senderPhone) || !phoneOk(rcptPhone) ? "both phone numbers" : null,
      ].filter(Boolean).join(", ");
      return (
        <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
          {/* z0 — full-bleed map, tap to place the active pin (DT5 / D-b) */}
          <K.FauxMap fill pins={{ a: pickupPt, b: dropPt }} onTap={placePin} />

          {/* z1 — top chips on solid fills (sunlight-legible) */}
          <div style={{ position: "absolute", top: 34, left: 12, right: 12, display: "flex", alignItems: "center", gap: 8, zIndex: 5 }}>
            <button onClick={() => setView("home")} aria-label="Back to home" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--bg)", border: "none", borderRadius: "var(--radius-pill)", padding: "6px 12px 6px 8px", boxShadow: "var(--shadow-card)", fontWeight: 700, fontSize: 14, color: "var(--accent-text)", cursor: "pointer", minHeight: 40, fontFamily: "var(--font-sans)" }}>
              <Icon name="chevron-right" size={17} color="var(--accent-text)" style={{ transform: "rotate(180deg)" }} />
              <DoveMark size={22} creases={false} />
              <span style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600 }}>Lynia<span style={{ color: "var(--accent-700)" }}>Go</span></span>
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setView("profile")} aria-label="Account" style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg)", border: "none", boxShadow: "var(--shadow-card)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <Icon name="user" size={18} color="var(--accent-text)" />
            </button>
            {RoleSwitch}
          </div>
          <button
            onClick={useMyLocation}
            style={{ position: "absolute", top: 78, right: 12, zIndex: 5, display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", border: "none", borderRadius: "var(--radius-pill)", padding: "9px 14px", boxShadow: "var(--shadow-card)", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--accent-text)", cursor: "pointer", minHeight: 36 }}
          >
            <Icon name="navigation" size={14} color="var(--accent-text)" /> Use my location
          </button>
          {pickupPt == null || dropPt == null ? (
            <div style={{ position: "absolute", top: 124, left: "50%", transform: "translateX(-50%)", zIndex: 5, background: "var(--ink)", color: "#fff", borderRadius: "var(--radius-pill)", padding: "7px 14px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
              Tap the map to drop your {target === "pickup" ? "pickup" : "drop-off"} pin
            </div>
          ) : null}

          {/* z2 — the bottom sheet: peek = the required path, expanded = the details */}
          <K.MapSheet
            expanded={sheetOpen}
            onToggle={() => setSheetOpen((v) => !v)}
            footer={
              <div>
                {!canSubmit ? (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Add {missing} to broadcast.</div>
                ) : null}
                <Button label="Broadcast request" onClick={() => { setDisclaimerAgreed(false); setDisclaimerOpen(true); }} disabled={!canSubmit} />
              </div>
            }
          >
            <AddressFields
              pickup={pickupPt ? pickup : ""}
              drop={dropPt ? drop : ""}
              onPick={(role) => { setAddrQuery(""); setAddrScreen(role); }}
            />
            <div style={{ fontSize: "var(--text-label)", fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>What are you sending?</div>
            {items.map((it, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: "10px 10px 4px", marginBottom: 8 }}>
                <Field value={it.desc} onChange={(d) => updateItem(i, { desc: d })} placeholder={i === 0 ? "Documents envelope" : "Another item"} maxLength={280} style={{ marginBottom: 8 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: "var(--text-label)", fontWeight: 600, color: "var(--muted)" }}>Qty</span>
                  <QtyStepper value={it.qty} onChange={(q) => updateItem(i, { qty: q })} />
                  <div style={{ flex: 1 }} />
                  {items.length > 1 ? (
                    <button onClick={() => removeItem(i)} aria-label={"Remove item " + (i + 1)} style={{ background: "none", border: "none", padding: "6px 8px", minHeight: 36, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "var(--muted)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600 }}>
                      <Icon name="x" size={14} color="var(--muted)" /> Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {items.length < 8 ? (
              <button onClick={addItem} style={{ ...collapseBtn, justifyContent: "flex-start", gap: 6, minHeight: 40, marginBottom: 8, color: "var(--accent-text)" }}>
                <Icon name="package" size={16} color="var(--accent-text)" />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}>Add another item</span>
              </button>
            ) : null}
            <Field label="Note for the rider (optional)" value={note} onChange={setNote} multiline rows={3} maxLength={280} placeholder="Ask for Rita at the pharmacy counter; parcel is fragile, keep it upright." hint="Pickup or handling instructions — the rider confirms these before collecting." />
            <Field label="Your price (USD)" value={fare} onChange={setFare} inputMode="decimal" hint={suggested != null ? `Suggested $${suggested.toFixed(2)} · ${routeKm} km · riders here usually accept around $${(suggested - 0.4).toFixed(2)}.` : "We'll suggest a fair price once your pins are set."} />
            {/* Both contact numbers are REQUIRED (Waypoint.contactPhone, contracts.ts) — on the
                required path, not hidden. The rider sees both once the ride is active. */}
            <Field label="Your phone (sender)" value={senderPhone} onChange={setSenderPhone} inputMode="tel" placeholder="+263 77 000 0000" hint="Shared with your rider only during the delivery." />
            <Field label="Recipient phone" value={rcptPhone} onChange={setRcptPhone} inputMode="tel" placeholder="+263 77 000 0000" hint="So the rider can reach them at drop-off." />
            {sheetOpen ? (
              <div>
                <Field label="Pickup landmark" value={pickup} onChange={setPickup} fromMap={pickupPt != null} />
                <Field label="Drop-off landmark" value={drop} onChange={setDrop} fromMap={dropPt != null} />
                <Field label="Declared value (USD, max 150)" value={declared} onChange={setDeclared} inputMode="decimal" placeholder="10" />
              </div>
            ) : (
              <button onClick={() => setSheetOpen(true)} style={collapseBtn}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}>Add landmarks & declared value (optional)</span>
                <Icon name="chevron-up" size={16} color="var(--accent-text)" />
              </button>
            )}
          </K.MapSheet>
          {disclaimerOpen ? (
            <DisclaimerSheet
              agreed={disclaimerAgreed}
              onToggle={() => setDisclaimerAgreed((v) => !v)}
              onAgree={() => { setDisclaimerOpen(false); broadcast(); }}
              onBack={() => setDisclaimerOpen(false)}
            />
          ) : null}
        </div>
      );
    }
    if (view === "auction") {
      const expired = remainingMs != null && remainingMs <= 0;
      const urgent = remainingMs != null && remainingMs > 0 && remainingMs <= URGENT_MS;
      const mm = Math.floor((remainingMs ?? 0) / 60000);
      const ss = Math.floor(((remainingMs ?? 0) % 60000) / 1000);
      const clock = `${mm}:${String(ss).padStart(2, "0")}`;
      if (expired) {
        return (
          <ScreenPad>
            <TopRow>
              <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
              <div style={{ flex: 1 }} />
              <StatusPill status="expired" tone="offline" />
            </TopRow>
            <EmptyState icon="bike" title="No riders took this price yet" message="Your 90-second window closed with no offer. Nudging the price up usually gets a rider fast.">
              <Button label="Nudge price & re-broadcast" onClick={() => { setFare((f) => (+f > 0 ? (+f + 0.5).toFixed(2) : f)); broadcast(); }} />
              <Button label="Edit order" variant="ghost" onClick={() => { clearTimers(); setView("send"); }} />
            </EmptyState>
          </ScreenPad>
        );
      }
      const askFare = +fare > 0 ? fare : "3.00";
      const counterRider = offers.find((o) => o.id === "r2");
      const counterFare = (+askFare + 0.5).toFixed(2);
      const showCounter = counterRider && !counterDeclined;
      const listOffers = showCounter ? rankedOffers.filter((o) => o.id !== "r2") : rankedOffers;
      return (
        <ScreenPad>
          <TopRow>
            <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
            <div style={{ flex: 1 }} />
            <StatusPill status={order.status} />
          </TopRow>
          <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ flex: 1, fontSize: 14, color: "var(--muted)" }}>
              {offers.length > 0 ? `${offers.length} ${offers.length === 1 ? "rider" : "riders"} bidding` : "Finding riders near you…"}
            </span>
            <span style={{ fontSize: 14, fontWeight: urgent ? 700 : 400, color: urgent ? "var(--danger)" : "var(--muted)" }} className="lynia-tabular" aria-label={`Offer window: ${mm ? mm + " minute " : ""}${ss} seconds left`}>{clock}</span>
          </div>
          {urgent ? <Button label="Nudge price & re-broadcast" variant="ghost" onClick={() => { setFare((f) => (+f > 0 ? (+f + 0.5).toFixed(2) : f)); broadcast(); }} /> : null}
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>Asking ${fare} · riders here usually accept around $2.40.</div>
          {offers.length > 1 ? <K.SortChips value={sort} onChange={setSort} /> : null}
          {showCounter ? (
            <CounterOffer o={counterRider} ask={askFare} counterFare={counterFare}
              onAccept={() => chooseRider({ ...counterRider, fare: counterFare })}
              onDecline={() => setCounterDeclined(true)} />
          ) : null}
          {listOffers.map((o, i) => <K.OfferCard key={o.id} o={o} recommended={sort === "best" && i === 0 && listOffers.length >= 2} onChoose={() => chooseRider(o)} />)}
          {selectNotice ? <div role="status" style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, marginBottom: 4 }}>{selectNotice}</div> : null}
          {offers.length === 0 ? (<div style={{ marginTop: 8 }}><SkeletonList count={1} /><Sub>No offers yet — riders nearby have been pinged. Hang tight.</Sub></div>) : null}
          <Button label="Cancel order" variant="ghost" onClick={() => { clearTimers(); setView("home"); }} />
        </ScreenPad>
      );
    }
    if (view === "noriders") {
      return (
        <ScreenPad>
          <TopRow>
            <Heading style={{ marginBottom: 0 }}>Send a parcel</Heading>
            <div style={{ flex: 1 }} />
          </TopRow>
          <EmptyState icon="inbox" title="No riders online right now" message="There are no riders in the CBD corridor at the moment — a higher price won't help until one comes online. Most riders are on 7–9am & 5–7pm.">
            {notifyArmed ? (
              <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px", color: "var(--accent-text)", fontWeight: 600, fontSize: 14 }}>
                <Icon name="check" size={16} color="var(--accent-text)" /> We'll notify you when a rider's available.
              </div>
            ) : (
              <Button label="Notify me when one's available" onClick={() => setNotifyArmed(true)} />
            )}
            <Button label="Back" variant="ghost" onClick={() => setView("send")} />
          </EmptyState>
        </ScreenPad>
      );
    }
    if (view === "profile") {
      return (
        <ScreenPad>
          <TopRow>
            <Heading style={{ marginBottom: 0 }}>Account</Heading>
            <div style={{ flex: 1 }} />
          </TopRow>
          <Sub>Your details and session.</Sub>
          <Card>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>Chipo M.</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }} className="lynia-tabular">{phone || "+263 77 000 0000"}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Customer</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Editing your details is coming soon.</div>
          </Card>
          <Card>
            <Button label="Trip history" onClick={() => setView("history")} />
            <Button label="Earnings" variant="ghost" onClick={() => setView("earnings")} />
            <Button label="Send a parcel" variant="ghost" onClick={() => setView("send")} />
          </Card>
          <Button label="Sign out" variant="ghost" onClick={() => { setView("login"); setPhone(""); setCode(""); }} />
          <Button label="Back" variant="ghost" onClick={() => setView("home")} />
        </ScreenPad>
      );
    }
    if (view === "history") {
      return (
        <ScreenPad>
          <TopRow>
            <Heading style={{ marginBottom: 0 }}>Your trips</Heading>
            <div style={{ flex: 1 }} />
          </TopRow>
          <Sub>Every parcel you've sent or delivered.</Sub>
          {TRIPS.map((t) => (
            <Card key={t.id}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ flex: 1, paddingRight: "var(--space-sm)", minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.from} → {t.to}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }} className="lynia-tabular">{t.date} · {t.role}{t.rating ? ` · ★ ${t.rating}` : ""}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">${t.fare}</div>
                  <div style={{ height: 4 }} />
                  <StatusPill status={t.status} tone={t.status === "expired" || t.status === "cancelled" ? "offline" : "neutral"} />
                </div>
              </div>
            </Card>
          ))}
          <Button label="Back" variant="ghost" onClick={() => setView("profile")} />
        </ScreenPad>
      );
    }
    if (view === "earnings") {
      const done = TRIPS.filter((t) => t.role === "Delivered" && t.status === "completed");
      const total = done.reduce((s, t) => s + +t.fare, 0);
      return (
        <ScreenPad>
          <TopRow>
            <Heading style={{ marginBottom: 0 }}>Earnings</Heading>
            <div style={{ flex: 1 }} />
          </TopRow>
          <Sub>What you've agreed and delivered.</Sub>
          <Card style={{ background: "var(--accent)", border: "1px solid transparent", boxShadow: "var(--shadow-card)" }}>
            <div style={{ color: "var(--on-accent)", fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Agreed &amp; delivered · total</div>
            <div style={{ color: "var(--on-accent)", fontSize: 28, fontWeight: 700, marginTop: 2 }} className="lynia-tabular">${total.toFixed(2)}</div>
            <div style={{ color: "var(--on-accent)", fontSize: 12, opacity: 0.9, marginTop: 2 }}>{done.length} completed {done.length === 1 ? "trip" : "trips"}</div>
          </Card>
          {/* Reveal flag (OV#5): the Wallet card appears only in the flip comms window. Hidden = the screen looks exactly as it does today. */}
          {walletReveal ? (
            <Card style={{ background: "var(--accent-wash)", border: "1px solid transparent", boxShadow: "var(--shadow-card)", padding: 0, overflow: "hidden" }}>
              <button onClick={() => setView("wallet")} aria-label="Commission balance, open Wallet" style={{ display: "flex", alignItems: "flex-start", gap: 12, width: "100%", background: "transparent", border: "none", padding: 18, cursor: "pointer", textAlign: "left" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--accent-text)", fontSize: 12, fontWeight: 600 }}>Commission balance</div>
                  <div style={{ color: "var(--ink)", fontSize: 28, fontWeight: 700, marginTop: 2 }} className="lynia-tabular">{money(walletBalance)}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>Prepaid — top up, receipts and rate</div>
                </div>
                <Icon name="chevron-right" size={18} color="var(--accent-text)" />
              </button>
            </Card>
          ) : null}
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "20px 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Completed trips</div>
          {done.map((t) => (
            <Card key={t.id}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ flex: 1, paddingRight: "var(--space-sm)", minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.from} → {t.to}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{t.date}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">${t.fare}</div>
              </div>
            </Card>
          ))}
          <Card style={{ background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", boxShadow: "none" }}>
            <div style={{ fontSize: 12, color: "var(--highlight-ink)", lineHeight: 1.5 }}>{walletReveal
              ? "Lynia takes a small commission on each delivery you complete — from a prepaid balance, never your cash in hand. Open your Wallet to top up and see every deduction beside the ride it came from."
              : "A record of work done — not a payout balance. You keep the full agreed fare during the launch period (no commission for the first few months); payment is cash, outside the app."}</div>
          </Card>
          <Button label="Back" variant="ghost" onClick={() => setView("profile")} />
        </ScreenPad>
      );
    }
    if (view === "tracking") {
      const s = order.status;
      const activeMap = ["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered"].includes(s);
      const riderPos = Math.min(1, STEP_FLOW.indexOf(s) / 5);
      const cancellable = ["assigned", "confirmed", "en_route_pickup"].includes(s);
      if (s === "cancelled") {
        return (
          <ScreenPad>
            <TopRow>
              <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
              <div style={{ flex: 1 }} />
              <StatusPill status="cancelled" tone="offline" />
            </TopRow>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Icon name="circle-alert" size={18} color="var(--danger)" />
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)" }}>This order was cancelled.</div>
              </div>
              {order.cancelReason ? <div style={{ fontSize: 13, color: "var(--muted)" }}>Reason: {order.cancelReason}</div> : null}
            </Card>
            <Button label="Send a new request" onClick={() => { setOrder(null); setView("send"); }} />
          </ScreenPad>
        );
      }
      return (
        <ScreenPad>
          <TopRow>
            <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
            <div style={{ flex: 1 }} />
            <StatusPill status={s} />
          </TopRow>
          <Card accent>
            <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">Give this code to the recipient — the rider enters it at hand-off:</div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 6, color: "var(--accent-text)" }} className="lynia-tabular">{deliveryCode.slice(0, 3)} {deliveryCode.slice(3)}</div>
            <Button label="Re-issue delivery code" variant="ghost" onClick={() => { setDeliveryCode(String(Math.floor(100000 + Math.random() * 900000))); setOtpAttempts(0); setOtpError(null); }} />
          </Card>
          <Card>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare ${order.fare} · {order.rider.name}</div>
            {activeMap ? <div style={{ marginBottom: 10 }}><CallRow label="Your rider" name={order.rider.name} phone="+263 78 202 1180" /></div> : null}
            {activeMap ? <K.FauxMap rider riderPos={riderPos} paused={net === "reconnecting"} pins={pickupPt && dropPt ? { a: pickupPt, b: dropPt } : undefined} /> : null}
            {activeMap ? <div style={{ height: 10 }} /> : null}
            {activeMap ? <GMapsRow /> : null}
            <div style={{ height: 12 }} />
            <Stepper events={order.events} currentStatus={s} view="customer" />
          </Card>
          {s === "delivered" ? (
            <Card>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Rate your rider</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => submitRating(n)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 30, color: n <= score ? "var(--highlight)" : "var(--line)", padding: 2 }}>★</button>
                ))}
              </div>
            </Card>
          ) : s === "completed" ? (
            <Card><div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-text)" }}>Delivered & completed. Thank you!</div></Card>
          ) : (
            <Button label="▶ Simulate next step" onClick={advanceCustomer} />
          )}
          <Button label="Back home" variant="ghost" onClick={() => { setOrder(null); setView("home"); }} />
          {cancellable ? (
            cancelOpen ? (
              <Card>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Cancel this order?</div>
                <Field label="Reason (optional)" value={cancelReason} onChange={setCancelReason} placeholder="Changed my mind / sent another way" maxLength={280} />
                <Button label="Confirm cancellation" onClick={() => { setOrder((o) => ({ ...o, status: "cancelled", cancelReason: cancelReason.trim() })); setCancelOpen(false); }} />
                <Button label="Keep order" variant="ghost" onClick={() => setCancelOpen(false)} />
              </Card>
            ) : (
              <Button label="Cancel order" variant="ghost" onClick={() => setCancelOpen(true)} />
            )
          ) : null}
        </ScreenPad>
      );
    }
  }

  /* ================= RIDER ================= */
  function renderRider() {
    const commissionGated = walletReveal && walletBalance < 2; // commission_low_balance online gate
    if (job) {
      const NEXT = { assigned: ["confirmed", "Confirm the job"], confirmed: ["en_route_pickup", "Head to pickup"], en_route_pickup: ["picked_up", "Mark parcel collected"], picked_up: ["en_route_dropoff", "Head to drop-off"] };
      const nx = NEXT[job.status];
      const riderPos = Math.min(1, STEP_FLOW.indexOf(job.status) / 5);
      return (
        <ScreenPad>
          <TopRow>
            <Heading style={{ marginBottom: 0 }}>Your job</Heading>
            <div style={{ flex: 1 }} />
            <StatusPill status={job.status} />
          </TopRow>
          <Card>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare ${job.fare}</div>
            {/* Ride is active → both contact numbers revealed so the rider can call either party
                for anything (PHONE_REVEAL_STATUSES: assigned→completed). */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              <CallRow label="Sender" name={pickup || "Pickup contact"} phone={senderPhone || "+263 77 123 4567"} />
              <CallRow label="Recipient" name={drop || "Drop-off contact"} phone={rcptPhone || "+263 71 555 0090"} />
            </div>
            {/* Items & note — what the rider reviews and confirms at the 'assigned' step (§5c step 2). */}
            <div style={{ padding: "10px 12px", background: "var(--surface)", borderRadius: "var(--radius-input)", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 2 }}>Items</div>
              {(job.order && job.order.items ? job.order.items : [{ desc: "Parcel", qty: 1 }]).map((it, i) => (
                <div key={i} style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--muted)", fontWeight: 700, minWidth: 22 }} className="lynia-tabular">{it.qty}×</span>
                  <span>{it.desc}</span>
                </div>
              ))}
              {job.order && job.order.note ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>Sender's note</div>
                  <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: "var(--leading-body)" }}>{job.order.note}</div>
                </div>
              ) : null}
            </div>
            <K.FauxMap rider riderPos={riderPos} paused={net === "reconnecting"} pins={pickupPt && dropPt ? { a: pickupPt, b: dropPt } : undefined} />
            <div style={{ height: 12 }} />
            <Stepper events={job.events} currentStatus={job.status} view="rider" />
          </Card>
          {nx ? <Button label={nx[1]} onClick={() => advanceRider(nx[0])} /> : null}
          {job.status === "en_route_dropoff" ? (
            <Card>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Confirm hand-off</div>
              <Sub>Ask the recipient for the 6-digit delivery code.</Sub>
              <Field label="Delivery code" value={rCode} onChange={(v) => { setRCode(v); if (otpError && !otpLocked) setOtpError(null); }} inputMode="numeric" placeholder="000000" maxLength={6} error={otpError} disabled={otpLocked} />
              {otpLocked ? (
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Locked after 5 attempts. The customer can re-issue a fresh code from their order screen.</div>
              ) : null}
              <Button label="Confirm delivery" onClick={confirmDelivery} disabled={rCode.trim().length !== 6 || otpLocked} />
            </Card>
          ) : null}
          {job.status === "delivered" ? (
            <Card><div style={{ fontWeight: 700, color: "var(--accent-text)" }}>Delivered. You're free for the next job.</div></Card>
          ) : null}
          <Button label="Back to board" variant="ghost" onClick={() => setJob(null)} />
        </ScreenPad>
      );
    }
    // ── KYC gate + become flow (rider self-onboarding, review §4/§5) ──
    if (kyc !== "verified") {
      if (kyc === "form") {
        return (
          <ScreenPad>
            <TopRow>
              <Heading style={{ marginBottom: 0 }}>Become a rider</Heading>
              <div style={{ flex: 1 }} />
            </TopRow>
            <Sub>Verify your ID and register your bike to start accepting deliveries.</Sub>
            <Card>
              <Field label="First name" value={kFirst} onChange={setKFirst} placeholder="Tendai" />
              <Field label="Last name" value={kLast} onChange={setKLast} placeholder="Moyo" />
              <Field label="National ID number" value={kId} onChange={setKId} inputMode="numeric" placeholder="631234567" error={idError} hint={idError ? undefined : "The 8–12 digits on your national ID card."} />
            </Card>
            <Card>
              <Field label="Bike registration" value={kBike} onChange={setKBike} placeholder="ABZ 1234" />
              <Label>Your photo</Label>
              <button onClick={() => setKPhoto(true)} style={{ ...collapseBtn, justifyContent: "center", gap: 8, minHeight: 52, border: "1px solid var(--line)", borderRadius: "var(--radius-input)", background: kPhoto ? "var(--accent-wash)" : "var(--bg)", marginTop: 4 }}>
                <Icon name={kPhoto ? "check" : "user"} size={18} color="var(--accent-text)" />
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-text)" }}>{kPhoto ? "Photo added — retake" : "Take photo"}</span>
              </button>
            </Card>
            {/* Consent block (review §4 P2): partner, what's collected, why, ≥14px, privacy link */}
            <Card style={{ background: "var(--surface)", border: "1px solid transparent", boxShadow: "none" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <Icon name="id-card" size={18} color="var(--accent-text)" style={{ marginTop: 1 }} />
                <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
                  Your national ID is checked by our verification partner <b style={{ color: "var(--ink)", fontWeight: 600 }}>Didit</b> — an ID photo plus a quick selfie liveness check. We store your ID number, bike reg and photo to keep deliveries safe; we don't share them with customers. You'll finish in your browser, then come back to go online.{" "}
                  <span style={{ color: "var(--accent-text)", fontWeight: 600, textDecoration: "underline" }}>Privacy policy</span>
                </div>
              </div>
            </Card>
            <Button label="Submit for verification" onClick={submitKyc} disabled={!kycCanSubmit} />
            <Button label="Back" variant="ghost" onClick={() => setKyc("none")} />
          </ScreenPad>
        );
      }
      return (
        <ScreenPad>
          <TopRow>
            <Heading style={{ marginBottom: 0 }}>Rider</Heading>
            <div style={{ flex: 1 }} />
            {RoleSwitch}
          </TopRow>
          {kyc === "pending" ? (
            <EmptyState icon="id-card" title="Finishing verification…" message="Your ID check is with Didit — riders go online once it's verified. This usually takes under a minute.">
              <Button label="Continue in browser" variant="ghost" onClick={() => {}} />
            </EmptyState>
          ) : kyc === "failed" ? (
            <EmptyState icon="triangle-alert" title="We couldn't verify your ID" message="Often a blurry photo or glare on the ID. Try again, or contact support if it keeps failing.">
              <Button label="Try again" onClick={() => setKyc("form")} />
            </EmptyState>
          ) : (
            <EmptyState icon="id-card" title="Set up as a rider" message="Verify your ID and register your bike to start accepting deliveries. Riders go online once verified.">
              <Button label="Become a rider" onClick={() => { setKTouched(false); setKyc("form"); }} />
            </EmptyState>
          )}
        </ScreenPad>
      );
    }
    return (
      <ScreenPad>
        <BrandHeader label="RIDING IN" address="Harare · CBD corridor" showSearch={false} onProfile={() => setView("profile")} style={{ margin: "calc(-1 * var(--space-screen)) calc(-1 * var(--space-screen)) 12px" }} />
        <TopRow>
          <div style={{ flex: 1 }} />
          {RoleSwitch}
        </TopRow>
        {pendingJob ? (
          <Card accent>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Icon name="check" size={18} color="var(--accent-text)" />
              <div style={{ fontWeight: 700, color: "var(--ink)" }}>A customer picked you!</div>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{pendingJob.order.from} → {pendingJob.order.to} · ${pendingJob.fare}</div>
            <Button label="Open job" onClick={() => { setJob(pendingJob); setPendingJob(null); }} />
          </Card>
        ) : null}
        {commissionGated ? (
          <Card style={{ padding: "8px 16px 20px" }}>
            <EmptyState icon="banknote" title="Top up to keep riding" message={`You're offline. Your commission balance is ${money(walletBalance)} — below the $2.00 you need to accept rides.`}>
              <div style={{ background: "var(--accent-wash)", borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--accent-text)" }}>Amount to go back online</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">{money(2 - walletBalance)}</div>
              </div>
              <div style={{ marginTop: 12 }}><Button label={`Top up ${money(2 - walletBalance)}`} onClick={() => { setTopupOrigin("gate"); setTopupStep("amount"); setTopupSeconds(90); setView("topup"); }} /></div>
              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>This isn't a fine — it's the prepaid balance rides come out of. Nothing was taken from your cash.</div>
            </EmptyState>
          </Card>
        ) : (
          <Card accent={online}>
            <button onClick={() => { if (!online) setOnline(true); }} disabled={online} style={{ background: "none", border: "none", padding: 0, marginBottom: 6, cursor: online ? "default" : "pointer" }}>
              <StatusPill status={online ? (net === "reconnecting" ? "Reconnecting" : "Online") : "Offline"} tone={online ? (net === "reconnecting" ? "reconnecting" : "online") : "offline"} dot />
            </button>
            <Button label={online ? "Go offline" : "Go online"} variant={online ? "ghost" : "primary"} onClick={() => setOnline((v) => !v)} />
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              {online ? (net === "reconnecting" ? "You're online — reconnecting to the live board…" : "You're online — new orders arrive live.") : "Go online to see and bid on nearby orders."}
            </div>
          </Card>
        )}
        {commissionGated ? null : online ? (
          selected ? (
            <Card accent>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Offer on {selected.from} → {selected.to}</div>
              <Field label="Your fare (USD)" value={rFare} onChange={setRFare} inputMode="decimal" placeholder={selected.fare} />
              <Field label="ETA to pickup (min)" value={rEta} onChange={setREta} inputMode="numeric" placeholder="8" />
              <Button label="Send offer" onClick={takeJob} />
              <Button label="Cancel" variant="ghost" onClick={() => setSelected(null)} />
            </Card>
          ) : (
            <div>
              <Sub>Open orders</Sub>
              {boardNotice ? (
                <div role="status" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", background: "var(--accent-wash)", borderRadius: "var(--radius-input)", marginBottom: 10, color: "var(--accent-text)", fontSize: 13, fontWeight: 600 }}>
                  <Icon name="check" size={16} color="var(--accent-text)" /> {boardNotice}
                </div>
              ) : null}
              {BOARD.filter((o) => !bidIds.has(o.id)).map((o) => (
                <Card key={o.id}>
                  <div style={{ fontWeight: 700, color: "var(--ink)" }}>{o.from} → {o.to}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">{itemSummary(o.items)} · {o.km} km away · asking ${o.fare}</div>
                  <Button label="Make an offer" variant="ghost" onClick={() => { setSelected(o); setRFare(o.fare); setREta("8"); }} />
                </Card>
              ))}
              {BOARD.filter((o) => !bidIds.has(o.id)).length === 0 ? (
                <EmptyState icon="inbox" title="No open orders near you right now" message="You're online and first in line — stay put, requests come through fast. Busiest 7–9am & 5–7pm." />
              ) : null}
            </div>
          )
        ) : (
          <EmptyState icon="inbox" title="You're offline" message="Go online to see nearby orders — you'll be first in line." />
        )}
      </ScreenPad>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, background: "var(--bg)", borderRadius: 999, padding: 4, boxShadow: "var(--shadow-card)" }}>
        {[[false, "360 · typical"], [true, "320 · entry phone"]].map(([v, lbl]) => (
          <button key={lbl} onClick={() => setSmall(v)} style={{
            border: "none", borderRadius: 999, padding: "7px 14px", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: small === v ? "var(--accent)" : "transparent", color: small === v ? "var(--on-accent)" : "var(--muted)",
          }}>{lbl}</button>
        ))}
      </div>
      {/* Demo controls (not product UI) — reach the supply + connectivity states. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", fontFamily: "var(--font-sans)" }}>
        <DemoChip label={ridersOnline ? "Riders: available" : "Riders: none (D3)"} on={!ridersOnline} onClick={() => setRidersOnline((v) => !v)} />
        <DemoChip label={net === "online" ? "Network: online" : net === "offline" ? "Network: offline" : "Network: reconnecting"} on={net !== "online"} onClick={() => setNet((n) => (n === "online" ? "offline" : n === "offline" ? "reconnecting" : "online"))} />
        <DemoChip label={walletReveal ? "Wallet: revealed" : "Wallet: hidden (flag)"} on={walletReveal} onClick={() => setWalletReveal((v) => !v)} />
        <DemoChip label={walletBalance < 2 ? "Balance: low (gate)" : "Balance: ok"} on={walletBalance < 2} onClick={() => setWalletBalance((b) => (b < 2 ? 4.85 : 0.85))} />
      </div>
      <Phone width={small ? 320 : 360} height={small ? 640 : 720}>
        <OfflineBanner state={net} />
        {view === "wallet" ? renderWallet() : view === "topup" ? renderTopup() : role === "customer" ? renderCustomer() : renderRider()}
      </Phone>
    </div>
  );
}

function DemoChip({ label, on, onClick }) {
  return (
    <button onClick={onClick} style={{
      border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent-wash)" : "var(--bg)",
      color: on ? "var(--accent-text)" : "var(--muted)", borderRadius: 999, padding: "5px 12px",
      fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, cursor: "pointer",
    }}>{label}</button>
  );
}

/* ── Layout helpers ── */
const collapseBtn = { display: "flex", alignItems: "center", width: "100%", minHeight: "var(--target-min)", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-sans)" };
function TopRow({ children }) { return <div style={{ display: "flex", alignItems: "center", marginBottom: "var(--space-md)", gap: 8 }}>{children}</div>; }
function QtyStepper({ value, onChange, min = 1, max = 99 }) {
  const btn = (dir, label) => (
    <button
      onClick={() => onChange(Math.max(min, Math.min(max, value + dir)))}
      disabled={dir < 0 ? value <= min : value >= max}
      aria-label={label}
      style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--accent-text)", fontSize: 20, fontWeight: 700, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >{dir < 0 ? "−" : "+"}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {btn(-1, "Fewer")}
      <span style={{ minWidth: 24, textAlign: "center", fontSize: 18, fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
      {btn(1, "More")}
    </div>
  );
}
/* ── Search-first addressing (2026 journey review). Two stacked address rows are the primary way
   to set pickup / drop-off; tapping a row opens the full-screen search. The map tap-to-pin remains
   a secondary fallback. Pickup = green dot, drop-off = red square. ── */
function AddressFields({ pickup, drop, onPick }) {
  const Row = ({ role, value }) => {
    const color = role === "pickup" ? "var(--accent)" : "var(--danger)";
    const label = role === "pickup" ? "PICKUP" : "DROP-OFF";
    const ph = role === "pickup" ? "Set pickup location" : "Where to?";
    return (
      <button onClick={() => onPick(role)} style={{ display: "flex", alignItems: "center", gap: 11, minHeight: 48, padding: "6px 12px", width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
        <span style={{ width: 12, height: 12, borderRadius: role === "pickup" ? "50%" : 3, background: value ? color : "var(--bg)", border: `2px solid ${color}`, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>{label}</div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: value ? "var(--ink)" : "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value || ph}</div>
        </div>
        <Icon name={value ? "pencil" : "search"} size={16} color="var(--muted)" />
      </button>
    );
  };
  return (
    <div>
      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", background: "var(--bg)", marginBottom: 6, overflow: "hidden" }}>
        <Row role="pickup" value={pickup} />
        <div style={{ height: 1, background: "var(--line)", marginLeft: 35 }} />
        <Row role="drop" value={drop} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 12, fontSize: 11.5, color: "var(--muted)" }}>
        <Icon name="map-pin" size={13} color="var(--muted)" /> Search an address, or tap the map to drop a pin.
      </div>
    </div>
  );
}

/* Google-backed address search (search-first). Selecting a text result sets the point directly;
   "Set the pin on the map" hands off to the draggable-pin confirm screen. */
const PLACE_RESULTS = {
  pickup: [
    ["Eastgate Mall, CBD", "Robert Mugabe Rd, Harare", { x: 26, y: 30 }],
    ["Joina City", "Jason Moyo Ave, CBD", { x: 34, y: 36 }],
    ["Avondale Shops", "King George Rd, Avondale", { x: 30, y: 22 }],
  ],
  drop: [
    ["14 Glenara Avenue", "Avenues, Harare", { x: 76, y: 70 }],
    ["Glenara Shopping Centre", "Glenara Ave S, Braeside", { x: 70, y: 64 }],
    ["Glen Lorne Shops", "Glen Lorne, Harare", { x: 82, y: 58 }],
  ],
};
function AddrSearch({ role, query, onQuery, onBack, onPickResult, onUseLocation, onSetOnMap }) {
  const isPickup = role === "pickup";
  const results = PLACE_RESULTS[role];
  const Result = ({ icon, name, sub, bg, ic, onClick }) => (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--line)", width: "100%", background: "none", border: "none", borderBottomStyle: "solid", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
      <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "50%", background: bg || "var(--surface)", flexShrink: 0 }}>
        <Icon name={icon} size={16} color={ic || "var(--muted)"} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
      </div>
    </button>
  );
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ padding: "36px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} aria-label="Back" style={{ background: "none", border: "none", padding: 4, cursor: "pointer", display: "flex" }}><Icon name="arrow-left" size={20} color="var(--ink)" /></button>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{isPickup ? "Set pickup" : "Set drop-off"}</span>
          <div style={{ flex: 1 }} />
          <span style={{ width: 11, height: 11, borderRadius: isPickup ? "50%" : 3, border: `2px solid ${isPickup ? "var(--accent)" : "var(--danger)"}`, background: "var(--bg)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "0 12px", height: 46, border: "1.5px solid var(--accent)" }}>
          <Icon name="search" size={18} color="var(--muted)" />
          <input autoFocus value={query} onChange={(e) => onQuery(e.target.value)} placeholder={isPickup ? "Search pickup address" : "Search drop-off address"} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--ink)" }} />
          {query ? <button onClick={() => onQuery("")} aria-label="Clear" style={{ background: "none", border: "none", padding: 2, cursor: "pointer", display: "flex" }}><Icon name="x" size={16} color="var(--muted)" /></button> : null}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--line)" }} role="button" onClick={onUseLocation}>
          <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--accent-wash)", flexShrink: 0 }}><Icon name="navigation" size={16} color="var(--accent-text)" /></span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--accent-text)" }}>Use my current location</span>
        </div>
        <button onClick={onSetOnMap} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--line)", width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
          <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--accent-wash)", flexShrink: 0 }}><Icon name="map-pin" size={16} color="var(--accent-text)" /></span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--accent-text)" }}>Set the pin on the map</span>
        </button>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", margin: "12px 0 2px" }}>RESULTS</div>
        {results.map(([name, sub, pt]) => <Result key={name} icon="map-pin" name={name} sub={sub} onClick={() => onPickResult({ pt, label: name })} />)}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, padding: "9px 16px", borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--muted)" }}>
        Powered by <span style={{ fontWeight: 700, letterSpacing: "-.01em" }}><span style={{ color: "#4285F4" }}>G</span><span style={{ color: "#EA4335" }}>o</span><span style={{ color: "#FBBC05" }}>o</span><span style={{ color: "#4285F4" }}>g</span><span style={{ color: "#34A853" }}>l</span><span style={{ color: "#EA4335" }}>e</span></span>
      </div>
    </div>
  );
}

/* Draggable-pin confirm — the map hand-off from search. Stores lat/lng + place_id so the rider
   gets turn-by-turn; an optional landmark note refines the exact door. */
function AddrConfirm({ role, onBack, onConfirm }) {
  const isPickup = role === "pickup";
  const color = isPickup ? "var(--accent)" : "var(--danger)";
  const label = isPickup ? "Eastgate Mall, CBD" : "14 Glenara Avenue";
  const sub = isPickup ? "Robert Mugabe Rd, Harare, Zimbabwe" : "Avenues, Harare, Zimbabwe";
  const pt = isPickup ? { x: 26, y: 30 } : { x: 76, y: 70 };
  const [note, setNote] = React.useState("");
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <K.FauxMap fill pins={{ a: { x: 50, y: 40 }, b: null }} />
      <button onClick={onBack} aria-label="Back" style={{ position: "absolute", top: 34, left: 14, zIndex: 6, width: 40, height: 40, borderRadius: "50%", background: "var(--bg)", border: "none", boxShadow: "var(--shadow-card)", display: "grid", placeItems: "center", cursor: "pointer" }}>
        <Icon name="arrow-left" size={18} color="var(--ink)" />
      </button>
      <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-100%)", zIndex: 6, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
        <span style={{ background: "var(--ink)", color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: "var(--radius-pill)", padding: "4px 9px", marginBottom: 4, whiteSpace: "nowrap" }}>Drag to adjust</span>
        <Icon name="map-pin" size={40} color={color} />
      </div>
      <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,4px)", zIndex: 5, width: 14, height: 5, borderRadius: "50%", background: "rgba(20,24,27,.28)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10, background: "var(--bg)", borderRadius: "20px 20px 0 0", boxShadow: "var(--shadow-sheet)", padding: "12px 16px 16px" }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--line)", margin: "0 auto 12px" }} />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <Icon name="map-pin" size={20} color={color} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{label}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{sub}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: "var(--radius-input)", background: "var(--accent-wash)", marginBottom: 12 }}>
          <Icon name="check" size={15} color="var(--accent-text)" />
          <span style={{ fontSize: 12, color: "var(--accent-text)", fontWeight: 600, lineHeight: 1.4 }}>Exact point set — syncs to Google Maps so your rider gets turn-by-turn.</span>
        </div>
        <Field label="Landmark / building, floor (optional)" value={note} onChange={setNote} placeholder="Blue gate opposite the pharmacy" />
        <Button label={isPickup ? "Confirm pickup" : "Confirm drop-off"} onClick={() => onConfirm({ pt, label })} />
      </div>
    </div>
  );
}

/* Google Maps hand-off row on live tracking — the customer follows the same route the rider is
   navigating (address object carries place_id + lat/lng, so it deep-links into Maps). */
function GMapsRow() {
  return (
    <a href="https://maps.google.com" target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-input)", border: "1px solid var(--line)", background: "var(--bg)", textDecoration: "none" }}>
      <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "50%", background: "var(--accent-wash)", flexShrink: 0 }}>
        <Icon name="navigation" size={16} color="var(--accent-text)" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Follow route in Google Maps</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Same live route your rider is navigating</div>
      </div>
      <Icon name="arrow-right" size={16} color="var(--muted)" />
    </a>
  );
}

/* A1-8 · pre-broadcast liability disclaimer — accept-to-continue sheet over the home map. Records
   consent (version + timestamp) before the order is created. */
function DisclaimerSheet({ agreed, onToggle, onAgree, onBack }) {
  const rows = [
    ["triangle-alert", "Sending is at your own risk", "If your parcel is lost, damaged or not delivered, Lynia isn't liable — you're hiring an independent rider."],
    ["banknote", "Payment is between you and your rider", "You agree the price in the app and pay cash directly. Lynia isn't involved in payment or any money dispute."],
    ["user", "Lynia connects you — that's all", "We match you with a nearby rider. We don't carry, insure or guarantee your parcel."],
  ];
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20 }}>
      <div onClick={onBack} style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", borderRadius: "22px 22px 0 0", boxShadow: "var(--shadow-sheet)", padding: "14px 16px 16px", maxHeight: "94%", overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--line)", margin: "0 auto 14px" }} />
        <div style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)", marginBottom: 3 }}>Before you send</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, lineHeight: 1.45 }}>Please read and accept — this is how LyniaGo works.</div>
        {rows.map(([ic, t, m]) => (
          <div key={t} style={{ display: "flex", gap: 11, marginBottom: 13 }}>
            <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", flexShrink: 0 }}>
              <Icon name={ic} size={17} color="var(--accent-text)" />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{t}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, marginTop: 1 }}>{m}</div>
            </div>
          </div>
        ))}
        <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: "var(--radius-input)", background: "var(--accent-wash)", marginBottom: 12, width: "100%", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: agreed ? "var(--accent)" : "var(--bg)", border: agreed ? "none" : "1.5px solid var(--line)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            {agreed ? <Icon name="check" size={14} color="#fff" /> : null}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4 }}>I understand and accept these terms</span>
        </button>
        <Button label="Agree & broadcast" onClick={onAgree} disabled={!agreed} />
        <Button label="Back" variant="ghost" onClick={onBack} />
      </div>
    </div>
  );
}

/* F-07 · auction counter-offer review — a rider offered above the ask. Show ask vs counter + delta;
   Accept assigns at the counter price, Decline keeps the rider in the list at their price (one
   counter round, no counter-back). Never auto-charges higher than the customer's ask. */
function CounterOffer({ o, ask, counterFare, onAccept, onDecline }) {
  const delta = (+counterFare - +ask).toFixed(2);
  return (
    <div style={{ border: "1.5px solid var(--accent)", borderRadius: "var(--radius-card)", background: "var(--bg)", boxShadow: "var(--shadow-card)", padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>{o.name} countered your price.</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name="user" size={20} color="var(--accent-text)" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{o.name}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }} className="lynia-tabular">★ {o.rating} · {o.trips} trips · {o.eta} min away</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "9px 10px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)" }}>YOUR PRICE</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">${(+ask).toFixed(2)}</div>
        </div>
        <div style={{ display: "grid", placeItems: "center", color: "var(--muted)" }}><Icon name="arrow-right" size={16} color="var(--muted)" /></div>
        <div style={{ flex: 1, background: "var(--accent-wash)", borderRadius: "var(--radius-input)", padding: "9px 10px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: "var(--accent-text)" }}>THEIR OFFER</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent-text)" }} className="lynia-tabular">${(+counterFare).toFixed(2)}</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--highlight-ink)" }}>+${delta}</span>
          </div>
        </div>
      </div>
      <Button label={`Accept $${(+counterFare).toFixed(2)}`} onClick={onAccept} />
      <Button label="Decline" variant="ghost" onClick={onDecline} />
      <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 2 }}>Declining keeps {o.name.split(" ")[0]} in your list at ${(+counterFare).toFixed(2)} — one counter round, no counter-back.</div>
    </div>
  );
}

/* Role fork — one account, pick how you'll start (switch anytime). Shown once, post-OTP. */
function RoleSelectScreen({ onCustomer, onRider }) {
  const [sel, setSel] = React.useState("customer");
  const Opt = ({ role, icon, title, desc }) => {
    const selected = sel === role;
    return (
      <button onClick={() => setSel(role)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: "var(--radius-card)", border: `1.5px solid ${selected ? "var(--accent)" : "var(--line)"}`, background: selected ? "var(--accent-wash)" : "var(--bg)", marginBottom: 10, boxShadow: selected ? "none" : "var(--shadow-card)", width: "100%", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
        <span style={{ width: 46, height: 46, borderRadius: "50%", background: selected ? "var(--accent)" : "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name={icon} size={22} color={selected ? "#fff" : "var(--accent-text)"} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{title}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>{desc}</div>
        </div>
        {selected ? <Icon name="check" size={20} color="var(--accent-text)" /> : <Icon name="chevron-right" size={18} color="var(--muted)" />}
      </button>
    );
  };
  return (
    <ScreenPad>
      <Lockup />
      <Heading>How do you want to start?</Heading>
      <Sub>It's one account — pick how you'll use LyniaGo now, and switch anytime.</Sub>
      <Opt role="customer" icon="shopping-bag" title="Use LyniaGo" desc="Order food, send parcels, more services soon." />
      <Opt role="rider" icon="bike" title="Earn as a rider" desc="Deliver parcels near you and get paid in cash." />
      <Button label={sel === "customer" ? "Continue as a customer" : "Continue as a rider"} onClick={() => (sel === "customer" ? onCustomer() : onRider())} />
    </ScreenPad>
  );
}

/* Post-OTP registration (first sign-up only) — a name + ID for the account record, NOT KYC. */
function RegisterScreen({ fullName, onFullName, idNum, onIdNum, phone, onContinue }) {
  return (
    <ScreenPad>
      <Heading>Tell us who you are</Heading>
      <Sub>You're sending parcels. Just a name and ID for your account record — no documents, no verification.</Sub>
      <Field label="Full name" value={fullName} onChange={onFullName} placeholder="Chipo Marufu" />
      <div style={{ position: "relative" }}>
        <Field label="Phone number" value={phone || "+263 77 245 1180"} onChange={() => {}} inputMode="tel" hint="Verified by SMS" />
        <span style={{ position: "absolute", top: 30, right: 12, display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: "var(--accent-text)" }}>
          <Icon name="check" size={13} color="var(--accent-text)" /> Verified
        </span>
      </div>
      <Field label="National ID number" value={idNum} onChange={onIdNum} placeholder="63-123456-A-42" hint="Stored on your account only — we don't verify it. Riders go through a separate ID check." />
      <Button label="Continue" onClick={onContinue} disabled={fullName.trim().length < 2} />
    </ScreenPad>
  );
}

function CallRow({ label, name, phone }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">{phone}</div>
      </div>
      <a href={"tel:" + String(phone).replace(/[^\d+]/g, "")} aria-label={"Call " + label} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, textDecoration: "none" }}>
        <Icon name="phone" size={18} color="#fff" />
      </a>
    </div>
  );
}
function ScreenPad({ children }) { return <div style={{ padding: "var(--space-screen)", minHeight: "100%", boxSizing: "border-box" }}>{children}</div>; }
/* LyniaGo mark — "the Paper Dove". Creases (the hidden cross) show only ≥ ~32px per the brand rule. */
function DoveMark({ size = 34, creases = true, crease = "var(--surface)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" style={{ flexShrink: 0 }}>
      <polygon points="28,6 58,32 38,42" fill="var(--accent)" />
      <polygon points="90,26 14,52 48,60" fill="var(--accent)" />
      <polygon points="90,26 48,60 42,84" fill="var(--accent-700)" />
      {creases && size >= 32 ? <path d="M90 26 L48 60 M70.5 30.2 L81.5 43.8" stroke={crease} strokeWidth="2.4" fill="none" /> : null}
    </svg>
  );
}
function Lockup() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      <DoveMark size={40} />
      <span style={{ fontFamily: "var(--font-wordmark)", fontSize: 24, fontWeight: 600, color: "var(--ink)" }}>Lynia<span style={{ color: "var(--accent-700)" }}>Go</span></span>
    </div>
  );
}
function Phone({ children, width = 360, height = 720 }) {
  return (
    <div style={{ width, height, background: "var(--surface)", borderRadius: 34, border: "10px solid #14181b", overflow: "hidden", position: "relative", boxShadow: "0 20px 60px rgba(20,24,27,.28)" }}>
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 110, height: 22, background: "#14181b", borderRadius: "0 0 14px 14px", zIndex: 20 }} />
      <div style={{ height: "100%", overflowY: "auto", background: "var(--surface)" }}>{children}</div>
    </div>
  );
}

// Mount ONLY on the kit page (index.html sets the flag). The DS compiler also bundles this file
// into _ds_bundle.js; without this guard the demo app would execute (and could hijack a #root)
// on every page that loads the bundle.
if (window.__LYNIA_KIT_PAGE) {
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
}