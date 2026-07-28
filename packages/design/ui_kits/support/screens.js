/* LyniaGo support / onboarding / edge screens. */
const S = window.LyniaSupport;
const { Dove, Wordmark, Phone, Pad, Top, SystemState } = S;
const { Button, Card, Field, StatusPill, EmptyState, Icon } = S.D;

/* ── 1. Onboarding carousel (first run) ── */
function Onboarding() {
  const [i, setI] = React.useState(0);
  const slides = [
    { icon: "utensils", t: "Food from kitchens near you", m: "Order from restaurants in your corridor — you see the arrival window before you pay." },
    { icon: "banknote", t: "Name your price to send", m: "Say what you'll pay to send a parcel. Riders bid for it — no fixed tariff, no haggling in the street." },
    { icon: "check", t: "One app, one code", m: "Same riders, same delivery code at the door, cash if that's how you pay. More services soon." },
  ];
  const s = slides[i];
  return (
    <Pad style={{ display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Dove size={24} on="white" /><Wordmark size={17} /></span>
        <button onClick={() => setI(2)} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }}>Skip</button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 6 }}>
        <div style={{ width: 120, height: 120, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", marginBottom: 18 }}>
          <Icon name={s.icon} size={52} color="var(--accent-text)" />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", fontFamily: "var(--font-sans)" }}>{s.t}</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--muted)", maxWidth: 240, fontFamily: "var(--font-sans)" }}>{s.m}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 7, marginBottom: 16 }}>
        {slides.map((_, n) => <span key={n} style={{ width: n === i ? 22 : 7, height: 7, borderRadius: 999, background: n === i ? "var(--accent)" : "var(--line)", transition: "width .2s" }} />)}
      </div>
      <Button label={i < 2 ? "Next" : "Get started"} onClick={() => setI((v) => Math.min(2, v + 1))} />
    </Pad>
  );
}

/* ── 2 & 3. Permission priming ── */
function PermissionLocation() {
  return <SystemState icon="navigation" title="Turn on location" message="LyniaGo uses your location to set your pickup pin and match you with the closest riders. We only use it while you're arranging a delivery." primary="Allow location" secondary="Enter address manually" />;
}
function PermissionNotifications() {
  return <SystemState icon="phone" title="Stay in the loop" message="Get notified the moment a rider offers, when they're arriving, and when your parcel is delivered. You can change this anytime in Settings." primary="Turn on notifications" secondary="Not now" />;
}

/* ── 4. Notifications centre ── */
function Notifications({ empty }) {
  const items = [
    { icon: "bike", t: "Tendai M. is on the way", m: "Arriving at pickup in about 6 min.", w: "now", unread: true },
    { icon: "banknote", t: "New offer — $3.20", m: "Kudzai N. offered on your CBD → Avenues order.", w: "2 min", unread: true },
    { icon: "check", t: "Delivered", m: "Order 8f3a91c2 was delivered. Rate your rider.", w: "1 hr" },
    { icon: "id-card", t: "You're verified", m: "Your rider account is approved — you can go online.", w: "Yesterday" },
  ];
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Notifications" /></Pad>
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
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-sans)" }}>{n.t}</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, fontFamily: "var(--font-sans)" }}>{n.m}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontFamily: "var(--font-sans)" }}>{n.w}</div>
              </div>
              {n.unread ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: 6 }} /> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 5. Help / support ── */
function Help() {
  const topics = [
    ["package", "A delivery problem", "Late, damaged or wrong drop-off"],
    ["banknote", "Payments & fares", "How pricing and cash work"],
    ["id-card", "My account", "Verification, phone number, safety"],
    ["bike", "Becoming a rider", "Requirements and onboarding"],
  ];
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Help" /></Pad>
      <Pad style={{ paddingTop: 4 }}>
        <Field placeholder="Search help…" value="" onChange={() => {}} />
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "6px 0 8px", fontFamily: "var(--font-sans)" }}>Browse topics</div>
        {topics.map(([ic, t, m]) => (
          <Card key={t} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <Icon name={ic} size={20} color="var(--accent-text)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-sans)" }}>{t}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-sans)" }}>{m}</div>
              </div>
              <Icon name="chevron-right" size={18} color="var(--muted)" />
            </div>
          </Card>
        ))}
        <Card style={{ background: "var(--accent-wash)", border: "1px solid transparent", boxShadow: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Icon name="phone" size={20} color="var(--accent-text)" />
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-sans)" }}>Chat with us on WhatsApp</div>
            <Icon name="chevron-right" size={18} color="var(--accent-text)" />
          </div>
        </Card>
      </Pad>
    </div>
  );
}

/* ── 6. Settings ── */
function Settings() {
  const Row = ({ icon, label, value, danger }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
      <Icon name={icon} size={19} color={danger ? "var(--danger)" : "var(--accent-text)"} />
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: danger ? "var(--danger)" : "var(--ink)", fontFamily: "var(--font-sans)" }}>{label}</span>
      {value ? <span style={{ fontSize: 13, color: "var(--muted)", fontFamily: "var(--font-sans)" }}>{value}</span> : null}
      {!danger ? <Icon name="chevron-right" size={17} color="var(--muted)" /> : null}
    </div>
  );
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Settings" /></Pad>
      <Pad style={{ paddingTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><Icon name="user" size={24} color="var(--accent-text)" /></div>
          <div><div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", fontFamily: "var(--font-sans)" }}>Chipo M.</div><div style={{ fontSize: 13, color: "var(--muted)", fontFamily: "var(--font-sans)" }} className="lynia-tabular">+263 77 000 0000</div></div>
        </div>
        <Row icon="user" label="Edit profile" />
        <Row icon="phone" label="Notifications" value="On" />
        <Row icon="map-pin" label="Language" value="English" />
        <Row icon="id-card" label="Privacy & safety" />
        <Row icon="banknote" label="Payment" value="Cash" />
        <div style={{ height: 10 }} />
        <Row icon="x" label="Sign out" danger />
        <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 14, fontFamily: "var(--font-sans)" }}>LyniaGo v1.0.0</div>
      </Pad>
    </div>
  );
}

/* ── Edge / system states ── */
const Suspended = () => <SystemState icon="triangle-alert" title="Your account is on hold" message="We've paused your account while we review recent activity. This usually takes 24 hours — reach out if you think it's a mistake." primary="Contact support" secondary="Sign out" />;
const ForceUpdate = () => <SystemState tone="green" brand title="Time to update" message="A new version of LyniaGo is ready with the latest fixes. Update to keep sending and delivering." primary="Update now" />;
const NoGps = () => <SystemState icon="wifi-off" title="Can't find your location" message="Turn on GPS / location so we can set your pickup and match nearby riders. Or enter your pickup address by hand." primary="Open location settings" secondary="Enter address manually" />;
const GenericError = () => <SystemState icon="circle-alert" title="Something went wrong" message="That didn't load. Check your connection and try again — your order is safe." primary="Try again" secondary="Back home" />;

/* ── Gallery ── */
const SCREENS = [
  ["Onboarding · carousel", <Onboarding />, "var(--bg)"],
  ["Permission · location", <PermissionLocation />, "var(--bg)"],
  ["Permission · notifications", <PermissionNotifications />, "var(--bg)"],
  ["Notifications centre", <Notifications />, "var(--bg)"],
  ["Notifications · empty", <Notifications empty />, "var(--bg)"],
  ["Help & support", <Help />, "var(--bg)"],
  ["Settings", <Settings />, "var(--bg)"],
  ["Edge · account on hold", <Suspended />, "var(--bg)"],
  ["Edge · force update", <ForceUpdate />, "var(--accent)"],
  ["Edge · location off", <NoGps />, "var(--bg)"],
  ["Edge · generic error", <GenericError />, "var(--bg)"],
];

function Gallery() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 28, justifyContent: "center", alignItems: "flex-start", padding: 28 }}>
      {SCREENS.map(([label, el, bg]) => <Phone key={label} label={label} bg={bg}>{el}</Phone>)}
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<Gallery />);
