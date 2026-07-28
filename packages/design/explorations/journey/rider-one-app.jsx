/* LyniaGo — ONE RIDER APP: Send (parcels) + Food on a single interface. Decisions (Jul 2026):
   one job list with a type tag per card · no countdowns, expired jobs just leave the list · one job
   at a time · online means online for everything · prepaid commission wallet for both, same % per
   completed job · Money tab shows yours vs owed-to-a-kitchen · Jobs · Money · Account tab bar.
   Static frozen states from the real DS bundle. Registers window.RJM. */
(() => {
const DS = window.LyniaDesignSystem_94c56a;
const { Button, Card, Field, StatusPill, EmptyState, Heading, Sub, Icon, Stepper } = DS;
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
/* The rider tab set is passed through AppScreen when the loaded bundle supports it; on an older
   bundle we compose the DS TabBar ourselves rather than silently showing the customer's tabs. */
const TB = DS.TabBar;
const SUPPORTS_TABS = /tabs/.test(String(DS.AppScreen || ""));
const S = (node, o = {}) => (SUPPORTS_TABS
  ? <SHELL tab={o.tab} tabs={TABS} footer={o.footer} bg={o.bg} dark={o.dark}>{node}</SHELL>
  : (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <SHELL footer={o.footer} bg={o.bg} dark={o.dark}><div style={{ paddingBottom: o.tab ? 58 : 0 }}>{node}</div></SHELL>
      {o.tab && TB ? <TB active={o.tab} tabs={TABS} /> : null}
    </div>
  ));
const Pad = ({ children, style }) => <div style={{ padding: "10px 16px 16px", ...style }}>{children}</div>;

/* Type tag — the only thing that says which service a job came from. */
function TypeTag({ food }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: food ? "var(--highlight-wash, var(--surface))" : "var(--accent-wash)", color: food ? "var(--highlight-ink)" : "var(--accent-text)", borderRadius: 999, padding: "2px 8px", fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em" }}>
      <Icon name={food ? "utensils" : "package"} size={11} color={food ? "var(--highlight-ink)" : "var(--accent-text)"} />
      {food ? "FOOD" : "PARCEL"}
    </span>
  );
}

/* One card for both kinds. Same anatomy; only the action differs — parcels are bid on, food jobs
   are offered to you and accepted. */
function JobCard({ food, from, to, km, fare, note, action }) {
  return (
    <Card style={{ padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <TypeTag food={food} />
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

const JOBS = [
  { food: true, from: "Sadza Republic · Belgravia", to: "12 Lanark Rd, Belgravia", km: "2.4", fare: "2.40", note: "Collect $15.50 for the kitchen", action: "Accept this job" },
  { food: false, from: "Eastgate Mall, CBD", to: "14 Glenara Ave, Avenues", km: "3.1", fare: "3.00", note: "Documents envelope · asking $3.00", action: "Make an offer" },
  { food: true, from: "Huku House · Avondale", to: "8 Fife Ave, Avenues", km: "1.8", fare: "2.00", note: "Already paid in the app · collect nothing", action: "Accept this job" },
];

const OnlinePill = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 8px" }}>
    <StatusPill status="online" />
    <span style={{ fontSize: 12, color: "var(--muted)" }}>Parcels and food · one queue</span>
    <span style={{ flex: 1 }} />
    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)" }}>Go offline</span>
  </div>
);

/* J1 — the one board. */
const board = () => S(
  <div>
    <AppBar title="Jobs near you" back={false} right={<Icon name="bell" size={19} color="var(--ink)" />} />
    <OnlinePill />
    <Pad style={{ paddingTop: 0 }}>{JOBS.map((j, i) => <JobCard key={i} {...j} />)}</Pad>
  </div>, { tab: "jobs" });

/* J2 — online, nothing in range. One empty state for both services. */
const board_empty = () => S(
  <div>
    <AppBar title="Jobs near you" back={false} />
    <OnlinePill />
    <Pad style={{ paddingTop: 4 }}>
      <Card style={{ padding: 16 }}>
        <EmptyState icon="inbox" title="Nothing in range yet" message="You'll see parcels and food orders here the moment they're posted near you. Jobs that get taken simply leave the list.">
          <Button label="Refresh" variant="ghost" onClick={nop} />
        </EmptyState>
      </Card>
    </Pad>
  </div>, { tab: "jobs" });

/* J3 — offline. Online means online for everything: no per-service switches. */
const offline = () => S(
  <div>
    <AppBar title="Jobs" back={false} />
    <Pad>
      <Card style={{ padding: 16, textAlign: "center" }}>
        <div style={{ width: 74, height: 74, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
          <Icon name="power" size={30} color="var(--muted)" />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>You're offline</div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginTop: 4 }}>Go online to receive parcels and food orders. One queue — there's no separate switch per service.</div>
        <Button label="Go online" onClick={nop} />
      </Card>
      <Card style={{ padding: 12, marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><Icon name="wallet" size={18} color="var(--accent-text)" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Commission balance</div>
            <Money v="4.60" size={17} />
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)" }}>Top up</span>
        </div>
      </Card>
    </Pad>
  </div>, { tab: "jobs" });

/* J4 — a food job offered to you. No countdown: if it's gone, it's gone from the list. */
const offer_food = () => S(
  <div>
    <AppBar title="Food job" sub="Sadza Republic → Belgravia" />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><TypeTag food /><span style={{ flex: 1 }} /><Money v="2.40" size={20} /></div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Your fare is fixed for food jobs — $1.50 base + $0.60/km over 2.4 km. No bidding.</div>
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "var(--surface)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--muted)", letterSpacing: ".04em" }}>MONEY AT THE DOOR</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>Collect <Money v="15.50" size={13.5} /> for the kitchen</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>Nothing from your pocket. You hand this back at the restaurant after the drop.</div>
        </div>
      </Card>
    </Pad>
  </div>, { footer: <div style={{ display: "grid", gap: 8 }}><Button label="Accept this job" onClick={nop} style={{ marginTop: 0 }} /><Button label="Not this one" variant="ghost" onClick={nop} /></div> });

/* J5 — a parcel job: you name your fare (the auction, unchanged for parcels). */
const offer_parcel = () => S(
  <div>
    <AppBar title="Parcel job" sub="Eastgate → Avenues · 3.1 km" />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><TypeTag /><span style={{ flex: 1 }} /><span style={{ fontSize: 12, color: "var(--muted)" }}>Sender asking</span><Money v="3.00" size={20} /></div>
        <Field label="Your fare (USD)" value="3.00" onChange={nop} inputMode="decimal" hint="Riders here usually get $2.96 on this distance. One offer per job." />
        <Field label="You'll be there in" value="8 min" onChange={nop} hint="Be honest — arriving late is what loses you the next job." />
      </Card>
    </Pad>
  </div>, { footer: <div style={{ display: "grid", gap: 8 }}><Button label="Send offer" onClick={nop} style={{ marginTop: 0 }} /><Button label="Skip this job" variant="ghost" onClick={nop} /></div> });

/* Cash-held strip — always visible while carrying. Yours vs owed to a kitchen, never one figure. */
function CashStrip({ yours = "3.00", owed }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "0 16px 10px" }}>
      <div style={{ flex: 1, padding: "8px 10px", borderRadius: 10, background: "var(--accent-wash)" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--accent-text)", letterSpacing: ".04em" }}>YOURS</div>
        <Money v={yours} size={15} color="var(--accent-text)" />
      </div>
      <div style={{ flex: 1, padding: "8px 10px", borderRadius: 10, background: owed ? "var(--danger-wash)" : "var(--surface)" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: owed ? "var(--danger-ink)" : "var(--muted)", letterSpacing: ".04em" }}>OWED TO A KITCHEN</div>
        <Money v={owed || "0.00"} size={15} color={owed ? "var(--danger-ink)" : "var(--muted)"} />
      </div>
    </div>
  );
}

const PARCEL_STEPS = ["Job accepted", "Items & note confirmed", "At pickup", "Parcel collected", "On the way", "Delivered", "Fare in hand"];
const FOOD_STEPS = ["Job accepted", "At the restaurant", "Food collected", "On the way", "Delivered", "Cash returned", "Job closed"];

/* J6 — active parcel job. One job at a time, so this screen is the whole app while it runs. */
const active_parcel = () => S(
  <div>
    <AppBar title="Active job" sub="Parcel · Eastgate → Avenues" back={false} />
    <CashStrip yours="3.00" />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><TypeTag /><span style={{ flex: 1 }} /><span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)" }}>Navigate</span></div>
        <Stepper steps={PARCEL_STEPS} step={4} times={{ 0: "09:41", 1: "09:44", 2: "09:52", 3: "09:55", 4: "just now" }} />
      </Card>
    </Pad>
  </div>, { tab: "jobs", footer: <Button label="I've arrived at the drop-off" onClick={nop} style={{ marginTop: 0 }} /> });

/* J7 — active food job. Same screen, same tracker, food step copy + the kitchen's money. */
const active_food = () => S(
  <div>
    <AppBar title="Active job" sub="Food · Sadza Republic → Belgravia" back={false} />
    <CashStrip yours="2.40" owed="15.50" />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><TypeTag food /><span style={{ flex: 1 }} /><span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)" }}>Navigate</span></div>
        <Stepper steps={FOOD_STEPS} step={3} times={{ 0: "18:02", 1: "18:11", 2: "18:16", 3: "just now" }} />
      </Card>
      <Card accent style={{ padding: 12, marginTop: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>Collect <Money v="15.50" size={13.5} /> at the door</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>Food first, then the cash, then the code. The kitchen's money rides back with you.</div>
      </Card>
    </Pad>
  </div>, { tab: "jobs", footer: <Button label="Enter the delivery code" onClick={nop} style={{ marginTop: 0 }} /> });

/* J8 — the hand-off, identical for both services: 6 digits, read at the door. */
const handoff = () => S(
  <div>
    <AppBar title="Delivery code" sub="Ask the customer to read it out" />
    <Pad>
      <Card style={{ padding: 14, textAlign: "center" }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10 }}>
          {["4", "1", "9", "2", "•", "•"].map((d, i) => (
            <span key={i} style={{ width: 38, height: 48, borderRadius: 10, border: `1.5px solid ${i < 4 ? "var(--accent)" : "var(--line)"}`, display: "grid", placeItems: "center", fontSize: 20, fontWeight: 800, color: i < 4 ? "var(--ink)" : "var(--muted)", ...TAB }}>{d}</span>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>Same code on parcels and food. Three wrong tries and the job locks — support takes it from there.</div>
      </Card>
    </Pad>
  </div>, { footer: <Button label="Confirm delivery" onClick={nop} style={{ marginTop: 0 }} /> });

const LEDGER = [
  { food: true, t: "Sadza Republic → Belgravia", m: "Today 18:24 · 5% commission $0.12", v: "2.40" },
  { food: false, t: "Eastgate → Avenues", m: "Today 09:58 · 5% commission $0.15", v: "3.00" },
  { food: true, t: "Huku House → Fife Ave", m: "Yesterday 19:40 · 5% commission $0.10", v: "2.00" },
  { food: false, t: "Avondale → Msasa", m: "Yesterday 14:02 · 5% commission $0.21", v: "4.20" },
];

/* M1 — one Money tab: commission balance, cash you're carrying, then one ledger for both services. */
const money = () => S(
  <div>
    <AppBar title="Money" back={false} />
    <Pad style={{ paddingTop: 0 }}>
      <Card accent style={{ padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", letterSpacing: ".04em" }}>COMMISSION BALANCE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
          <Money v="4.60" size={28} />
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>≈ 30 more jobs</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.45 }}>5% comes off this balance when a job closes — parcels and food, same rate. Run it to zero and you can't go online.</div>
        <Button label="Top up" onClick={nop} />
      </Card>
      <div style={{ marginTop: 10 }}><CashStrip yours="5.40" owed="15.50" /></div>
      <div style={{ display: "flex", gap: 6, margin: "2px 0 8px" }}>
        {[["All", true], ["Parcels", false], ["Food", false]].map(([l, on]) => (
          <span key={l} style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 12px", borderRadius: 999, background: on ? "var(--accent-wash)" : "var(--bg)", color: on ? "var(--accent-text)" : "var(--muted)", border: `1px solid ${on ? "#bfe7cf" : "var(--line)"}` }}>{l}</span>
        ))}
      </div>
      {LEDGER.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={r.food ? "utensils" : "package"} size={16} color="var(--muted)" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.t}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>{r.m}</div>
          </div>
          <Money v={r.v} size={14} />
        </div>
      ))}
    </Pad>
  </div>, { tab: "money" });

/* M2 — the one gate: no balance, no riding. Same rule whichever service is busy. */
const gate_topup = () => S(
  <div>
    <AppBar title="Top up to keep riding" back={false} />
    <Pad>
      <Card style={{ padding: 16, textAlign: "center" }}>
        <div style={{ width: 74, height: 74, borderRadius: "50%", background: "var(--danger-wash)", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
          <Icon name="wallet" size={30} color="var(--danger-ink)" />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Your balance is $0.00</div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginTop: 4 }}>Commission comes off this balance as jobs close. Top up $2 or more to start receiving parcels and food again.</div>
        <Button label="Top up now" onClick={nop} />
        <Button label="How commission works" variant="ghost" onClick={nop} />
      </Card>
    </Pad>
  </div>, { tab: "money" });

/* A1 — Account: one identity, one set of documents, whatever you carry. */
const account = () => S(
  <div>
    <AppBar title="Account" back={false} />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><Icon name="user" size={22} color="var(--accent-text)" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>Tendai M.</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", ...TAB }}>★ 4.9 · 312 jobs · verified</div>
          </div>
          <StatusPill status="online" />
        </div>
      </Card>
      <Card style={{ padding: 4, marginTop: 10 }}>
        {[["id-card", "Bike & documents", "Verified · expires Mar 2027"], ["history", "Job history", "Parcels and food in one list"], ["wallet", "Money", "Balance, cash held, commission"], ["bell", "Notifications", "One inbox for both services"], ["phone", "Help & support", "Call the safety line"]].map(([ic, l, s2]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 10px", borderBottom: "1px solid var(--line)" }}>
            <Icon name={ic} size={18} color="var(--muted)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{l}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{s2}</div>
            </div>
            <Icon name="chevron-right" size={16} color="var(--muted)" />
          </div>
        ))}
      </Card>
    </Pad>
  </div>, { tab: "acct" });

/* N1 — one inbox. The tag says which service; the line says what and where. */
const notifications = () => S(
  <div>
    <AppBar title="Notifications" />
    <Pad style={{ paddingTop: 0 }}>
      {[[true, "Food job near you", "Sadza Republic → Belgravia · $2.40 · collect $15.50", "now"],
        [false, "New parcel posted", "Eastgate → Avenues · sender asking $3.00", "2 min"],
        [false, "Your offer was picked", "Avondale → Msasa · $4.20 · head to pickup", "18 min"],
        [true, "Kitchen is running late", "Huku House says 6 more minutes", "1 hr"]].map(([food, t, m, w], i) => (
        <div key={i} style={{ display: "flex", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={food ? "utensils" : "package"} size={16} color="var(--muted)" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{w}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>{m}</div>
          </div>
        </div>
      ))}
    </Pad>
  </div>, { tab: "jobs" });

window.RJM = { board, board_empty, offline, offer_food, offer_parcel, active_parcel, active_food, handoff, money, gate_topup, account, notifications };
})();
