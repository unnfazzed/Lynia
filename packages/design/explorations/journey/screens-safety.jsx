/* file-scoped: Babel classic scripts share one global scope, so every declaration below is
   wrapped in an IIFE — only window.LJ / window.RJ leave this file. Without it, a later-loading
   sibling silently overwrites same-named screens (customer Profile vs rider Profile, etc.). */
(() => {
/* LyniaGo — customer journey: NEW screens from the UX-fix design-gap plan (§2).
   B1 SOS · B2 report+block · B3 get-help · C OTP-resend states · D rider-went-dark escalation.
   Same conventions as screens.jsx (frozen state, real DS bundle). Extends window.LJ.
   Decisions (final, 5 Jul 2026): emergency number 999 · Lynia safety line +263 77 883 1938 ·
   contact-support actions are tel: calls. Designed to the shipped contracts in
   apps/mobile/src/api/safety.ts (raiseSos / reportUser / raiseIssue). */

const DS = window.LyniaDesignSystem_94c56a;
const K = window.LyniaKit;
const SUP = window.LyniaSupport;
const { Button, Card, Field, StatusPill, Stepper, EmptyState, Heading, Sub, Label, Icon } = DS;
const { Pad, Top } = SUP;

const noop = () => {};
const T0 = "2026-07-04T09:00:00.000Z";
const ev = (...st) => st.map((s) => ({ status: s, createdAt: T0 }));
const PINS = { a: { x: 26, y: 30 }, b: { x: 76, y: 70 } };
const SAFETY_LINE = "+263 77 883 1938";

/* ── shared bits (same visual vocabulary as screens.jsx) ── */
function OrderHead({ status, tone }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
      <div style={{ flex: 1 }} />
      <StatusPill status={status} tone={tone} />
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
/* B1 · the idle SOS control — pinned over the live map, ≥44px, deliberate (opens confirm, never dials). */
function SosPill() {
  return (
    <button type="button" aria-label="Emergency — call for help" style={{ position: "absolute", top: 10, right: 10, zIndex: 6, minHeight: 44, minWidth: 64, padding: "0 16px", borderRadius: "var(--radius-pill)", border: "2px solid #fff", background: "var(--danger)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 800, letterSpacing: ".08em", boxShadow: "0 2px 8px rgba(20,24,27,.3)", cursor: "pointer" }}>SOS</button>
  );
}
/* B1 · the single dominant element on the contacts sheet — a panicked one-handed user hits this. */
function EmergencyRow() {
  return (
    <button type="button" aria-label="Emergency — call for help" style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", minHeight: 76, padding: "14px 16px", marginBottom: 8, borderRadius: "var(--radius-card)", border: "none", background: "var(--danger)", color: "#fff", fontFamily: "var(--font-sans)", cursor: "pointer", boxSizing: "border-box", textAlign: "left" }}>
      <span style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name="phone" size={24} color="#fff" />
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, opacity: 0.92 }}>Call emergency</span>
        <span style={{ display: "block", fontSize: 30, fontWeight: 700, letterSpacing: 3 }} className="lynia-tabular">999</span>
      </span>
      <Icon name="arrow-right" size={20} color="#fff" />
    </button>
  );
}
/* Live-trip background the SOS sheets sit over. */
function TrackLive({ paused }) {
  return (
    <Pad>
      <OrderHead status="en_route_dropoff" />
      <Card>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $2.50 · Tendai M.</div>
        <div style={{ marginBottom: 10 }}><CallRow label="Your rider" name="Tendai M." phone="+263 78 202 1180" /></div>
        <div style={{ position: "relative" }}>
          <K.FauxMap rider riderPos={0.66} paused={paused} pins={PINS} />
          <SosPill />
        </div>
        <div style={{ height: 12 }} />
        <Stepper events={ev("assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff")} currentStatus="en_route_dropoff" view="customer" />
      </Card>
    </Pad>
  );
}
function SosOverlay({ children }) {
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <div style={{ height: "100%", overflow: "hidden" }}><TrackLive /></div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", zIndex: 8 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10, background: "var(--bg)", borderRadius: "22px 22px 0 0", boxShadow: "var(--shadow-sheet)", padding: "12px 16px 16px" }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--line)", margin: "0 auto 14px" }} />
        {children}
      </div>
    </div>
  );
}

/* ── B1·1 idle · B1·2 confirm · B1·3 contacts · B1·4 error ── */
const SosIdle = () => <TrackLive />;
const SosConfirm = () => (
  <SosOverlay>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <span style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(192,57,43,0.12)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name="triangle-alert" size={20} color="var(--danger)" />
      </span>
      <div style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)" }}>Get emergency help?</div>
    </div>
    <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 14 }}>You'll see the emergency numbers straight away. Lynia's safety team is alerted with your trip and live location.</div>
    <button type="button" aria-label="Show emergency numbers" style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", minHeight: 56, padding: "14px 22px", borderRadius: "var(--radius-button)", border: "none", background: "var(--danger)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600, cursor: "pointer", boxSizing: "border-box" }}>Show emergency numbers</button>
    <Button label="Cancel" variant="ghost" onClick={noop} />
  </SosOverlay>
);
function SosContacts({ failed }) {
  return (
    <SosOverlay>
      <div style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)", marginBottom: 12 }}>Emergency — call for help</div>
      <EmergencyRow />
      <CallRow label="Lynia safety line" name="Talk to our safety team" phone={SAFETY_LINE} />
      {failed ? (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-input)", background: "var(--surface)", marginTop: 10 }}>
          <Icon name="wifi-off" size={16} color="var(--muted)" style={{ marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.5 }}><b style={{ fontWeight: 700 }}>No connection — we couldn't alert Lynia's safety team.</b> These numbers still work: phone calls don't need data.</span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-input)", background: "var(--accent-wash)", marginTop: 10 }}>
          <Icon name="check" size={16} color="var(--accent-text)" style={{ marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: "var(--accent-text)", fontWeight: 600, lineHeight: 1.5 }}>Lynia's safety team has been alerted with your trip details and location.</span>
        </div>
      )}
      <Button label="Close" variant="ghost" onClick={noop} />
    </SosOverlay>
  );
}

/* ── B2 · report + optional block (post-trip) ── */
function PickRow({ icon, label, on }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 11px", borderRadius: "var(--radius-input)", background: on ? "var(--accent-wash)" : "var(--surface)", boxSizing: "border-box" }}>
      <Icon name={on ? "check" : icon} size={15} color={on ? "var(--accent-text)" : "var(--muted)"} />
      <span style={{ fontSize: 13, fontWeight: 600, color: on ? "var(--accent-text)" : "var(--ink)" }}>{label}</span>
    </div>
  );
}
function BlockToggle({ label, sub, on }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 12px", borderRadius: "var(--radius-input)", background: on ? "var(--accent-wash)" : "var(--surface)", margin: "10px 0 2px" }}>
      <span style={{ width: 22, height: 22, borderRadius: 6, background: on ? "var(--accent)" : "var(--bg)", border: on ? "none" : "1.5px solid var(--line)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
        {on ? <Icon name="check" size={14} color="#fff" /> : null}
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{label}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--muted)", lineHeight: 1.4, marginTop: 1 }}>{sub}</span>
      </span>
    </div>
  );
}
const Report = () => (
  <Pad>
    <Top title="Report a problem" />
    <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }} className="lynia-tabular">Trip with Tendai M. · Order 8f3a91c2 · 4 Jul</div>
    <Label>What happened?</Label>
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4, marginBottom: 4 }}>
      <PickRow icon="bike" label="Unsafe riding" />
      <PickRow icon="user" label="Rude or threatening behaviour" on />
      <PickRow icon="banknote" label="Asked for more money than agreed" />
      <PickRow icon="circle-alert" label="Something else" />
    </div>
    <Field label="Details (optional)" value="" onChange={noop} placeholder="Anything that helps us review this" />
    <BlockToggle on label="Also block Tendai M." sub="You won't see or be matched with them again." />
    <Button label="Send report" onClick={noop} />
  </Pad>
);
const ReportDone = () => (
  <Pad>
    <Top title="Report a problem" />
    <EmptyState icon="check" title="Report sent" message="Thank you — our team reviews every report. Tendai won't see who reported them, and you won't be matched together again.">
      <Button label="Done" onClick={noop} />
    </EmptyState>
  </Pad>
);

/* ── B3 · get help with this trip (order-level, distinct from account Help) ── */
const TripHelp = () => (
  <Pad>
    <Top title="Get help with this trip" />
    <Card style={{ background: "var(--surface)", border: "1px solid transparent", boxShadow: "none" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">Order 8f3a91c2</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }} className="lynia-tabular">Eastgate Mall → 14 Glenara Ave · Tendai M. · $2.50</div>
    </Card>
    <Label>What went wrong?</Label>
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4, marginBottom: 4 }}>
      <PickRow icon="package" label="Parcel damaged" on />
      <PickRow icon="inbox" label="Item missing" />
      <PickRow icon="banknote" label="Paid more than agreed" />
      <PickRow icon="user" label="Rider behaviour" />
      <PickRow icon="circle-alert" label="Something else" />
    </div>
    <Field label="Tell us more" value="" onChange={noop} placeholder="What happened, and what would put it right?" />
    <Button label="Send to Lynia" onClick={noop} />
    <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 4, lineHeight: 1.4 }}>Logged against this order — for general questions, use Help.</div>
  </Pad>
);
const TripHelpSent = () => (
  <Pad>
    <Top title="Get help with this trip" />
    <Card accent>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name="check" size={22} color="#fff" />
        </span>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>We've got it</div>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>Your issue is logged against order 8f3a91c2. The team replies on WhatsApp — usually within a few hours.</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-input)", background: "var(--bg)" }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ink)" }} className="lynia-tabular">Issue #a41f92 · Parcel damaged</span>
        <StatusPill status="open" />
      </div>
    </Card>
    <Button label="Back to order" variant="ghost" onClick={noop} />
  </Pad>
);

/* ── C · OTP resend states (extend the "Check your WhatsApp" screen; idle is retrofitted in screens.jsx) ── */
function OtpState({ variant }) {
  const cooldown = variant === "cooldown", resent = variant === "resent", locked = variant === "locked";
  return (
    <Pad>
      <Heading>Check your WhatsApp</Heading>
      <Sub>We sent a 6-digit code to +263 77 245 1180 on WhatsApp.</Sub>
      {resent ? (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", background: "var(--accent-wash)", borderRadius: "var(--radius-input)", marginBottom: 12, color: "var(--accent-text)", fontSize: 13, fontWeight: 600 }}>
          <Icon name="check" size={16} color="var(--accent-text)" /> A fresh code is on its way — check WhatsApp.
        </div>
      ) : null}
      {locked ? (
        <Field label="6-digit code" value="418207" onChange={noop} inputMode="numeric" error="That code has expired." />
      ) : (
        <Field label="6-digit code" value="" onChange={noop} inputMode="numeric" placeholder="000000" />
      )}
      {locked ? (
        <Card style={{ background: "var(--surface)", border: "1px solid transparent", boxShadow: "none" }}>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Codes last 10 minutes, and 5 wrong tries locks one. Send a fresh code — it resets your attempts too.</div>
        </Card>
      ) : null}
      {locked ? <Button label="Send a fresh code" onClick={noop} /> : <Button label="Verify" onClick={noop} />}
      {cooldown || resent ? (
        <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, fontSize: 13.5, fontWeight: 600, color: "var(--muted)" }}>
          <Icon name="clock" size={15} color="var(--muted)" /> Resend {resent ? "again " : ""}in <span className="lynia-tabular">{resent ? "0:58" : "0:42"}</span>
        </div>
      ) : null}
      <Button label="Back" variant="ghost" onClick={noop} />
    </Pad>
  );
}

/* ── D · rider-went-dark escalation (track_paused after ~2 min stale) ── */
const TrackDark = () => (
  <Pad>
    <OrderHead status="en_route_dropoff" tone="reconnecting" />
    <Card style={{ background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", boxShadow: "none" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <Icon name="triangle-alert" size={16} color="var(--highlight-ink)" style={{ marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: "var(--highlight-ink)", lineHeight: 1.5 }}><b style={{ fontWeight: 700 }}>Your rider's been quiet for 2 minutes.</b> The live position hasn't updated — it's usually just signal. Give Tendai a call to check in.</div>
      </div>
    </Card>
    <Button label="Call Tendai M." onClick={noop} />
    <Card>
      <div style={{ position: "relative" }}>
        <K.FauxMap rider riderPos={0.66} paused pins={PINS} />
        <SosPill />
      </div>
      <div style={{ height: 12 }} />
      <Stepper events={ev("assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff")} currentStatus="en_route_dropoff" view="customer" />
    </Card>
  </Pad>
);

/* Same DS AppScreen shell as every other screen — status bar + body geometry. */
const SHELL = DS.AppScreen || (({ children }) => children);
const S = (node) => <SHELL>{node}</SHELL>;

Object.assign(window.LJ, {
  sos_idle: () => S(<SosIdle />),
  sos_confirm: () => S(<SosConfirm />),
  sos_contacts: () => S(<SosContacts />),
  sos_error: () => S(<SosContacts failed />),
  report: () => S(<Report />),
  report_done: () => S(<ReportDone />),
  trip_help: () => S(<TripHelp />),
  trip_help_sent: () => S(<TripHelpSent />),
  otp_cooldown: () => S(<OtpState variant="cooldown" />),
  otp_resent: () => S(<OtpState variant="resent" />),
  otp_locked: () => S(<OtpState variant="locked" />),
  track_dark: () => S(<TrackDark />),
});

})();
