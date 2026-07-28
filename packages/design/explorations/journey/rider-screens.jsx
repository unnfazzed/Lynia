/* file-scoped: Babel classic scripts share one global scope, so every declaration below is
   wrapped in an IIFE — only window.LJ / window.RJ leave this file. Without it, a later-loading
   sibling silently overwrites same-named screens (customer Profile vs rider Profile, etc.). */
(() => {
/* LyniaGo — RIDER journey flow-map: static screen renderers.
   Every tile is composed from the REAL design-system bundle + kit primitives (frozen state, no
   interactivity) so the map reads at production fidelity. Ported from the interactive rider flow in
   ui_kits/mobile/app.js. Registers window.RJ (id -> render fn). */

const DS = window.LyniaDesignSystem_94c56a;
const K = window.LyniaKit;
const SUP = window.LyniaSupport;
const { Button, Card, Field, StatusPill, Stepper, EmptyState, Heading, Sub, Label, SkeletonList, Icon, OfflineBanner } = DS;
const { Dove, Wordmark, Pad, Top, SystemState } = SUP;

const noop = () => {};
const T0 = "2026-07-04T09:00:00.000Z";
const ev = (...st) => st.map((s) => ({ status: s, createdAt: T0 }));
const PINS = { a: { x: 26, y: 30 }, b: { x: 76, y: 70 } };

/* ── shared bits ── */
function JobHead({ status, tone }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <Heading style={{ marginBottom: 0 }}>Your job</Heading>
      <div style={{ flex: 1 }} />
      <StatusPill status={status} tone={tone} />
    </div>
  );
}
function RiderHead({ chip }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <Heading style={{ marginBottom: 0 }}>Rider</Heading>
      <div style={{ flex: 1 }} />
      {chip}
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
function ItemsBlock({ items, note }) {
  return (
    <div style={{ padding: "10px 12px", background: "var(--surface)", borderRadius: "var(--radius-input)", marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 2 }}>Items</div>
      {items.map((it, i) => (
        <div key={i} style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", display: "flex", gap: 8 }}>
          <span style={{ color: "var(--muted)", fontWeight: 700, minWidth: 22 }} className="lynia-tabular">{it.qty}×</span>
          <span>{it.desc}</span>
        </div>
      ))}
      {note ? (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>Sender's note</div>
          <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.45 }}>{note}</div>
        </div>
      ) : null}
    </div>
  );
}
function BoardCard({ o, dim }) {
  return (
    <Card style={dim ? { opacity: 0.5 } : undefined}>
      <div style={{ fontWeight: 700, color: "var(--ink)" }}>{o.from} → {o.to}</div>
      <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">{o.items} · {o.km} km away · asking ${o.fare}</div>
      <Button label="Make an offer" variant="ghost" onClick={noop} />
    </Card>
  );
}
const BOARD = [
  { id: "o1", from: "Avondale", to: "CBD", items: "1× Small package", km: "2.4", fare: "2.50", note: "Ask for Rita at reception; parcel is fragile." },
  { id: "o2", from: "Borrowdale", to: "Msasa", items: "3× Documents · 1× USB", km: "6.1", fare: "4.00", note: "" },
  { id: "o3", from: "Mbare", to: "Waterfalls", items: "1× Food order", km: "3.3", fare: "2.80", note: "" },
];

/* ── ACT 0 · first run & auth ── */
const Splash = () => (
  <div style={{ height: "100%", background: "var(--accent)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
    <Dove size={104} on="green" />
    <div style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600, fontSize: 32, color: "#fff" }}>LyniaGo</div>
  </div>
);
function Onboard() {
  return (
    <Pad style={{ display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Dove size={24} on="white" /><Wordmark size={17} /></span>
        <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>Skip</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 6 }}>
        <div style={{ width: 120, height: 120, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", marginBottom: 18 }}>
          <Icon name="bike" size={52} color="var(--accent-text)" />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>Earn on your bike</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--muted)", maxWidth: 244 }}>See parcels near you, name your fare, and get paid in cash on delivery. Ride when you want.</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 7, marginBottom: 16 }}>
        {[0, 1, 2].map((n) => <span key={n} style={{ width: n === 1 ? 22 : 7, height: 7, borderRadius: 999, background: n === 1 ? "var(--accent)" : "var(--line)" }} />)}
      </div>
      <Button label="Next" onClick={noop} />
    </Pad>
  );
}
const Login = () => (
  <Pad>
    <Lockup />
    <Heading>Sign in to ride</Heading>
    <Sub>We'll WhatsApp a one-time code to this number.</Sub>
    <Field label="Phone number" value="+263 78 202 1180" onChange={noop} inputMode="tel" />
    <Button label="Send code" onClick={noop} />
  </Pad>
);
const Otp = () => (
  <Pad>
    <Heading>Check your WhatsApp</Heading>
    <Sub>We sent a 6-digit code to +263 78 202 1180 on WhatsApp.</Sub>
    <Field label="6-digit code" value="418207" onChange={noop} inputMode="numeric" hint="No WhatsApp on this number? Contact support to sign up." />
    <Button label="Verify" onClick={noop} />
    <Button label="Back" variant="ghost" onClick={noop} />
  </Pad>
);
const PermLoc = () => <SystemState icon="navigation" title="Turn on location" message="LyniaGo uses your location to show parcels near you and to match you with the closest pickups. It's only used while you're online." primary="Allow location" secondary="Not now" />;
const PermNotif = () => <SystemState icon="phone" title="Never miss an order" message="Get a ping the moment a new parcel is posted near you, and when a customer picks your offer." primary="Turn on notifications" secondary="Not now" />;

/* Role fork — initial flow is identical to the customer; this is where a signed-in user says
   they want to ride. One account, switchable later. */
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
      <Opt icon="shopping-bag" title="Use LyniaGo" desc="Order food, send parcels, more services soon." selected={false} />
      <Opt icon="bike" title="Earn as a rider" desc="Deliver parcels near you and get paid in cash." selected={true} />
      <Button label="Continue as a rider" onClick={noop} />
    </Pad>
  );
}

/* ── ACT 1 · become a rider (KYC) ── */
const KycIntro = () => (
  <Pad>
    <RiderHead />
    <EmptyState icon="id-card" title="Set up as a rider" message="Verify your ID and register your bike to start accepting deliveries. Riders go online once verified.">
      <Button label="Become a rider" onClick={noop} />
    </EmptyState>
  </Pad>
);
function KycForm() {
  return (
    <Pad>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Become a rider</Heading></div>
      <Sub>Verify your ID and register your bike to start accepting deliveries.</Sub>
      <Card>
        <Field label="First name" value="Tendai" onChange={noop} />
        <Field label="Last name" value="Moyo" onChange={noop} />
        <Field label="National ID number" value="631234567" onChange={noop} inputMode="numeric" hint="The 8–12 digits on your national ID card." />
      </Card>
      <Card>
        <Field label="Bike registration" value="ABZ 1234" onChange={noop} />
        <Label>Your photo</Label>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, minHeight: 52, border: "1px solid var(--line)", borderRadius: "var(--radius-input)", background: "var(--accent-wash)", marginTop: 4 }}>
          <Icon name="check" size={18} color="var(--accent-text)" />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-text)" }}>Photo added — retake</span>
        </div>
      </Card>
      <Card style={{ background: "var(--surface)", border: "1px solid transparent", boxShadow: "none" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Icon name="id-card" size={18} color="var(--accent-text)" style={{ marginTop: 1 }} />
          <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
            Your national ID is checked by our verification partner <b style={{ color: "var(--ink)", fontWeight: 600 }}>Didit</b> — an ID photo plus a quick selfie liveness check. We store your ID number, bike reg and photo to keep deliveries safe; we don't share them with customers.{" "}
            <span style={{ color: "var(--accent-text)", fontWeight: 600, textDecoration: "underline" }}>Privacy policy</span>
          </div>
        </div>
      </Card>
      <Button label="Submit for verification" onClick={noop} />
    </Pad>
  );
}
const KycPending = () => (
  <Pad>
    <RiderHead />
    <EmptyState icon="id-card" title="Finishing verification…" message="Your ID check is with Didit — riders go online once it's verified. This usually takes under a minute.">
      <Button label="Continue in browser" variant="ghost" onClick={noop} />
    </EmptyState>
  </Pad>
);
const KycVerified = () => (
  <Pad>
    <RiderHead chip={<StatusPill status="Verified" tone="online" dot />} />
    <Card accent>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name="check" size={22} color="#fff" />
        </span>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>You're verified</div>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Your ID and bike are approved. Go online to see parcels near you and start earning.</div>
    </Card>
    <Button label="Go online" onClick={noop} />
  </Pad>
);
const KycFailed = () => (
  <Pad>
    <RiderHead />
    <EmptyState icon="triangle-alert" title="We couldn't verify your ID" message="Often a blurry photo or glare on the ID. Try again, or contact support if it keeps failing.">
      <Button label="Try again" onClick={noop} />
      <Button label="Contact support" variant="ghost" onClick={noop} />
    </EmptyState>
  </Pad>
);
const KycExpired = () => (
  <Pad>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Rider</Heading><div style={{ flex: 1 }} /><StatusPill status="Offline" tone="offline" dot /></div>
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(192,57,43,0.12)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name="triangle-alert" size={18} color="var(--danger)" />
        </span>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)" }}>Your ID has expired</div>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 4 }}>You can't go online until you re-verify. Re-submit a valid national ID to keep riding.</div>
    </Card>
    <Button label="Re-verify my ID" onClick={noop} />
  </Pad>
);

/* ── ACT 2 · online & the board ── */
const RiderOffline = () => (
  <Pad>
    <RiderHead chip={<StatusPill status="Offline" tone="offline" dot />} />
    <Card>
      <div style={{ marginBottom: 6 }}><StatusPill status="Offline" tone="offline" dot /></div>
      <Button label="Go online" onClick={noop} />
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Go online to see and bid on nearby orders.</div>
    </Card>
    <EmptyState icon="inbox" title="You're offline" message="Go online to see nearby orders — you'll be first in line." />
  </Pad>
);
const OnlineEmpty = () => (
  <Pad>
    <RiderHead chip={<StatusPill status="Online" tone="online" dot />} />
    <Card accent>
      <div style={{ marginBottom: 6 }}><StatusPill status="Online" tone="online" dot /></div>
      <Button label="Go offline" variant="ghost" onClick={noop} />
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>You're online — new orders arrive live.</div>
    </Card>
    <Sub>Open orders</Sub>
    <EmptyState icon="inbox" title="No open orders near you right now" message="You're online and first in line — stay put, requests come through fast. Busiest 7–9am & 5–7pm." />
  </Pad>
);
function Board() {
  return (
    <Pad>
      <RiderHead chip={<StatusPill status="Online" tone="online" dot />} />
      <Card accent>
        <div style={{ marginBottom: 6 }}><StatusPill status="Online" tone="online" dot /></div>
        <Button label="Go offline" variant="ghost" onClick={noop} />
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>You're online — new orders arrive live.</div>
      </Card>
      <Sub>Open orders</Sub>
      {BOARD.map((o) => <BoardCard key={o.id} o={o} />)}
    </Pad>
  );
}
function MissedOrder() {
  return (
    <Pad>
      <RiderHead chip={<StatusPill status="Online" tone="online" dot />} />
      <Sub>Open orders</Sub>
      <div role="status" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", background: "var(--surface)", borderRadius: "var(--radius-input)", marginBottom: 10, color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>
        <Icon name="circle-alert" size={16} color="var(--muted)" /> That order was taken by another rider.
      </div>
      <BoardCard o={BOARD[0]} dim />
      <BoardCard o={BOARD[1]} />
      <BoardCard o={BOARD[2]} />
    </Pad>
  );
}

/* ── ACT 3 · make an offer ── */
function OfferCompose() {
  const seg = (label, active) => (
    <div style={{ flex: 1, textAlign: "center", padding: "9px 6px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: active ? "var(--bg)" : "transparent", color: active ? "var(--accent-text)" : "var(--muted)", boxShadow: active ? "var(--shadow-card)" : "none" }}>{label}</div>
  );
  return (
    <Pad>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Make an offer</Heading></div>
      <Card accent>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Avondale → CBD</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }} className="lynia-tabular">1× Small package · 2.4 km · asking $2.50</div>
        <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--surface)", borderRadius: 999, marginBottom: 12 }}>
          {seg("Accept $2.50", false)}{seg("Counter your fare", true)}
        </div>
        <Field label="Your fare (USD)" value="3.00" onChange={noop} inputMode="decimal" hint="Counter higher if the trip's worth more — the customer accepts or declines." />
        <Field label="ETA to pickup (min)" value="8" onChange={noop} inputMode="numeric" />
        <Button label="Send counter-offer" onClick={noop} />
        <Button label="Cancel" variant="ghost" onClick={noop} />
      </Card>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
        <Icon name="check" size={14} color="var(--accent-text)" /> Tap “Accept $2.50” to take the asking price in one tap.
      </div>
    </Pad>
  );
}
function OfferSent() {
  return (
    <Pad>
      <RiderHead chip={<StatusPill status="Online" tone="online" dot />} />
      <div role="status" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", background: "var(--accent-wash)", borderRadius: "var(--radius-input)", marginBottom: 12, color: "var(--accent-text)", fontSize: 13, fontWeight: 600 }}>
        <Icon name="check" size={16} color="var(--accent-text)" /> Offer sent — you'll be notified if the customer picks you.
      </div>
      <Card>
        <div style={{ fontWeight: 700, color: "var(--ink)" }}>Avondale → CBD</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">Your offer $3.00 · ETA 8 min</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8, padding: "7px 10px", borderRadius: "var(--radius-input)", background: "var(--surface)" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", flex: 1 }}>Customer's window closes in</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">0:47</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>One offer per order — yours stays live at this price until the window closes, even if a counter is declined.</div>
      </Card>
      <Sub>Other open orders</Sub>
      <BoardCard o={BOARD[1]} />
    </Pad>
  );
}
function Picked() {
  return (
    <Pad>
      <RiderHead chip={<StatusPill status="Online" tone="online" dot />} />
      <Card accent>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Icon name="check" size={18} color="var(--accent-text)" />
          <div style={{ fontWeight: 700, color: "var(--ink)" }}>A customer picked you!</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }} className="lynia-tabular">Avondale → CBD · $3.00</div>
        <Button label="Open job" onClick={noop} />
      </Card>
      <Sub>Other open orders</Sub>
      <BoardCard o={BOARD[1]} />
    </Pad>
  );
}
function NotChosen() {
  return (
    <Pad>
      <RiderHead chip={<StatusPill status="Online" tone="online" dot />} />
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="user" size={18} color="var(--muted)" />
          </span>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Not this time</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>The customer picked another rider for <span className="lynia-tabular">Avondale → CBD</span>. It happens — you're still online and first in line for the next one.</div>
      </Card>
      <Sub>Open orders</Sub>
      <BoardCard o={BOARD[1]} />
      <BoardCard o={BOARD[2]} />
    </Pad>
  );
}

/* S1 · The 90s window closed with nobody picked — distinct from losing to another rider. */
function BidExpired() {
  return (
    <Pad>
      <RiderHead chip={<StatusPill status="Online" tone="online" dot />} />
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="inbox" size={18} color="var(--muted)" />
          </span>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>That window closed</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>The customer's 90-second window on <span className="lynia-tabular">Avondale → CBD</span> ended without a pick. If they re-broadcast at a new price, it'll show up on your board as a fresh order.</div>
      </Card>
      <Sub>Open orders</Sub>
      <BoardCard o={BOARD[1]} />
      <BoardCard o={BOARD[2]} />
    </Pad>
  );
}

/* ── ACT 4 · the active job ── */
function Job({ status, tone, primary, steps, extra, map, mapPos, hideItems }) {
  return (
    <Pad>
      <JobHead status={status} tone={tone} />
      <Card>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $3.00</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          <CallRow label="Sender" name="Eastgate contact" phone="+263 77 245 1180" />
          <CallRow label="Recipient" name="Avenues contact" phone="+263 71 555 0090" />
        </div>
        {!hideItems ? <ItemsBlock items={[{ desc: "Small package", qty: 1 }]} note="Ask for Rita at reception; parcel is fragile." /> : null}
        {map ? <K.FauxMap rider riderPos={mapPos} pins={PINS} /> : null}
        {map ? <div style={{ height: 12 }} /> : null}
        <Stepper events={ev(...steps.done)} currentStatus={steps.cur} view="rider" />
      </Card>
      {extra}
      {primary ? <Button label={primary} onClick={noop} /> : null}
    </Pad>
  );
}
const JobAssigned = () => <Job status="assigned" primary="Confirm the job" steps={{ done: ["assigned"], cur: "assigned" }} />;
const JobPickup = () => <Job status="en_route_pickup" primary="Arrived at pickup" hideItems map mapPos={0.15} steps={{ done: ["assigned", "confirmed", "en_route_pickup"], cur: "en_route_pickup" }} />;
/* Pickup verification — the rider sees the sender's item list and ticks each one off to confirm
   what's physically collected before riding to the drop-off. */
function JobVerify() {
  const items = [{ desc: "Documents envelope", qty: 1, ok: true }, { desc: "Small package", qty: 2, ok: true }];
  const total = items.reduce((s, it) => s + it.qty, 0);
  return (
    <Pad>
      <JobHead status="en_route_pickup" />
      <Card accent>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>Confirm pickup</div>
        <Sub>Tick each item against the sender's list before you ride off.</Sub>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: "var(--radius-input)", background: it.ok ? "var(--accent-wash)" : "var(--surface)", border: `1px solid ${it.ok ? "transparent" : "var(--line)"}` }}>
              <span style={{ width: 24, height: 24, borderRadius: 7, background: it.ok ? "var(--accent)" : "var(--bg)", border: it.ok ? "none" : "1.5px solid var(--line)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                {it.ok ? <Icon name="check" size={15} color="#fff" /> : null}
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{it.desc}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }} className="lynia-tabular">{it.qty}×</span>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: "flex", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-input)", background: "var(--surface)", marginBottom: 12 }}>
        <Icon name="triangle-alert" size={15} color="var(--muted)" />
        <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>Only confirm what you actually have. The recipient still verifies delivery with the 6-digit code.</span>
      </div>
      <Button label={`Confirm ${total} items collected`} onClick={noop} />
    </Pad>
  );
}
const JobCollect = () => <Job status="picked_up" primary="Head to drop-off" map mapPos={0.42} steps={{ done: ["assigned", "confirmed", "en_route_pickup", "picked_up"], cur: "picked_up" }} />;
const JobDropoff = () => <Job status="en_route_dropoff" hideItems map mapPos={0.72} steps={{ done: ["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"], cur: "en_route_dropoff" }}
  extra={
    <Card>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Confirm hand-off</div>
      <Sub>Ask the recipient for the 6-digit delivery code.</Sub>
      <Field label="Delivery code" value="" onChange={noop} inputMode="numeric" placeholder="000000" />
      <Button label="Confirm delivery" onClick={noop} />
    </Card>
  } />;
const JobHandoff = () => (
  <Pad>
    <JobHead status="en_route_dropoff" />
    <Card>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $3.00</div>
      <div style={{ marginBottom: 10 }}><CallRow label="Recipient" name="Avenues contact" phone="+263 71 555 0090" /></div>
      <Stepper events={ev("assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff")} currentStatus="en_route_dropoff" view="rider" />
    </Card>
    <Card accent>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Confirm hand-off</div>
      <Sub>Ask the recipient for the 6-digit delivery code.</Sub>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["4", "1", "8", "2", "0", "7"].map((d, i) => (
          <span key={i} style={{ flex: 1, textAlign: "center", padding: "10px 0", border: "1.5px solid var(--accent)", borderRadius: "var(--radius-input)", fontSize: 20, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">{d}</span>
        ))}
      </div>
      <Button label="Confirm delivery" onClick={noop} />
    </Card>
  </Pad>
);
const JobDelivered = () => (
  <Pad>
    <JobHead status="delivered" />
    <Card>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $3.00</div>
      <Stepper events={ev("assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered")} currentStatus="delivered" view="rider" />
    </Card>
    <Card accent>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="check" size={20} color="var(--accent-text)" />
        <div style={{ fontWeight: 700, color: "var(--accent-text)" }}>Delivered. You're free for the next job.</div>
      </div>
    </Card>
    <Card>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>Rate the sender</div>
      <Sub>Optional — a no-show or cash problem here protects other riders.</Sub>
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => <span key={n} style={{ fontSize: 30, color: "var(--line)" }}>★</span>)}
      </div>
    </Card>
    <Button label="Back to board" onClick={noop} />
  </Pad>
);

/* ── ACT 4 · branches & failures ── */
const HandoffWrong = () => (
  <Pad>
    <JobHead status="en_route_dropoff" />
    <Card accent style={{ borderColor: "var(--danger)" }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Confirm hand-off</div>
      <Field label="Delivery code" value="418209" onChange={noop} inputMode="numeric" error="That code doesn't match. 4 attempts left." />
      <Button label="Confirm delivery" onClick={noop} />
    </Card>
    <Card style={{ background: "var(--surface)", border: "1px solid transparent", boxShadow: "none" }}>
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8 }}>Locked after 5 wrong attempts. If the recipient doesn't have the code, ask the customer to re-send it — they re-issue a fresh one from their order screen.</div>
      <Button label="Ask customer to re-send the code" variant="ghost" onClick={noop} />
    </Card>
  </Pad>
);
const Undelivered = () => (
  <Pad>
    <JobHead status="not delivered" tone="offline" />
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(192,57,43,0.12)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name="circle-alert" size={18} color="var(--danger)" />
        </span>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)" }}>Couldn't deliver</div>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>You marked this parcel undeliverable after 3 attempts to reach the recipient.</div>
      <Label>Reason recorded — shown to the customer</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[["check", "Recipient unreachable", true], ["circle-alert", "Recipient refused", false], ["map-pin", "Wrong address", false], ["bike", "Couldn't complete (breakdown)", false]].map(([ic, t, on]) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-input)", background: on ? "var(--accent-wash)" : "var(--surface)" }}>
            <Icon name={on ? "check" : ic} size={15} color={on ? "var(--accent-text)" : "var(--muted)"} />
            <span style={{ fontSize: 13, fontWeight: 600, color: on ? "var(--accent-text)" : "var(--ink)" }}>{t}</span>
          </div>
        ))}
      </div>
    </Card>
    <div style={{ display: "flex", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-input)", background: "var(--surface)", marginBottom: 12 }}>
      <Icon name="triangle-alert" size={15} color="var(--muted)" />
      <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>The parcel is still with you — arrange its return directly with the customer. Settled off-platform.</span>
    </div>
    <Button label="Back to board" onClick={noop} />
  </Pad>
);
const JobBail = () => (
  <Pad>
    <JobHead status="assigned" />
    <Card>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Cancel this job?</div>
      <Sub>The customer's order is re-broadcast at the same price so another rider can take it. You can only cancel before pickup — once the parcel's on your bike, finish the job or mark it undeliverable.</Sub>
      <Field label="Reason" value="Bike trouble" onChange={noop} />
      <Button label="Confirm cancellation" onClick={noop} />
      <Button label="Keep job" variant="ghost" onClick={noop} />
    </Card>
    <Card style={{ background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", boxShadow: "none" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <Icon name="triangle-alert" size={16} color="var(--highlight-ink)" style={{ marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: "var(--highlight-ink)", lineHeight: 1.5 }}>Cancelling an accepted job affects your reliability score. Too many cancels can pause your account.</div>
      </div>
    </Card>
  </Pad>
);
const JobOffline = () => (
  <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
    <OfflineBanner state="reconnecting" />
    <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
    <Pad>
      <JobHead status="en_route_pickup" tone="reconnecting" />
      <Card>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $3.00</div>
        <K.FauxMap rider riderPos={0.3} paused pins={PINS} />
        <div style={{ height: 12 }} />
        <Stepper events={ev("assigned", "confirmed", "en_route_pickup")} currentStatus="en_route_pickup" view="rider" />
      </Card>
      <Card style={{ background: "var(--surface)", border: "1px solid transparent", boxShadow: "none" }}>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Live paused — reconnecting. Your job is saved; keep riding to pickup and it'll sync when you're back on.</div>
      </Card>
    </Pad>
    </div>
  </div>
);

/* S5 · Customer exercised cancel-anytime mid-job — the rider-side mirror. Pre-pickup: simply free.
   Post-pickup (frozen state shown): the parcel is on the bike — hand-back arranged directly with
   the sender, settled off-platform. Never dents the rider's reliability score. */
function JobCancelled() {
  return (
    <Pad>
      <JobHead status="cancelled" tone="offline" />
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(192,57,43,0.12)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="circle-alert" size={18} color="var(--danger)" />
          </span>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)" }}>The customer cancelled</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>This job has ended. You still have the parcel — arrange the hand-back directly with the sender. This doesn't affect your reliability score.</div>
        <CallRow label="Sender" name="Eastgate contact" phone="+263 77 245 1180" />
      </Card>
      <div style={{ display: "flex", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-input)", background: "var(--surface)", marginBottom: 12 }}>
        <Icon name="triangle-alert" size={15} color="var(--muted)" />
        <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>Cancelled before pickup? You're simply free — no parcel, straight back to the board.</span>
      </div>
      <Button label="Back to board" onClick={noop} />
    </Pad>
  );
}

/* ── ACT 5 · earnings ── */
const EARN = [
  { from: "Borrowdale", to: "Msasa", date: "2 Jul", fare: "4.00" },
  { from: "Avondale", to: "CBD", date: "2 Jul", fare: "3.00" },
  { from: "Mbare", to: "Waterfalls", date: "1 Jul", fare: "2.80" },
];
function Earnings() {
  const total = EARN.reduce((s, t) => s + +t.fare, 0);
  return (
    <Pad>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Earnings</Heading></div>
      <Sub>What you've agreed and delivered.</Sub>
      <Card style={{ background: "var(--accent)", border: "1px solid transparent", boxShadow: "var(--shadow-card)" }}>
        <div style={{ color: "var(--on-accent)", fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Agreed &amp; delivered · total</div>
        <div style={{ color: "var(--on-accent)", fontSize: 28, fontWeight: 700, marginTop: 2 }} className="lynia-tabular">${total.toFixed(2)}</div>
        <div style={{ color: "var(--on-accent)", fontSize: 12, opacity: 0.9, marginTop: 2 }}>{EARN.length} completed trips</div>
      </Card>
      <Card style={{ background: "var(--accent-wash)", border: "1px solid transparent", boxShadow: "var(--shadow-card)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--accent-text)", fontSize: 12, fontWeight: 600 }}>Commission balance</div>
            <div style={{ color: "var(--ink)", fontSize: 28, fontWeight: 700, marginTop: 2 }} className="lynia-tabular">$4.85</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>Prepaid — top up, receipts and rate</div>
          </div>
          <Icon name="chevron-right" size={18} color="var(--accent-text)" />
        </div>
      </Card>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "20px 2px 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Completed trips</div>
      {EARN.map((t, i) => (
        <Card key={i}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ flex: 1, paddingRight: 12, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{t.from} → {t.to}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{t.date}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">${t.fare}</div>
          </div>
        </Card>
      ))}
      <Card style={{ background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", boxShadow: "none" }}>
        <div style={{ fontSize: 12, color: "var(--highlight-ink)", lineHeight: 1.5 }}>Lynia takes a small commission on each delivery you complete — from a prepaid balance, never your cash in hand. Open your Wallet to top up and see every deduction beside the ride it came from.</div>
      </Card>
    </Pad>
  );
}
const EarningsNew = () => (
  <Pad>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Earnings</Heading></div>
    <Sub>What you've agreed and delivered.</Sub>
    <Card style={{ background: "var(--accent)", border: "1px solid transparent", boxShadow: "var(--shadow-card)" }}>
      <div style={{ color: "var(--on-accent)", fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Agreed &amp; delivered · total</div>
      <div style={{ color: "var(--on-accent)", fontSize: 28, fontWeight: 700, marginTop: 2 }} className="lynia-tabular">$0.00</div>
      <div style={{ color: "var(--on-accent)", fontSize: 12, opacity: 0.9, marginTop: 2 }}>No trips yet</div>
    </Card>
    <EmptyState icon="banknote" title="Your first fare starts here" message="Go online and make an offer — every delivery you complete shows up here as a record of your work." >
      <Button label="Go online" onClick={noop} />
    </EmptyState>
  </Pad>
);

/* ── ACT 6 · account ── */
const Profile = () => (
  <Pad>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Account</Heading></div>
    <Sub>Your details and session.</Sub>
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="user" size={24} color="var(--accent-text)" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>Tendai M.</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }} className="lynia-tabular">★ 4.8 · 132 trips</div>
        </div>
        <StatusPill status="Verified" tone="online" dot />
      </div>
    </Card>
    <Card>
      <Button label="Bike & documents" variant="ghost" onClick={noop} />
      <Button label="Trip history" variant="ghost" onClick={noop} />
      <Button label="Earnings" variant="ghost" onClick={noop} />
    </Card>
    <Button label="Sign out" variant="ghost" onClick={noop} />
  </Pad>
);
function BikeDocs() {
  const Row = ({ icon, label, value, pill, pillTone }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
      <Icon name={icon} size={19} color="var(--accent-text)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{label}</div>
        {value ? <div style={{ fontSize: 12, color: "var(--muted)" }} className="lynia-tabular">{value}</div> : null}
      </div>
      {pill ? <StatusPill status={pill} tone={pillTone} /> : <Icon name="chevron-right" size={17} color="var(--muted)" />}
    </div>
  );
  return (
    <Pad>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Bike &amp; documents</Heading></div>
      <Sub>What we verified to let you ride.</Sub>
      <Card>
        <Row icon="id-card" label="National ID" value="631•••••••" pill="Verified" pillTone="online" />
        <Row icon="bike" label="Bike registration" value="ABZ 1234" pill="Verified" pillTone="online" />
        <Row icon="user" label="Rider photo" value="Added" />
      </Card>
      <Card style={{ background: "var(--surface)", border: "1px solid transparent", boxShadow: "none" }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>Your documents are checked by Didit and stored securely. To change your bike or re-verify, contact support.</div>
      </Card>
    </Pad>
  );
}
const RTRIPS = [
  { from: "Borrowdale", to: "Msasa", date: "2 Jul", fare: "4.00", status: "completed", rating: 5 },
  { from: "Avondale", to: "CBD", date: "2 Jul", fare: "3.00", status: "completed", rating: 5 },
  { from: "Mbare", to: "Waterfalls", date: "1 Jul", fare: "2.80", status: "not delivered", rating: 0 },
];
const History = () => (
  <Pad>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Your trips</Heading></div>
    <Sub>Every parcel you've delivered.</Sub>
    {RTRIPS.map((t, i) => (
      <Card key={i}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, paddingRight: 12, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{t.from} → {t.to}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }} className="lynia-tabular">{t.date} · Delivered{t.rating ? ` · ★ ${t.rating}` : ""}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">${t.fare}</div>
            <div style={{ height: 4 }} />
            <StatusPill status={t.status} tone={t.status === "not delivered" ? "offline" : "neutral"} />
          </div>
        </div>
      </Card>
    ))}
  </Pad>
);
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
          <div><div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Tendai M.</div><div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">+263 78 202 1180</div></div>
        </div>
        <Row icon="bike" label="Bike & documents" />
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
function Help() {
  const topics = [
    ["package", "A delivery problem", "Undeliverable, wrong code, damaged"],
    ["banknote", "Payments & fares", "How cash and pricing work"],
    ["id-card", "My account", "Verification, bike, safety"],
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

/* ── SYSTEM / EDGE ── */
/* Retrofit (plan §2, Cluster A shared requirement): "Contact support" is a real tel: call row, not dead text. */
const OnHold = () => (
  <Pad style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 4, fontFamily: "var(--font-sans)" }}>
    <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", marginBottom: 14 }}>
      <Icon name="triangle-alert" size={34} color="var(--accent-text)" />
    </div>
    <div style={{ fontSize: 19, fontWeight: 700, color: "var(--ink)" }}>Your account is on hold</div>
    <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--muted)", maxWidth: 230 }}>We've paused your rider account while we review recent cancellations. This usually takes 24 hours — call us if you think it's a mistake.</div>
    <div style={{ alignSelf: "stretch", marginTop: 18 }}>
      <CallRow label="Support" name="Lynia support" phone="+263 77 883 1938" />
      <Button label="Sign out" variant="ghost" onClick={noop} />
    </div>
  </Pad>
);
const ForceUpdate = () => <SystemState tone="green" brand title="Time to update" message="A new version of LyniaGo is ready with the latest fixes. Update to keep riding." primary="Update now" />;
const NoGps = () => <SystemState icon="wifi-off" title="Can't find your location" message="Turn on GPS so we can show parcels near you and navigate to pickups. You can't go online without it." primary="Open location settings" secondary="Not now" />;
const GenericError = () => <SystemState icon="circle-alert" title="Something went wrong" message="That didn't load. Check your connection and try again — your active job is safe." primary="Try again" secondary="Back to board" />;
function OfflineBoard() {
  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <OfflineBanner state="offline" />
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}><Board /></div>
    </div>
  );
}

/* Same DS AppScreen shell as every other screen — status bar + body geometry. */
const SHELL = DS.AppScreen || (({ children }) => children);
const S = (node, o = {}) => <SHELL tab={o.tab} bg={o.bg} dark={o.dark}>{node}</SHELL>;

window.RJ = {
  splash: () => S(<Splash />, { bg: "var(--accent)", dark: true }),
  onboard: () => S(<Onboard />),
  login: () => S(<Login />),
  otp: () => S(<Otp />),
  perm_loc: () => S(<PermLoc />),
  perm_notif: () => S(<PermNotif />),
  role_select: () => S(<RoleSelect />),
  kyc_intro: () => S(<KycIntro />),
  kyc_form: () => S(<KycForm />),
  kyc_pending: () => S(<KycPending />),
  kyc_verified: () => S(<KycVerified />),
  kyc_failed: () => S(<KycFailed />),
  kyc_expired: () => S(<KycExpired />),
  rider_offline: () => S(<RiderOffline />),
  online_empty: () => S(<OnlineEmpty />),
  board: () => S(<Board />),
  missed_order: () => S(<MissedOrder />),
  offer_compose: () => S(<OfferCompose />),
  offer_sent: () => S(<OfferSent />),
  picked: () => S(<Picked />),
  not_chosen: () => S(<NotChosen />),
  bid_expired: () => S(<BidExpired />),
  job_assigned: () => S(<JobAssigned />),
  job_pickup: () => S(<JobPickup />),
  job_verify: () => S(<JobVerify />),
  job_collect: () => S(<JobCollect />),
  job_dropoff: () => S(<JobDropoff />),
  job_handoff: () => S(<JobHandoff />),
  job_delivered: () => S(<JobDelivered />),
  handoff_wrong: () => S(<HandoffWrong />),
  undelivered: () => S(<Undelivered />),
  job_bail: () => S(<JobBail />),
  job_offline: () => S(<JobOffline />),
  job_cancelled: () => S(<JobCancelled />),
  earnings: () => S(<Earnings />),
  earnings_new: () => S(<EarningsNew />),
  profile: () => S(<Profile />),
  bike_docs: () => S(<BikeDocs />),
  history: () => S(<History />),
  settings: () => S(<Settings />),
  help: () => S(<Help />),
  offline: () => S(<OfflineBoard />),
  on_hold: () => S(<OnHold />),
  force_update: () => S(<ForceUpdate />, { bg: "var(--accent)", dark: true }),
  no_gps: () => S(<NoGps />),
  generic_error: () => S(<GenericError />),
};

})();
