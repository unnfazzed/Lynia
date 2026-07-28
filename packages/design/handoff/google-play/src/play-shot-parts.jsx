/* Google Play screenshot kit — static, marketing-posed recreations of the LyniaGo customer
   screens, composed from the design-system primitives (window.LyniaDesignSystem_94c56a).
   Map/offer composites are lifted from ui_kits/mobile/kit-parts.js and frozen (no interactivity —
   these exist to be exported as 1080×1920 PNGs). Canvas green is --accent-700 (#009D3B) so the
   white captions clear WCAG AA-large; the icon tile stays brand #00B14F. */

const DS = window.LyniaDesignSystem_94c56a;
const { Button, Card, Field, StatusPill, Stepper, Heading, Sub, Icon, SkeletonList } = DS;

/* ── Brand mark ── */
function ShotDove({ size = 34, white = false, creases = true }) {
  const fill = white ? "#fff" : "var(--accent)";
  const fold = white ? "rgba(255,255,255,.62)" : "var(--accent-700)";
  const crease = white ? "#009D3B" : "var(--surface)";
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" style={{ flexShrink: 0 }}>
      <polygon points="28,6 58,32 38,42" fill={fill}></polygon>
      <polygon points="90,26 14,52 48,60" fill={fill}></polygon>
      <polygon points="90,26 48,60 42,84" fill={fold}></polygon>
      {creases && size >= 32 ? <path d="M90 26 L48 60 M70.5 30.2 L81.5 43.8" stroke={crease} strokeWidth="2.4" fill="none"></path> : null}
    </svg>
  );
}

/* ── Android status bar (simple shapes only) ── */
function StatusBar({ float = false }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px 4px", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
      color: "var(--ink)", position: float ? "absolute" : "static", top: 0, left: 0, right: 0, zIndex: 30,
    }}>
      <span className="lynia-tabular">9:16</span>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
          {[4, 6, 8, 10].map((h) => <span key={h} style={{ width: 3, height: h, background: "var(--ink)", borderRadius: 1 }}></span>)}
        </span>
        <span style={{ width: 21, height: 11, border: "1.5px solid var(--ink)", borderRadius: 3, position: "relative", display: "inline-block", boxSizing: "border-box" }}>
          <span style={{ position: "absolute", top: 1.5, bottom: 1.5, left: 1.5, width: 11, background: "var(--ink)", borderRadius: 1 }}></span>
        </span>
      </span>
    </div>
  );
}

/* ── Frozen composites (from kit-parts.js) ── */
function Pin({ x, y, color, label }) {
  return (
    <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-100%)", display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: color, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }}>{label}</div>
      <div style={{ width: 2, height: 8, background: color }}></div>
    </div>
  );
}
function FauxMap({ height = 190, fill = false, pins, rider = false, riderPos = 0.5 }) {
  const a = pins && pins.a, b = pins && pins.b;
  const rx = a && b ? a.x + (b.x - a.x) * riderPos : 50;
  const ry = a && b ? a.y + (b.y - a.y) * riderPos : 50;
  return (
    <div style={{
      position: "relative", height: fill ? "100%" : height,
      borderRadius: fill ? 0 : "var(--radius-input)", overflow: "hidden",
      background:
        "repeating-linear-gradient(0deg,#eef1f3 0 1px,transparent 1px 34px)," +
        "repeating-linear-gradient(90deg,#eef1f3 0 1px,transparent 1px 40px)," +
        "linear-gradient(135deg,#f2f5f6,#e9edf0)",
      border: fill ? "none" : "1px solid var(--line)",
    }}>
      {a && b ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          <path d={`M ${a.x} ${a.y} C ${a.x + (b.x - a.x) * 0.55} ${a.y}, ${a.x + (b.x - a.x) * 0.45} ${b.y}, ${b.x} ${b.y}`}
            fill="none" stroke="var(--accent)" strokeDasharray="0.8 2.6" strokeLinecap="round" opacity="0.75" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3 }}></path>
        </svg>
      ) : null}
      {a ? <Pin x={a.x} y={a.y} color="var(--accent)" label="A" /> : null}
      {b ? <Pin x={b.x} y={b.y} color="var(--danger)" label="B" /> : null}
      {rider && a && b ? (
        <div style={{ position: "absolute", left: `${rx}%`, top: `${ry}%`, transform: "translate(-50%,-50%)", width: 30, height: 30, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.3)" }}>
          <Icon name="bike" size={16} color="#fff" />
        </div>
      ) : null}
    </div>
  );
}
function OfferCard({ o, recommended }) {
  return (
    <Card accent={recommended} style={recommended ? { borderColor: "var(--highlight)" } : undefined}>
      {recommended ? <div style={{ fontSize: 10, fontWeight: 700, color: "var(--highlight-ink)", letterSpacing: 0.5, marginBottom: 3 }}>★ RECOMMENDED</div> : null}
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{o.name}</div>
      <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">★ {o.rating} · {o.trips} trips · ETA {o.eta} min</div>
      <div style={{ fontSize: 20, fontWeight: 700, margin: "4px 0" }} className="lynia-tabular">${o.fare}</div>
      <Button label="Choose this rider" onClick={() => {}} />
    </Card>
  );
}
function SortChips({ value }) {
  const modes = [["best", "Best match"], ["cheapest", "Cheapest"], ["fastest", "Fastest"], ["rated", "Top rated"]];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "var(--space-sm)" }}>
      {modes.map(([k, lbl]) => {
        const on = value === k;
        return (
          <span key={k} style={{
            display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 14px", borderRadius: "var(--radius-pill)",
            border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent)" : "var(--bg)",
            color: on ? "var(--on-accent)" : "var(--muted)", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600,
          }}>{lbl}</span>
        );
      })}
    </div>
  );
}
function PinToggle({ target, hasPickup, hasDrop }) {
  const opts = [["pickup", "Pickup", "var(--accent)", hasPickup], ["drop", "Drop-off", "var(--danger)", hasDrop]];
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--surface)", borderRadius: "var(--radius-pill)", padding: 4 }}>
      {opts.map(([k, lbl, color, done]) => {
        const on = target === k;
        return (
          <span key={k} style={{
            flex: 1, minHeight: 36, borderRadius: "var(--radius-pill)",
            background: on ? color : "transparent", color: on ? "#fff" : "var(--muted)",
            fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            {done ? <Icon name="check" size={14} color={on ? "#fff" : "var(--accent-text)"} /> : null}
            {lbl}
          </span>
        );
      })}
    </div>
  );
}
function MapSheet({ children, footer }) {
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10,
      background: "var(--bg)", borderRadius: "20px 20px 0 0", boxShadow: "var(--shadow-sheet)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "10px 0 4px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)" }}></span>
      </div>
      <div style={{ padding: "4px var(--space-screen) 0" }}>{children}</div>
      {footer ? <div style={{ padding: "0 var(--space-screen) var(--space-md)" }}>{footer}</div> : null}
    </div>
  );
}
function CallRow({ label, name, phone }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{name}</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">{phone}</div>
      </div>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }}>
        <Icon name="phone" size={18} color="#fff" />
      </span>
    </div>
  );
}
function TopRow({ children }) { return <div style={{ display: "flex", alignItems: "center", marginBottom: "var(--space-md)", gap: 8 }}>{children}</div>; }
function ScreenPad({ children }) { return <div style={{ padding: "0 var(--space-screen) var(--space-screen)", minHeight: "100%", boxSizing: "border-box", background: "var(--surface)" }}>{children}</div>; }

/* ── The shot stage: 1080×1920 canvas, caption, framed phone ── */
const PHONE_SCALE = 2.2;
const SCREEN_W = 360;
const SCREEN_H = 700;
function PhoneFrame({ children }) {
  return (
    <div style={{
      width: SCREEN_W * PHONE_SCALE + 28, height: SCREEN_H * PHONE_SCALE,
      borderLeft: "14px solid #14181b", borderRight: "14px solid #14181b", borderTop: "14px solid #14181b",
      borderRadius: "56px 56px 0 0", overflow: "hidden", background: "#fff",
      boxShadow: "0 48px 120px rgba(0,0,0,.32)", boxSizing: "border-box",
    }}>
      <div style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${PHONE_SCALE})`, transformOrigin: "top left", background: "var(--surface)", overflow: "hidden", position: "relative" }}>
        {children}
      </div>
    </div>
  );
}
function FlatScreen({ children }) {
  return (
    <div style={{
      width: SCREEN_W * PHONE_SCALE, height: SCREEN_H * PHONE_SCALE,
      borderRadius: "40px 40px 0 0", overflow: "hidden", background: "#fff",
      boxShadow: "0 48px 120px rgba(0,0,0,.32)",
    }}>
      <div style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${PHONE_SCALE})`, transformOrigin: "top left", background: "var(--surface)", overflow: "hidden", position: "relative" }}>
        {children}
      </div>
    </div>
  );
}
function PlayShot({ caption, sub, canvas = "#009D3B", bezel = true, children }) {
  return (
    <div className="play-shot" style={{ width: 1080, height: 1920, background: canvas, overflow: "hidden", position: "relative", fontFamily: "var(--font-sans)", flexShrink: 0 }}>
      <div style={{ padding: "104px 84px 0", textAlign: "center" }}>
        <div style={{ fontSize: 78, fontWeight: 700, color: "#fff", letterSpacing: "-1.5px", lineHeight: 1.12, textWrap: "balance" }}>{caption}</div>
        {sub ? <div style={{ marginTop: 20, fontSize: 34, fontWeight: 600, color: "rgba(255,255,255,.88)", lineHeight: 1.3, textWrap: "balance" }}>{sub}</div> : null}
      </div>
      <div style={{ position: "absolute", top: sub ? 452 : 400, left: "50%", transform: "translateX(-50%)" }}>
        {bezel ? <PhoneFrame>{children}</PhoneFrame> : <FlatScreen>{children}</FlatScreen>}
      </div>
    </div>
  );
}

/* ── Fixture data (mirrors ui_kits/mobile/app.js) ── */
const OFFERS = [
  { id: "r1", name: "Tendai M.", rating: "4.8", trips: 132, eta: 6, fare: "2.50" },
  { id: "r2", name: "Kudzai N.", rating: "4.9", trips: 88, eta: 9, fare: "2.20" },
  { id: "r3", name: "Farai R.", rating: "new", trips: 3, eta: 5, fare: "3.00" },
];
const TRIPS = [
  { id: "t1", from: "Eastgate", to: "Avenues", date: "2 Jul", role: "Sent", fare: "3.36", status: "completed", rating: 5 },
  { id: "t2", from: "Avondale", to: "CBD", date: "1 Jul", role: "Sent", fare: "2.50", status: "completed", rating: 5 },
  { id: "t3", from: "Borrowdale", to: "Msasa", date: "30 Jun", role: "Sent", fare: "4.00", status: "completed", rating: 4 },
  { id: "t4", from: "CBD", to: "Belvedere", date: "29 Jun", role: "Sent", fare: "1.50", status: "expired", rating: 0 },
];
const PINS = { a: { x: 24, y: 22 }, b: { x: 74, y: 62 } };
const EV = (n) => ["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered", "completed"]
  .slice(0, n).map((status, i) => ({ status, createdAt: `2026-07-07T10:${String(2 + i * 4).padStart(2, "0")}:00` }));

const noop = () => {};

/* ── Item line (mirrors the DT5 home's line-item editor: Field + Qty stepper) ── */
function ShotQty({ value }) {
  const b = { width: 36, height: 36, borderRadius: "50%", border: "1px solid var(--line)", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 600, color: "var(--accent-text)", boxSizing: "border-box" };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={b}>−</span>
      <span className="lynia-tabular" style={{ fontSize: 15, fontWeight: 700, minWidth: 18, textAlign: "center", color: "var(--ink)" }}>{value}</span>
      <span style={b}>+</span>
    </span>
  );
}
function ItemBox({ desc, qty }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: "10px 10px 8px", marginBottom: 8 }}>
      <Field value={desc} onChange={noop} style={{ marginBottom: 8 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: "var(--text-label)", fontWeight: 600, color: "var(--muted)" }}>Qty</span>
        <ShotQty value={qty} />
      </div>
    </div>
  );
}
function RoleChip() {
  return (
    <span style={{ border: "1px solid var(--line)", background: "var(--bg)", borderRadius: "var(--radius-pill)", padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>Rider →</span>
  );
}
function ShotCodeCard() {
  return (
    <Card accent>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>Give this code to the recipient — the rider enters it at hand-off:</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 6, color: "var(--accent-text)", margin: "4px 0 2px" }} className="lynia-tabular">418 207</div>
      <Button label="Re-issue delivery code" variant="ghost" onClick={noop} />
    </Card>
  );
}

/* ── Shot 1 — map-anchored home, ready to broadcast ── */
function HomeShot() {
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <FauxMap fill pins={PINS} />
      <StatusBar float />
      <div style={{ position: "absolute", top: 34, left: 12, right: 12, display: "flex", alignItems: "center", gap: 8, zIndex: 5 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", borderRadius: "var(--radius-pill)", padding: "6px 12px 6px 6px", boxShadow: "var(--shadow-card)", fontWeight: 700, fontSize: 14, color: "var(--accent-text)" }}>
          <ShotDove size={22} creases={false} />
          <span style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600 }}>Lynia<span style={{ color: "var(--accent-700)" }}>Go</span></span>
        </span>
        <div style={{ flex: 1 }}></div>
        <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg)", boxShadow: "var(--shadow-card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="user" size={18} color="var(--accent-text)" />
        </span>
        <RoleChip />
      </div>
      <span style={{ position: "absolute", top: 78, right: 12, zIndex: 5, display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", borderRadius: "var(--radius-pill)", padding: "9px 14px", boxShadow: "var(--shadow-card)", fontSize: 12, fontWeight: 600, color: "var(--accent-text)", minHeight: 36, boxSizing: "border-box" }}>
        <Icon name="navigation" size={14} color="var(--accent-text)" /> Use my location
      </span>
      <MapSheet footer={<Button label="Broadcast request" onClick={noop} />}>
        <PinToggle target="drop" hasPickup hasDrop />
        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 0 12px", fontSize: 13, color: "var(--muted)" }}>
          <span style={{ fontWeight: 600, color: "var(--ink)" }}>Eastgate Mall, CBD</span>
          <Icon name="arrow-right" size={14} color="var(--muted)" />
          <span style={{ fontWeight: 600, color: "var(--ink)" }}>14 Glenara Ave, Avenues</span>
        </div>
        <div style={{ fontSize: "var(--text-label)", fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>What are you sending?</div>
        <ItemBox desc="Documents envelope" qty={1} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 40, marginBottom: 8 }}>
          <Icon name="package" size={16} color="var(--accent-text)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}>Add another item</span>
        </div>
        <Field label="Your price (USD)" value="3.36" onChange={noop} hint="Suggested $3.36 · 3.1 km · riders here usually accept around $2.96." />
        <Field label="Your phone (sender)" value="+263 77 000 0000" onChange={noop} hint="Shared with your rider only during the delivery." />
        <Field label="Recipient phone" value="+263 71 448 9902" onChange={noop} hint="So the rider can reach them at drop-off." />
        <button style={{ display: "flex", alignItems: "center", width: "100%", minHeight: 44, background: "none", border: "none", padding: "8px 0", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
          <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}>Add landmarks &amp; declared value (optional)</span>
          <Icon name="chevron-up" size={16} color="var(--accent-text)" />
        </button>
      </MapSheet>
    </div>
  );
}

/* ── Shot 2 — name your price (the DT5 home sheet, items + note + price posed) ── */
function PriceShot() {
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <FauxMap fill pins={PINS} />
      <StatusBar float />
      <MapSheet footer={<Button label="Broadcast request" onClick={noop} />}>
        <div style={{ fontSize: "var(--text-label)", fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>What are you sending?</div>
        <ItemBox desc="Pharmacy parcel" qty={1} />
        <ItemBox desc="Documents envelope" qty={3} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 40, marginBottom: 8 }}>
          <Icon name="package" size={16} color="var(--accent-text)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}>Add another item</span>
        </div>
        <Field label="Note for the rider (optional)" value="Ask for Rita at the pharmacy counter; parcel is fragile." onChange={noop} multiline rows={2} hint="Pickup or handling instructions — the rider confirms these before collecting." />
        <Field label="Your price (USD)" value="2.50" onChange={noop} hint="Suggested $3.36 · 3.1 km · riders here usually accept around $2.96." />
      </MapSheet>
    </div>
  );
}

/* ── Shot 3 — offers streaming in ── */
function AuctionShot() {
  return (
    <ScreenPad>
      <StatusBar />
      <div style={{ height: 8 }}></div>
      <TopRow>
        <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
        <div style={{ flex: 1 }}></div>
        <StatusPill status="open_for_offers" />
      </TopRow>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ flex: 1, fontSize: 14, color: "var(--muted)" }}>2 riders bidding</span>
        <span style={{ fontSize: 14, color: "var(--muted)" }} className="lynia-tabular">1:21</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>Asking $2.50 · riders here usually accept around $2.40.</div>
      <OfferCard o={OFFERS[0]} />
      <OfferCard o={OFFERS[1]} />
      <div style={{ marginTop: 8 }}><SkeletonList count={1} /></div>
      <Sub>More riders nearby have been pinged. Hang tight.</Sub>
    </ScreenPad>
  );
}

/* ── Shot 4 — choose your rider ── */
function ChooseShot() {
  return (
    <ScreenPad>
      <StatusBar />
      <div style={{ height: 8 }}></div>
      <TopRow>
        <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
        <div style={{ flex: 1 }}></div>
        <StatusPill status="open_for_offers" />
      </TopRow>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ flex: 1, fontSize: 14, color: "var(--muted)" }}>3 riders bidding</span>
        <span style={{ fontSize: 14, color: "var(--muted)" }} className="lynia-tabular">0:58</span>
      </div>
      <SortChips value="best" />
      <OfferCard o={OFFERS[1]} recommended />
      <OfferCard o={OFFERS[0]} />
      <OfferCard o={OFFERS[2]} />
    </ScreenPad>
  );
}

/* ── Shot 5 — live tracking ── */
function TrackShot() {
  return (
    <ScreenPad>
      <StatusBar />
      <div style={{ height: 8 }}></div>
      <TopRow>
        <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
        <div style={{ flex: 1 }}></div>
        <StatusPill status="en_route_dropoff" />
      </TopRow>
      <ShotCodeCard />
      <Card>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $2.50 · Tendai M.</div>
        <div style={{ marginBottom: 10 }}><CallRow label="Your rider" name="Tendai M." phone="+263 78 202 1180" /></div>
        <FauxMap rider riderPos={0.72} pins={PINS} height={130} />
        <div style={{ height: 12 }}></div>
        <Stepper events={EV(5)} currentStatus="en_route_dropoff" view="customer" />
      </Card>
    </ScreenPad>
  );
}

/* ── Shot 6 — the delivery code + cash ── */
function CodeShot() {
  return (
    <ScreenPad>
      <StatusBar />
      <div style={{ height: 8 }}></div>
      <TopRow>
        <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
        <div style={{ flex: 1 }}></div>
        <StatusPill status="picked_up" />
      </TopRow>
      <ShotCodeCard />
      <Card>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $2.50 · Tendai M.</div>
        <div style={{ marginBottom: 10 }}><CallRow label="Your rider" name="Tendai M." phone="+263 78 202 1180" /></div>
        <FauxMap rider riderPos={0.45} pins={PINS} height={130} />
        <div style={{ height: 12 }}></div>
        <Stepper events={EV(4)} currentStatus="picked_up" view="customer" />
      </Card>
    </ScreenPad>
  );
}

/* ── Shot 7 — delivered, rate your rider ── */
function RateShot() {
  return (
    <ScreenPad>
      <StatusBar />
      <div style={{ height: 8 }}></div>
      <TopRow>
        <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
        <div style={{ flex: 1 }}></div>
        <StatusPill status="delivered" />
      </TopRow>
      <Card>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $2.50 · Tendai M.</div>
        <FauxMap rider riderPos={1} pins={PINS} height={140} />
        <div style={{ height: 12 }}></div>
        <Stepper events={EV(6)} currentStatus="delivered" view="customer" />
      </Card>
      <Card>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Rate your rider</div>
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} style={{ fontSize: 30, color: n <= 5 ? "var(--highlight)" : "var(--line)", padding: 2 }}>★</span>
          ))}
        </div>
      </Card>
    </ScreenPad>
  );
}

/* ── Shot 8 — trip history ── */
function HistoryShot() {
  return (
    <ScreenPad>
      <StatusBar />
      <div style={{ height: 8 }}></div>
      <TopRow><Heading style={{ marginBottom: 0 }}>Your trips</Heading></TopRow>
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
              <div style={{ height: 4 }}></div>
              <StatusPill status={t.status} tone={t.status === "expired" ? "offline" : "neutral"} />
            </div>
          </div>
        </Card>
      ))}
    </ScreenPad>
  );
}

/* ── The 8-shot manifest — order = upload order ── */
const SHOTS = [
  { n: 1, caption: "A bike is minutes away", warm: "A rider is already close by", sub: "On-demand motorbike couriers across Harare", screen: HomeShot, alt: "The send-a-parcel map with pickup and drop-off pins set and a price ready to broadcast." },
  { n: 2, caption: "Send anything — you name the price", warm: "Your parcel, your price", screen: PriceShot, alt: "The order form with two items, a note for the rider, and the sender's own price." },
  { n: 3, caption: "Riders answer in seconds", warm: "Watch the offers roll in", screen: AuctionShot, alt: "Live offers from nearby riders arriving against the 90-second window." },
  { n: 4, caption: "Pick the rider you trust", warm: "Choose who carries it", screen: ChooseShot, alt: "Three rider offers compared by price, rating, trips, and arrival time." },
  { n: 5, caption: "Track every step, live", warm: "Follow it all the way there", screen: TrackShot, alt: "Live delivery tracking with the rider on the map and the 7-step delivery timeline." },
  { n: 6, caption: "A code seals the hand-off", warm: "Only the right hands receive it", sub: "The recipient's code confirms delivery", screen: CodeShot, alt: "The 6-digit delivery code the recipient gives the rider at hand-off." },
  { n: 7, caption: "Delivered — rate your rider", warm: "Done — say thanks with stars", screen: RateShot, alt: "A completed delivery with the five-star rating card." },
  { n: 8, caption: "Every trip on the record", warm: "Your deliveries, remembered", screen: HistoryShot, alt: "The trip history list with routes, dates, and fares." },
];

Object.assign(window, { PlayShotParts: { PlayShot, SHOTS, ShotDove } });
