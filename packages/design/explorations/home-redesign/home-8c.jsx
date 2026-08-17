/* LyniaGo — Customer Home REDESIGN, variant 8c (SELECTED 2026-08-17).
   Lineage 2a → 7a/7b → 8a → 8b → 8c. Registers window.HOME8C.Home8c, which `r-customer-a.jsx`
   renders as RC.home — 8c REPLACES the pre-8c green-header `AppHome` body as THE customer home.

   Pixel reference: handoff/home-8c/home-8c.html (360×720). DS card: ui_kits/mobile/home-8c.html.
   This file is the gallery-renderable transcription of that reference — same element tree, same
   measurements, same copy. Values the token file names are read through var(); the three sticker
   icons are the shipped SVGs at assets/service-icons/ (used verbatim, never redrawn). Every style
   is inline, so the screen renders identically on any page that loads this file with no dependency
   on the handoff HTML's local stylesheet.

   FOUR NAMED MEMBERS — HomeHeader · ServiceTiles · LiveOrderCard · RestaurantCard — because those
   are the four region anchors the structural guardrail keys off (tools/parity/codegen/adopted.mjs
   → RC.home). The app mounts same-named twins in the same order, so composition drift is caught
   statically rather than by eye.

   The status bar is NOT drawn here: the kit's `Screen` puts one above the body, and the screen
   background is --accent-wash so it sits on mint exactly as the reference draws it.

   Hard rules this screen enforces (see the DS card): zero box-shadows anywhere — depth is tint and
   hairline borders; gold only on the unread dot, the SOON chip, the ETA chip and star ratings;
   service labels 12px/400 regular; every number tabular-lining. */
(() => {
const H = (window.HOME8C = window.HOME8C || {});
const P = window.RParts || {};
const Screen = P.Screen || (({ children }) => <div style={{ height: "100%", background: "var(--accent-wash)", overflow: "hidden" }}>{children}</div>);
const Icon = P.Icon || (({ name, size = 16, color = "currentColor" }) => (
  <span style={{ display: "inline-grid", placeItems: "center", flexShrink: 0, width: size, height: size, color }}>
    <i data-lucide={name} />
  </span>
));

/* Sticker service icons — the shipped flat SVGs, referenced as files so the gallery and the app
   consume the exact same artwork. Paths are relative to the gallery HTML that loads this file. */
const ICON_SRC = {
  send: "../../assets/service-icons/send.svg",
  food: "../../assets/service-icons/food.svg",
  pharmacy: "../../assets/service-icons/pharmacy.svg",
};

/* The four venues the reference draws, with the handoff's placeholder photography. Live data
   replaces the names/ratings/ETAs/fees; the CARD is what is being specified here. */
const PHOTO_BASE = "../../handoff/home-8c/assets/food/";
const VENUES = [
  { name: "Golden Bao", rating: "4.9", eta: "25 min", fee: "$1.00", photo: "biryani-1.jpg" },
  { name: "Mbuya's Kitchen", rating: "4.8", eta: "25 min", fee: "$1.00", photo: "rice-1.jpg" },
  { name: "Fresh Press", rating: "4.5", eta: "30 min", fee: "$1.50", photo: "dosa-1.jpg" },
  { name: "Harare Grill Co.", rating: "4.6", eta: "30 min", fee: "$1.50", photo: "burger-1.jpg" },
];

/* One running job. The home draws one pill PER running job, so this is an array on purpose. */
const LIVE = [{ id: "j1", who: "Tendai M.", step: 5, steps: 7, eta: "12" }];

/* Flat sun sticker, 46px — swaps to the moon after 18:00, so the greeting and the sticker always
   agree about the time of day. */
const Sun = () => (
  <svg width="46" viewBox="0 0 64 64" style={{ marginRight: 2 }}>
    <circle cx="32" cy="32" r="13" fill="#f2b705" />
    <circle cx="27" cy="27" r="4.5" fill="#ffd76b" />
    <g stroke="#f2b705" strokeWidth="4.5" strokeLinecap="round">
      <path d="M32 9v6M32 49v6M9 32h6M49 32h6M16 16l4.5 4.5M43.5 43.5 48 48M48 16l-4.5 4.5M20.5 43.5 16 48" />
    </g>
  </svg>
);
const Moon = () => (
  <svg width="46" viewBox="0 0 64 64" style={{ marginRight: 2 }}>
    <path d="M40 12a22 22 0 1 0 14 40A24 24 0 0 1 40 12Z" fill="#f2b705" />
    <circle cx="46" cy="24" r="3.5" fill="#ffd76b" />
  </svg>
);

/* ── 1 · MINT HEADER ──────────────────────────────────────────────────────────────────────────
   Square bottom edge (no radius, no shadow): the mint block and the white body meet on a straight
   seam, which is what lets the tiles sit close underneath instead of a search bar floating over it. */
function HomeHeader({ greeting, name, address, unread, evening }) {
  return (
    <div style={{ background: "var(--accent-wash)", paddingBottom: 24 }}>
      <div style={{ padding: "16px 18px 0", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-.01em" }}>{greeting}, {name}</div>
          {/* The user's CURRENT DETECTED location (reverse-geocoded), not a saved profile address. */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 11, fontSize: 12.5, fontWeight: 600, color: "var(--accent-text)" }}>
            <Icon name="map-pin" size={13} color="var(--accent-text)" />{address}
            <Icon name="chevron-down" size={13} color="var(--accent-text)" />
          </div>
        </div>
        {evening ? <Moon /> : <Sun />}
        {/* 42px white circle. No avatar button — the bell is the only round action in the header. */}
        <span style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--bg)", display: "grid", placeItems: "center", position: "relative" }}>
          <Icon name="bell" size={18} color="var(--accent-text)" />
          {unread ? <span style={{ position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: "50%", background: "var(--highlight)", border: "1.5px solid var(--bg)" }} /> : null}
        </span>
      </div>
      {/* Deliberately quiet: radius 12 (NOT a full pill), muted 12.5px placeholder — it must not
          outweigh the greeting or the tiles. */}
      <div style={{ margin: "16px 18px 0", display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: 12, padding: "10px 15px" }}>
        <Icon name="search" size={16} color="var(--muted)" />
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Search food, or send a parcel</span>
      </div>
    </div>
  );
}

/* ── 2 · SERVICE TILES ────────────────────────────────────────────────────────────────────────
   Chowdeck-scale buttons with the label INSIDE. Three equal columns, so a fourth vertical is a
   grid change, never a navigation change. */
const TILES = [
  { id: "send", label: "Send", src: ICON_SRC.send, w: 50, top: 0, bg: "var(--accent-wash)", blob: "var(--tile-send-blob)" },
  { id: "food", label: "Restaurants", src: ICON_SRC.food, w: 56, top: 4, bg: "var(--tile-food-wash)", blob: "var(--tile-food-blob)" },
  { id: "pharmacy", label: "Pharmacy", src: ICON_SRC.pharmacy, w: 53, top: 3, bg: "var(--tile-pharmacy-wash)", blob: "var(--tile-pharmacy-blob)", soon: true },
];

function ServiceTiles() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, padding: "14px 16px 0" }}>
      {TILES.map((t) => (
        <button
          key={t.id}
          style={{ position: "relative", background: t.bg, border: "none", borderRadius: 16, padding: "10px 4px 9px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", cursor: "pointer", boxShadow: "none" }}
        >
          {/* SOON chip until the vertical launches — the tile itself stays live and opens the
              notify-me sheet, so it is never a dead control. */}
          {t.soon ? (
            <span style={{ position: "absolute", top: 6, right: 6, background: "var(--highlight)", color: "var(--highlight-chip-ink)", fontSize: 8.5, fontWeight: 800, letterSpacing: ".04em", borderRadius: 999, padding: "2px 5px" }}>SOON</span>
          ) : null}
          <span style={{ height: 44, display: "grid", placeItems: "center", position: "relative" }}>
            <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-46%)", width: 42, height: 42, borderRadius: "50%", background: t.blob }} />
            <img src={t.src} alt="" style={{ width: t.w, marginTop: t.top || undefined, position: "relative" }} />
          </span>
          {/* 12px REGULAR — never bold. */}
          <span style={{ fontSize: 12, fontWeight: 400, letterSpacing: ".01em", color: "var(--ink)" }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── 3 · LIVE ORDER TRACKER ───────────────────────────────────────────────────────────────────
   One mint pill per running order; the whole pill is the tap target for the tracker screen.
   Hidden entirely when nothing is running — no empty-state placeholder takes its place. */
function LiveOrderCard({ who, step = 5, steps = 7, eta = "12" }) {
  return (
    <div style={{ margin: "14px 16px 0", background: "var(--accent-wash)", borderRadius: 999, padding: "9px 14px 9px 10px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name="bike" size={17} color="#fff" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{who} · on the way</div>
        <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
          {Array.from({ length: steps }, (_, i) => (
            <i key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < step ? "var(--accent)" : "var(--tile-send-blob)" }} />
          ))}
        </div>
      </div>
      <span style={{ background: "var(--highlight)", color: "var(--highlight-chip-ink)", fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: "4px 9px", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{eta} min</span>
    </div>
  );
}

/* ── 4 · POPULAR NEAR YOU ─────────────────────────────────────────────────────────────────────
   A two-column photo grid (the pre-8c home used a horizontal rail). Cards carry a 1px hairline
   border and NO shadow — including the ETA pill sitting on the photo. */
function RestaurantCard({ v }) {
  return (
    <div style={{ borderRadius: 16, background: "var(--bg)", overflow: "hidden", border: "1px solid var(--line)", boxShadow: "none" }}>
      <div style={{ position: "relative" }}>
        <img src={PHOTO_BASE + v.photo} alt="" style={{ width: "100%", height: 76, objectFit: "cover", display: "block" }} />
        <span style={{ position: "absolute", right: 8, bottom: 8, background: "var(--bg)", border: "1px solid var(--line)", boxShadow: "none", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{v.eta}</span>
      </div>
      <div style={{ padding: "7px 10px 9px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 2, fontSize: 11.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          <span><span style={{ color: "var(--highlight)" }}>★</span> <b>{v.rating}</b></span>
          <span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--accent-text)" }}>{v.fee}</span>
        </div>
      </div>
    </div>
  );
}

/* THE screen. `live: []` renders the no-running-order state — the tracker is absent and NOTHING
   takes its place. Same component either way, so the two states cannot drift apart. */
function Home8c({ live = LIVE, evening = false }) {
  return (
    <Screen tab="home" bg="var(--accent-wash)">
      <HomeHeader greeting={evening ? "Good evening" : "Good morning"} name="Rudo" address="12 Samora Machel Ave" unread evening={evening} />
      {/* White body under the mint block — the screen root is --accent-wash so the status bar sits
          on mint, so everything below the header states its own background. */}
      <div style={{ background: "var(--bg)", paddingBottom: 16 }}>
        <ServiceTiles />
        {live.map((j) => <LiveOrderCard key={j.id} who={j.who} step={j.step} steps={j.steps} eta={j.eta} />)}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", padding: "14px 16px 8px" }}>
            <b style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>Popular near you</b>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)" }}>See all →</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px" }}>
            {VENUES.map((v) => <RestaurantCard key={v.name} v={v} />)}
          </div>
        </div>
      </div>
    </Screen>
  );
}

H.Home8c = Home8c;

})();
