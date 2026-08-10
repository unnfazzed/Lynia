/* file-scoped: Babel classic scripts share one global scope, so every declaration below is
   wrapped in an IIFE — only window.RJM leaves this file. */
(() => {
/* LyniaGo — rider journey: SHIPPED-STATES alignment wave (2026-08, SH·). Board copy honest under
   the food-dispatch feature flag (ON promises one queue; OFF never promises food), the strike
   counter surface, and the proof-of-pickup photo loop on the active parcel job.
   Same conventions as rider-one-app.jsx (frozen state, real DS bundle). Extends window.RJM.
   Sheet + logic notes: ui_kits/mobile/shipped-states.html. */

const DS = window.LyniaDesignSystem_94c56a;
const { Button, Card, StatusPill, EmptyState, Icon, Stepper } = DS;
const SUP = window.LyniaSupport;
const { Top } = SUP;
const Money = DS.Money || (({ v, size = 14, weight = 700, color = "var(--ink)" }) => <span style={{ fontSize: size, fontWeight: weight, color }}>${v}</span>);
const SHELL = DS.AppScreen || (({ children }) => <div style={{ height: "100%", overflow: "hidden" }}>{children}</div>);
const AppBar = DS.AppBar || (({ title }) => <div style={{ padding: "8px 16px", fontSize: 16, fontWeight: 700 }}>{title}</div>);
const nop = () => {};
const TAB = { fontVariantNumeric: "tabular-nums" };
const TABS = [
  { id: "jobs", icon: "bike", label: "Jobs" },
  { id: "money", icon: "wallet", label: "Money" },
  { id: "acct", icon: "user", label: "Account" },
];
const S = (node, o = {}) => <SHELL tab={o.tab} tabs={TABS} footer={o.footer} bg={o.bg} dark={o.dark}>{node}</SHELL>;
const Pad = ({ children, style }) => <div style={{ padding: "10px 16px 16px", ...style }}>{children}</div>;

/* Same card anatomy as the one-app board (rider-one-app.jsx). */
function JobCard({ from, to, km, fare, note, action }) {
  return (
    <Card style={{ padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--accent-wash)", color: "var(--accent-text)", borderRadius: 999, padding: "2px 8px", fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em" }}>
          <Icon name="package" size={11} color="var(--accent-text)" />PARCEL
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>{km} km</span>
        <Money v={fare} size={16} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", border: "2px solid var(--accent)", boxSizing: "border-box" }} />
          <span style={{ width: 2, flex: 1, minHeight: 14, background: "var(--line)" }} />
          <span style={{ width: 9, height: 9, borderRadius: 2, border: "2px solid var(--danger)", boxSizing: "border-box" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{from}</div>
          <div style={{ height: 8 }} />
          <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{to}</div>
        </div>
      </div>
      {note ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.4 }}>{note}</div> : null}
      <Button label={action} onClick={nop} />
    </Card>
  );
}
const PARCEL_JOBS = [
  { from: "Eastgate Mall, CBD", to: "14 Glenara Ave, Avenues", km: "3.1", fare: "3.00", note: "Documents envelope · asking $3.00", action: "Make an offer" },
  { from: "Avondale Shops", to: "8 Fife Ave, Avenues", km: "1.8", fare: "2.20", note: "Small box · asking $2.20", action: "Make an offer" },
];

/* ── SH8 · The board when food dispatch is OFF — the copy never promises a queue food can't join ── */
const OnlinePillOff = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 8px" }}>
    <StatusPill status="online" />
    <span style={{ fontSize: 12, color: "var(--muted)" }}>Parcels near you</span>
    <span style={{ flex: 1 }} />
    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)" }}>Go offline</span>
  </div>
);
const board_food_off = () => S(
  <div>
    <AppBar title="Jobs near you" back={false} right={<Icon name="bell" size={19} color="var(--ink)" />} />
    <OnlinePillOff />
    <Pad style={{ paddingTop: 0 }}>
      {PARCEL_JOBS.map((j, i) => <JobCard key={i} {...j} />)}
      <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: 10, background: "var(--surface)" }}>
        <Icon name="utensils" size={15} color="var(--muted)" />
        <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>Food deliveries aren't on in your area yet. When kitchens join, those jobs land in this same list — nothing to set up.</span>
      </div>
    </Pad>
  </div>, { tab: "jobs" });
const board_empty_food_off = () => S(
  <div>
    <AppBar title="Jobs near you" back={false} />
    <OnlinePillOff />
    <Pad style={{ paddingTop: 4 }}>
      <Card style={{ padding: 16 }}>
        <EmptyState icon="inbox" title="Nothing in range yet" message="You'll see parcels here the moment they're posted near you. Jobs that get taken simply leave the list.">
          <Button label="Refresh" variant="ghost" onClick={nop} />
        </EmptyState>
      </Card>
    </Pad>
  </div>, { tab: "jobs" });

/* ── SH9a · Strike counter — a rule you can see, never a surprise ── */
function Strikes({ final: fin }) {
  const count = fin ? 2 : 1;
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Reliability" /></Pad>
      <Pad style={{ paddingTop: 4 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {[0, 1, 2].map((n) => (
                <span key={n} style={{ width: 26, height: 26, borderRadius: "50%", background: n < count ? "var(--danger-wash)" : "var(--surface)", border: `2px solid ${n < count ? "var(--danger-ink)" : "var(--line)"}`, display: "grid", placeItems: "center", boxSizing: "border-box" }}>
                  {n < count ? <Icon name="x" size={13} color="var(--danger-ink)" /> : null}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">{count} of 3 strikes</div>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>Three strikes in a month pauses your account for 48 hours. Strikes clear on the 1st — this counter resets 1 September.</div>
        </Card>
        {fin ? (
          <Card style={{ background: "var(--danger-wash)", border: "1px solid transparent", boxShadow: "none" }}>
            <div style={{ display: "flex", gap: 9 }}>
              <Icon name="triangle-alert" size={17} color="var(--danger-ink)" />
              <div style={{ fontSize: 12.5, color: "var(--danger-ink)", lineHeight: 1.5 }}><b>One more strike pauses your account until it clears.</b> If a job goes wrong, use "Get help with this job" before dropping it — a logged problem is never a strike.</div>
            </div>
          </Card>
        ) : null}
        <Card style={{ padding: 4 }}>
          {[["14 Aug · Dropped a job after collecting", "Eastgate → Avenues"], fin ? ["9 Aug · No-show at pickup", "Avondale Shops"] : null].filter(Boolean).map(([t, m]) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 10px", borderBottom: "1px solid var(--line)" }}>
              <Icon name="history" size={17} color="var(--muted)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }} className="lynia-tabular">{t}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{m}</div>
              </div>
              <Icon name="chevron-right" size={16} color="var(--muted)" />
            </div>
          ))}
          <div style={{ padding: "11px 10px", fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>What counts as a strike: dropping a job after collecting · not showing at a pickup you accepted · 3 wrong hand-off codes.</div>
        </Card>
        <Button label="Dispute a strike" variant="ghost" onClick={nop} />
      </Pad>
    </div>
  );
}

/* ── SH9b · Proof-of-pickup photo — capture → preview → (background) upload ── */
function PhotoStage({ preview }) {
  return (
    <div style={{ height: "100%", background: "#14181b", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "38px 16px 10px" }}>
        <Icon name="x" size={20} color="#fff" />
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Proof of pickup</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,.75)", ...TAB }}>LG-88f3</span>
      </div>
      <div style={{ padding: "0 16px 10px", fontSize: 12, color: "rgba(255,255,255,.75)", lineHeight: 1.45 }}>Eastgate Mall pickup — the sender sees this photo the moment you collect.</div>
      <div style={{ flex: 1, minHeight: 0, margin: "0 16px", position: "relative", borderRadius: 14, overflow: "hidden", background: preview ? "repeating-linear-gradient(45deg, #2a3136, #2a3136 14px, #232a2e 14px, #232a2e 28px)" : "#22282c" }}>
        {preview ? (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: "ui-monospace, monospace", fontSize: 12, color: "rgba(255,255,255,.65)" }}>parcel photo</div>
        ) : (
          <div style={{ position: "absolute", inset: 18, border: "2px dashed rgba(255,255,255,.55)", borderRadius: 12, display: "grid", placeItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.85)", textAlign: "center", padding: "0 20px", lineHeight: 1.5 }}>Fit the whole parcel in the frame</span>
          </div>
        )}
      </div>
      {preview ? (
        <div style={{ background: "var(--bg)", borderRadius: "16px 16px 0 0", padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Can you see the parcel clearly?</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, marginTop: 2 }}>This photo is your protection too — it shows what you collected, in what condition.</div>
          <Button label="Use this photo" onClick={nop} />
          <Button label="Retake" variant="ghost" onClick={nop} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "14px 16px 24px" }}>
          <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.7)" }}>Good light · hold steady · label visible</span>
          <span aria-label="Take photo" style={{ width: 68, height: 68, borderRadius: "50%", background: "#fff", border: "4px solid rgba(255,255,255,.4)", boxSizing: "border-box" }} />
        </div>
      )}
    </div>
  );
}
const PP_STEPS = ["Job accepted", "Items & note confirmed", "At pickup", "Parcel collected", "On the way", "Delivered", "Fare in hand"];
const pickup_photo_failed = () => S(
  <div>
    <AppBar title="Active job" sub="Parcel · Eastgate → Avenues" back={false} />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", boxShadow: "none", padding: 12 }}>
        <div style={{ display: "flex", gap: 9 }}>
          <Icon name="wifi-off" size={16} color="var(--highlight-ink)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--highlight-ink)" }}>Pickup photo didn't upload</div>
            <div style={{ fontSize: 12.5, color: "var(--highlight-ink)", lineHeight: 1.45, marginTop: 2 }}>No signal at the pickup. It retries in the background — ride on, the job isn't blocked.</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", marginTop: 7, minHeight: 24 }}>Try again now</div>
          </div>
        </div>
      </Card>
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--accent-wash)", color: "var(--accent-text)", borderRadius: 999, padding: "2px 8px", fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em" }}><Icon name="package" size={11} color="var(--accent-text)" />PARCEL</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)" }}>Navigate</span>
        </div>
        <Stepper steps={PP_STEPS} step={4} times={{ 0: "09:41", 1: "09:44", 2: "09:52", 3: "09:55", 4: "just now" }} />
      </Card>
    </Pad>
  </div>, { tab: "jobs", footer: <Button label="I've arrived at the drop-off" onClick={nop} style={{ marginTop: 0 }} /> });

window.RJM = Object.assign(window.RJM || {}, {
  board_food_off,
  board_empty_food_off,
  strikes: () => S(<Strikes />, { tab: "acct" }),
  strikes_final: () => S(<Strikes final />, { tab: "acct" }),
  pickup_photo: () => <PhotoStage />,
  pickup_photo_preview: () => <PhotoStage preview />,
  pickup_photo_failed,
});

})();
