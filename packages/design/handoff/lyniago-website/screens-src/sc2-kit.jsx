/* Send Compose v2 — shared parts. Tokens only (see PROMPT.md). */
const S = {
  back: "Back", title: "Send a parcel", s1: "Where", s2: "What", s3: "Price", s4: "Review",
  pickup: "PICKUP", drop: "DROP-OFF", pickPh: "Set pickup location", dropPh: "Where to?",
  fromGps: "Your location", change: "Change", search: "Search", clear: "Clear",
  useLoc: "Use my location", useCur: "Use my current location", tapMap: "Tap the map to set the pin",
  mapHintDrop: "Or tap the map to set your drop-off", needDrop: "Add a drop-off to continue.",
  noRes: "No matches. Check the spelling, or set the pin on the map.",
  slow: "Searching… Slow connection, hang on.",
  limited: "Search is limited right now. Type the street and area, or use the map.",
  next: "Next", km: "3.1 km",
  outArea: "We don't cover that pickup or drop-off yet. Move your pins closer to Harare to send your parcel, or check back as we expand.",
  outTag: "Outside our area",
  whatSend: "What are you sending?", itemPh: "e.g. Documents envelope", qty: "Qty", remove: "Remove",
  addItem: "Add another item", maxItems: "Up to 10 items per order.",
  note: "Note for the rider (optional)", notePh: "Ask for Rita at the pharmacy counter; keep it upright.",
  sender: "Your phone (sender)", senderHint: "Shared with your rider only during the delivery.",
  rcpt: "Recipient phone", rcptHint: "So the rider can reach them at drop-off.", recent: "Recent",
  rcptErr: "That doesn't look like a phone number",
  need2: "Still needed: what you're sending, recipient phone",
  yourPrice: "Your price", tapType: "Tap the price to type an amount",
  minus: "− $0.50", plus: "+ $0.50", band: "Riders usually accept around $2.96–$3.80",
  low: "That's below what riders usually take — they may pass. Nudge it up for a faster match.",
  high: "That's a lot more than usual for this trip — double-check you didn't add a digit by mistake.",
  cash: "Cash to your rider", review: "Review",
  sumRoute: "Route", sumItems: "Items", sumNote: "Note", sumPhones: "Phones", sumPrice: "Price", edit: "Edit",
  you: "You", recipient: "Recipient",
  send: "Send to riders", sending: "Sending…", finding: "Finding riders near you…",
  failed: "Couldn't send. Check your data and try again.", retry: "Try again",
  offline: "You're offline. What you've entered is saved.", offlineCta: "Connect to the internet to send.",
  again: "Copied from your order on 28 Sep. Check it, then send.",
  holdT: "Your account is on hold", holdB: "You can't send parcels right now. Call us and we'll help you sort it out.",
  call: "Call support", home: "Back to home",
};
const ADDR = { a: "Eastgate Mall, CBD", b: "14 Glenara Ave, Avenues", far: "Seke Rd, Chitungwiza" };
const PH = { me: "+263 77 245 1180", rcpt: "+263 71 555 0090", bad: "077 12" };

const font = "var(--font-sans)";
const lbl = { fontSize: "var(--text-label)", fontWeight: 600, letterSpacing: ".04em", color: "var(--muted)", lineHeight: "16px" };
const fieldLbl = { fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: "18px", marginBottom: 6 };

function Ic({ n, s = 18, c = "currentColor", rot = 0 }) {
  const node = (window.lucide && window.lucide.icons[n]) || [];
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", transform: rot ? `rotate(${rot}deg)` : undefined }}>{node.map(([t, a], i) => React.createElement(t, { ...a, key: i }))}</svg>;
}
const Dot = ({ s = 12, empty }) => <span style={{ width: s, height: s, borderRadius: "50%", flex: "none", boxSizing: "border-box", background: empty ? "var(--bg)" : "var(--accent)", border: empty ? "2px solid var(--accent)" : "none" }}></span>;
const Sq = ({ s = 12, empty }) => <span style={{ width: s, height: s, borderRadius: 2, flex: "none", boxSizing: "border-box", background: empty ? "var(--bg)" : "var(--danger)", border: empty ? "2px solid var(--danger)" : "none" }}></span>;

function Status() {
  return <div style={{ height: 24, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 12, fontWeight: 600, background: "var(--bg)", position: "relative", zIndex: 30 }}><span style={{ flex: 1 }}>09:41</span><span>3G 84%</span></div>;
}

function StepBar({ step }) {
  const st = [S.s1, S.s2, S.s3, S.s4];
  return <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>
    {st.map((l, i) => { const n = i + 1, done = n < step, cur = n === step;
      return <div key={l} style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, height: 22 }}>
          <span style={{ width: 18, height: 18, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: done || cur ? "var(--accent-text)" : "var(--surface)", color: done || cur ? "#fff" : "var(--muted)", border: done || cur ? "none" : "1px solid var(--line)" }}>{done ? <Ic n="Check" s={12} c="#fff" /> : n}</span>
          <span style={{ fontSize: 12, fontWeight: cur ? 700 : 600, color: cur ? "var(--ink)" : done ? "var(--accent-text)" : "var(--muted)", whiteSpace: "nowrap" }}>{l}</span>
        </div>
        <div style={{ height: 3, borderRadius: 2, marginTop: 4, background: done || cur ? "var(--accent)" : "var(--line)" }}></div>
      </div>; })}
  </div>;
}

function Header({ step, bar = true }) {
  return <div style={{ background: "var(--bg)", position: "relative", zIndex: 20, borderBottom: "1px solid var(--line)" }}>
    <div style={{ height: 52, display: "flex", alignItems: "center", gap: 4, padding: "0 8px" }}>
      <span style={{ height: 44, display: "flex", alignItems: "center", gap: 2, padding: "0 8px 0 2px", fontSize: 15, fontWeight: 600, color: "var(--accent-text)" }}><Ic n="ChevronDown" s={22} c="var(--accent-text)" rot={90} />{S.back}</span>
      <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700, marginRight: 64 }}>{S.title}</span>
    </div>
    {bar ? <StepBar step={step} /> : null}
  </div>;
}

function Btn({ label, disabled, loading, ghost, icon }) {
  const bg = ghost ? "var(--bg)" : disabled ? "var(--line)" : "var(--accent)";
  const fg = ghost ? "var(--accent-text)" : disabled ? "var(--muted)" : "#fff";
  return <div style={{ height: 52, borderRadius: "var(--radius-pill)", background: bg, color: fg, border: ghost ? "1.5px solid var(--line)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 16, fontWeight: 700 }}>
    {loading ? <span className="sc2-spin"></span> : icon ? <Ic n={icon} s={18} c={fg} /> : null}{label}
  </div>;
}

function CTA({ label, disabled, loading, hint, bottom = 0 }) {
  return <div style={{ position: "absolute", left: 0, right: 0, bottom, background: "var(--bg)", padding: "10px 16px 12px", boxShadow: "var(--shadow-sheet)", zIndex: 25 }}>
    {hint ? <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", marginBottom: 8, lineHeight: "18px" }}>{hint}</div> : null}
    <Btn label={label} disabled={disabled} loading={loading} />
  </div>;
}

function Keyboard({ W }) {
  const h = W < 340 ? 220 : 240;
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const key = (k, flex = 1, i) => <span key={i} style={{ flex, height: (h - 40) / 4 - 8, background: "var(--bg)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "var(--ink)", boxShadow: "0 1px 0 rgba(20,24,27,.15)" }}>{k}</span>;
  return <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: "var(--line)", padding: "8px 3px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8, zIndex: 40 }}>
    {rows.map((r, ri) => <div key={r} style={{ display: "flex", gap: 5, padding: ri === 1 ? "0 14px" : 0 }}>{ri === 2 ? key("⇧", 1.5, "s") : null}{r.split("").map((c, i) => key(c, 1, i))}{ri === 2 ? key("⌫", 1.5, "d") : null}</div>)}
    <div style={{ display: "flex", gap: 5 }}>{key("?123", 1.5, 0)}{key(",", 1, 1)}{key("", 5, 2)}{key(".", 1, 3)}{key("↵", 1.5, 4)}</div>
  </div>;
}
const kbH = (W) => (W < 340 ? 220 : 240);

/* Faux map — token colours only. pins in 0–1 coords of the map box. */
function MapBox({ W, H, top = 0, a, b, route, labels = true, offline, children, style }) {
  const h = H - top;
  const X = (f) => f * W, Y = (f) => f * h;
  const roads = [[0, .2, 1, .26], [0, .46, 1, .4], [0, .7, 1, .76], [0, .9, 1, .88], [.2, 0, .26, 1], [.56, 0, .5, 1], [.86, 0, .8, 1], [0, .05, .7, 1]];
  let rp = null;
  if (route && a && b) { const ax = X(a[0]), ay = Y(a[1]), bx = X(b[0]), by = Y(b[1]); rp = `M${ax} ${ay} C ${ax + (bx - ax) * .1} ${ay + (by - ay) * .7}, ${bx - (bx - ax) * .6} ${by - (by - ay) * .05}, ${bx} ${by}`; }
  return <div style={{ position: "absolute", left: 0, right: 0, top, height: h, background: "var(--surface)", overflow: "hidden", ...style }}>
    {offline ? <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(45deg, var(--line) 0 1px, transparent 1px 12px)" }}></div> :
      <svg width={W} height={h} style={{ position: "absolute", inset: 0 }}>
        <rect x={X(.6)} y={Y(.5)} width={X(.18)} height={Y(.14)} rx="6" fill="var(--accent-wash)" />
        <rect x={X(.04)} y={Y(.78)} width={X(.12)} height={Y(.08)} rx="6" fill="var(--accent-wash)" />
        {roads.map((r, i) => <line key={"o" + i} x1={X(r[0])} y1={Y(r[1])} x2={X(r[2])} y2={Y(r[3])} stroke="var(--line)" strokeWidth={i < 3 ? 12 : 9} />)}
        {roads.map((r, i) => <line key={"i" + i} x1={X(r[0])} y1={Y(r[1])} x2={X(r[2])} y2={Y(r[3])} stroke="var(--bg)" strokeWidth={i < 3 ? 9 : 6} />)}
        {rp ? <path d={rp} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" /> : null}
      </svg>}
    {a ? <MapPin x={X(a[0])} y={Y(a[1])} kind="a" label={labels ? "Pickup" : null} /> : null}
    {b ? <MapPin x={X(b[0])} y={Y(b[1])} kind="b" label={labels ? "Drop-off" : null} /> : null}
    {children}
  </div>;
}
function MapPin({ x, y, kind, label }) {
  const m = kind === "a"
    ? <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", border: "3px solid #fff", boxShadow: "var(--shadow-card)", boxSizing: "border-box" }}></span>
    : <span style={{ width: 20, height: 20, borderRadius: 3, background: "var(--danger)", border: "3px solid #fff", boxShadow: "var(--shadow-card)", boxSizing: "border-box" }}></span>;
  return <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-11px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
    {m}{label ? <span style={{ background: "var(--bg)", borderRadius: "var(--radius-pill)", padding: "2px 8px", fontSize: 12, fontWeight: 600, boxShadow: "var(--shadow-card)", whiteSpace: "nowrap" }}>{label}</span> : null}
  </div>;
}

function MapPill({ label, icon, right = 12, left, bottom, top, dark }) {
  return <span style={{ position: "absolute", right: left != null ? undefined : right, left, bottom, top, zIndex: 15, height: 44, display: "inline-flex", alignItems: "center", gap: 6, background: dark ? "var(--ink)" : "var(--bg)", color: dark ? "#fff" : "var(--accent-text)", borderRadius: "var(--radius-pill)", padding: "0 14px", boxShadow: "var(--shadow-card)", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{icon ? <Ic n={icon} s={16} c={dark ? "#fff" : "var(--accent-text)"} /> : null}{label}</span>;
}

/* Address row: idle filled / idle empty / editing */
function AddrRow({ kind, value, meta, edit, typed, out, divider }) {
  const isA = kind === "a";
  const marker = isA ? <Dot s={14} empty={!value && !edit} /> : <Sq s={14} empty={!value && !edit} />;
  if (edit) return <div style={{ padding: "4px 8px 4px 14px", display: "flex", alignItems: "center", gap: 10, borderTop: divider ? "1px solid var(--line)" : "none" }}>
    {marker}
    <div style={{ flex: 1, minWidth: 0, height: 52, border: "2px solid var(--accent-text)", borderRadius: "var(--radius-input)", display: "flex", alignItems: "center", padding: "0 4px 0 10px", gap: 4, boxSizing: "border-box" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...lbl, color: "var(--accent-text)" }}>{isA ? S.pickup : S.drop}</div>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", whiteSpace: "nowrap", overflow: "hidden" }}>{typed}<span className="sc2-caret"></span></div>
      </div>
      {typed ? <span style={{ height: 44, display: "flex", alignItems: "center", gap: 3, padding: "0 6px", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}><Ic n="X" s={14} c="var(--muted)" />{S.clear}</span> : null}
    </div>
  </div>;
  return <div style={{ minHeight: 56, padding: "6px 8px 6px 14px", display: "flex", alignItems: "center", gap: 12, borderTop: divider ? "1px solid var(--line)" : "none", boxSizing: "border-box" }}>
    {marker}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={lbl}>{isA ? S.pickup : S.drop}{meta ? <span style={{ color: "var(--accent-text)" }}> · {meta}</span> : null}</div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", color: value ? "var(--ink)" : "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value || (isA ? S.pickPh : S.dropPh)}</div>
      {out ? <div style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}><Ic n="CircleAlert" s={13} c="var(--danger)" />{S.outTag}</div> : null}
    </div>
    <span style={{ height: 44, display: "flex", alignItems: "center", gap: 4, padding: "0 6px", fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}><Ic n={value ? "Pencil" : "Search"} s={15} c="var(--accent-text)" />{value ? S.change : S.search}</span>
  </div>;
}

function SugRow({ icon, title, sub, action, tag, skeleton }) {
  if (skeleton) return <div style={{ height: 48, display: "flex", alignItems: "center", gap: 12, padding: "0 14px" }}>
    <span style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface)" }}></span>
    <div style={{ flex: 1 }}><div style={{ height: 10, width: "60%", background: "var(--line)", borderRadius: 5, marginBottom: 6 }}></div><div style={{ height: 8, width: "36%", background: "var(--surface)", borderRadius: 4 }}></div></div>
  </div>;
  return <div style={{ minHeight: 48, display: "flex", alignItems: "center", gap: 12, padding: "0 14px", borderTop: "1px solid var(--line)" }}>
    <span style={{ width: 32, height: 32, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: action ? "var(--accent-wash)" : "var(--surface)" }}><Ic n={icon} s={16} c={action ? "var(--accent-text)" : "var(--muted)"} /></span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: action ? "var(--accent-text)" : "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      {sub ? <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: "16px" }}>{sub}</div> : null}
    </div>
    {tag ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-text)", background: "var(--accent-wash)", borderRadius: "var(--radius-pill)", padding: "2px 8px" }}>{tag}</span> : null}
  </div>;
}

function Field({ label, value, ph, hint, err, focus, multi, children }) {
  return <div style={{ marginBottom: 14 }}>
    {label ? <div style={fieldLbl}>{label}</div> : null}
    <div style={{ minHeight: multi ? 68 : 48, border: `${focus || err ? 2 : 1}px solid ${err ? "var(--danger)" : focus ? "var(--accent-text)" : "var(--line)"}`, borderRadius: "var(--radius-input)", background: "var(--bg)", padding: multi ? "10px 12px" : "0 12px", display: "flex", alignItems: multi ? "flex-start" : "center", fontSize: 15, lineHeight: "22px", color: value ? "var(--ink)" : "var(--muted)", boxSizing: "border-box" }}>
      <span>{value || ph}{focus ? <span className="sc2-caret"></span> : null}</span>
    </div>
    {children}
    {err ? <div style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--danger)", marginTop: 6 }}><Ic n="CircleAlert" s={14} c="var(--danger)" />{err}</div> : null}
    {hint ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: "16px" }}>{hint}</div> : null}
  </div>;
}

function RoundBtn({ label, size = 44 }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", border: "1.5px solid var(--line)", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "var(--accent-text)", flex: "none" }}>{label}</span>;
}

function ItemCard({ desc, qty = 1, focus, removable, compact }) {
  return <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: "10px 10px 6px", marginBottom: 8, background: "var(--bg)" }}>
    <Field value={desc} ph={S.itemPh} focus={focus} />
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: -8, marginBottom: 2 }}>
      <span style={{ ...lbl, letterSpacing: 0 }}>{S.qty}</span>
      <RoundBtn label="−" /><span style={{ minWidth: 22, textAlign: "center", fontSize: 17, fontWeight: 700 }} className="lynia-tabular">{qty}</span><RoundBtn label="+" />
      <span style={{ flex: 1 }}></span>
      {removable ? <span style={{ height: 44, display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, color: "var(--muted)" }}><Ic n="Trash2" s={15} c="var(--muted)" />{S.remove}</span> : null}
    </div>
  </div>;
}

function Chip({ label }) {
  return <span style={{ height: 44, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", fontSize: 13, fontWeight: 600, background: "var(--bg)", whiteSpace: "nowrap" }}><Ic n="History" s={14} c="var(--muted)" />{label}</span>;
}

/* Small route strip used on steps 2 & 3 (tap = back to step 1) */
function RouteStrip({ W }) {
  return <div style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: 6, marginBottom: 16, background: "var(--bg)" }}>
    <div style={{ width: 64, height: 56, position: "relative", borderRadius: 8, overflow: "hidden", flex: "none" }}>
      <MapBox W={64} H={56} a={[.22, .3]} b={[.78, .72]} route labels={false} />
    </div>
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden" }}><Dot s={10} />{ADDR.a}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden" }}><Sq s={10} />{ADDR.b}</div>
    </div>
    <span style={{ height: 44, display: "flex", alignItems: "center", gap: 4, padding: "0 6px", fontSize: 13, fontWeight: 600, color: "var(--accent-text)", flex: "none" }}><Ic n="Pencil" s={14} c="var(--accent-text)" />{S.edit}</span>
  </div>;
}

function Notice({ icon = "CircleAlert", text, tone = "calm", style }) {
  const warn = tone === "warn";
  return <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: warn ? "var(--bg)" : "var(--surface)", border: `1px solid ${warn ? "var(--danger)" : "var(--line)"}`, borderRadius: "var(--radius-input)", padding: "10px 12px", fontSize: 13, lineHeight: "19px", color: "var(--ink)", ...style }}>
    <Ic n={icon} s={18} c={warn ? "var(--danger)" : "var(--muted)"} /><span style={{ textWrap: "pretty" }}>{text}</span>
  </div>;
}

function Toast({ text, action, bottom }) {
  return <div style={{ position: "absolute", left: 12, right: 12, bottom, zIndex: 35, background: "var(--ink)", color: "#fff", borderRadius: "var(--radius-input)", padding: "6px 6px 6px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, lineHeight: "18px", boxShadow: "var(--shadow-menu)" }}>
    <Ic n="CircleAlert" s={18} c="#fff" /><span style={{ flex: 1 }}>{text}</span>
    {action ? <span style={{ height: 44, display: "flex", alignItems: "center", gap: 4, padding: "0 10px", borderRadius: 10, background: "var(--accent-wash)", color: "var(--accent-text)", fontWeight: 700, whiteSpace: "nowrap" }}><Ic n="RefreshCw" s={14} c="var(--accent-text)" />{action}</span> : null}
  </div>;
}

Object.assign(window, { S, ADDR, PH, lbl, fieldLbl, Ic, Dot, Sq, Status, StepBar, Header, Btn, CTA, Keyboard, kbH, MapBox, MapPin, MapPill, AddrRow, SugRow, Field, RoundBtn, ItemCard, Chip, RouteStrip, Notice, Toast });
