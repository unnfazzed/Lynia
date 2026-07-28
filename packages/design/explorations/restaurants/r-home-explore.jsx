/* LyniaGo — customer home explorations: three directions for a richer root home.
   Photos are now allowed for Food (lazy-load, compressed); every photo is a drop-slot the founder
   can fill with real dish/kitchen shots. No promos anywhere — richness comes from real content. */

const P = window.RParts;
const { Icon, Card, Money, TAB, StatusBar, TabBar, HomeHead, ServiceTiles, REST, MENU, nop } = P;

const OPEN = REST.filter((r) => r.open);
const MORE = [
  { id: "pitstop", name: "Pit Stop Braai", kind: "Braai · Wors rolls", km: "2.8", eta: "30–40", fee: "2.00", rating: "4.6", n: 71, open: true },
  { id: "amais", name: "Amai's Pot", kind: "Stews · Rice", km: "1.8", eta: "25–35", fee: "1.50", rating: "4.9", n: 33, open: true },
];
const CUISINES = ["Sadza & stews", "Chicken", "Braai", "Breakfast", "Drinks"];
const REORDER = [
  { id: "huku", name: "Half roast huku", price: "6.00", from: "Huku House" },
  { id: "sadza", name: "Sadza & beef stew", price: "4.50", from: "Sadza Republic" },
  { id: "mazoe", name: "Mazoe crush 500ml", price: "1.50", from: "Sadza Republic" },
];

/* Photo drop-slot in a sized box. Bottom-left stays clear (credit overlay corner). */
function Slot({ id, label, h, w = "100%", shape = "rect", style }) {
  return (
    <div style={{ position: "relative", width: w, height: h, background: "var(--surface)", overflow: "hidden", flexShrink: 0, borderRadius: shape === "circle" ? "50%" : 0, ...style }}>
      <image-slot id={id} shape={shape} placeholder={label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}></image-slot>
    </div>
  );
}

/* Tall phone: full scroll length visible, dashed fold marker at 744px, tab bar pinned at the end. */
function Phone({ children, dark, topBg }) {
  return (
    <div style={{ position: "relative", width: 360, background: "var(--bg)", borderRadius: 24, boxShadow: "0 16px 48px rgba(20,24,27,.16)", overflow: "hidden", fontFamily: "var(--font-sans)", color: "var(--ink)" }}>
      <div style={topBg ? { background: topBg } : null}><StatusBar dark={dark} /></div>
      <div style={{ paddingBottom: 70 }}>{children}</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 744, borderTop: "1.5px dashed rgba(20,24,27,.3)", zIndex: 30, pointerEvents: "none" }}>
        <span style={{ position: "absolute", right: 8, top: 3, fontSize: 9.5, fontFamily: "ui-monospace, monospace", color: "rgba(20,24,27,.5)", background: "rgba(255,255,255,.85)", padding: "1px 6px", borderRadius: 4 }}>fold · 360×744</span>
      </div>
      <TabBar active="home" />
    </div>
  );
}

function H({ t, sub, action, style }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "16px 16px 10px", ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{t}</div>
        {sub ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{sub}</div> : null}
      </div>
      {action ? <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", flexShrink: 0 }}>{action}</span> : null}
    </div>
  );
}
const Rail = ({ children, gap = 10 }) => <div style={{ display: "flex", gap, padding: "0 16px", overflow: "hidden" }}>{children}</div>;
const Star = ({ r, n }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: "var(--ink)", ...TAB }}>
    <span style={{ color: "var(--highlight)" }}>★</span>{r}{n ? <span style={{ color: "var(--muted)", fontWeight: 400 }}>({n})</span> : null}
  </span>
);

/* ── 1a · Launcher, upgraded — D-01 untouched, richness added below the tiles ── */
function LiveOrderCard() {
  return (
    <Card accent style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="bike" size={20} color="var(--accent-text)" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Rider on the way · ~6 min</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Half roast huku + 2 more · Sadza Republic</div>
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            {[1, 1, 1, 1, 1, 0, 0].map((on, i) => <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: on ? "var(--accent)" : "var(--line)" }} />)}
          </div>
        </div>
        <Icon name="chevron-right" size={18} color="var(--muted)" style={{ flexShrink: 0 }} />
      </div>
    </Card>
  );
}
function KitchenCard({ r, pre }) {
  return (
    <div style={{ width: 152, borderRadius: 14, background: "var(--bg)", boxShadow: "var(--shadow-card)", overflow: "hidden", flexShrink: 0 }}>
      <Slot id={`${pre}-${r.id}`} label={`photo — ${r.name}`} h={92} />
      <div style={{ padding: "9px 11px 11px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 11.5, color: "var(--muted)", ...TAB }}>
          <Star r={r.rating} /><span>{r.eta} min</span>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-text)", marginTop: 3, ...TAB }}>${r.fee} delivery</div>
      </div>
    </div>
  );
}
function VarA() {
  return (
    <Phone>
      <HomeHead />
      <div style={{ padding: "2px 16px 0" }}><ServiceTiles /></div>
      <div style={{ padding: "10px 16px 0" }}><LiveOrderCard /></div>
      <H t="Order again" />
      <Rail gap={14}>
        {REORDER.map((d) => (
          <div key={d.id} style={{ width: 84, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Slot id={`hxa-d-${d.id}`} label="dish" h={62} w={62} shape="circle" />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{d.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1, ...TAB }}>${d.price}</div>
            </div>
          </div>
        ))}
      </Rail>
      <H t="Restaurants near you" action="See all" />
      <Rail>
        {[OPEN[0], MORE[1], OPEN[1], OPEN[2]].map((r) => <KitchenCard key={r.id} r={r} pre="hxa-r" />)}
      </Rail>
      <div style={{ height: 16 }} />
    </Phone>
  );
}

/* ── 1b · Food-forward storefront — services compress to pills, photos lead ── */
function ServicePills() {
  const pill = (icon, label, soon) => (
    <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--line)", borderRadius: 999, padding: "9px 14px", background: "var(--bg)", opacity: soon ? .55 : 1 }}>
      <Icon name={icon} size={16} color={soon ? "var(--muted)" : "var(--accent-text)"} />
      <span style={{ fontSize: 13, fontWeight: 700, color: soon ? "var(--muted)" : "var(--ink)" }}>{label}</span>
      {soon ? <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--surface)", borderRadius: 999, padding: "1px 6px" }}>Soon</span> : null}
    </span>
  );
  return <div style={{ display: "flex", gap: 8, padding: "2px 16px 0" }}>{pill("package", "Send")}{pill("utensils", "Food")}{pill("plus", "Pharmacy", true)}</div>;
}
function BigCard({ r, pre }) {
  return (
    <div style={{ borderRadius: 16, background: "var(--bg)", boxShadow: "var(--shadow-card)", overflow: "hidden", marginBottom: 12 }}>
      <div style={{ position: "relative" }}>
        <Slot id={`${pre}-${r.id}`} label={`kitchen photo — ${r.name}`} h={148} />
        <span style={{ position: "absolute", right: 10, bottom: 10, background: "var(--bg)", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 800, boxShadow: "var(--shadow-card)", ...TAB }}>{r.eta} min</span>
      </div>
      <div style={{ padding: "10px 13px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
          <Star r={r.rating} n={r.n} />
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, ...TAB }}>{r.kind} · {r.km} km · <span style={{ color: "var(--accent-text)", fontWeight: 700 }}>${r.fee} delivery</span></div>
      </div>
    </div>
  );
}
function VarB() {
  return (
    <Phone>
      <HomeHead />
      <ServicePills />
      <H t="What are you craving?" />
      <Rail gap={14}>
        {CUISINES.map((c, i) => (
          <div key={c} style={{ width: 68, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Slot id={`hxb-c-${i}`} label="food" h={62} w={62} shape="circle" />
            <span style={{ fontSize: 11.5, fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>{c}</span>
          </div>
        ))}
      </Rail>
      <H t="Open now" action="See all" />
      <div style={{ padding: "0 16px" }}>
        {[OPEN[0], MORE[0], OPEN[2]].map((r) => <BigCard key={r.id} r={r} pre="hxb-r" />)}
      </div>
    </Phone>
  );
}

/* ── 1c · ETA-first grid — dense, honest about speed, closed kitchens sink ── */
function GridCard({ r, pre }) {
  const closed = !r.open;
  return (
    <div style={{ borderRadius: 14, background: "var(--bg)", boxShadow: "var(--shadow-card)", overflow: "hidden", opacity: closed ? .6 : 1 }}>
      <div style={{ position: "relative" }}>
        <Slot id={`${pre}-${r.id}`} label={`photo — ${r.name}`} h={96} />
        {closed ? <span style={{ position: "absolute", right: 8, top: 8, fontSize: 10.5, fontWeight: 700, color: "var(--ink)", background: "var(--bg)", borderRadius: 999, padding: "3px 8px", boxShadow: "var(--shadow-card)" }}>{r.note}</span> : null}
      </div>
      <div style={{ padding: "8px 10px 10px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, fontSize: 11, whiteSpace: "nowrap", ...TAB }}>
          {closed
            ? <span style={{ color: "var(--muted)" }}>Closed</span>
            : <React.Fragment><span style={{ fontWeight: 700 }}>{r.eta} min</span><span style={{ color: "var(--muted)" }}>${r.fee}</span></React.Fragment>}
          <span style={{ flex: 1 }} />
          <span style={{ color: "var(--muted)" }}><span style={{ color: "var(--highlight)" }}>★</span>{r.rating}</span>
        </div>
      </div>
    </div>
  );
}
function VarC() {
  const grid = [OPEN[0], MORE[1], OPEN[1], MORE[0], OPEN[2], REST[3]];
  return (
    <Phone>
      <HomeHead />
      <div style={{ padding: "2px 16px 0" }}><ServiceTiles /></div>
      <H t="Fastest to you" sub="Sorted by delivery time — closed kitchens last" action="See all" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px 16px" }}>
        {grid.map((r) => <GridCard key={r.id} r={r} pre="hxc-r" />)}
      </div>
    </Phone>
  );
}

/* ── 2a · Launcher, upgraded — POP: Grab-style green brand header, floating search, bigger photo cards ── */
function GreenHead() {
  const circ = (icon) => (
    <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-700, #009D3B)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={icon} size={17} color="#fff" /></span>
  );
  return (
    <div style={{ background: "var(--accent)", padding: "6px 16px 38px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,.85)", letterSpacing: ".05em" }}>DELIVER TO</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>12 Lanark Rd, Belgravia</span>
            <Icon name="chevron-down" size={15} color="#fff" />
          </div>
        </div>
        {circ("bell")}{circ("user")}
      </div>
    </div>
  );
}
function PopKitchenCard({ r, pre }) {
  return (
    <div style={{ width: 172, borderRadius: 16, background: "var(--bg)", boxShadow: "var(--shadow-card)", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ position: "relative" }}>
        <Slot id={`${pre}-${r.id}`} label={`photo — ${r.name}`} h={104} />
        <span style={{ position: "absolute", right: 8, bottom: 8, background: "var(--bg)", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 800, boxShadow: "var(--shadow-card)", ...TAB }}>{r.eta} min</span>
      </div>
      <div style={{ padding: "9px 12px 12px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 11.5, whiteSpace: "nowrap", ...TAB }}>
          <Star r={r.rating} />
          <span style={{ flex: 1 }} />
          <span style={{ fontWeight: 700, color: "var(--accent-text)" }}>${r.fee} delivery</span>
        </div>
      </div>
    </div>
  );
}
function VarPop() {
  return (
    <Phone dark topBg="var(--accent)">
      <GreenHead />
      <div style={{ margin: "-26px 16px 0", display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: "var(--radius-input)", padding: "12px 13px", boxShadow: "var(--shadow-card)", position: "relative" }}>
        <Icon name="search" size={16} color="var(--muted)" />
        <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Search food, or send a parcel</span>
      </div>
      <div style={{ padding: "14px 16px 0" }}><ServiceTiles /></div>
      <div style={{ padding: "10px 16px 0" }}><LiveOrderCard /></div>
      <H t="Order again" />
      <Rail gap={14}>
        {REORDER.map((d) => (
          <div key={d.id} style={{ width: 86, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ padding: 3, borderRadius: "50%", border: "2px solid var(--accent)", display: "inline-flex" }}>
              <Slot id={`hxp-d-${d.id}`} label="dish" h={58} w={58} shape="circle" />
            </span>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{d.name}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-text)", marginTop: 1, ...TAB }}>${d.price}</div>
            </div>
          </div>
        ))}
      </Rail>
      <H t="Restaurants near you" action="See all →" />
      <Rail>
        {[OPEN[0], MORE[1], OPEN[1], OPEN[2]].map((r) => <PopKitchenCard key={r.id} r={r} pre="hxp-r" />)}
      </Rail>
      <div style={{ height: 16 }} />
    </Phone>
  );
}

/* ── 3a · 2a + localized intelligence (DoorDash daypart ranking, Uber Lite tap-over-type + data saver, ZW reality) ── */
const CHIPS = ["Half roast huku", "sadza & stew", "Mazoe crush"];
function ZWKitchenCard({ r, pre, power, noPhoto, neu }) {
  return (
    <div style={{ width: 172, borderRadius: 16, background: "var(--bg)", boxShadow: "var(--shadow-card)", overflow: "hidden", flexShrink: 0, opacity: power ? .65 : 1 }}>
      <div style={{ position: "relative" }}>
        {noPhoto
          ? <div style={{ height: 104, background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><span style={{ fontSize: 40, fontWeight: 800, color: "var(--accent-text)", opacity: .5 }}>{r.name[0]}</span></div>
          : <Slot id={`${pre}-${r.id}`} label={`photo — ${r.name}`} h={104} />}
        {power
          ? <span style={{ position: "absolute", left: 8, top: 8, background: "var(--bg)", borderRadius: 999, padding: "4px 9px", fontSize: 10.5, fontWeight: 700, color: "var(--danger-ink)", boxShadow: "var(--shadow-card)" }}>Power cut · back ~14:00</span>
          : <span style={{ position: "absolute", right: 8, bottom: 8, background: "var(--bg)", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 800, boxShadow: "var(--shadow-card)", ...TAB }}>{r.eta} min</span>}
        {neu ? <span style={{ position: "absolute", left: 8, top: 8, background: "var(--accent)", color: "#fff", borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, letterSpacing: ".04em" }}>NEW</span> : null}
      </div>
      <div style={{ padding: "9px 12px 11px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 11.5, whiteSpace: "nowrap", ...TAB }}>
          {r.rating === "new" ? <span style={{ fontWeight: 700 }}><span style={{ color: "var(--highlight)" }}>★</span> new</span> : <Star r={r.rating} />}
          <span style={{ flex: 1 }} />
          <span style={{ fontWeight: 700, color: "var(--accent-text)" }}>${r.fee} delivery</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 600, color: "var(--muted)", letterSpacing: ".02em" }}>Cash · EcoCash</div>
      </div>
    </div>
  );
}
function VarZW() {
  return (
    <Phone dark topBg="var(--accent)">
      <GreenHead />
      <div style={{ margin: "-26px 16px 0", display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: "var(--radius-input)", padding: "12px 13px", boxShadow: "var(--shadow-card)", position: "relative" }}>
        <Icon name="search" size={16} color="var(--muted)" />
        <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Search food, or send a parcel</span>
      </div>
      <div style={{ display: "flex", gap: 6, padding: "10px 16px 0", overflow: "hidden" }}>
        {CHIPS.map((c) => (
          <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--surface)", borderRadius: 999, padding: "7px 11px", fontSize: 12, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", flexShrink: 0 }}>
            <Icon name="history" size={12} color="var(--muted)" />{c}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 0" }}>
        <Icon name="wifi-off" size={13} color="var(--muted)" />
        <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: "var(--muted)" }}>Data saver is on — photos load when you tap them</span>
        <span style={{ width: 30, height: 18, borderRadius: 999, background: "var(--accent)", position: "relative", flexShrink: 0 }}><span style={{ position: "absolute", right: 2, top: 2, width: 14, height: 14, borderRadius: "50%", background: "#fff" }} /></span>
      </div>
      <div style={{ padding: "12px 16px 0" }}><ServiceTiles /></div>
      <div style={{ padding: "10px 16px 0" }}><LiveOrderCard /></div>
      <H t="Order again" />
      <Rail gap={14}>
        {REORDER.map((d) => (
          <div key={d.id} style={{ width: 86, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ padding: 3, borderRadius: "50%", border: "2px solid var(--accent)", display: "inline-flex" }}>
              <Slot id={`hxz-d-${d.id}`} label="dish" h={58} w={58} shape="circle" />
            </span>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{d.name}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-text)", marginTop: 1, ...TAB }}>${d.price}</div>
            </div>
          </div>
        ))}
      </Rail>
      <H t="Lunch near you" sub="Re-ranked through the day — supper looks different" action="See all →" />
      <Rail>
        <ZWKitchenCard r={OPEN[0]} pre="hxz-r" />
        <ZWKitchenCard r={REST[3]} pre="hxz-r" power />
        <ZWKitchenCard r={OPEN[1]} pre="hxz-r" noPhoto />
        <ZWKitchenCard r={MORE[1]} pre="hxz-r" />
      </Rail>
      <H t="New this week" sub="Fresh kitchens, seen first" />
      <Rail>
        <ZWKitchenCard r={REST[4]} pre="hxz-n" noPhoto neu />
        <ZWKitchenCard r={MORE[0]} pre="hxz-n" neu />
      </Rail>
      <div style={{ height: 16 }} />
    </Phone>
  );
}

/* ── canvas layout ── */
function Note({ children }) { return <li style={{ marginBottom: 4 }}>{children}</li>; }
function Option({ id, x, y = 190, title, bullets, children }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 380 }} id={id}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16, minHeight: 118 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--ink)", color: "#fff", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{id}</span>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink)" }}>{title}</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12.5, lineHeight: 1.45, color: "var(--muted)" }}>{bullets}</ul>
        </div>
      </div>
      {children}
    </div>
  );
}
function App() {
  return (
    <div style={{ position: "relative", fontFamily: "var(--font-sans)" }}>
      <div style={{ position: "absolute", left: 40, top: 36, width: 900 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)" }}>Customer home — three directions</div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5, maxWidth: 760 }}>
          Root home only (tiles stay the way into Food per D-01, except where noted). Photos are now allowed for Food — lazy-loaded, compressed to ~15–25KB each, with the tinted-initial block as the no-photo fallback. No promo banners. Drag real dish/kitchen shots onto any grey slot — they persist. <b style={{ color: "var(--ink)" }}>3a is the lead: 2a plus daypart ranking, tap-over-type, data saver and ZW-only states</b> — earlier rounds sit beside and below for reference.
        </div>
      </div>
      <Option id="3a" x={40} title="2a + localized intelligence" bullets={[
        <Note key="1">Time-of-day home (DoorDash): the rail is “Lunch near you”, re-ranked per daypart — precomputed server-side, so it loads instantly.</Note>,
        <Note key="2">Tap over type (Uber Lite): cached chips under search — your usual order is one tap, works offline.</Note>,
        <Note key="3">Data saver (Uber Lite “maps on request”): photos load on tap; the tinted-initial block is the first-class fallback, not a failure.</Note>,
        <Note key="4">ZW reality: ZESA power-cut status on the card (“back ~14:00”), Cash · EcoCash on every kitchen.</Note>,
        <Note key="5">“New this week” gives small kitchens first exposure — DoorDash saw carousels drive small-merchant discovery.</Note>,
      ]}><VarZW /></Option>
      <Option id="2a" x={520} title="Launcher, upgraded — pop" bullets={[
        <Note key="1">Grab-style green brand header with the search bar floating over the seam — the one big colour moment, still solid fills.</Note>,
        <Note key="2">Photo cards grow (172px, ETA pill on the photo); reorder dishes get an accent ring and green price.</Note>,
        <Note key="3">Same modules as 1a — D-01 untouched, nothing moved, just louder.</Note>,
      ]}><VarPop /></Option>
      <Option id="1a" x={40} y={2150} title="Launcher, upgraded" bullets={[
        <Note key="1">Safest: D-01 untouched — tiles, then live order, reorder, kitchen rail.</Note>,
        <Note key="2">“Order again” is the highest-converting module Uber Eats runs — one tap to a filled cart.</Note>,
        <Note key="3">Food shows above the fold without claiming the whole home.</Note>,
      ]}><VarA /></Option>
      <Option id="1b" x={520} y={2150} title="Food-forward storefront" bullets={[
        <Note key="1">Glovo-style: services compress to pills, photos lead the page.</Note>,
        <Note key="2">Cuisine circles give browsers a way in when they don’t know the kitchen yet.</Note>,
        <Note key="3">Bends D-01 — Food dominates; right only if Food becomes the main event.</Note>,
      ]}><VarB /></Option>
      <Option id="1c" x={1000} y={2150} title="ETA-first grid" bullets={[
        <Note key="1">DoorDash density: 6 kitchens in one screen, ETA is the biggest number.</Note>,
        <Note key="2">Speed-led sort is the honest brag vs. Sadieexpress — we show the minutes.</Note>,
        <Note key="3">Closed kitchens stay visible but sink, with their opening time.</Note>,
      ]}><VarC /></Option>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
