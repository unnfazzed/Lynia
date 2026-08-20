/* file-scoped: Babel classic scripts share one global scope, so every declaration below is
   wrapped in an IIFE — only window.LJ / window.RJ leave this file. Without it, a later-loading
   sibling silently overwrites same-named screens (customer Profile vs rider Profile, etc.). */
(() => {
/* LyniaGo — RIDER journey: NEW screens from the UX-fix design-gap plan (§2).
   A1–A4 go-online gate states (one reason-keyed EmptyState template, matching gates.ts
   OnlineGateReason) · B1 SOS · B2 report+block · B3 get-help · E KYC ID-photo states.
   Same conventions as rider-screens.jsx (frozen state, real DS bundle). Extends window.RJ.
   Decisions (final, 5 Jul 2026): emergency 999 · Lynia safety line +263 77 883 1938 ·
   contact-support = tel: call. Designed to the shipped contracts in safety.ts / gates.ts. */

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

/* ── shared bits (same visual vocabulary as rider-screens.jsx) ── */
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

/* ── A1–A4 · go-online gate states — ONE template keyed on OnlineGateReason (gates.ts).
   The rider tapped "Go online" and the rules API refused: same dashboard, offline pill,
   an EmptyState whose icon/title/message/actions are props. Every dead end has a real exit. */
function GateState({ icon, title, message, children }) {
  return (
    <Pad>
      <RiderHead chip={<StatusPill status="Offline" tone="offline" dot />} />
      <EmptyState icon={icon} title={title} message={message}>{children}</EmptyState>
    </Pad>
  );
}
const GateOutOfArea = () => (
  <GateState icon="circle-alert" title="You're outside the service area" message="You can only go online inside the Harare service area for now. Head back toward the city, then refresh.">
    <Button label="Refresh status" onClick={noop} />
  </GateState>
);
const GateCooldown = () => (
  <GateState icon="clock" title="You're on a short cooldown" message="You were taken offline after a recent cancellation. Wait a few minutes, then try again.">
    <Button label="Try again" onClick={noop} />
  </GateState>
);
const GateBanned = () => (
  <GateState icon="triangle-alert" title="Your account is closed" message="This account can no longer go online. If you think this is a mistake, call support and we'll look into it with you.">
    <div style={{ marginBottom: 4 }}><CallRow label="Support" name="Lynia support" phone={SAFETY_LINE} /></div>
    <Button label="Sign out" variant="ghost" onClick={noop} />
  </GateState>
);
const GateKycLocked = () => (
  <GateState icon="triangle-alert" title="Verification locked" message="You've reached the limit for ID checks. Call support and we'll finish your verification together.">
    <div style={{ marginBottom: 4 }}><CallRow label="Support" name="Lynia support" phone={SAFETY_LINE} /></div>
    <Button label="Back" variant="ghost" onClick={noop} />
  </GateState>
);

/* ── B1 · SOS on the live job (same shared control + sheet as the customer map) ── */
function SosPill() {
  return (
    <button type="button" aria-label="Emergency — call for help" style={{ position: "absolute", top: 10, right: 10, zIndex: 6, minHeight: 44, minWidth: 64, padding: "0 16px", borderRadius: "var(--radius-pill)", border: "2px solid #fff", background: "var(--danger)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 800, letterSpacing: ".08em", boxShadow: "0 2px 8px rgba(20,24,27,.3)", cursor: "pointer" }}>SOS</button>
  );
}
function JobLive() {
  return (
    <Pad>
      <JobHead status="en_route_dropoff" />
      <Card>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $3.00</div>
        <div style={{ marginBottom: 10 }}><CallRow label="Recipient" name="Avenues contact" phone="+263 71 555 0090" /></div>
        <div style={{ position: "relative" }}>
          <K.FauxMap rider riderPos={0.72} pins={PINS} />
          <SosPill />
        </div>
        <div style={{ height: 12 }} />
        <Stepper events={ev("assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff")} currentStatus="en_route_dropoff" view="rider" />
      </Card>
    </Pad>
  );
}
function SosOverlay({ children }) {
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <div style={{ height: "100%", overflow: "hidden" }}><JobLive /></div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", zIndex: 8 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10, background: "var(--bg)", borderRadius: "22px 22px 0 0", boxShadow: "var(--shadow-sheet)", padding: "12px 16px 16px" }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--line)", margin: "0 auto 14px" }} />
        {children}
      </div>
    </div>
  );
}
const RSosConfirm = () => (
  <SosOverlay>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <span style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(192,57,43,0.12)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name="triangle-alert" size={20} color="var(--danger)" />
      </span>
      <div style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)" }}>Get emergency help?</div>
    </div>
    <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 14 }}>You'll see the emergency numbers straight away. Lynia's safety team is alerted with this job and your live location.</div>
    <button type="button" aria-label="Show emergency numbers" style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", minHeight: 56, padding: "14px 22px", borderRadius: "var(--radius-button)", border: "none", background: "var(--danger)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600, cursor: "pointer", boxSizing: "border-box" }}>Show emergency numbers</button>
    <Button label="Cancel" variant="ghost" onClick={noop} />
  </SosOverlay>
);
const RSosContacts = () => (
  <SosOverlay>
    <div style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)", marginBottom: 12 }}>Emergency — call for help</div>
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
    <CallRow label="Lynia safety line" name="Talk to our safety team" phone={SAFETY_LINE} />
    <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-input)", background: "var(--accent-wash)", marginTop: 10 }}>
      <Icon name="check" size={16} color="var(--accent-text)" style={{ marginTop: 1 }} />
      <span style={{ fontSize: 12.5, color: "var(--accent-text)", fontWeight: 600, lineHeight: 1.5 }}>Lynia's safety team has been alerted with your job details and location.</span>
    </div>
    <Button label="Close" variant="ghost" onClick={noop} />
  </SosOverlay>
);

/* ── B2 · report + optional block (post-job) ── */
function PickRow({ icon, label, on }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 11px", borderRadius: "var(--radius-input)", background: on ? "var(--accent-wash)" : "var(--surface)", boxSizing: "border-box" }}>
      <Icon name={on ? "check" : icon} size={15} color={on ? "var(--accent-text)" : "var(--muted)"} />
      <span style={{ fontSize: 13, fontWeight: 600, color: on ? "var(--accent-text)" : "var(--ink)" }}>{label}</span>
    </div>
  );
}
const RReport = () => (
  <Pad>
    <Top title="Report a problem" />
    <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }} className="lynia-tabular">Job Avondale → CBD · Eastgate contact · 4 Jul</div>
    <Label>What happened?</Label>
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4, marginBottom: 4 }}>
      <PickRow icon="user" label="Threatening or unsafe behaviour" on />
      <PickRow icon="banknote" label="Cash problem at hand-off" />
      <PickRow icon="circle-alert" label="False 'not delivered' claim" />
      <PickRow icon="inbox" label="Something else" />
    </div>
    <Field label="Details (optional)" value="" onChange={noop} placeholder="Anything that helps us review this" />
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 12px", borderRadius: "var(--radius-input)", background: "var(--accent-wash)", margin: "10px 0 2px" }}>
      <span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
        <Icon name="check" size={14} color="#fff" />
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>Also block this customer</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--muted)", lineHeight: 1.4, marginTop: 1 }}>Their future requests won't reach your board.</span>
      </span>
    </div>
    <Button label="Send report" onClick={noop} />
  </Pad>
);
const RReportDone = () => (
  <Pad>
    <Top title="Report a problem" />
    <EmptyState icon="check" title="Report sent" message="Thank you — the team reviews every report. The customer won't see who reported them, and their requests won't reach your board again.">
      <Button label="Back to board" onClick={noop} />
    </EmptyState>
  </Pad>
);

/* ── B3 · get help with this job (order-level, distinct from account Help) ── */
const JobHelp = () => (
  <Pad>
    <Top title="Get help with this job" />
    <Card style={{ background: "var(--surface)", border: "1px solid transparent", boxShadow: "none" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">Job 8f3a91c2</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }} className="lynia-tabular">Avondale → CBD · 1× Small package · $3.00</div>
    </Card>
    <Label>What went wrong?</Label>
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4, marginBottom: 4 }}>
      <PickRow icon="phone" label="Customer unreachable" on />
      <PickRow icon="banknote" label="Cash dispute" />
      <PickRow icon="map-pin" label="Wrong address given" />
      <PickRow icon="package" label="Parcel problem" />
      <PickRow icon="circle-alert" label="Something else" />
    </div>
    <Field label="Tell us more" value="" onChange={noop} placeholder="What happened, and what would put it right?" />
    <Button label="Send to Lynia" onClick={noop} />
    <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 4, lineHeight: 1.4 }}>Logged against this job — for general questions, use Help.</div>
  </Pad>
);
const JobHelpSent = () => (
  <Pad>
    <Top title="Get help with this job" />
    <Card accent>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name="check" size={22} color="#fff" />
        </span>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>We've got it</div>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>Your issue is logged against job 8f3a91c2. The team replies on WhatsApp — usually within a few hours.</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-input)", background: "var(--bg)" }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ink)" }} className="lynia-tabular">Issue #b83c04 · Customer unreachable</span>
        <StatusPill status="open" />
      </div>
    </Card>
    <Button label="Back to job" variant="ghost" onClick={noop} />
  </Pad>
);

/* ── E · KYC ID-photo states (extends the KycForm "Photo added — retake" row) ── */
const PhotoCapture = () => (
  <div style={{ height: "100%", background: "var(--ink)", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)", boxSizing: "border-box" }}>
    {/* N-02: the close was a bare 20px glyph — no role, no label, no hit area, and absent from both
        the hierarchy and accessibility notes — while the shutter beside it is a fully specified 68px
        button. It is the ONLY exit from a full-bleed dark camera, so it is now a real control at the
        --target-min floor DESIGN.md requires. (D2 settled the precedence: the 2026-08-10 "mock wins" rule
        stops the APP silently resizing a mock; it was never licence for the kit to draw an unusable
        target. A mock below the floor is a kit defect, not a size to reproduce.)
        The box is centred on the same 20px glyph, so the drawn mark is unchanged — only the touch
        area around it grew, and the negative margin keeps the row's optical alignment. */}
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "34px 16px 10px" }}>
      <button
        type="button"
        aria-label="Close"
        style={{ width: "var(--target-min)", height: "var(--target-min)", marginLeft: -12, display: "grid", placeItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer" }}
      >
        <Icon name="x" size={20} color="#fff" />
      </button>
      <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Rider photo</span>
    </div>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 22px" }}>
      {/* D3: this step is the RIDER PORTRAIT, not the ID document — the Didit SDK photographs the
          document itself, so our capture exists for the admin reviewer who approves the rider (and
          for KYC_MODE=manual, the fallback when the vendor is down; reviewing blind is worse than one
          extra photo). Portrait oval, not an ID-card rectangle, and face-framing rules instead of
          document-readability ones: "all four corners in" describes a card, not a person. */}
      <div style={{ width: "72%", aspectRatio: "0.78 / 1", borderRadius: "50%", border: "2.5px dashed rgba(255,255,255,.75)", display: "grid", placeItems: "center", boxSizing: "border-box" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.8)", textAlign: "center", maxWidth: 170, lineHeight: 1.5 }}>Put your face inside the oval</span>
      </div>
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)", textAlign: "center", maxWidth: 240, lineHeight: 1.5 }}>Face the light · no hat or sunglasses · look straight ahead</div>
    </div>
    <div style={{ display: "flex", justifyContent: "center", padding: "18px 0 34px" }}>
      <button type="button" aria-label="Take photo" style={{ width: 68, height: 68, borderRadius: "50%", background: "#fff", border: "5px solid rgba(255,255,255,.35)", cursor: "pointer" }} />
    </div>
  </div>
);
const PhotoPreview = () => (
  <Pad>
    <Top title="Check your photo" />
    {/* D3, same re-scope as PhotoCapture above: this is the RIDER PORTRAIT, so the self-check is about
        the face being usable to a reviewer, not about a document being legible. "Can you read
        everything?" and "check the names, ID number" were asking about a card that is no longer what
        this step captures — a rider following them would go looking for their ID. */}
    <div style={{ height: 200, borderRadius: "var(--radius-input)", border: "1px solid var(--line)", background: "repeating-linear-gradient(45deg, #eef1f3 0 10px, #e6eaec 10px 20px)", display: "grid", placeItems: "center", marginBottom: 12 }}>
      <span style={{ fontFamily: "monospace", fontSize: 11.5, color: "var(--muted)", background: "var(--bg)", padding: "3px 8px", borderRadius: 6 }}>Rider photo preview</span>
    </div>
    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 2 }}>Is your face clear?</div>
    <Sub>Check your whole face is in frame and sharp — blur or shadow is the top reason a photo has to be retaken.</Sub>
    <Button label="Use this photo" onClick={noop} />
    <Button label="Retake" variant="ghost" onClick={noop} />
    <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 4, lineHeight: 1.4 }}>Retaking keeps your current photo until the new one is saved.</div>
  </Pad>
);
const PhotoUploading = () => (
  <Pad>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Become a rider</Heading></div>
    <Sub>Verify your ID and register your bike to start accepting deliveries.</Sub>
    <Card>
      <Field label="Bike registration" value="ABZ 1234" onChange={noop} />
      <Label>Your photo</Label>
      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: 12, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Icon name="id-card" size={18} color="var(--accent-text)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Uploading photo…</span>
          <span style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">60%</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: "var(--surface)", overflow: "hidden" }}>
          <div style={{ width: "60%", height: "100%", background: "var(--accent)" }} />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.4 }}>Keep filling in the form — this finishes in the background.</div>
      </div>
    </Card>
    <Button label="Submit for verification" disabled onClick={noop} />
  </Pad>
);
const PhotoFailed = () => (
  <Pad>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Heading style={{ marginBottom: 0 }}>Become a rider</Heading></div>
    <Sub>Verify your ID and register your bike to start accepting deliveries.</Sub>
    <Card>
      <Field label="Bike registration" value="ABZ 1234" onChange={noop} />
      <Label>Your photo</Label>
      <div style={{ border: "1.5px solid var(--danger)", borderRadius: "var(--radius-input)", padding: 12, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Icon name="circle-alert" size={16} color="var(--danger)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--danger)" }}>Upload failed</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 4 }}>That photo didn't reach us — usually a connection drop. Your last saved photo is untouched.</div>
        <Button label="Try again" onClick={noop} />
        <Button label="Keep my current photo" variant="ghost" onClick={noop} />
      </div>
    </Card>
    <div style={{ display: "flex", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-input)", background: "var(--surface)" }}>
      <Icon name="check" size={15} color="var(--accent-text)" style={{ marginTop: 1 }} />
      <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>A retake never removes your saved photo — it's only replaced once the new one uploads.</span>
    </div>
  </Pad>
);

/* Same DS AppScreen shell as every other screen — status bar + body geometry. */
const SHELL = DS.AppScreen || (({ children }) => children);
const S = (node) => <SHELL>{node}</SHELL>;

Object.assign(window.RJ, {
  gate_out_of_area: () => S(<GateOutOfArea />),
  gate_cooldown: () => S(<GateCooldown />),
  gate_banned: () => S(<GateBanned />),
  gate_kyc_locked: () => S(<GateKycLocked />),
  sos_idle: () => S(<JobLive />),
  sos_confirm: () => S(<RSosConfirm />),
  sos_contacts: () => S(<RSosContacts />),
  report: () => S(<RReport />),
  report_done: () => S(<RReportDone />),
  job_help: () => S(<JobHelp />),
  job_help_sent: () => S(<JobHelpSent />),
  photo_capture: () => S(<PhotoCapture />),
  photo_preview: () => S(<PhotoPreview />),
  photo_uploading: () => S(<PhotoUploading />),
  photo_failed: () => S(<PhotoFailed />),
});

})();
