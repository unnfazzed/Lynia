/* file-scoped: Babel classic scripts share one global scope, so every declaration below is
   wrapped in an IIFE — only window.LJ / window.RJ leave this file. Without it, a later-loading
   sibling silently overwrites same-named screens (customer Profile vs rider Profile, etc.). */
(() => {
/* LyniaGo — RIDER journey: commission-wallet screen renderers (static, production-fidelity).
   Ported from templates/wallet, templates/top-up, templates/gate-state. Extends window.RJ. */

const DSW = window.LyniaDesignSystem_94c56a;
const SUPW = window.LyniaSupport;
const { Button, Card, Field, StatusPill, EmptyState, Heading, Sub, Icon } = DSW;
const { Pad } = SUPW;

const noopw = () => {};
const mw = (n) => (n < 0 ? "\u2212$" : "$") + Math.abs(n).toFixed(2);

const WRECEIPTS = [
  { title: "Delivery to Avondale", meta: "Tue 14:02 \u00b7 5% of $3.00", amount: "\u2212$0.15", credit: false },
  { title: "Delivery to Msasa", meta: "Tue 11:40 \u00b7 5% of $2.40", amount: "\u2212$0.12", credit: false },
  { title: "EcoCash top-up", meta: "Tue 09:10 \u00b7 ref 8821", amount: "+$5.00", credit: true },
  { title: "Delivery to Mount Pleasant", meta: "Mon 16:20 \u00b7 5% of $4.20", amount: "\u2212$0.21", credit: false },
];

function WalletHero({ bal }) {
  const neg = bal < 0;
  return (
    <div style={{ background: neg ? "var(--danger-wash)" : "var(--bg)", borderRadius: 16, padding: 18, boxShadow: "var(--shadow-card)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: neg ? "var(--bg)" : "var(--accent-wash)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="banknote" size={22} color={neg ? "var(--danger-ink)" : "var(--accent-text)"} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: neg ? "var(--danger-ink)" : "var(--muted)" }}>Commission balance</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--ink)", lineHeight: 1.05, marginTop: 1, letterSpacing: "-0.02em" }} className="lynia-tabular">{mw(bal)}</div>
        </div>
      </div>
      <div style={{ height: 1, background: neg ? "rgba(143,36,24,.16)" : "var(--line)", margin: "14px 0" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12, color: neg ? "var(--danger-ink)" : "var(--muted)", lineHeight: 1.4 }}>{neg ? mw(bal) + " owed \u00b7 your next top-up covers this" : "Commission: 5% per delivery"}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: neg ? "var(--danger-ink)" : "var(--accent-text)", background: neg ? "var(--bg)" : "var(--accent-wash)", borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{neg ? "Owed" : "Prepaid float"}</span>
      </div>
    </div>
  );
}
function ReceiptRow({ r }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: r.credit ? "var(--accent-wash)" : "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={r.credit ? "banknote" : "package"} size={18} color={r.credit ? "var(--accent-text)" : "var(--muted)"} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{r.title}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{r.meta}</div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: r.credit ? "var(--accent-text)" : "var(--ink)" }} className="lynia-tabular">{r.amount}</div>
    </div>
  );
}
function WalletScreen({ bal = 4.85 }) {
  return (
    <Pad>
      <div style={{ display: "flex", alignItems: "center", margin: "0 0 4px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--muted)" }}><span style={{ fontSize: 17, lineHeight: 1, marginRight: 2 }}>\u2039</span>Earnings</span>
        <div style={{ flex: 1 }} />
        <StatusPill status="Online" tone="online" dot />
      </div>
      <Heading style={{ marginBottom: 2 }}>Wallet</Heading>
      <Sub style={{ marginBottom: 14 }}>Your prepaid commission balance.</Sub>
      <WalletHero bal={bal} />
      <div style={{ marginTop: 16 }}><Button label="Top up" onClick={noopw} /></div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "22px 0 8px" }}>Recent activity</div>
      <Card style={{ padding: "2px 16px" }}>
        {WRECEIPTS.map((r, i) => <ReceiptRow key={i} r={r} />)}
      </Card>
      <div style={{ background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", borderRadius: 16, padding: 16, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--highlight-ink)", marginBottom: 5 }}>How your commission works</div>
        <div style={{ fontSize: 12, color: "var(--highlight-ink)", lineHeight: 1.55 }}>Lynia takes 5% of each delivery you complete — from a prepaid balance, never your cash in hand. Every deduction shows up here beside the ride it came from.</div>
      </div>
    </Pad>
  );
}
function WalletLow() {
  return (
    <Pad>
      <div style={{ display: "flex", alignItems: "center", margin: "0 0 4px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--muted)" }}><span style={{ fontSize: 17, lineHeight: 1, marginRight: 2 }}>\u2039</span>Earnings</span>
        <div style={{ flex: 1 }} />
        <StatusPill status="Online" tone="online" dot />
      </div>
      <Heading style={{ marginBottom: 2 }}>Wallet</Heading>
      <Sub style={{ marginBottom: 14 }}>Your prepaid commission balance.</Sub>
      <WalletHero bal={-0.30} />
      <div style={{ background: "var(--danger-wash)", borderRadius: 12, padding: "12px 14px", marginTop: 12, fontSize: 13, color: "var(--danger-ink)", lineHeight: 1.4 }}>You're below the $2.00 balance you need to go online — top up to keep riding.</div>
      <div style={{ marginTop: 16 }}><Button label="Top up" onClick={noopw} /></div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "22px 0 8px" }}>Recent activity</div>
      <Card style={{ padding: "2px 16px" }}>
        {WRECEIPTS.slice(0, 3).map((r, i) => <ReceiptRow key={i} r={r} />)}
      </Card>
    </Pad>
  );
}

/* ── top-up ── */
const RAILSW = [
  { id: "ecocash", name: "EcoCash", logo: "../../assets/brand/rails/ecocash.png", logoW: 48, logoH: 28, note: "Approve on your phone", on: true },
  { id: "innbucks", name: "InnBucks", logo: "../../assets/brand/rails/innbucks.png", logoW: 52, logoH: 28, tileBg: "#13294B", note: "Approve on your phone", on: false },
  { id: "omari", name: "O'mari", logo: "../../assets/brand/rails/omari.png", logoW: 48, logoH: 30, note: "Approve on your phone", on: false },
];
function TopupAmount() {
  return (
    <Pad>
      <span style={{ display: "inline-flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 12 }}><span style={{ fontSize: 17, lineHeight: 1, marginRight: 2 }}>\u2039</span>Wallet</span>
      <Heading style={{ marginBottom: 4 }}>Top up</Heading>
      <Sub>Add to your commission balance. This money can only be spent on commission.</Sub>
      <Field label="Amount (USD)" value="10.00" onChange={noopw} inputMode="decimal" hint="Minimum top-up is $5.00" />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {[5, 10, 20].map((v) => { const on = v === 10; return (
          <span key={v} style={{ flex: 1, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 999, border: on ? "1.5px solid var(--accent)" : "1px solid var(--line)", background: on ? "var(--accent-wash)" : "var(--bg)", color: on ? "var(--accent-text)" : "var(--ink)", fontSize: 15, fontWeight: on ? 700 : 600 }} className="lynia-tabular">{mw(v)}</span>
        ); })}
      </div>
      <div style={{ marginTop: 16 }}><Field label="Phone number" value="077 234 5678" onChange={noopw} inputMode="tel" hint="This number gets the payment prompt — change it if you're paying from another line." /></div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "22px 0 8px" }}>Pay with</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {RAILSW.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: r.on ? "1.5px solid var(--accent)" : "1px solid var(--line)", background: r.on ? "var(--accent-wash)" : "var(--bg)" }}>
            <span style={{ width: 58, height: 36, borderRadius: 8, background: r.tileBg || "#fff", border: r.tileBg ? "none" : "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><img src={r.logo} alt={r.name} style={{ maxWidth: r.logoW, maxHeight: r.logoH, objectFit: "contain", display: "block" }} /></span>
            <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{r.name}</span><span style={{ display: "block", fontSize: 12, color: r.on ? "var(--accent-text)" : "var(--muted)", marginTop: 1 }}>{r.note}</span></span>
            <span style={{ width: 20, height: 20, borderRadius: 999, border: r.on ? "6px solid var(--accent)" : "1.5px solid var(--line)", background: "var(--bg)", flexShrink: 0 }} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20 }}><Button label="Request $10.00 via EcoCash" onClick={noopw} /></div>
    </Pad>
  );
}
function TopupWait() {
  const C = 326.7, off = C * (1 - 62 / 90);
  return (
    <Pad>
      <span style={{ display: "inline-flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--muted)" }}><span style={{ fontSize: 17, lineHeight: 1, marginRight: 2 }}>\u2039</span>Top up</span>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 30 }}>
        <div style={{ position: "relative", width: 132, height: 132 }}>
          <svg width={132} height={132} viewBox="0 0 132 132" style={{ transform: "rotate(-90deg)" }}>
            <circle cx={66} cy={66} r={52} fill="none" stroke="var(--line)" strokeWidth={8} />
            <circle cx={66} cy={66} r={52} fill="none" stroke="var(--accent)" strokeWidth={8} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">62</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>seconds</span>
          </div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", marginTop: 24 }}>Check your phone</div>
        <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6, maxWidth: 260, lineHeight: 1.5 }}>Approve the EcoCash prompt on <span style={{ fontWeight: 600, color: "var(--ink)" }} className="lynia-tabular">077 234 5678</span>. We'll credit your balance the moment it clears.</div>
        <div style={{ fontSize: 13, color: "var(--accent-text)", fontWeight: 600, marginTop: 16 }} className="lynia-tabular">$10.00 \u00b7 EcoCash</div>
        <div style={{ width: "100%", marginTop: 28 }}><Button label="Cancel request" variant="ghost" onClick={noopw} /></div>
      </div>
    </Pad>
  );
}
function TopupSuccess() {
  return (
    <Pad>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 36 }}>
        <div style={{ width: 88, height: 88, borderRadius: 999, background: "var(--accent-wash)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="check" size={44} color="var(--accent-text)" />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", marginTop: 16 }} className="lynia-tabular">$10.00 added</div>
        <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>New balance <span style={{ fontWeight: 600, color: "var(--ink)" }} className="lynia-tabular">$14.85</span></div>
        <div style={{ width: "100%", marginTop: 24 }}>
          <Card style={{ padding: "2px 16px", marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-wash)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="banknote" size={18} color="var(--accent-text)" /></div>
              <div style={{ flex: 1, textAlign: "left" }}><div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>EcoCash top-up</div><div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Just now \u00b7 ref 9042</div></div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--accent-text)" }} className="lynia-tabular">+$10.00</div>
            </div>
          </Card>
        </div>
        <div style={{ width: "100%", marginTop: 20 }}><Button label="Back to wallet" onClick={noopw} /></div>
      </div>
    </Pad>
  );
}
function TopupDeclined() {
  return (
    <Pad>
      <span style={{ display: "inline-flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}><span style={{ fontSize: 17, lineHeight: 1, marginRight: 2 }}>\u2039</span>Top up</span>
      <Card style={{ padding: "8px 16px 16px" }}>
        <EmptyState icon="circle-alert" title="The payment was declined" message="No money left your EcoCash. This usually means the EcoCash balance was too low, or the request was declined on your phone.">
          <Button label="Try again" onClick={noopw} />
        </EmptyState>
      </Card>
    </Pad>
  );
}
function GateCommission() {
  return (
    <Pad>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontFamily: "var(--font-wordmark)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>LyniaGo</span>
        <div style={{ flex: 1 }} />
        <StatusPill status="Offline" tone="offline" dot />
      </div>
      <Card style={{ padding: "8px 16px 20px" }}>
        <EmptyState icon="banknote" title="Top up to keep riding" message="You're offline. Your commission balance is $0.85 — below the $2.00 you need to accept rides.">
          <div style={{ background: "var(--accent-wash)", borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "var(--accent-text)" }}>Amount to go back online</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)" }} className="lynia-tabular">$1.15</div>
          </div>
          <div style={{ marginTop: 12 }}><Button label="Top up $1.15" onClick={noopw} /></div>
          <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>This isn't a fine — it's the prepaid balance rides come out of. Nothing was taken from your cash.</div>
        </EmptyState>
      </Card>
    </Pad>
  );
}

/* Same DS AppScreen shell as every other screen — status bar + body geometry. */
const SHELL = DS.AppScreen || (({ children }) => children);
const S = (node) => <SHELL>{node}</SHELL>;

Object.assign(window.RJ, {
  wallet: () => S(<WalletScreen />),
  wallet_low: () => S(<WalletLow />),
  topup_amount: () => S(<TopupAmount />),
  topup_wait: () => S(<TopupWait />),
  topup_success: () => S(<TopupSuccess />),
  topup_declined: () => S(<TopupDeclined />),
  gate_commission: () => S(<GateCommission />),
});

})();
