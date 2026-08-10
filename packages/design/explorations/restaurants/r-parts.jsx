/* LyniaGo — Restaurants vertical: shared parts + fixture data for the static screen gallery.
   Registers window.RParts. Everything composes the real design-system bundle; nothing here is
   interactive (the gallery is a frozen-state mockup set). */

const DSR = window.LyniaDesignSystem_94c56a;
const { Button, Card, Field, StatusPill, EmptyState, Heading, Sub, Label, Skeleton, SkeletonList, Icon, OfflineBanner } = DSR;
const SUPR = window.LyniaSupport;
const { Dove, Wordmark } = SUPR;

const nop = () => {};
const TAB = { fontVariantNumeric: "tabular-nums" };

/* ── fixtures ─────────────────────────────────────────────────────────── */
const REST = [
  { id: "sadza", name: "Sadza Republic", kind: "Zimbabwean · Grills", km: "1.2", eta: "25–35", fee: "1.50", open: true, rating: "4.7", n: 210 },
  { id: "huku", name: "Huku House", kind: "Chicken · Chips", km: "2.4", eta: "30–40", fee: "2.00", open: true, rating: "4.5", n: 96 },
  { id: "msasa", name: "Café Msasa", kind: "Breakfast · Coffee", km: "3.1", eta: "35–45", fee: "2.50", open: true, rating: "4.8", n: 44 },
  { id: "kombi", name: "Kombi Grill", kind: "Braai · Takeaway", km: "4.0", eta: "40–50", fee: "3.00", open: false, rating: "4.4", n: 158, note: "Opens 11:00" },
  { id: "mbuya", name: "Mbuya's Kitchen", kind: "Home cooking", km: "5.2", eta: "45–55", fee: "3.50", open: false, rating: "new", n: 0, note: "Opens tomorrow 09:00", photo: false },
];
const MENU = [
  { id: "m1", name: "Sadza & beef stew", desc: "Sadza, slow-cooked beef, muriwo", price: "4.50" },
  { id: "m2", name: "Half roast huku", desc: "Half chicken, chips, house peri", price: "6.00" },
  { id: "m3", name: "Mazondo", desc: "Trotters in a rich gravy, sadza", price: "4.00", oos: true },
  { id: "m4", name: "Muriwo une dovi", desc: "Greens in peanut butter", price: "2.50", photo: false },
  { id: "m5", name: "Rice & chicken stew", desc: "Long-grain rice, chicken pieces", price: "5.00" },
  { id: "m6", name: "Mazoe orange crush 500ml", desc: "Chilled", price: "1.50" },
];
const CART = [
  { name: "Half roast huku", qty: 1, price: "6.00", note: "Leg portion please, not breast. No chilli." },
  { name: "Sadza & beef stew", qty: 1, price: "4.50" },
  { name: "Muriwo une dovi", qty: 1, price: "2.50" },
];
// One note for the whole order, separate from the per-dish notes above.
const ORDER_NOTE = "Pack the sadza separately from the stew.";
const ORDER = {
  id: "LG-4471", rest: "Sadza Republic", goods: "13.00", fee: "2.50", total: "15.50",
  km: "3.1", customer: "Rufaro C.", area: "Belgravia", addr: "12 Lanark Rd, Belgravia",
  phone: "+263 7• ••• ••90", rider: "Tendai M.", code: "418 302", prep: 20,
};
const QUEUE = [
  { id: "LG-4471", name: "Rufaro C.", area: "Belgravia", items: 3, pay: "CASH", total: "15.50", ago: "just now" },
  { id: "LG-4470", name: "Tapiwa K.", area: "Avenues", items: 1, pay: "WALLET", total: "6.00", ago: "4 min" },
  { id: "LG-4469", name: "Nyasha D.", area: "Milton Park", items: 2, pay: "CASH", total: "11.00", ago: "9 min" },
];
const SHOP = {
  name: "Sadza Republic", tagline: "Home-style sadza and slow-cooked stews, cnr Fife Ave & 5th St.",
  tags: ["Zimbabwean", "Grills", "Sadza"], price: "$$",
};
const RAILS = [
  { id: "ecocash", name: "EcoCash", logo: "../../assets/brand/rails/ecocash.png", w: 48, h: 28 },
  { id: "innbucks", name: "InnBucks", logo: "../../assets/brand/rails/innbucks.png", w: 52, h: 28, tile: "#13294B" },
  { id: "omari", name: "O'mari", logo: "../../assets/brand/rails/omari.png", w: 48, h: 30 },
];

/* ── atoms ────────────────────────────────────────────────────────────── */
function Money({ v, size = 14, weight = 700, color = "var(--ink)", style }) {
  return DSR.Money ? <DSR.Money v={v} size={size} weight={weight} color={color} style={style} /> : <span style={{ fontSize: size, fontWeight: weight, color, ...TAB, ...style }}>${v}</span>;
}
const Pad = ({ children, style }) => <div style={{ padding: "var(--space-screen)", boxSizing: "border-box", ...style }}>{children}</div>;

/* Phone status bar — the app draws under it; kept neutral so screens read as real captures. */
function StatusBar({ dark }) {
  if (DSR.StatusBar) return <DSR.StatusBar dark={dark} />;
  const c = dark ? "rgba(255,255,255,.9)" : "var(--ink)";
  return (
    <div style={{ display: "flex", alignItems: "center", height: 26, padding: "0 14px 0 16px", fontSize: 10.5, fontWeight: 700, color: c, ...TAB }}>
      09:41<span style={{ flex: 1 }} /><span style={{ opacity: .75 }}>3G</span><span style={{ marginLeft: 6, opacity: .75 }}>84%</span>
    </div>
  );
}

/* App bar — DS AppBar is the source of truth; local render is the stale-bundle fallback. */
function AppBar({ title, sub, back = true, right, onWhite = true }) {
  if (DSR.AppBar) return <DSR.AppBar title={title} sub={sub} back={back} right={right} transparent={!onWhite} />;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 10px", background: onWhite ? "var(--bg)" : "transparent" }}>
      {back ? <Icon name="chevron-right" size={20} color="var(--ink)" style={{ transform: "rotate(180deg)", flexShrink: 0 }} /> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {sub ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}

/* Bottom tab bar — the app root, NOT the product switcher. Services live on Home as tiles, so a
   new vertical adds a tile, never a tab. DS TabBar is the source of truth. */
function TabBar({ active = "home", neu = false }) {
  if (DSR.TabBar) return <DSR.TabBar active={active} dot={neu ? "home" : undefined} />;
  const tabs = [{ id: "home", icon: "store", label: "Home" }, { id: "orders", icon: "receipt", label: "Orders" }, { id: "acct", icon: "user", label: "Account" }];
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", background: "var(--bg)", borderTop: "1px solid var(--line)", paddingBottom: 4, zIndex: 20 }}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <div key={t.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 0 6px" }}>
            <Icon name={t.icon} size={21} color={on ? "var(--accent-text)" : "var(--muted)"} />
            <span style={{ fontSize: 11.5, fontWeight: on ? 700 : 600, color: on ? "var(--accent-text)" : "var(--muted)" }}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* Screen scaffold — DS AppScreen is the source of truth (status bar → banner → scrolling body →
   sticky footer → tab bar, with the tab-bar height reserved). */
function Screen({ children, footer, tab, tabNeu, banner, bg = "var(--bg)", dark, pad = true }) {
  if (DSR.AppScreen) return <DSR.AppScreen footer={footer} tab={tab} tabDot={tabNeu ? "home" : undefined} banner={banner} bg={bg} dark={dark}>{children}</DSR.AppScreen>;
  return (
    <div style={{ position: "relative", height: "100%", background: bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <StatusBar dark={dark} />
      {banner}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: tab ? 58 : 0 }}>{children}</div>
      {footer ? <div style={{ padding: "8px 16px 12px", background: "var(--bg)", borderTop: "1px solid var(--line)", marginBottom: tab ? 58 : 0 }}>{footer}</div> : null}
      {tab ? <TabBar active={tab} neu={tabNeu} /> : null}
    </div>
  );
}

/* Service tiles — the superapp launcher. Round icon tiles in a 4-up grid: adding Pharmacies (or
   anything after it) is one more tile, never a navigation change. */
const SERVICES = [
  { id: "express", icon: "package", label: "Send", sub: "Parcel", bg: "var(--accent)" },
  { id: "food", icon: "utensils", label: "Food", sub: "Restaurants", bg: "var(--accent)" },
  { id: "pharm", icon: "plus", label: "Pharmacy", sub: "Soon", bg: "var(--line)", soon: true },
];
function ServiceTiles({ neu, dim }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, opacity: dim ? .5 : 1 }}>
      {SERVICES.map((s) => (
        <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: "4px 0", position: "relative" }}>
          <span style={{ width: 62, height: 62, borderRadius: 20, background: s.bg, display: "grid", placeItems: "center", boxShadow: s.soon ? "none" : "0 4px 12px rgba(0,129,47,.22)" }}>
            <Icon name={s.icon} size={27} color={s.soon ? "var(--muted)" : "#fff"} />
          </span>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: s.soon ? "var(--muted)" : "var(--ink)" }}>{s.label}</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{s.sub}</span>
          </span>
          {neu && s.id === "food" ? (
            <span style={{ position: "absolute", top: -2, right: 14, fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: "#fff", background: "var(--danger)", borderRadius: 999, padding: "2px 7px" }}>NEW</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* Home header — address + search, the two things every superapp home opens with. */
function HomeHead({ dark }) {
  return (
    <div style={{ padding: "4px 16px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em" }}>DELIVER TO</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>12 Lanark Rd, Belgravia</span>
            <Icon name="chevron-down" size={15} color="var(--muted)" />
          </div>
        </div>
        <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center" }}><Icon name="bell" size={17} color="var(--ink)" /></span>
        <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center" }}><Icon name="user" size={17} color="var(--ink)" /></span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "10px 12px" }}>
        <Icon name="search" size={16} color="var(--muted)" />
        <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Search food, or send a parcel</span>
      </div>
    </div>
  );
}

/* Strip banner — the one-line interrupt above content. tone: info | warn | danger | offline | good */
function Banner({ tone = "info", icon, title, msg, action }) {
  const map = {
    info: ["var(--accent-wash)", "var(--accent-text)"],
    good: ["var(--accent-wash)", "var(--accent-text)"],
    warn: ["var(--highlight-wash)", "var(--highlight-ink)"],
    danger: ["var(--danger-wash)", "var(--danger-ink)"],
    offline: ["var(--surface)", "var(--muted)"],
  };
  const [bg, fg] = map[tone] || map.info;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", background: bg }}>
      {icon ? <Icon name={icon} size={16} color={fg} style={{ flexShrink: 0 }} /> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: fg }}>{title}</div>
        {msg ? <div style={{ fontSize: 12, color: fg, opacity: .85, lineHeight: 1.35 }}>{msg}</div> : null}
      </div>
      {action ? <span style={{ fontSize: 12.5, fontWeight: 700, color: fg, textDecoration: "underline", flexShrink: 0 }}>{action}</span> : null}
    </div>
  );
}

/* Food thumbnail. Photos are an UPGRADE, never a dependency — most Harare merchants ship without
   one, so the photoless block is the default: category tint + the dish initial, set large. */
const CAT = { mains: ["var(--accent-wash)", "var(--accent-text)"], sides: ["var(--surface)", "var(--muted)"], drinks: ["var(--highlight-wash)", "var(--highlight-ink)"] };
function FoodThumb({ name = "", cat = "mains", size = 72, radius = 12, photo = false, label = "photo", style }) {
  const [bg, fg] = CAT[cat] || CAT.mains;
  if (photo) {
    return (
      <div style={{ width: size, height: size, borderRadius: radius, background: "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden", ...style }}>
        <span style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "ui-monospace, monospace", textAlign: "center", lineHeight: 1.3, padding: 2 }}>{label}</span>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: bg, display: "grid", placeItems: "center", flexShrink: 0, position: "relative", overflow: "hidden", ...style }}>
      <span style={{ fontSize: Math.round(size * 0.42), fontWeight: 800, color: fg, opacity: .9, lineHeight: 1 }}>{(name[0] || "•").toUpperCase()}</span>
      <Icon name={cat === "drinks" ? "shopping-bag" : "utensils"} size={13} color={fg} style={{ position: "absolute", right: 5, bottom: 5, opacity: .55 }} />
    </div>
  );
}

/* Restaurant cover — 3:1 strip the merchant uploads; the logo sits over its bottom-left corner.
   Falls back to a tinted band with the shop name when there is no cover yet. */
function CoverPhoto({ height = 96, name = "", photo = true, label = "cover banner · 1200×400", children }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ height, background: photo ? "var(--surface)" : "var(--accent-wash)", display: "grid", placeItems: "center", overflow: "hidden" }}>
        {photo
          ? <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>{label}</span>
          : <span style={{ fontSize: 28, fontWeight: 800, color: "var(--accent-text)", opacity: .45 }}>{name}</span>}
      </div>
      {children}
    </div>
  );
}

/* Round shop logo — sits over the cover, white ring so it reads on any photo. */
function ShopLogo({ size = 54, name = "S", photo = true, style }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: photo ? "var(--surface)" : "var(--accent)", border: "3px solid var(--bg)", display: "grid", placeItems: "center", boxShadow: "var(--shadow-card)", flexShrink: 0, overflow: "hidden", ...style }}>
      {photo
        ? <span style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>logo</span>
        : <span style={{ fontSize: size * 0.42, fontWeight: 800, color: "#fff" }}>{name[0]}</span>}
    </span>
  );
}

/* ETA promise — shown BEFORE payment, as a range, with the honest caveat. */
function EtaLine({ range = "25–40 min", arrive = "10:06–10:21", tone = "var(--accent-wash)", note = "Confirmed the moment the kitchen accepts." }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", background: tone, borderRadius: "var(--radius-input)" }}>
      <Icon name="clock" size={17} color="var(--accent-text)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>Arrives in {range} <span style={{ color: "var(--muted)", fontWeight: 600, ...TAB }}>· {arrive}</span></div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.35 }}>{note}</div>
      </div>
    </div>
  );
}

/* Pickup code — proves the rider at the counter is the assigned one (mirror of the delivery code). */
function PickupCode({ code = "7241", tone = "phone" }) {
  const big = tone === "tablet";
  if (big) {
    return (
      <div style={{ padding: "12px 14px", border: "1.5px solid var(--accent)", borderRadius: 12, background: "var(--accent-wash)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--accent-text)", letterSpacing: ".04em" }}>PICKUP CODE</span>
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: ".1em", lineHeight: 1, ...TAB }}>{code}</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.4, marginTop: 6 }}>Ask the rider to read this before you release the food.</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", border: "1.5px solid var(--accent)", borderRadius: 12, background: "var(--accent-wash)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-text)", letterSpacing: ".04em" }}>PICKUP CODE</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.35 }}>Read it to the cashier at the counter.</div>
      </div>
      <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: ".12em", ...TAB }}>{code}</span>
    </div>
  );
}

/* Payment-method tag — the single most important token on a rider/merchant card. */
function PayTag({ pay, size = "md" }) {
  const cash = pay === "CASH";
  const big = size === "lg";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8,
      padding: big ? "6px 12px" : "4px 9px", fontSize: big ? 15 : 12, fontWeight: 800, letterSpacing: ".04em",
      background: cash ? "var(--highlight-wash)" : "var(--accent-wash)",
      color: cash ? "var(--highlight-ink)" : "var(--accent-text)",
      border: `1px solid ${cash ? "var(--highlight-border)" : "#bfe7cf"}`,
    }}>
      <Icon name={cash ? "banknote" : "wallet"} size={big ? 18 : 13} color={cash ? "var(--highlight-ink)" : "var(--accent-text)"} />{pay}
    </span>
  );
}

/* Price math block — goods + per-km fee, shown honestly. */
function PriceMath({ goods, fee, km, total, note }) {
  const row = (l, v, sub) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, color: "var(--muted)" }}>{l}</div>
        {sub ? <div style={{ fontSize: 12, color: "var(--muted)", opacity: .85 }}>{sub}</div> : null}
      </div>
      <Money v={v} size={14} weight={600} color="var(--ink)" />
    </div>
  );
  return (
    <div>
      {row("Food", goods)}
      {row("Delivery", fee, `${km} km · $0.80/km, rounded to $0.50`)}
      <div style={{ height: 1, background: "var(--line)", margin: "6px 0" }} />
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1, fontSize: 14.5, fontWeight: 700 }}>Total</div>
        <Money v={total} size={19} />
      </div>
      {note ? <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 7, lineHeight: 1.4 }}>{note}</div> : null}
    </div>
  );
}

/* Photo drop-slot — ids shared with the home rail (`hxp-r-*`), so one dropped photo fills every surface. */
function PhotoSlot({ id, label, h, w = "100%", shape = "rect", style }) {
  return (
    <div style={{ position: "relative", width: w, height: h, background: "var(--surface)", overflow: "hidden", flexShrink: 0, borderRadius: shape === "circle" ? "50%" : 0, ...style }}>
      <image-slot id={id} shape={shape} placeholder={label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}></image-slot>
    </div>
  );
}

/* Restaurant list row — photo-led per RESTAURANTS-UX-REVIEW: 96px thumb rows, `hero` = 16:9 card
   for the top of the list. Photoless merchants keep the tinted-initial block — photos are an
   upgrade, never a dependency. */
function RestRow({ r, closingSoon, hero }) {
  const closed = !r.open;
  const badges = [
    closed ? <span key="c" style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", background: "var(--surface)", borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>Closed</span> : null,
    closingSoon ? <span key="s" style={{ fontSize: 11, fontWeight: 700, color: "var(--highlight-ink)", background: "var(--highlight-wash)", borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>Closes 21:00</span> : null,
  ];
  const meta = (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 6, fontSize: 12.5, color: "var(--muted)", ...TAB }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--ink)", fontWeight: 700 }}>
        <span style={{ color: "var(--highlight)" }}>★</span>{r.rating}{r.n ? <span style={{ color: "var(--muted)", fontWeight: 400 }}>({r.n})</span> : null}
      </span>
      <span>{r.km} km</span>
      <span style={{ fontWeight: closed ? 400 : 700, color: closed ? "var(--muted)" : "var(--ink)" }}>{closed ? r.note : `${r.eta} min`}</span>
    </div>
  );
  const fee = !closed ? <div style={{ fontSize: 12.5, color: "var(--accent-text)", fontWeight: 700, marginTop: 3, ...TAB }}>${r.fee} delivery</div> : null;
  const photo = (h, w, radius) => r.photo !== false
    ? <PhotoSlot id={`hxp-r-${r.id}`} label={`photo — ${r.name}`} h={h} w={w} style={{ borderRadius: radius }} />
    : <FoodThumb name={r.name} cat={closed ? "sides" : "mains"} size={typeof w === "number" ? w : 96} radius={radius} photo={false} style={typeof w !== "number" ? { width: "100%", height: h } : { height: h }} />;
  if (hero) {
    return (
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 10, opacity: closed ? .72 : 1 }}>
        <div style={{ position: "relative" }}>
          {photo(130, "100%", 0)}
          {!closed ? <span style={{ position: "absolute", right: 10, bottom: 10, background: "var(--bg)", borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 800, boxShadow: "var(--shadow-card)", ...TAB }}>{r.eta} min</span> : null}
        </div>
        <div style={{ padding: "10px 13px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>{badges}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{r.kind}</div>
          {meta}{fee}
        </div>
      </Card>
    );
  }
  return (
    <Card style={{ padding: 12, marginBottom: 10, opacity: closed ? .72 : 1 }}>
      <div style={{ display: "flex", gap: 12 }}>
        {photo(96, 96, 14)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>{badges}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{r.kind}</div>
          {meta}{fee}
        </div>
      </div>
    </Card>
  );
}

/* Menu row — out-of-stock stays visible but disabled (never hidden). 44px add target. */
function MenuRow({ i, qty, cat = "mains" }) {
  const oos = i.oos;
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)", opacity: oos ? .55 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>{i.name}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.35 }}>{i.desc}</div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <Money v={i.price} size={14} />
          {oos ? <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", background: "var(--surface)", borderRadius: 999, padding: "3px 9px" }}>Out of stock today</span> : null}
        </div>
      </div>
      <div style={{ position: "relative", flexShrink: 0, paddingBottom: 8, paddingRight: 4 }}>
        <FoodThumb name={i.name} cat={cat} size={68} photo={i.photo !== false} label="dish photo" />
        {!oos ? (
          <span style={{ position: "absolute", right: -4, bottom: -2, minWidth: 44, height: 44, borderRadius: 22, background: qty ? "var(--cta-fill)" : "var(--bg)", border: qty ? "none" : "1px solid var(--line)", display: "grid", placeItems: "center", boxShadow: "var(--shadow-card)" }}>
            {qty ? <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", ...TAB }}>{qty}</span> : <Icon name="plus" size={19} color="var(--accent-text)" />}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* Order tracker — the shared 7-step timeline (DS Stepper) with this vertical's step copy. The local
   render is the fallback for a bundle compiled before Stepper gained the plain API. */
const R_STEPS = DSR.RESTAURANT_STEPS || ["Order placed", "Restaurant accepted", "Rider secured", "Rider at restaurant", "Picked up", "On the way", "Delivered"];
function RTracker({ step, times = {}, failAt }) {
  if (DSR.RESTAURANT_STEPS && DSR.Stepper) return <DSR.Stepper steps={R_STEPS} step={step} times={times} failAt={failAt} />;
  return (
    <div>
      {R_STEPS.map((label, i) => {
        const done = i < step, now = i === step, failed = failAt === i;
        const on = done || now;
        const ring = failed ? "var(--danger)" : on ? "var(--accent)" : "var(--line)";
        const last = i === R_STEPS.length - 1;
        return (
          <div key={label} style={{ display: "flex" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 26 }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${ring}`, background: failed ? "var(--danger)" : done ? "var(--accent)" : "var(--bg)", display: "grid", placeItems: "center", boxSizing: "border-box", flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: done || failed ? "#fff" : now ? "var(--accent-text)" : "var(--muted)" }}>{failed ? "!" : done ? "✓" : i + 1}</span>
              </div>
              {!last ? <div style={{ flex: 1, width: 2, minHeight: 14, background: done ? "var(--accent)" : "var(--line)" }} /> : null}
            </div>
            <div style={{ flex: 1, paddingLeft: 8, paddingBottom: last ? 0 : 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: now || done ? 700 : 600, color: failed ? "var(--danger-ink)" : now ? "var(--accent-text)" : done ? "var(--ink)" : "var(--muted)" }}>{label}</div>
              {times[i] ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, ...TAB }}>{times[i]}{now ? " · live" : ""}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Rider marker on the customer's tracking card — plate number is the largest thing, because that is
   how a person finds a bike in a car park. */
function RiderCard({ eta = "6 min", meta = "Cash at the door · $15.50", plate = "AEE 4471" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="user" size={20} color="var(--muted)" /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>Tendai M. · {eta}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: ".06em", background: "var(--ink)", color: "#fff", borderRadius: 6, padding: "2px 8px", ...TAB }}>{plate}</span>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>red Honda</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, ...TAB }}>{meta}</div>
      </div>
      <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="phone" size={18} color="#fff" /></span>
    </div>
  );
}

/* Safety / help row — the Express trust surface, reused verbatim on food deliveries. */
function SafetyRow() {
  const cell = (icon, label, danger) => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minHeight: 44, justifyContent: "center", padding: "6px 0", borderRadius: 10, background: danger ? "var(--danger-wash)" : "var(--surface)" }}>
      <Icon name={icon} size={17} color={danger ? "var(--danger-ink)" : "var(--accent-text)"} />
      <span style={{ fontSize: 12, fontWeight: 700, color: danger ? "var(--danger-ink)" : "var(--ink)" }}>{label}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {cell("circle-alert", "Get help")}{cell("map-pin", "Share trip")}{cell("triangle-alert", "SOS", true)}
    </div>
  );
}

/* Countdown bar — a depleting bar reads faster than a number in traffic. */
function TimerBar({ value, total, tone = "#fff", track = "rgba(255,255,255,.35)" }) {
  return (
    <div style={{ height: 5, borderRadius: 3, background: track, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, (value / total) * 100))}%`, height: "100%", background: tone, borderRadius: 3 }} />
    </div>
  );
}

/* Countdown ring — prep time / payment window / offer timer. */
function Ring({ value, total, label, sub, size = 116, tone = "var(--accent)" }) {
  const r = (size - 12) / 2, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(1, value / total));
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size > 100 ? 26 : 20, fontWeight: 800, color: "var(--ink)", ...TAB }}>{label}</span>
        {sub ? <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{sub}</span> : null}
      </div>
    </div>
  );
}

/* Payment-rail row (EcoCash / InnBucks / O'mari) */
function RailRow({ rail, selected, note }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: "var(--radius-input)", border: `1.5px solid ${selected ? "var(--accent)" : "var(--line)"}`, background: selected ? "var(--accent-wash)" : "var(--bg)", marginBottom: 8 }}>
      <span style={{ width: 56, height: 34, borderRadius: 8, background: rail.tile || "var(--bg)", border: rail.tile ? "none" : "1px solid var(--line)", display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" }}>
        <img src={rail.logo} alt={rail.name} width={rail.w} height={rail.h} style={{ objectFit: "contain" }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{rail.name}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{note || "Pay the restaurant directly"}</div>
      </div>
      <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${selected ? "var(--accent)" : "var(--line)"}`, background: selected ? "var(--accent)" : "var(--bg)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        {selected ? <Icon name="check" size={12} color="#fff" /> : null}
      </span>
    </div>
  );
}

/* Delivery code card — the Express hand-off moment, unchanged in this vertical. */
function CodeCard({ code, hint = "Read this to the rider at the door — never before." }) {
  return (
    <Card accent style={{ padding: 14, textAlign: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-text)", letterSpacing: ".05em" }}>DELIVERY CODE</div>
      <div style={{ fontSize: 34, fontWeight: 800, color: "var(--ink)", letterSpacing: ".1em", margin: "4px 0 2px", ...TAB }}>{code}</div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>{hint}</div>
    </Card>
  );
}

/* ── real Harare geography (Leaflet + OSM) ────────────────────────────────
   Corridor: Avenues (restaurant) → Belgravia (customer). Waypoints follow real streets. */
const GEO = {
  rest: [-17.8206, 31.0468],   // cnr Fife Ave & 5th St, Avenues
  cust: [-17.8064, 31.0389],   // Lanark Rd, Belgravia
  route: [[-17.8206, 31.0468], [-17.8168, 31.0459], [-17.8131, 31.0450], [-17.8104, 31.0432], [-17.8085, 31.0412], [-17.8064, 31.0389]],
};
let mapSeq = 0;
function HarareMap({ height = 200, phase = "toCustomer", fill = false, paused = false, dim = false }) {
  const ref = React.useRef(null);
  const [near, setNear] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (!("IntersectionObserver" in window)) { setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  React.useEffect(() => {
    if (!near || !ref.current || !window.L) return;
    const L = window.L;
    const map = L.map(ref.current, {
      zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19, crossOrigin: "anonymous" }).addTo(map);
    const line = L.polyline(GEO.route, { color: "#00B14F", weight: 5, opacity: paused ? .35 : .95, lineCap: "round" }).addTo(map);
    const pin = (cls, color, glyph) => L.divIcon({
      className: "", iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(20,24,27,.35);color:#fff;font:700 11px/1 Inter,sans-serif">${glyph}</span>`,
    });
    L.marker(GEO.rest, { icon: pin("r", "#14181B", "R") }).addTo(map);
    L.marker(GEO.cust, { icon: pin("c", "#00B14F", "•") }).addTo(map);
    const t = phase === "toRestaurant" ? 0.15 : phase === "atRestaurant" ? 0.02 : phase === "return" ? 0.55 : 0.62;
    const idx = Math.min(GEO.route.length - 2, Math.floor(t * (GEO.route.length - 1)));
    const f = t * (GEO.route.length - 1) - idx;
    const rp = [GEO.route[idx][0] + (GEO.route[idx + 1][0] - GEO.route[idx][0]) * f, GEO.route[idx][1] + (GEO.route[idx + 1][1] - GEO.route[idx][1]) * f];
    L.marker(rp, {
      icon: L.divIcon({
        className: "", iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#fff;border:2px solid #00B14F;box-shadow:0 2px 8px rgba(20,24,27,.3)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006630" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg></span>`,
      }),
    }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [26, 26] });
    const id = ++mapSeq;
    setTimeout(() => map.invalidateSize(), 60 + (id % 5) * 40);
    return () => map.remove();
  }, [near, phase, paused]);
  return (
    <div style={{ position: "relative", height: fill ? "100%" : height, background: "var(--surface)" }}>
      <div ref={ref} style={{ position: "absolute", inset: 0, filter: `saturate(.4) brightness(1.05)${dim || paused ? " grayscale(.7) opacity(.75)" : ""}` }} />
      {paused ? (
        <div style={{ position: "absolute", left: 10, top: 10, display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", borderRadius: 999, padding: "6px 12px", boxShadow: "var(--shadow-card)", fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>
          <Icon name="wifi-off" size={13} color="var(--muted)" />Live paused — reconnecting…
        </div>
      ) : null}
    </div>
  );
}

/* ── merchant tablet chrome ───────────────────────────────────────────── */
function KitchenBar({ open = true, orders = 3, offline = false, muted = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, height: 56, padding: "0 20px", background: "var(--bg)", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Dove size={24} on="white" /><Wordmark size={17} /></span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>Sadza Republic · Fife Ave</span>
      <span style={{ flex: 1 }} />
      {offline ? null : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", background: "var(--accent-wash)", borderRadius: 999, padding: "5px 12px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} />Connected
        </span>
      )}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: open ? "var(--accent-text)" : "var(--muted)", border: "1px solid var(--line)", borderRadius: 999, padding: "5px 12px" }}>
        <Icon name="power" size={14} color={open ? "var(--accent-text)" : "var(--muted)"} />{open ? "Open for orders" : "Closed"}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 999, padding: "5px 12px" }}>
        <Icon name={muted ? "ban" : "volume-2"} size={14} color={muted ? "var(--danger-ink)" : "var(--accent-text)"} />{muted ? "Alarm muted" : "Alarm on"}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}><Icon name="inbox" size={15} color="var(--muted)" />{orders} live</span>
    </div>
  );
}
/* Merchant left nav — tablet-first; collapses to a bottom bar on phone (noted, not drawn here). */
function KitchenNav({ active = "queue" }) {
  const items = [["queue", "inbox", "Orders"], ["catalog", "utensils", "Menu"], ["shop", "store", "Shop"], ["hours", "clock", "Hours"], ["money", "receipt", "Statement"], ["help", "circle-alert", "Help"]];
  return (
    <div style={{ width: 92, borderRight: "1px solid var(--line)", background: "var(--bg)", padding: "10px 0", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
      {items.map(([id, icon, label]) => {
        const on = id === active;
        return (
          <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 0", background: on ? "var(--accent-wash)" : "transparent", borderLeft: `3px solid ${on ? "var(--accent)" : "transparent"}` }}>
            <Icon name={icon} size={19} color={on ? "var(--accent-text)" : "var(--muted)"} />
            <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 600, color: on ? "var(--accent-text)" : "var(--muted)" }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
function Kitchen({ children, nav = "queue", bar = {}, chrome = true }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface)", overflow: "hidden" }}>
      {chrome ? <KitchenBar {...bar} /> : null}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {chrome ? <KitchenNav active={nav} /> : null}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );
}

window.RParts = {
  DSR, Button, Card, Field, StatusPill, EmptyState, Heading, Sub, Label, Skeleton, SkeletonList, Icon, OfflineBanner,
  Dove, Wordmark, nop, TAB, REST, MENU, CART, ORDER_NOTE, ORDER, QUEUE, RAILS, GEO, SHOP,
  Money, Pad, StatusBar, AppBar, TabBar, Screen, Banner, PayTag, PriceMath, RestRow, MenuRow, ServiceTiles, HomeHead, SERVICES, PhotoSlot,
  FoodThumb, EtaLine, PickupCode, RiderCard, SafetyRow, TimerBar, CoverPhoto, ShopLogo,
  RTracker, R_STEPS, Ring, RailRow, CodeCard, HarareMap, KitchenBar, KitchenNav, Kitchen,
};
