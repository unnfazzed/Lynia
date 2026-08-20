/* file-scoped: Babel classic scripts share one global scope, so every declaration below is
   wrapped in an IIFE — only window.LJ / window.RJ leave this file. Without it, a later-loading
   sibling silently overwrites same-named screens (customer Profile vs rider Profile, etc.). */
(() => {
/* LyniaGo — customer journey flow-map: static screen renderers.
   Every tile is composed from the REAL design-system bundle + kit primitives (frozen state, no
   interactivity) so the map reads at production fidelity. Registers window.LJ (id -> render fn). */

const DS = window.LyniaDesignSystem_94c56a;
const K = window.LyniaKit;
const SUP = window.LyniaSupport;
const { Button, Card, Field, StatusPill, Stepper, EmptyState, Heading, Sub, Label, SkeletonList, Icon, OfflineBanner, BrandHeader, LiveOrderCard, ReorderRail, RestaurantCard } = DS;
const Money = DS.Money || (({ v, size = 14, weight = 700, color = "var(--ink)" }) => <span className="lynia-tabular" style={{ fontSize: size, fontWeight: weight, color }}>${v}</span>);
/* Guard: a bundle compiled before AppHome existed would otherwise throw through React
   reconciliation and unmount the whole page. */
const AppHome = DS.AppHome || (() => <div style={{ padding: 20, fontSize: 12, color: "var(--muted)" }}>Home needs a design-system rebuild (AppHome missing from the bundle).</div>);
const AppScreen = DS.AppScreen || (({ children }) => <div style={{ height: "100%", overflow: "hidden" }}>{children}</div>);
const { Dove, Wordmark, Pad, Top, SystemState } = SUP;

const noop = () => {};
const T0 = "2026-07-04T09:00:00.000Z";
const ev = (...st) => st.map((s) => ({ status: s, createdAt: T0 }));
const PINS = { a: { x: 26, y: 30 }, b: { x: 76, y: 70 } };
const RIDERS = [
  { id: "r1", name: "Tendai M.", rating: "4.8", trips: 132, eta: 6, fare: "2.50" },
  { id: "r2", name: "Kudzai N.", rating: "4.9", trips: 88, eta: 9, fare: "2.20" },
  { id: "r3", name: "Farai R.", rating: "new", trips: 3, eta: 5, fare: "3.00" },
];
const collapseBtn = { display: "flex", alignItems: "center", width: "100%", minHeight: 44, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-sans)" };

function OrderHead({ status, tone }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
      <div style={{ flex: 1 }} />
      <StatusPill status={status} tone={tone} />
    </div>
  );
}
function Lockup() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      <Dove size={40} on="white" /><Wordmark size={24} />
    </div>
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
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }}>
        <Icon name="phone" size={18} color="#fff" />
      </span>
    </div>
  );
}
/* Two stacked address rows (search-first). Pickup = green dot, Drop-off = red square.
   Empty value shows a placeholder; tapping either opens the address search screen. */
function AddressFields({ pickup, drop }) {
  const Row = ({ role, value }) => {
    const color = role === "pickup" ? "var(--accent)" : "var(--danger)";
    const label = role === "pickup" ? "PICKUP" : "DROP-OFF";
    const ph = role === "pickup" ? "Set pickup location" : "Where to?";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 11, minHeight: 48, padding: "6px 12px" }}>
        <span style={{ width: 12, height: 12, borderRadius: role === "pickup" ? "50%" : 3, background: value ? color : "var(--bg)", border: `2px solid ${color}`, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>{label}</div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: value ? "var(--ink)" : "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value || ph}</div>
        </div>
        <Icon name={value ? "pencil" : "search"} size={16} color="var(--muted)" />
      </div>
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

/* Google Maps hand-off row on live tracking — the customer follows the same route the rider
   is navigating (address object carries place_id + lat/lng, so it deep-links into Maps). */
function GMapsRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-input)", border: "1px solid var(--line)", background: "var(--bg)" }}>
      <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "50%", background: "var(--accent-wash)", flexShrink: 0 }}>
        <Icon name="navigation" size={16} color="var(--accent-text)" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Follow route in Google Maps</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Same live route your rider is navigating</div>
      </div>
      <Icon name="arrow-right" size={16} color="var(--muted)" />
    </div>
  );
}

function QtyStepper({ value }) {
  const btn = (dir) => <span style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--accent-text)", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{dir}</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {btn("\u2212")}
      <span style={{ minWidth: 24, textAlign: "center", fontSize: 18, fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
      {btn("+")}
    </div>
  );
}

/* ── HOME — the Food-customer home IS the customer home. When the Restaurants screens are on the
   page (all-screens gallery) we render RC.home itself, so 0·9 and Food 0·1 are the same call, the
   same shell and the same photo slots. The fallback below is the identical screen for pages that
   don't load the Restaurants files (the journey map), where photo slots can't mount. ── */
const LAUNCHER_VENUES = [
  { name: "Sadza Republic", rating: "4.7", ratingCount: 210, eta: "25–35", fee: "1.50" },
  { name: "Huku House", rating: "4.5", ratingCount: 96, eta: "30–40", fee: "2.00" },
  { name: "Café Msasa", rating: "4.8", ratingCount: 44, eta: "35–45", fee: "2.50" },
];
const LAUNCHER_LIVE = [
  { id: "food", title: "Sadza Republic · 6 min away", meta: "Cash at the door · $15.50", step: 4, icon: "utensils" },
  { id: "ride", title: "Parcel to Msasa · rider 4 min away", meta: "Delivery code 4192 · $3.36", step: 5 },
];
function LauncherHome() {
  const foodHome = window.RC && window.RC.home;
  if (foodHome) return foodHome();
  return (
    <AppScreen tab="home" dark bg="var(--accent)">
      <AppHome address="12 Lanark Rd, Belgravia" live={LAUNCHER_LIVE} restaurants={LAUNCHER_VENUES} />
    </AppScreen>
  );
}

/* ── HOME (map-anchored) — param'd across empty / pins / expanded ── */
function Home({ pins, expanded }) {
  const a = pins ? PINS.a : null, b = pins ? PINS.b : null;
  const item = pins ? "Documents envelope" : "";
  const fare = pins ? "3.00" : "";
  const sender = pins ? "+263 77 245 1180" : "";
  const rcpt = pins ? "+263 71 555 0090" : "";
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <K.FauxMap fill pins={{ a, b }} />
      <div style={{ position: "absolute", top: 34, left: 12, right: 12, display: "flex", alignItems: "center", gap: 8, zIndex: 5 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", borderRadius: "var(--radius-pill)", padding: "6px 12px 6px 6px", boxShadow: "var(--shadow-card)", fontWeight: 700, fontSize: 14 }}>
          <Dove size={22} on="white" /><Wordmark size={15} />
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg)", boxShadow: "var(--shadow-card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="user" size={18} color="var(--accent-text)" />
        </span>
      </div>
      {!pins ? (
        <div style={{ position: "absolute", top: 92, left: "50%", transform: "translateX(-50%)", zIndex: 5, background: "var(--ink)", color: "#fff", borderRadius: "var(--radius-pill)", padding: "7px 14px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>Tap the map to drop your pickup pin</div>
      ) : null}
      <span style={{ position: "absolute", top: 78, right: 12, zIndex: 5, display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", borderRadius: "var(--radius-pill)", padding: "9px 14px", boxShadow: "var(--shadow-card)", fontSize: 12, fontWeight: 600, color: "var(--accent-text)" }}>
        <Icon name="navigation" size={14} color="var(--accent-text)" /> Use my location
      </span>
      <K.MapSheet expanded={expanded} onToggle={noop} footer={
        <div>
          {!pins ? <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Add pickup &amp; drop-off pins, an item, a price and both phones to broadcast.</div> : null}
          <Button label="Broadcast request" onClick={noop} disabled={!pins} />
        </div>
      }>
        <AddressFields pickup={pins ? "Eastgate Mall, CBD" : ""} drop={pins ? "14 Glenara Ave, Avenues" : ""} />
        <div style={{ fontSize: "var(--text-label)", fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>What are you sending?</div>
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: "10px 10px 4px", marginBottom: 8 }}>
          <Field value={item} onChange={noop} placeholder="Documents envelope" style={{ marginBottom: 8 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: "var(--text-label)", fontWeight: 600, color: "var(--muted)" }}>Qty</span>
            <QtyStepper value={1} />
          </div>
        </div>
        <div style={{ ...collapseBtn, gap: 6, minHeight: 40, marginBottom: 8, color: "var(--accent-text)" }}>
          <Icon name="package" size={16} color="var(--accent-text)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}>Add another item</span>
        </div>
        <Field label="Note for the rider (optional)" value="" onChange={noop} multiline rows={2} placeholder="Ask for Rita at the pharmacy counter; keep it upright." />
        <Field label="Your price (USD)" value={fare} onChange={noop} inputMode="decimal" hint={pins ? "Suggested $3.36 · 3.1 km · riders here usually accept around $2.96." : "We'll suggest a fair price once your pins are set."} />
        <Field label="Your phone (sender)" value={sender} onChange={noop} inputMode="tel" placeholder="+263 77 000 0000" hint="Shared with your rider only during the delivery." />
        <Field label="Recipient phone" value={rcpt} onChange={noop} inputMode="tel" placeholder="+263 77 000 0000" hint="So the rider can reach them at drop-off." />
        {expanded ? (
          <div>
            <Field label="Pickup landmark" value="Eastgate Mall, CBD" onChange={noop} fromMap />
            <Field label="Drop-off landmark" value="14 Glenara Ave, Avenues" onChange={noop} fromMap />
            <Field label="Declared value (USD, max 150)" value="10" onChange={noop} inputMode="decimal" />
          </div>
        ) : (
          <div style={collapseBtn}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}>Add landmarks &amp; declared value (optional)</span>
            <Icon name="chevron-up" size={16} color="var(--accent-text)" />
          </div>
        )}
      </K.MapSheet>
    </div>
  );
}

/* ── AUCTION ── */
function Auction({ variant }) {
  if (variant === "finding") {
    return (
      <Pad>
        <OrderHead status="open_for_offers" />
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ flex: 1, fontSize: 14, color: "var(--muted)" }}>Finding riders near you…</span>
          <span style={{ fontSize: 14, color: "var(--muted)" }} className="lynia-tabular">1:24</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>Asking $3.00 · riders here usually accept around $2.40.</div>
        <SkeletonList count={2} />
        <Sub>No offers yet — riders nearby have been pinged. Hang tight.</Sub>
        <Button label="Cancel order" variant="ghost" onClick={noop} />
      </Pad>
    );
  }
  if (variant === "race") {
    return (
      <Pad>
        <OrderHead status="open_for_offers" />
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ flex: 1, fontSize: 14, color: "var(--muted)" }}>2 riders bidding</span>
          <span style={{ fontSize: 14, color: "var(--muted)" }} className="lynia-tabular">0:58</span>
        </div>
        <K.SortChips value="best" onChange={noop} />
        <K.OfferCard o={RIDERS[1]} recommended onChoose={noop} />
        <K.OfferCard o={RIDERS[2]} onChoose={noop} />
        <div role="status" style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, marginBottom: 4 }}>That rider was just taken — choose another.</div>
        <Button label="Cancel order" variant="ghost" onClick={noop} />
      </Pad>
    );
  }
  if (variant === "expired") {
    return (
      <Pad>
        <OrderHead status="expired" tone="offline" />
        <EmptyState icon="bike" title="No riders took this price yet" message="Your 90-second window closed with no offer. Nudging the price up usually gets a rider fast.">
          <Button label="Nudge price & re-broadcast" onClick={noop} />
          <Button label="Edit order" variant="ghost" onClick={noop} />
        </EmptyState>
      </Pad>
    );
  }
  if (variant === "noriders") {
    return (
      <Pad>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Send a parcel</Heading></div>
        <EmptyState icon="inbox" title="No riders online right now" message="There are no riders in the CBD corridor at the moment — a higher price won't help until one comes online. Most riders are on 7–9am & 5–7pm.">
          <Button label="Notify me when one's available" onClick={noop} />
          <Button label="Back" variant="ghost" onClick={noop} />
        </EmptyState>
      </Pad>
    );
  }
  // live
  return (
    <Pad>
      <OrderHead status="open_for_offers" />
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ flex: 1, fontSize: 14, color: "var(--muted)" }}>3 riders bidding</span>
        <span style={{ fontSize: 14, color: "var(--muted)" }} className="lynia-tabular">1:02</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>Asking $3.00 · riders here usually accept around $2.40.</div>
      <K.SortChips value="best" onChange={noop} />
      <K.OfferCard o={RIDERS[0]} recommended onChoose={noop} />
      <K.OfferCard o={RIDERS[1]} onChoose={noop} />
      <K.OfferCard o={RIDERS[2]} onChoose={noop} />
    </Pad>
  );
}

/* ── TRACKING ── */
function Tracking({ variant }) {
  if (variant === "code") {
    return (
      <Pad>
        <OrderHead status="assigned" />
        <Card accent>
          <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">Give this code to the recipient — the rider enters it at hand-off:</div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 6, color: "var(--accent-text)" }} className="lynia-tabular">418 207</div>
          <Button label="Re-issue delivery code" variant="ghost" onClick={noop} />
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $2.50 · Tendai M.</div>
          <div style={{ marginBottom: 10 }}><CallRow label="Your rider" name="Tendai M." phone="+263 78 202 1180" /></div>
          <Stepper events={ev("assigned")} currentStatus="assigned" view="customer" />
        </Card>
        <Button label="Cancel order" variant="ghost" onClick={noop} />
      </Pad>
    );
  }
  if (variant === "active" || variant === "paused") {
    const paused = variant === "paused";
    return (
      <Pad>
        <OrderHead status="en_route_dropoff" />
        <Card>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $2.50 · Tendai M.</div>
          <div style={{ marginBottom: 10 }}><CallRow label="Your rider" name="Tendai M." phone="+263 78 202 1180" /></div>
          <K.FauxMap rider riderPos={0.66} paused={paused} pins={PINS} />
          <div style={{ height: 10 }} />
          <GMapsRow />
          <div style={{ height: 12 }} />
          <Stepper events={ev("assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff")} currentStatus="en_route_dropoff" view="customer" />
        </Card>
        {paused ? (
          <Card style={{ background: "var(--surface)", border: "1px solid transparent", boxShadow: "none" }}>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Live position paused — your rider's connection (or yours) dropped. It usually recovers in seconds; if it stays quiet past a couple of minutes we'll let you know, and you can always call your rider.</div>
          </Card>
        ) : null}
      </Pad>
    );
  }
  if (variant === "cancel") {
    return (
      <Pad>
        <OrderHead status="assigned" />
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Cancel this order?</div>
          <Field label="Reason (optional)" value="Sending it another way" onChange={noop} />
          <div style={{ display: "flex", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-input)", background: "var(--surface)", margin: "2px 0 12px" }}>
            <Icon name="triangle-alert" size={15} color="var(--muted)" />
            <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>You can cancel at any point. If your rider has already collected the parcel, they'll be notified and you arrange the hand-back directly with them — at your own risk, off-platform.</span>
          </div>
          <Button label="Confirm cancellation" onClick={noop} />
          <Button label="Keep order" variant="ghost" onClick={noop} />
        </Card>
      </Pad>
    );
  }
  if (variant === "cancelled") {
    return (
      <Pad>
        <OrderHead status="cancelled" tone="offline" />
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Icon name="circle-alert" size={18} color="var(--danger)" />
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)" }}>This order was cancelled.</div>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Reason: Sending it another way</div>
        </Card>
        <Button label="Send a new request" onClick={noop} />
      </Pad>
    );
  }
  if (variant === "rate") {
    return (
      <Pad>
        <OrderHead status="delivered" />
        <Card>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $2.50 · Tendai M.</div>
          <Stepper events={ev("assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered")} currentStatus="delivered" view="customer" />
        </Card>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Rate your rider</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => <span key={n} style={{ fontSize: 30, color: n <= 4 ? "var(--highlight)" : "var(--line)" }}>★</span>)}
          </div>
        </Card>
      </Pad>
    );
  }
  // completed
  return (
    <Pad>
      <OrderHead status="completed" />
      <Card>
        <Stepper events={ev("assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered", "completed")} currentStatus="completed" view="customer" />
      </Card>
      <Card><div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-text)" }}>Delivered &amp; completed. Thank you!</div></Card>
      <Button label="Send another parcel" onClick={noop} />
    </Pad>
  );
}

/* ── ADDRESS ENTRY (search-first, Google-backed) ── */
function AddrSearch() {
  const results = [
    ["14 Glenara Avenue", "Avenues, Harare"],
    ["Glenara Shopping Centre", "Glenara Ave S, Braeside"],
    ["Glen Lorne Shops", "Glen Lorne, Harare"],
  ];
  const saved = [["home", "Home", "4 Northwood Rd, Mount Pleasant"], ["package", "Work", "Eastgate Mall, CBD"]];
  const quick = [["navigation", "Use my current location", "var(--accent-text)"], ["map-pin", "Set the pin on the map", "var(--accent-text)"]];
  const Result = ({ icon, name, sub, bg, ic }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "50%", background: bg || "var(--surface)", flexShrink: 0 }}>
        <Icon name={icon} size={16} color={ic || "var(--muted)"} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
      </div>
    </div>
  );
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ padding: "36px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <Icon name="arrow-left" size={20} color="var(--ink)" />
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Set drop-off</span>
          <div style={{ flex: 1 }} />
          <span style={{ width: 11, height: 11, borderRadius: 3, border: "2px solid var(--danger)", background: "var(--bg)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "0 12px", height: 46, border: "1.5px solid var(--accent)" }}>
          <Icon name="search" size={18} color="var(--muted)" />
          <span style={{ flex: 1, fontSize: 15, color: "var(--ink)", display: "flex", alignItems: "center" }}>14 Glenara<span style={{ display: "inline-block", width: 1.5, height: 18, background: "var(--accent)", marginLeft: 2 }} /></span>
          <Icon name="x" size={16} color="var(--muted)" />
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden", padding: "0 16px" }}>
        {quick.map(([ic, lbl, col]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--accent-wash)", flexShrink: 0 }}><Icon name={ic} size={16} color={col} /></span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--accent-text)" }}>{lbl}</span>
          </div>
        ))}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", margin: "12px 0 2px" }}>SAVED</div>
        {saved.map(([ic, name, sub]) => <Result key={name} icon={ic} name={name} sub={sub} bg="var(--accent-wash)" ic="var(--accent-text)" />)}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", margin: "12px 0 2px" }}>RESULTS</div>
        {results.map(([name, sub]) => <Result key={name} icon="map-pin" name={name} sub={sub} />)}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, padding: "9px 16px", borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--muted)" }}>
        Powered by <span style={{ fontWeight: 700, letterSpacing: "-.01em" }}><span style={{ color: "#4285F4" }}>G</span><span style={{ color: "#EA4335" }}>o</span><span style={{ color: "#FBBC05" }}>o</span><span style={{ color: "#4285F4" }}>g</span><span style={{ color: "#34A853" }}>l</span><span style={{ color: "#EA4335" }}>e</span></span>
      </div>
    </div>
  );
}

function AddrConfirm() {
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <K.FauxMap fill pins={{ a: { x: 50, y: 40 }, b: null }} />
      <span style={{ position: "absolute", top: 34, left: 14, zIndex: 6, width: 40, height: 40, borderRadius: "50%", background: "var(--bg)", boxShadow: "var(--shadow-card)", display: "grid", placeItems: "center" }}>
        <Icon name="arrow-left" size={18} color="var(--ink)" />
      </span>
      {/* draggable centre pin */}
      <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-100%)", zIndex: 6, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ background: "var(--ink)", color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: "var(--radius-pill)", padding: "4px 9px", marginBottom: 4, whiteSpace: "nowrap" }}>Drag to adjust</span>
        <Icon name="map-pin" size={40} color="var(--danger)" />
      </div>
      <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,4px)", zIndex: 5, width: 14, height: 5, borderRadius: "50%", background: "rgba(20,24,27,.28)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10, background: "var(--bg)", borderRadius: "20px 20px 0 0", boxShadow: "var(--shadow-sheet)", padding: "12px 16px 16px" }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--line)", margin: "0 auto 12px" }} />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <Icon name="map-pin" size={20} color="var(--danger)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>14 Glenara Avenue</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Avenues, Harare, Zimbabwe</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: "var(--radius-input)", background: "var(--accent-wash)", marginBottom: 12 }}>
          <Icon name="check" size={15} color="var(--accent-text)" />
          <span style={{ fontSize: 12, color: "var(--accent-text)", fontWeight: 600, lineHeight: 1.4 }}>Exact point set — syncs to Google Maps so your rider gets turn-by-turn.</span>
        </div>
        <Field label="Landmark / building, floor (optional)" value="" onChange={noop} placeholder="Blue gate opposite the pharmacy" />
        <Button label="Confirm drop-off" onClick={noop} />
      </div>
    </div>
  );
}

/* ── A1-8 · PRE-BROADCAST LIABILITY DISCLAIMER (accept-to-continue sheet over home) ── */
function Disclaimer() {
  const rows = [
    ["triangle-alert", "Sending is at your own risk", "If your parcel is lost, damaged or not delivered, Lynia isn't liable — you're hiring an independent rider."],
    ["banknote", "Payment is between you and your rider", "You agree the price in the app and pay cash directly. Lynia isn't involved in payment or any money dispute."],
    ["user", "Lynia connects you — that's all", "We match you with a nearby rider. We don't carry, insure or guarantee your parcel."],
  ];
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <K.FauxMap fill pins={PINS} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", zIndex: 5 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10, background: "var(--bg)", borderRadius: "22px 22px 0 0", boxShadow: "var(--shadow-sheet)", padding: "14px 16px 16px", maxHeight: "94%", overflow: "auto" }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: "var(--radius-input)", background: "var(--accent-wash)", marginBottom: 12 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="check" size={14} color="#fff" />
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4 }}>I understand and accept these terms</span>
        </div>
        <Button label="Agree &amp; broadcast" onClick={noop} />
        <Button label="Back" variant="ghost" onClick={noop} />
      </div>
    </div>
  );
}

/* ── F-07 · AUCTION COUNTER-OFFER (rider proposes a different price; accept or decline) ── */
function AuctionCounter() {
  return (
    <Pad>
      <OrderHead status="open_for_offers" />
      <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>Kudzai countered your price.</div>
      <div style={{ border: "1.5px solid var(--accent)", borderRadius: "var(--radius-card)", background: "var(--bg)", boxShadow: "var(--shadow-card)", padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="user" size={20} color="var(--accent-text)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Kudzai N.</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>★ 4.9 · 88 trips · 9 min away</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "stretch", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "9px 10px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)" }}>YOUR PRICE</div>
            <Money v="3.00" size={20} />
          </div>
          <div style={{ display: "grid", placeItems: "center", color: "var(--muted)" }}><Icon name="arrow-right" size={16} color="var(--muted)" /></div>
          <div style={{ flex: 1, background: "var(--accent-wash)", borderRadius: "var(--radius-input)", padding: "9px 10px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: "var(--accent-text)" }}>THEIR OFFER</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <Money v="3.50" size={20} color="var(--accent-text)" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--highlight-ink)" }}>+$0.50</span>
            </div>
          </div>
        </div>
        <Button label="Accept $3.50" onClick={noop} />
        <Button label="Decline" variant="ghost" onClick={noop} />
        <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 2 }}>Declining keeps Kudzai in your list at $3.50 — one counter round, no counter-back.</div>
      </div>
      <div style={{ fontSize: "var(--text-label)", fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Other offers</div>
      <K.OfferCard o={RIDERS[0]} onChoose={noop} />
    </Pad>
  );
}

/* ── F-01 · RIDER BAILED AFTER ASSIGNMENT → auto re-broadcast at same price ── */
function RiderCancelled() {
  return (
    <Pad>
      <OrderHead status="re-broadcasting" tone="reconnecting" />
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="bike" size={18} color="var(--muted)" />
          </span>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Tendai had to cancel</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Sometimes a rider can't make it. We're finding you another rider at the same price — <span style={{ fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">$2.50</span>. No need to start over.</div>
      </Card>
      <div style={{ display: "flex", alignItems: "baseline", margin: "2px 2px 6px" }}>
        <span style={{ flex: 1, fontSize: 14, color: "var(--muted)" }}>Re-broadcasting…</span>
        <span style={{ fontSize: 14, color: "var(--muted)" }} className="lynia-tabular">0:12</span>
      </div>
      <SkeletonList count={2} />
      <Button label="Cancel order" variant="ghost" onClick={noop} />
    </Pad>
  );
}

/* ── F-02 · UNDELIVERABLE (terminal — parcel not delivered; settled off-platform) ── */
function Undelivered() {
  return (
    <Pad>
      <OrderHead status="not delivered" tone="offline" />
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(192,57,43,0.12)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="circle-alert" size={18} color="var(--danger)" />
          </span>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)" }}>Parcel not delivered</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>Tendai couldn't complete this delivery. The parcel is still with your rider.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-input)", background: "var(--surface)", marginBottom: 10 }}>
          <Icon name="circle-alert" size={15} color="var(--muted)" />
          <span style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.4 }}><span style={{ fontWeight: 700 }}>Reason recorded by your rider:</span> recipient unreachable · 3 attempts</span>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-input)", background: "var(--surface)", marginBottom: 12 }}>
          <Icon name="triangle-alert" size={15} color="var(--muted)" />
          <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>Sending is at your own risk — arrange the parcel directly with your rider. Lynia isn't liable for non-delivery.</span>
        </div>
        <CallRow label="Your rider" name="Tendai M." phone="+263 78 202 1180" />
      </Card>
      <Button label="Send a new request" onClick={noop} />
    </Pad>
  );
}

/* ── AUTH ── */
const Splash = () => (
  <div style={{ height: "100%", background: "var(--accent)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
    <Dove size={104} on="green" />
    <div style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600, fontSize: 32, color: "#fff" }}>LyniaGo</div>
  </div>
);
const Login = () => (
  <Pad>
    <Lockup />
    <Heading>Welcome to Lynia</Heading>
    <Sub>We'll SMS a one-time code to this number.</Sub>
    <Field label="Phone number" value="+263 77 245 1180" onChange={noop} inputMode="tel" />
    <Button label="Send code" onClick={noop} />
  </Pad>
);
const Otp = () => (
  <Pad>
    <Heading>Check your messages</Heading>
    <Sub>We sent a 6-digit code to +263 77 245 1180 by SMS.</Sub>
    <Field label="6-digit code" value="418207" onChange={noop} inputMode="numeric" hint="SMS can take a minute on a busy network." />
    <Button label="Verify" onClick={noop} />
    {/* C-OTP idle · resend affordance — cooldown / resent / locked states live in screens-safety.jsx */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, fontSize: 13.5, fontWeight: 600, color: "var(--accent-text)", cursor: "pointer" }}>Didn't get it? Resend code</div>
    <Button label="Back" variant="ghost" onClick={noop} />
  </Pad>
);

/* ── REGISTRATION (post-OTP, first sign-up only) — stored for the account record, NOT KYC ── */
const Register = () => (
  <Pad>
    <Heading>Tell us who you are</Heading>
    <Sub>You're sending parcels. Just a name and ID for your account record — no documents, no verification.</Sub>
    <Field label="Full name" value="Chipo Marufu" onChange={noop} />
    <div style={{ position: "relative" }}>
      <Field label="Phone number" value="+263 77 245 1180" onChange={noop} inputMode="tel" hint="Verified by SMS ✓" />
      <span style={{ position: "absolute", top: 30, right: 12, display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: "var(--accent-text)" }}>
        <Icon name="check" size={13} color="var(--accent-text)" /> Verified
      </span>
    </div>
    <Field label="National ID number" value="63-123456-A-42" onChange={noop} hint="Stored on your account only — we don't verify it. Riders go through a separate ID check." />
    <Button label="Continue" onClick={noop} />
    {/* N-01: this screen had NO way out — no back, no skip, no sign-out — and it sits immediately
        after OTP. Someone who mistyped their number and passed the code sent to it was trapped, with
        the Android system back button as the only exit and nowhere defined for it to go. That is the
        one thing DESIGN.md's own accessibility section forbids: "easy error recovery (retry, edit,
        go back)". Ghost, not primary, and phrased as the thing the rider actually wants ("a different
        number") rather than a navigation word. Same weight and idiom as the OTP screen's ghost Back
        one step earlier, so the pair reads as one flow. */}
    <Button label="Use a different number" variant="ghost" onClick={noop} />
  </Pad>
);

/* ── ROLE SELECT (copied from the rider journey; customer option selected) ── */
function RoleSelect() {
  const Opt = ({ icon, title, desc, selected }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: "var(--radius-card)", border: `1.5px solid ${selected ? "var(--accent)" : "var(--line)"}`, background: selected ? "var(--accent-wash)" : "var(--bg)", marginBottom: 10, boxShadow: selected ? "none" : "var(--shadow-card)" }}>
      <span style={{ width: 46, height: 46, borderRadius: "50%", background: selected ? "var(--accent)" : "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name={icon} size={22} color={selected ? "#fff" : "var(--accent-text)"} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>{desc}</div>
      </div>
      {selected ? <Icon name="check" size={20} color="var(--accent-text)" /> : <Icon name="chevron-right" size={18} color="var(--muted)" />}
    </div>
  );
  return (
    <Pad>
      <Lockup />
      <Heading>How do you want to start?</Heading>
      <Sub>It's one account — pick how you'll use LyniaGo now, and switch anytime.</Sub>
      <Opt icon="shopping-bag" title="Use LyniaGo" desc="Order food, send parcels, more services soon." selected={true} />
      <Opt icon="bike" title="Earn as a rider" desc="Deliver parcels near you and get paid in cash." selected={false} />
      <Button label="Continue as a customer" onClick={noop} />
    </Pad>
  );
}

/* ── ACCOUNT ── */
const TRIPS = [
  { id: "t1", from: "Eastgate", to: "Avenues", date: "2 Jul", role: "Sent", fare: "3.36", status: "completed", rating: 5 },
  { id: "t2", from: "Avondale", to: "CBD", date: "1 Jul", role: "Sent", fare: "2.50", status: "completed", rating: 5 },
  { id: "t4", from: "CBD", to: "Belvedere", date: "29 Jun", role: "Sent", fare: "1.50", status: "expired", rating: 0 },
];
const Profile = () => (
  <Pad>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Account</Heading></div>
    <Sub>Your details and session.</Sub>
    <Card>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>Chipo Marufu</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }} className="lynia-tabular">+263 77 245 1180</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
        <span className="lynia-tabular">ID 63•1234••••••42</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".03em", color: "var(--muted)", background: "var(--surface)", borderRadius: 999, padding: "2px 8px" }}>NOT VERIFIED</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Customer</div>
    </Card>
    <Card>
      <Button label="Trip history" onClick={noop} />
      <Button label="Send a parcel" variant="ghost" onClick={noop} />
    </Card>
    <Button label="Sign out" variant="ghost" onClick={noop} />
  </Pad>
);
const History = () => (
  <Pad>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Your trips</Heading></div>
    <Sub>Every parcel you've sent.</Sub>
    {TRIPS.map((t) => (
      <Card key={t.id}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, paddingRight: 12, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{t.from} → {t.to}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }} className="lynia-tabular">{t.date} · {t.role}{t.rating ? ` · ★ ${t.rating}` : ""}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <Money v={t.fare} size={15} />
            <div style={{ height: 4 }} />
            <StatusPill status={t.status} tone={t.status === "expired" ? "offline" : "neutral"} />
          </div>
        </div>
      </Card>
    ))}
  </Pad>
);

/* ── SUPPORT (copied from support kit, static) ── */
/* Onboarding carousel — three slides: Food, Send, then the promise both share. Product-neutral
   framing: LyniaGo is the app, the services are what's inside it. */
const ONBOARD = [
  { icon: "utensils", title: "Food from kitchens near you", body: "Order from restaurants in your corridor — you see the arrival window before you pay." },
  { icon: "banknote", title: "Name your price to send", body: "Say what you'll pay to send a parcel. Riders bid for it — no fixed tariff, no haggling in the street." },
  { icon: "check", title: "One app, one code", body: "Same riders, same delivery code at the door, cash if that's how you pay. More services soon." },
];
function Onboarding({ slide = 0 }) {
  const s = ONBOARD[slide] || ONBOARD[0];
  return (
    <Pad style={{ display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Dove size={24} on="white" /><Wordmark size={17} /></span>
        <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>Skip</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 6 }}>
        <div style={{ width: 120, height: 120, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", marginBottom: 18 }}>
          <Icon name={s.icon} size={52} color="var(--accent-text)" />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>{s.title}</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--muted)", maxWidth: 240 }}>{s.body}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 7, marginBottom: 16 }}>
        {[0, 1, 2].map((n) => <span key={n} style={{ width: n === slide ? 22 : 7, height: 7, borderRadius: 999, background: n === slide ? "var(--accent)" : "var(--line)" }} />)}
      </div>
      <Button label={slide === 2 ? "Get started" : "Next"} onClick={noop} />
    </Pad>
  );
}
function Notifications({ empty }) {
  const items = [
    { icon: "bike", t: "Tendai M. is on the way", m: "Arriving at pickup in about 6 min.", w: "now", unread: true },
    { icon: "banknote", t: "New offer — $3.20", m: "Kudzai N. offered on your CBD → Avenues order.", w: "2 min", unread: true },
    { icon: "check", t: "Delivered", m: "Order 8f3a91c2 was delivered. Rate your rider.", w: "1 hr" },
    { icon: "id-card", t: "You're verified", m: "Your account is approved.", w: "Yesterday" },
  ];
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Notifications" onBack={false} /></Pad>
      {empty ? (
        <Pad><EmptyState icon="inbox" title="No notifications yet" message="Offers, delivery updates and account news will show up here." /></Pad>
      ) : (
        <div style={{ padding: "0 var(--space-screen) var(--space-screen)" }}>
          {items.map((n, i) => (
            <div key={i} style={{ display: "flex", gap: 11, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Icon name={n.icon} size={18} color="var(--accent-text)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{n.t}</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>{n.m}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{n.w}</div>
              </div>
              {n.unread ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: 6 }} /> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function Help() {
  const topics = [
    ["package", "A delivery problem", "Late, damaged or wrong drop-off"],
    ["banknote", "Payments & fares", "How pricing and cash work"],
    ["id-card", "My account", "Verification, phone number, safety"],
  ];
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Help" onBack={false} /></Pad>
      <Pad style={{ paddingTop: 4 }}>
        <Field placeholder="Search help…" value="" onChange={noop} />
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "6px 0 8px" }}>Browse topics</div>
        {topics.map(([ic, t, m]) => (
          <Card key={t} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <Icon name={ic} size={20} color="var(--accent-text)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{t}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{m}</div>
              </div>
              <Icon name="chevron-right" size={18} color="var(--muted)" />
            </div>
          </Card>
        ))}
        <Card style={{ background: "var(--accent-wash)", border: "1px solid transparent", boxShadow: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Icon name="phone" size={20} color="var(--accent-text)" />
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Chat with us on WhatsApp</div>
            <Icon name="chevron-right" size={18} color="var(--accent-text)" />
          </div>
        </Card>
      </Pad>
    </div>
  );
}
function Settings() {
  const Row = ({ icon, label, value, danger }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
      <Icon name={icon} size={19} color={danger ? "var(--danger)" : "var(--accent-text)"} />
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: danger ? "var(--danger)" : "var(--ink)" }}>{label}</span>
      {value ? <span style={{ fontSize: 13, color: "var(--muted)" }}>{value}</span> : null}
      {!danger ? <Icon name="chevron-right" size={17} color="var(--muted)" /> : null}
    </div>
  );
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Settings" onBack={false} /></Pad>
      <Pad style={{ paddingTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><Icon name="user" size={24} color="var(--accent-text)" /></div>
          <div><div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Chipo M.</div><div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">+263 77 245 1180</div></div>
        </div>
        <Row icon="user" label="Edit profile" />
        <Row icon="phone" label="Notifications" value="On" />
        <Row icon="map-pin" label="Language" value="English" />
        <Row icon="banknote" label="Payment" value="Cash" />
        <div style={{ height: 10 }} />
        <Row icon="x" label="Sign out" danger />
        <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 14 }}>LyniaGo v1.0.0</div>
      </Pad>
    </div>
  );
}

/* ── SYSTEM / EDGE ── */
const PermLoc = () => <SystemState icon="navigation" title="Turn on location" message="LyniaGo uses your location to set your pickup pin and match you with the closest riders. We only use it while you're arranging a delivery." primary="Allow location" secondary="Enter address manually" />;
const PermNotif = () => <SystemState icon="phone" title="Stay in the loop" message="Get notified the moment a rider offers, when they're arriving, and when your parcel is delivered." primary="Turn on notifications" secondary="Not now" />;
/* Retrofit (plan §2, Cluster A shared requirement): "Contact support" is a real tel: call row, not dead text. */
const OnHold = () => (
  <Pad style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 4, fontFamily: "var(--font-sans)" }}>
    <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", marginBottom: 14 }}>
      <Icon name="triangle-alert" size={34} color="var(--accent-text)" />
    </div>
    <div style={{ fontSize: 19, fontWeight: 700, color: "var(--ink)" }}>Your account is on hold</div>
    <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--muted)", maxWidth: 230 }}>We've paused your account while we review recent activity. This usually takes 24 hours — call us if you think it's a mistake.</div>
    <div style={{ alignSelf: "stretch", marginTop: 18 }}>
      <CallRow label="Support" name="Lynia support" phone="+263 77 883 1938" />
      <Button label="Sign out" variant="ghost" onClick={noop} />
    </div>
  </Pad>
);
const ForceUpdate = () => <SystemState tone="green" brand title="Time to update" message="A new version of LyniaGo is ready with the latest fixes. Update to keep sending." primary="Update now" />;
const NoGps = () => <SystemState icon="wifi-off" title="Can't find your location" message="Turn on GPS so we can set your pickup and match nearby riders. Or enter your pickup address by hand." primary="Open location settings" secondary="Enter address manually" />;
const GenericError = () => <SystemState icon="circle-alert" title="Something went wrong" message="That didn't load. Check your connection and try again — your order is safe." primary="Try again" secondary="Back home" />;
function OfflineHome() {
  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <OfflineBanner state="offline" />
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <Home pins={true} expanded={false} />
      </div>
    </div>
  );
}

/* Every screen sits in the DS AppScreen shell — same status bar, same root tab bar, same sticky
   footer geometry as the Food journey. Root screens name their tab; pushed screens omit it.
   Screens that already carry their own shell (the shared home) are passed through untouched. */
const S = (node, o = {}) => <AppScreen tab={o.tab} bg={o.bg} dark={o.dark}>{node}</AppScreen>;

window.LJ = {
  splash: () => S(<Splash />, { bg: "var(--accent)", dark: true }),
  onboard: () => S(<Onboarding slide={0} />),
  onboard_send: () => S(<Onboarding slide={1} />),
  onboard_shared: () => S(<Onboarding slide={2} />),
  login: () => S(<Login />),
  otp: () => S(<Otp />),
  register: () => S(<Register />),
  role_select: () => S(<RoleSelect />),
  perm_loc: () => S(<PermLoc />),
  perm_notif: () => S(<PermNotif />),
  home_launcher: () => <LauncherHome />,
  home_empty: () => S(<Home pins={false} expanded={false} />),
  home_pins: () => S(<Home pins={true} expanded={false} />),
  home_expanded: () => S(<Home pins={true} expanded={true} />),
  disclaimer: () => S(<Disclaimer />),
  addr_search: () => S(<AddrSearch />),
  addr_map_confirm: () => S(<AddrConfirm />),
  auction_finding: () => S(<Auction variant="finding" />),
  auction_live: () => S(<Auction variant="live" />),
  select_race: () => S(<Auction variant="race" />),
  auction_counter: () => S(<AuctionCounter />),
  auction_expired: () => S(<Auction variant="expired" />),
  no_riders: () => S(<Auction variant="noriders" />),
  track_code: () => S(<Tracking variant="code" />),
  track_active: () => S(<Tracking variant="active" />),
  track_paused: () => S(<Tracking variant="paused" />),
  rider_cancelled: () => S(<RiderCancelled />),
  undelivered: () => S(<Undelivered />),
  cancel: () => S(<Tracking variant="cancel" />),
  cancelled: () => S(<Tracking variant="cancelled" />),
  delivered_rate: () => S(<Tracking variant="rate" />),
  completed: () => S(<Tracking variant="completed" />),
  profile: () => S(<Profile />, { tab: "acct" }),
  /* One Orders list across every service (D-02b) — the same screen the Food journey shows. */
  history: () => (window.RC && window.RC.orders ? window.RC.orders() : S(<History />, { tab: "orders" })),
  notifications: () => S(<Notifications />),
  notif_empty: () => S(<Notifications empty />),
  help: () => S(<Help />),
  settings: () => S(<Settings />),
  offline: () => S(<OfflineHome />),
  on_hold: () => S(<OnHold />),
  force_update: () => S(<ForceUpdate />, { bg: "var(--accent)", dark: true }),
  no_gps: () => S(<NoGps />),
  generic_error: () => S(<GenericError />),
};

})();
