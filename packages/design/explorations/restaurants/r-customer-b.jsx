/* LyniaGo Restaurants — CUSTOMER screens, part B: pay-after-accept, live tracking with the prep
   countdown, every exception path, hand-off and rating. Registers into window.RC. */

const PB = window.RParts;
const { Button, Card, EmptyState, Icon, Skeleton, Money, Pad, AppBar, Screen, Banner, RTracker,
  Ring, RailRow, CodeCard, HarareMap, PriceMath, RiderCard, SafetyRow, RAILS, nop, TAB } = PB;

const RCB = (window.RC = window.RC || {});

const OrderHead = ({ status, tone = "var(--accent-text)", bg = "var(--accent-wash)" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px 10px" }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15.5, fontWeight: 700 }}>Sadza Republic</div>
      <div style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>Order LG-4471 · 3 items · $15.50</div>
    </div>
    <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".04em", color: tone, background: bg, borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap", flexShrink: 0 }}>{status}</span>
  </div>
);

/* R5·1 — order sent, waiting on the kitchen. A hard 3-minute cap, stated. */
RCB.await_accept = () => (
  <Screen>
    <OrderHead status="WAITING" tone="var(--muted)" bg="var(--surface)" />
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 20px 0" }}>
      <Ring value={104} total={180} label="1:44" sub="to accept" tone="var(--accent)" />
      <div style={{ fontSize: 16.5, fontWeight: 700, marginTop: 16, textAlign: "center" }}>Waiting for Sadza Republic</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5, textAlign: "center", lineHeight: 1.45 }}>They have 3 minutes to accept. You'll pay only after they do — nothing has left your wallet.</div>
      <div style={{ width: "100%", marginTop: 18 }}>
        <Card style={{ padding: 12 }}>
          <RTracker step={0} times={{ 0: "09:41" }} />
        </Card>
      </div>
    </div>
  </Screen>
);

/* R5·1b — accepted; the kitchen calls before asking for money. A human voice replaces every
   payment clock. */
RCB.confirm_call = () => (
  <Screen>
    <OrderHead status="CONFIRMING" />
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 20px 0" }}>
      <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><Icon name="phone" size={34} color="var(--accent-text)" /></div>
      <div style={{ fontSize: 16.5, fontWeight: 700, marginTop: 16, textAlign: "center" }}>Sadza Republic is calling you</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5, textAlign: "center", lineHeight: 1.45 }}>They confirm every order by phone before asking for payment — answer, agree the total, and the request arrives right after.</div>
      <div style={{ width: "100%", marginTop: 18 }}>
        <Card style={{ padding: 12 }}>
          <RTracker step={1} times={{ 0: "09:41", 1: "09:44 · calling you" }} />
        </Card>
      </div>
    </div>
  </Screen>
);

/* R5·2 — the push that fires the payment moment. Lock-screen + heads-up, sound on. */
RCB.pay_push = () => (
  <div style={{ height: "100%", background: "#0d1114", position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#101619,#1b2226)" }} />
    <div style={{ position: "relative", padding: "56px 16px 0", textAlign: "center", color: "rgba(255,255,255,.92)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, opacity: .7, ...TAB }}>Sunday 27 July</div>
      <div style={{ fontSize: 58, fontWeight: 300, letterSpacing: "-.02em", lineHeight: 1.05, ...TAB }}>09:44</div>
    </div>
    <div style={{ position: "relative", margin: "26px 10px 0", background: "rgba(255,255,255,.96)", borderRadius: 18, padding: 13, boxShadow: "0 8px 26px rgba(0,0,0,.4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <PB.Dove size={17} on="white" />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>LyniaGo</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>now</span>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>Sadza Republic confirmed — payment requested</div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>They called to confirm your order. Pay $15.50 when you're ready — the kitchen starts the moment it lands.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <span style={{ flex: 1, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "#fff", background: "var(--cta-fill)", borderRadius: 999, padding: "9px 0" }}>Pay now</span>
        <span style={{ flex: 1, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", border: "1px solid var(--line)", borderRadius: 999, padding: "9px 0", background: "#fff" }}>View order</span>
      </div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 14, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.5)" }}>Persists on the lock screen until paid or cancelled</div>
  </div>
);

/* R5·3 — pay the merchant directly. Amount is the hero; the window is visible. */
RCB.pay_now = () => (
  <Screen footer={<Button label="Send payment prompt · $15.50" onClick={nop} style={{ marginTop: 0 }} />}>
    <div style={{ height: "100%", overflow: "hidden" }}>
      <AppBar title="Pay Sadza Republic" sub="Order LG-4471" />
      <Pad style={{ paddingTop: 0 }}>
        <Card accent style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-text)" }}>PAY EXACTLY</div>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, ...TAB }}>$15.50</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Food $13.00 + delivery $2.50</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.4 }}>No deadline — you confirmed by phone at 09:46, and the kitchen starts the moment the money lands.</div>
        </Card>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 7 }}>PAY WITH</div>
        {RAILS.map((r, i) => <RailRow key={r.id} rail={r} selected={i === 0} note={i === 0 ? "Prompt goes to +263 77 245 1180" : "Approve on your phone"} />)}
        <div style={{ display: "flex", gap: 8, marginTop: 4, padding: "10px 12px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
          <Icon name="circle-alert" size={15} color="var(--muted)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>The money goes straight to the restaurant's merchant number. LyniaGo never holds it — so refunds come from them, with a reference you'll see here.</div>
        </div>
        <div style={{ marginTop: 10, padding: "11px 12px", border: "1px solid var(--line)", borderRadius: "var(--radius-input)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>No prompt? Pay manually</div>
          {[["Merchant number", "0771 182 400"], ["Exact amount", "$15.50"], ["Reference", "LG-4471"]].map(([l, v]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", minHeight: 40 }}>
              <span style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>{l}</span>
              <span style={{ fontSize: 14, fontWeight: 700, ...TAB }}>{v}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-text)", border: "1px solid var(--line)", borderRadius: 999, padding: "5px 10px" }}>Copy</span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4, marginTop: 4 }}>Dial your rail's USSD, send the exact amount, then come back and enter your reference.</div>
        </div>
      </Pad>
    </div>
  </Screen>
);

/* R5·4 — prompt sent, waiting for the rail. The one sanctioned wait animation. */
RCB.pay_wait = () => (
  <Screen footer={<Button label="I paid another way · enter my reference" variant="ghost" onClick={nop} style={{ marginTop: 0 }} />}>
    <div style={{ height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><Icon name="phone" size={34} color="var(--accent-text)" /></div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 18, textAlign: "center" }}>Check your phone</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, textAlign: "center", lineHeight: 1.5 }}>Approve the EcoCash prompt on <b style={{ color: "var(--ink)" }}>+263 77 245 1180</b> to pay Sadza Republic.</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-text)", marginTop: 14, ...TAB }}>$15.50 · EcoCash</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 18, textAlign: "center", lineHeight: 1.45 }}>Prompts can take a few minutes — there's no deadline on our side. The kitchen starts only after the money lands and a rider is secured.</div>
    </div>
  </Screen>
);

/* R5·5 — paid outside the prompt (USSD, another line, a relative's phone). The reference the
   customer types is what the merchant matches against their own statement. */
RCB.pay_manual = () => (
  <Screen footer={<Button label="Submit my reference" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="I paid another way" sub="Order LG-4471" />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>YOU SHOULD HAVE SENT</div>
        <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15, ...TAB }}>$15.50</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>to 0771 182 400 · Sadza Republic</div>
      </Card>
      <PB.Field label="Your transaction reference" value="" onChange={nop} placeholder="e.g. EC240727.1132.A81043" hint="Copy it from the confirmation SMS — not a screenshot." />
      <PB.Field label="Number you paid from" value="+263 77 245 1180" onChange={nop} />
      <div style={{ display: "flex", gap: 8, marginTop: 6, padding: "11px 12px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
        <Icon name="circle-alert" size={15} color="var(--muted)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>Sadza Republic checks this against their own statement before they cook. A wrong or short amount is rejected and refunded, not guessed at.</div>
      </div>
    </Pad>
  </Screen>
);

/* R5·6 — paid, waiting for the merchant to confirm it landed. The gap that used to be undesigned. */
RCB.pay_confirmed = () => (
  <Screen>
    <OrderHead status="PAID" tone="var(--highlight-ink)" bg="var(--highlight-wash)" />
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 16px 0" }}>
      <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--highlight-wash)", display: "grid", placeItems: "center" }}><Icon name="clock" size={34} color="var(--highlight-ink)" /></div>
      <div style={{ fontSize: 16.5, fontWeight: 700, marginTop: 16, textAlign: "center" }}>Payment sent — waiting for the restaurant</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5, textAlign: "center", lineHeight: 1.45 }}>Sadza Republic is checking their statement. Nothing is cooked until they confirm, and if they can't find it we refund and cancel.</div>
      <Card style={{ padding: 13, width: "100%", marginTop: 14 }}>
        {[["Amount sent", "$15.50"], ["Your reference", "EC-77241180-4471"], ["Sent at", "09:52"]].map(([l, v]) => (
          <div key={l} style={{ display: "flex", alignItems: "baseline", padding: "6px 0" }}>
            <span style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>{l}</span>
            <span style={{ fontSize: 13, fontWeight: 700, ...TAB }}>{v}</span>
          </div>
        ))}
      </Card>
      <div style={{ width: "100%", marginTop: 12 }}><SafetyRow /></div>
    </div>
  </Screen>
);

/* R5·b3 — the kitchen is out of one line item. Approve the shorter order or cancel — 60 seconds,
   with the money difference stated (a partial refund on WALLET). */
RCB.item_removed = () => (
  <Screen footer={
    <div>
      <Button label="Yes — send it without the muriwo" onClick={nop} style={{ marginTop: 0 }} />
      <Button label="Cancel the whole order" variant="ghost" onClick={nop} style={{ color: "var(--danger-ink)" }} />
    </div>
  }>
    <AppBar title="One item is unavailable" sub="LG-4471 · answer within 0:52 — no answer cancels it, free" />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 14, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 9, marginBottom: 10 }}>
          <Icon name="circle-alert" size={17} color="var(--highlight-ink)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.45 }}>Sadza Republic has everything except the <b>muriwo une dovi</b>. They can cook the rest now.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--line)", opacity: .55 }}>
          <span style={{ minWidth: 28, height: 28, borderRadius: 8, background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, ...TAB }}>1</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, textDecoration: "line-through" }}>Muriwo une dovi</span>
          <Money v="2.50" size={13.5} weight={600} color="var(--muted)" />
        </div>
      </Card>
      <Card style={{ padding: 14 }}>
        <PriceMath goods="10.50" fee="2.50" km="3.1" total="13.00" note="You'd pay $2.50 less — refunded on mobile money, or less cash at the door." />
      </Card>
    </Pad>
  </Screen>
);

/* R5·b1 — still unpaid, later. No clock, no auto-cancel — an honest reminder and a free exit. */
RCB.pay_open = () => (
  <Screen footer={<Button label="Pay now · $15.50" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="Order LG-4471" />
    <Pad style={{ paddingTop: 14 }}>
      <Card style={{ padding: "10px 16px 18px" }}>
        <EmptyState icon="clock" title="Sadza Republic is still waiting" message="You confirmed this order on the phone at 09:46, but the payment hasn't landed. Nothing is cooking and nothing was charged — they start the moment it arrives.">
          <Button label="Cancel the order — free" variant="ghost" onClick={nop} />
        </EmptyState>
      </Card>
      <div style={{ display: "flex", gap: 8, marginTop: 12, padding: "10px 12px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
        <Icon name="banknote" size={15} color="var(--muted)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>Unpaid orders close by themselves when the kitchen closes for the day — nothing is ever charged. You can also pay cash at the door next time.</div>
      </div>
    </Pad>
  </Screen>
);

/* R5·b2 — the rail declined. Honest cause, single retry, other rails offered. */
RCB.pay_failed = () => (
  <Screen footer={<Button label="Try again · $15.50" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="Pay Sadza Republic" sub="Order LG-4471" />
    <Pad style={{ paddingTop: 8 }}>
      <Card style={{ padding: "10px 16px 16px" }}>
        <EmptyState icon="circle-alert" title="The payment was declined" message="No money left your EcoCash. Usually the balance was too low, or the prompt was declined on the phone." />
      </Card>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", margin: "14px 0 7px" }}>OR PAY WITH</div>
      {RAILS.slice(1).map((r) => <RailRow key={r.id} rail={r} note="Approve on your phone" />)}
    </Pad>
  </Screen>
);

/* R6·1 — accepted: prep countdown running, rider not yet secured. The honest in-between. */
RCB.track_prep = () => (
  <Screen>
    <OrderHead status="COOKING SOON" />
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 16px 0" }}>
      <Ring value={17} total={20} label="17" sub="min prep" />
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12, textAlign: "center" }}>Sadza Republic accepted your order</div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, textAlign: "center", lineHeight: 1.45 }}>They said 20 minutes. We're finding a rider now — the kitchen starts once one is secured.</div>
      <Card style={{ padding: 12, width: "100%", marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
          <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><Icon name="bike" size={16} color="var(--accent-text)" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Finding a rider</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Nearest first · usually under 2 min</div>
          </div>
          <Skeleton width={38} height={10} />
        </div>
        <RTracker step={2} times={{ 0: "11 min ago", 1: "8 min ago" }} />
      </Card>
    </div>
  </Screen>
);

/* R6·2 — rider secured. This is the moment the kitchen is told to cook. */
RCB.track_secured = () => (
  <Screen banner={<Banner tone="good" icon="circle-check" title="Rider secured — the kitchen is cooking" msg="Tendai M. is assigned and heading over." />}>
    <OrderHead status="COOKING" />
    <div style={{ padding: "0 16px" }}>
      <Card style={{ padding: 12, marginBottom: 10 }}>
        <RiderCard eta="heading to the kitchen" meta="★ 4.8 · 132 trips · cash at the door" />
      </Card>
      <Card style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Ready in about 12 min</span>
          <span style={{ fontSize: 12.5, color: "var(--muted)", ...TAB }}>Arrives ≈ 10:14</span>
        </div>
        <RTracker step={2} times={{ 0: "13 min ago", 1: "10 min ago", 2: "just now" }} />
      </Card>
      <SafetyRow />
    </div>
  </Screen>
);

/* R6·3 — on the way. Real Harare corridor, Express tracker grammar, code always visible. */
RCB.track_way = () => (
  <Screen pad={false}>
    <div style={{ height: "100%", position: "relative" }}>
      <HarareMap fill phase="toCustomer" />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", borderRadius: "18px 18px 0 0", padding: "12px 16px 14px", boxShadow: "0 -6px 22px rgba(20,24,27,.16)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 10px" }} />
        <div style={{ marginBottom: 10 }}><RiderCard eta="6 min away" meta="Picked up 4 min ago · pay $15.50 cash at the door" /></div>
        <div style={{ padding: "11px 13px", background: "var(--surface)", borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em" }}>DELIVERY CODE</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--line)", letterSpacing: ".14em", ...TAB }}>••• •••</div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.35 }}>Appears at the door, once you and Tendai both confirm the cash.</div>
        </div>
        <div style={{ marginTop: 10 }}><SafetyRow /></div>
      </div>
    </div>
  </Screen>
);

/* R6·b1 — socket drop mid-track. Muted, never alarming; last known position is labelled. */
RCB.track_paused = () => (
  <Screen pad={false} banner={<Banner tone="offline" icon="wifi-off" title="Live paused — reconnecting…" msg="Last update 10:06. Your order is unaffected." />}>
    <div style={{ height: "100%", position: "relative" }}>
      <HarareMap fill phase="toCustomer" paused />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", borderRadius: "18px 18px 0 0", padding: "12px 16px 14px", boxShadow: "0 -6px 22px rgba(20,24,27,.16)" }}>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>Tendai M. · on the way</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "3px 0 10px" }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: ".06em", background: "var(--ink)", color: "#fff", borderRadius: 6, padding: "2px 8px", ...TAB }}>AEE 4471</span>
          <span style={{ fontSize: 12.5, color: "var(--muted)", ...TAB }}>Position last confirmed 4 min ago</span>
        </div>
        <div style={{ padding: "11px 13px", background: "var(--surface)", borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em" }}>DELIVERY CODE</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--line)", letterSpacing: ".14em", ...TAB }}>••• •••</div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.35 }}>Stored on this phone. If you're still offline at the door, pay first — then press and hold to reveal it.</div>
        </div>
      </div>
    </div>
  </Screen>
);

/* R6·b2 — NO_RIDER. Apology, plain mechanism, two honest ways forward. */
RCB.no_rider = () => (
  <Screen>
    <AppBar title="Order LG-4471" />
    <Pad style={{ paddingTop: 10 }}>
      <Card style={{ padding: "10px 16px 18px" }}>
        <EmptyState icon="bike" title="We couldn't find a rider" message="We tried every rider near Fife Ave for 6 minutes. Sadza Republic never started cooking, and you were not charged.">
          <Button label="Try again now" onClick={nop} />
          <Button label="See places with riders nearby" variant="ghost" onClick={nop} />
        </EmptyState>
      </Card>
      <Card style={{ padding: 13, marginTop: 12 }}>
        <RTracker step={2} failAt={2} times={{ 0: "9 min ago", 1: "6 min ago", 2: "just now · no rider" }} />
      </Card>
    </Pad>
  </Screen>
);

/* R6·b3 — merchant rejected after a wallet payment: refund pending, with the reference. */
RCB.rejected = () => (
  <Screen>
    <AppBar title="Order LG-4471" />
    <Pad style={{ paddingTop: 10 }}>
      <Card style={{ padding: "10px 16px 16px" }}>
        <EmptyState icon="circle-alert" title="Sadza Republic couldn't take your order" message="They ran out of beef stew. Because you'd already paid, they owe you a refund — we're tracking it." />
      </Card>
      <Card style={{ padding: 14, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".04em", color: "var(--highlight-ink)", background: "var(--highlight-wash)", borderRadius: 999, padding: "4px 10px" }}>REFUND PENDING</span>
          <span style={{ flex: 1 }} /><Money v="15.50" size={17} />
        </div>
        {[["Paid to", "Sadza Republic · EcoCash"], ["Your reference", "EC-77241180-4471"], ["Refund due by", "Today, 12:00"]].map(([l, v]) => (
          <div key={l} style={{ display: "flex", padding: "6px 0", borderTop: "1px solid var(--line)" }}>
            <span style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>{l}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, ...TAB }}>{v}</span>
          </div>
        ))}
        <Button label="Get help with this refund" variant="ghost" onClick={nop} />
      </Card>
    </Pad>
  </Screen>
);

/* R6·b4 — refund landed. The reference stays in the order forever. */
RCB.refunded = () => (
  <Screen>
    <AppBar title="Order LG-4471" />
    <Pad style={{ paddingTop: 10 }}>
      <Card accent style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><Icon name="circle-check" size={19} color="var(--accent-text)" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Refunded in full</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Sadza Republic sent it back at 11:26</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
          <span style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>Amount</span><Money v="15.50" size={16} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", padding: "6px 0", borderTop: "1px solid var(--line)" }}>
          <span style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>Their reference</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, ...TAB }}>EC-4471-RF9920</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.45 }}>Keep this reference — it's your proof against the restaurant's own statement, not a screenshot.</div>
      </Card>
      <Button label="Order from somewhere else" onClick={nop} />
    </Pad>
  </Screen>
);

/* R6·b5 — cancel, pre-pickup only. States the consequence before the destructive act. */
RCB.cancel_sheet = () => (
  <Screen pad={false}>
    <div style={{ opacity: .3, padding: 16 }}><Skeleton height={120} radius={14} /></div>
    <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)" }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", borderRadius: "20px 20px 0 0", padding: "16px 16px 14px" }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 12px" }} />
      <div style={{ fontSize: 16.5, fontWeight: 700 }}>Cancel this order?</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5, lineHeight: 1.45 }}>The food isn't cooked yet, so this is free. Once the rider collects it you'd owe the full $15.50 — the kitchen and the rider have both already been paid.</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", margin: "14px 0 7px" }}>WHY ARE YOU CANCELLING?</div>
      {["Taking too long", "Ordered by mistake", "I don't need it any more", "Something else"].map((r, i) => (
        <div key={r} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1.5px solid ${i === 0 ? "var(--accent)" : "var(--line)"}`, background: i === 0 ? "var(--accent-wash)" : "var(--bg)", borderRadius: "var(--radius-input)", marginBottom: 7 }}>
          <span style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${i === 0 ? "var(--accent)" : "var(--line)"}`, background: i === 0 ? "var(--accent)" : "var(--bg)" }} />
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r}</span>
        </div>
      ))}
      <Button label="Cancel my order" onClick={nop} style={{ background: "var(--danger)" }} />
      <Button label="Keep waiting" variant="ghost" onClick={nop} />
    </div>
  </Screen>
);

/* R7·1 — the door, collect-and-return. Food first, then cash, then BOTH confirm in-app — the
   delivery code appears only after the handshake, so the money moment can't be skipped. */
RCB.handoff = () => (
  <Screen footer={<Button label="I gave Tendai the cash · $15.50" onClick={nop} style={{ marginTop: 0 }} />}>
    <OrderHead status="AT YOUR DOOR" />
    <Pad style={{ paddingTop: 4 }}>
      <Card style={{ padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", letterSpacing: ".04em" }}>TAKE YOUR FOOD, THEN PAY</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 34, fontWeight: 800, ...TAB }}>$15.50</span>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>cash to Tendai</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>$13.00 food + $2.50 delivery. Tendai rides the $13.00 back to Sadza Republic after this stop.</div>
      </Card>
      <Card style={{ padding: 13, marginTop: 10 }}>
        {[["check", "Take your food from Tendai", true], ["banknote", "Hand over $15.50 and tap the button below", false], ["clock", "Tendai confirms — your code appears", false]].map(([ic, l, done], i) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: done ? "var(--accent)" : i === 1 ? "var(--accent-wash)" : "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={ic} size={14} color={done ? "#fff" : i === 1 ? "var(--accent-text)" : "var(--muted)"} /></span>
            <span style={{ fontSize: 13, fontWeight: done || i === 1 ? 700 : 600, color: done || i === 1 ? "var(--ink)" : "var(--muted)", lineHeight: 1.35 }}>{l}</span>
          </div>
        ))}
      </Card>
      <Card style={{ padding: 14, marginTop: 10, textAlign: "center", background: "var(--surface)", boxShadow: "none" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em" }}>DELIVERY CODE</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "var(--line)", letterSpacing: ".14em", margin: "4px 0 2px", ...TAB }}>••• •••</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>Appears once you and Tendai both confirm the cash.</div>
      </Card>
    </Pad>
  </Screen>
);

/* R7·1b — you confirmed; the rider is counting. The trip cannot close until both taps exist. */
RCB.handoff_wait = () => (
  <Screen>
    <OrderHead status="CONFIRMING CASH" tone="var(--highlight-ink)" bg="var(--highlight-wash)" />
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 16px 0" }}>
      <Ring value={85} total={120} label="1:25" sub="for Tendai" tone="var(--highlight)" size={96} />
      <div style={{ fontSize: 16.5, fontWeight: 700, marginTop: 14, textAlign: "center" }}>Waiting for Tendai to confirm</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5, textAlign: "center", lineHeight: 1.45 }}>You said you gave $15.50 at 10:14 — that's saved. Tendai counts it and confirms the same amount. If he doesn't within 2 minutes, support is called automatically.</div>
      <Card style={{ padding: 13, width: "100%", marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, paddingBottom: 9, borderBottom: "1px solid var(--line)" }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center" }}><Icon name="check" size={13} color="#fff" /></span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>You gave $15.50</span>
          <span style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>10:14</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, paddingTop: 9 }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--highlight-wash)", display: "grid", placeItems: "center" }}><Icon name="clock" size={13} color="var(--highlight-ink)" /></span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Tendai — counting…</span>
          <Skeleton width={34} height={10} />
        </div>
      </Card>
    </div>
  </Screen>
);

/* R7·1c — both confirmed. The code appears and closes the trip. */
RCB.handoff_code = () => (
  <Screen banner={<Banner tone="good" icon="circle-check" title="Cash confirmed by both of you" msg="$15.50 · 10:15 — now read the code to Tendai to finish." />}>
    <OrderHead status="READ THE CODE" />
    <div style={{ padding: "0 16px" }}>
      <CodeCard code="418 302" hint="Tendai types this to close the trip — your receipt that food and cash both moved." />
      <Card style={{ padding: 13, marginTop: 10 }}>
        {[["You gave $15.50", "10:14"], ["Tendai received $15.50", "10:15"]].map(([l, t], i) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center" }}><Icon name="check" size={12} color="#fff" /></span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{l}</span>
            <span style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>{t}</span>
          </div>
        ))}
      </Card>
    </div>
  </Screen>
);

/* R7·b3 — you confirmed, the rider didn't. The trip freezes open, support is auto-called, and the
   rider can't take new jobs until it's settled. */
RCB.handoff_dispute = () => (
  <Screen footer={<Button label="Call support now" onClick={nop} style={{ marginTop: 0 }} />}>
    <OrderHead status="ON HOLD" tone="var(--danger-ink)" bg="var(--danger-wash)" />
    <Pad style={{ paddingTop: 6 }}>
      <Card style={{ padding: "8px 16px 14px" }}>
        <EmptyState icon="circle-alert" title="Tendai hasn't confirmed your cash" message="You said you gave $15.50 at 10:14. He hasn't confirmed it, so this order stays open and support has already been called — he can't take another job until it's settled. Keep your food; stay at the door if you can." />
      </Card>
      <Card style={{ padding: 13, marginTop: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>WHAT'S LOGGED</div>
        {[["10:14", "You confirmed giving $15.50"], ["10:16", "No confirmation from the rider"], ["10:16", "Support called automatically"]].map(([t, l]) => (
          <div key={l} style={{ display: "flex", gap: 10, padding: "3px 0" }}>
            <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 38, ...TAB }}>{t}</span>
            <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{l}</span>
          </div>
        ))}
      </Card>
      <div style={{ marginTop: 10 }}><SafetyRow /></div>
    </Pad>
  </Screen>
);

/* R7·2 — delivered → rate. Same two-sided rating pattern as Express. */
RCB.delivered_rate = () => (
  <Screen footer={<Button label="Submit rating" onClick={nop} style={{ marginTop: 0 }} />}>
    <Pad style={{ paddingTop: 18, textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
        <Icon name="circle-check" size={26} color="var(--accent-text)" />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Delivered at 10:16</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>$15.50 paid in cash · Sadza Republic</div>
      <Card style={{ padding: 14, marginTop: 16, textAlign: "left" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>How was the food?</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>{[1, 2, 3, 4, 5].map((i) => <span key={i} style={{ fontSize: 27, color: i <= 4 ? "var(--highlight)" : "var(--line)" }}>★</span>)}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>How was Tendai M.?</div>
        <div style={{ display: "flex", gap: 8 }}>{[1, 2, 3, 4, 5].map((i) => <span key={i} style={{ fontSize: 27, color: i <= 5 ? "var(--highlight)" : "var(--line)" }}>★</span>)}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {["Hot food", "On time", "Polite", "Right order"].map((t, i) => (
            <span key={t} style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999, border: `1px solid ${i < 2 ? "#bfe7cf" : "var(--line)"}`, background: i < 2 ? "var(--accent-wash)" : "var(--bg)", color: i < 2 ? "var(--accent-text)" : "var(--muted)" }}>{t}</span>
          ))}
        </div>
      </Card>
    </Pad>
  </Screen>
);

/* R7·b1 — customer no-show terminal. Logged attempts are the evidence; goods went back. */
RCB.failed_noshow = () => (
  <Screen footer={<Button label="Get help with this order" variant="ghost" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="Order LG-4471" />
    <Pad style={{ paddingTop: 6 }}>
      <Card style={{ padding: "8px 16px 14px" }}>
        <EmptyState icon="triangle-alert" title="We couldn't hand your food over" message="Tendai waited 8 minutes and called twice, so the food went back to Sadza Republic. You weren't charged for it — only the $2.50 delivery fee stands." />
      </Card>
      <Card style={{ padding: 14, marginTop: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>WHAT HAPPENED</div>
        {[["10:16", "Rider arrived at your address"], ["10:18", "Called twice — no answer"], ["10:24", "Waiting window ended"], ["10:39", "Food returned to the restaurant"]].map(([t, l]) => (
          <div key={t} style={{ display: "flex", gap: 10, padding: "3px 0" }}>
            <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 38, ...TAB }}>{t}</span>
            <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{l}</span>
          </div>
        ))}
      </Card>
    </Pad>
  </Screen>
);

/* R7·b2 — app killed and reopened mid-order. Straight back into the live order. */
RCB.resume = () => (
  <Screen banner={<Banner tone="info" icon="refresh-cw" title="Picking up where you left off" msg="Your order is still live — nothing was lost." />}>
    <OrderHead status="ON THE WAY" />
    <div style={{ padding: "0 16px" }}>
      <Card style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center" }}><Icon name="bike" size={18} color="var(--accent-text)" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Tendai M. · 6 min away</div>
            <div style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>Cash at the door · $15.50</div>
          </div>
        </div>
      </Card>
      <Card style={{ padding: 12 }}><RTracker step={5} times={{ 0: "09:41", 1: "09:44", 2: "09:46", 3: "09:58", 4: "10:02", 5: "10:02" }} /></Card>
    </div>
  </Screen>
);


/* R6·b6 — the rider cancelled after being secured. Express grammar: the tracker steps back one, the
   reason is named, and the food is not lost. */
RCB.rider_cancelled = () => (
  <Screen banner={<Banner tone="warn" icon="bike" title="Your rider had a bike problem" msg="Finding another one now — same food, same price, same code." />}>
    <OrderHead status="FINDING A RIDER" tone="var(--highlight-ink)" bg="var(--highlight-wash)" />
    <div style={{ padding: "0 16px" }}>
      <Card style={{ padding: 13, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--highlight-wash)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="bike" size={19} color="var(--highlight-ink)" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Looking for another rider</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Nearest first · usually under 2 min</div>
          </div>
          <Skeleton width={38} height={10} />
        </div>
      </Card>
      <Card style={{ padding: 12 }}>
        <RTracker step={2} times={{ 0: "25 min ago", 1: "22 min ago", 2: "just now" }} />
      </Card>
    </div>
  </Screen>
);
