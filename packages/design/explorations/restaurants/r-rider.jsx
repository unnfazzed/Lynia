/* LyniaGo Restaurants — RIDER screens (same Expo app, rider role). Auto-dispatch offers, the float
   rule, the mirrored pay-merchant moment, code capture and the return leg. Registers window.RR. */

const R = window.RParts;
const { Button, Card, Field, EmptyState, Icon, Money, Pad, AppBar, Screen, Banner, PayTag, Ring,
  CodeCard, HarareMap, PickupCode, TimerBar, nop, TAB } = R;

const RR = (window.RR = window.RR || {});

const OfferHead = ({ secs, total, tone = "var(--cta-fill)" }) => (
  <div style={{ background: tone, padding: "10px 16px 12px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <Icon name="timer" size={17} color="#fff" />
      <span style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", letterSpacing: ".03em" }}>NEW ORDER</span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", ...TAB }}>{secs}s</span>
    </div>
    <TimerBar value={parseInt(secs, 10) || 0} total={60} />
  </div>
);
const Leg = ({ role, name, meta }) => (
  <div style={{ display: "flex", gap: 10, padding: "9px 0" }}>
    <span style={{ width: 24, display: "grid", placeItems: "center", paddingTop: 2 }}>
      <span style={{ width: 11, height: 11, borderRadius: role === "pickup" ? "50%" : 3, background: role === "pickup" ? "var(--ink)" : "var(--accent)" }} />
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>{role === "pickup" ? "COLLECT FROM" : "DELIVER TO"}</div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>{meta}</div>
    </div>
  </div>
);

/* R1·1 — CASH offer, collect-and-return (the default). Nothing from the rider's pocket; the
   return-to-kitchen duty is stated on the offer, not discovered at the door. */
RR.offer_cash = () => (
  <Screen pad={false}>
    <OfferHead secs="47" total="15.50" />
    <div style={{ padding: "12px 16px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <PayTag pay="CASH" size="lg" />
        <div style={{ flex: 1, textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>YOU EARN</div>
          <Money v="2.50" size={22} />
        </div>
      </div>
      <Card style={{ padding: 13, marginBottom: 10, background: "var(--highlight-wash)", boxShadow: "none" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--highlight-ink)" }}>COLLECT AT THE DOOR</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", lineHeight: 1.15, ...TAB }}>$15.50</div>
        <div style={{ fontSize: 12, color: "var(--highlight-ink)", lineHeight: 1.4 }}>Nothing from your pocket. Hand over the food, take the cash, then ride $13.00 back to the kitchen — the $2.50 is yours.</div>
      </Card>
      <Card style={{ padding: "4px 13px" }}>
        <Leg role="pickup" name="Sadza Republic" meta="Fife Ave · 1.4 km away · ready in 12 min" />
        <div style={{ height: 1, background: "var(--line)", marginLeft: 24 }} />
        <Leg role="drop" name="12 Lanark Rd, Belgravia" meta="3.1 km from the restaurant" />
      </Card>
      <div style={{ height: 72, borderRadius: 12, overflow: "hidden", marginTop: 10 }}><HarareMap fill phase="atRestaurant" /></div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
        <Icon name="refresh-cw" size={14} color="var(--muted)" />After the drop: return leg to the kitchen · ~9 min · no new offers until they confirm the cash
      </div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 16px 14px", background: "var(--bg)", borderTop: "1px solid var(--line)" }}>
      <Button label="Accept · collect at the door" onClick={nop} style={{ marginTop: 0 }} />
      <Button label="Pass" variant="ghost" onClick={nop} />
    </div>
  </Screen>
);

/* R1·1b — a kitchen whose rule is 'pay me upfront'. The old fronting model, now opt-in per
   merchant — cash headroom applies only to these offers. */
RR.offer_upfront = () => (
  <Screen pad={false}>
    <OfferHead secs="51" total="15.50" />
    <div style={{ padding: "12px 16px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <PayTag pay="CASH" size="lg" />
        <div style={{ flex: 1, textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>YOU EARN</div>
          <Money v="2.50" size={22} />
        </div>
      </div>
      <Card style={{ padding: 13, marginBottom: 10, background: "var(--highlight-wash)", boxShadow: "none" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--highlight-ink)" }}>THIS KITCHEN ASKS YOU TO PAY FIRST</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", lineHeight: 1.15, ...TAB }}>$13.00</div>
        <div style={{ fontSize: 12, color: "var(--highlight-ink)", lineHeight: 1.4 }}>Sadza Republic's rule: cash before the food leaves. You collect $15.50 at the door — no return leg.</div>
      </Card>
      <Card style={{ padding: "4px 13px" }}>
        <Leg role="pickup" name="Sadza Republic" meta="Fife Ave · 1.4 km away · ready in 12 min" />
        <div style={{ height: 1, background: "var(--line)", marginLeft: 24 }} />
        <Leg role="drop" name="12 Lanark Rd, Belgravia" meta="3.1 km from the restaurant" />
      </Card>
      <div style={{ display: "flex", gap: 8, marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
        <Icon name="banknote" size={14} color="var(--muted)" />Only accept if you're carrying $13.00 — nobody checks a balance, but arriving short strands you at the counter
      </div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 16px 14px", background: "var(--bg)", borderTop: "1px solid var(--line)" }}>
      <Button label="Accept · front $13.00" onClick={nop} style={{ marginTop: 0 }} />
      <Button label="Pass" variant="ghost" onClick={nop} />
    </div>
  </Screen>
);

/* R1·2 — WALLET offer. No float at risk; say so, because that changes the decision. */
RR.offer_wallet = () => (
  <Screen pad={false}>
    <OfferHead secs="52" total="6.00" />
    <div style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <PayTag pay="WALLET" size="lg" />
        <div style={{ flex: 1, textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>YOU EARN</div>
          <Money v="2.00" size={22} />
        </div>
      </div>
      <Card style={{ padding: 13, marginBottom: 10, background: "var(--accent-wash)", boxShadow: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="circle-check" size={20} color="var(--accent-text)" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>No money from your pocket</div>
            <div style={{ fontSize: 12, color: "var(--accent-text)" }}>The customer already paid the restaurant. Just collect and deliver.</div>
          </div>
        </div>
      </Card>
      <Card style={{ padding: "4px 13px" }}>
        <Leg role="pickup" name="Sadza Republic" meta="Fife Ave · 0.8 km away · ready now" />
        <div style={{ height: 1, background: "var(--line)", marginLeft: 24 }} />
        <Leg role="drop" name="45 Josiah Tongogara Ave, Avenues" meta="1.9 km from the restaurant" />
      </Card>
      <div style={{ height: 92, borderRadius: 12, overflow: "hidden", marginTop: 10 }}><HarareMap fill phase="toRestaurant" /></div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 16px 14px", background: "var(--bg)", borderTop: "1px solid var(--line)" }}>
      <Button label="Accept" onClick={nop} style={{ marginTop: 0 }} />
      <Button label="Pass" variant="ghost" onClick={nop} />
    </div>
  </Screen>
);

/* R1·b2 — it expired while you were reading. No penalty, and the next one is coming. */
RR.offer_expired = () => (
  <Screen>
    <Pad style={{ paddingTop: 30 }}>
      <Card style={{ padding: "10px 16px 18px" }}>
        <EmptyState icon="timer" title="That one went to another rider" message="Offers hold for 60 seconds, then move to the next rider nearby. Passing or missing one doesn't affect your standing.">
          <Button label="Back to the board" onClick={nop} />
        </EmptyState>
      </Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 14, fontSize: 12.5, color: "var(--muted)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />You're online and first in line for the next one
      </div>
    </Pad>
  </Screen>
);

/* R2·1 — navigate to the restaurant. Real corridor geometry; prep clock visible. */
RR.nav_rest = () => (
  <Screen pad={false}>
    <div style={{ height: "100%", position: "relative" }}>
      <HarareMap fill phase="toRestaurant" />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", borderRadius: "18px 18px 0 0", padding: "12px 16px 14px", boxShadow: "0 -6px 22px rgba(20,24,27,.16)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 10px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>Sadza Republic · 4 min</div>
            <div style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>Food ready in 12 min · nothing to pay here</div>
          </div>
          <PayTag pay="CASH" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button label="Open in Maps" variant="ghost" onClick={nop} style={{ flex: 1, marginTop: 0 }} />
          <span style={{ width: 48, height: 44, borderRadius: 999, border: "1px solid var(--line)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="phone" size={17} color="var(--accent-text)" /></span>
        </div>
      </div>
    </div>
  </Screen>
);

/* R2·2 — pay the merchant. The exact mirror of the merchant's confirm screen. */
RR.pay_merchant = () => (
  <Screen footer={<Button label="I paid $13.00 in cash" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="Pay Sadza Republic" sub="Order LG-4471" />
    <Pad style={{ paddingTop: 0 }}>
      <Card accent style={{ padding: 18, textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-text)", letterSpacing: ".04em" }}>HAND OVER EXACTLY</div>
        <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.1, ...TAB }}>$13.00</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>Food only. Not the $2.50 delivery — that's yours.</div>
      </Card>
      <div style={{ display: "flex", gap: 9, marginTop: 12, padding: "11px 13px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
        <Icon name="circle-alert" size={16} color="var(--muted)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>The cashier is confirming the same $13.00 on their screen. Both taps must match before the food is released.</div>
      </div>
      <div style={{ marginTop: 12 }}><PickupCode code="7241" /></div>
      <Card style={{ padding: 13, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>YOU'LL GET BACK AT THE DOOR</div>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ flex: 1, fontSize: 13, color: "var(--muted)" }}>Food you fronted</span><Money v="13.00" size={13.5} weight={600} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", marginTop: 4 }}>
          <span style={{ flex: 1, fontSize: 13, color: "var(--muted)" }}>Your delivery fee</span><Money v="2.50" size={13.5} weight={600} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>Collect from the customer</span><Money v="15.50" size={18} />
        </div>
      </Card>
    </Pad>
  </Screen>
);

/* R2·3 — collect the food. Count the bags, not the ingredients. */
RR.pickup_confirm = () => (
  <Screen footer={<Button label="I have the order — start delivery" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="Collect the order" sub="LG-4471 · Sadza Republic" />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>CHECK BEFORE YOU RIDE</div>
        {[["1 × Half roast huku", true], ["1 × Sadza & beef stew", true], ["1 × Muriwo une dovi", false]].map(([l, on]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent)" : "var(--bg)", display: "grid", placeItems: "center" }}>{on ? <Icon name="check" size={14} color="#fff" /> : null}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{l}</span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, lineHeight: 1.45 }}>Missing something? Say so now — once you ride off it's your word against theirs.</div>
      </Card>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12, padding: "11px 13px", background: "var(--highlight-wash)", borderRadius: "var(--radius-input)" }}>
        <Icon name="banknote" size={16} color="var(--highlight-ink)" />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--highlight-ink)" }}>NOT PAID — collect $15.50 cash at the door</span>
      </div>
    </Pad>
  </Screen>
);

/* R2·3b — collecting a WALLET order. Payment already settled and confirmed by the kitchen before
   it cooked — the rider sees PAID in one glance and collects nothing, here or at the door. */
RR.pickup_paid = () => (
  <Screen footer={<Button label="I have the order — start delivery" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="Collect the order" sub="LG-4472 · Sadza Republic" />
    <Pad style={{ paddingTop: 0 }}>
      <Card accent style={{ padding: 14, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="check" size={20} color="#fff" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: "var(--accent-text)", ...TAB }}>PAID · $6.00 · EcoCash</div>
            <div style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>Confirmed by Sadza Republic at 09:54 · ref …4472</div>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 8, lineHeight: 1.4 }}>Collect nothing — not here, not at the door. Just the code at hand-off.</div>
      </Card>
      <Card style={{ padding: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>CHECK BEFORE YOU RIDE</div>
        {["1 × Rice & chicken stew"].map((l) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0" }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, border: "2px solid var(--accent)", background: "var(--accent)", display: "grid", placeItems: "center" }}><Icon name="check" size={14} color="#fff" /></span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{l}</span>
          </div>
        ))}
      </Card>
    </Pad>
  </Screen>
);

/* R3·1 — ride to the customer. Amount to collect is pinned in view the whole way. */
RR.nav_cust = () => (
  <Screen pad={false}>
    <div style={{ height: "100%", position: "relative" }}>
      <HarareMap fill phase="toCustomer" />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", borderRadius: "18px 18px 0 0", padding: "12px 16px 14px", boxShadow: "0 -6px 22px rgba(20,24,27,.16)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 10px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>12 Lanark Rd, Belgravia</div>
            <div style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>6 min · gate 2, ask for Rufaro</div>
          </div>
          <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="phone" size={18} color="#fff" /></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--highlight-wash)", borderRadius: 12 }}>
          <Icon name="banknote" size={17} color="var(--highlight-ink)" />
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "var(--highlight-ink)" }}>Collect at the door</span>
          <Money v="15.50" size={19} color="var(--highlight-ink)" />
        </div>
      </div>
    </div>
  </Screen>
);

/* R3·2 — the doorstep. Food first, cash second, confirm third — code entry unlocks only after
   both sides confirm the cash, so the handshake can't be skipped. */
RR.doorstep = () => (
  <Screen footer={<Button label="I received $15.50 in cash" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="At the door" sub="LG-4471 · Rufaro C." />
    <Pad style={{ paddingTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", background: "var(--accent-wash)", borderRadius: "var(--radius-input)", marginBottom: 10 }}>
        <Icon name="circle-check" size={16} color="var(--accent-text)" />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>1 · Hand over the food first</span>
      </div>
      <Card style={{ padding: 14, background: "var(--highlight-wash)", boxShadow: "none" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--highlight-ink)" }}>2 · COLLECT AND COUNT</div>
        <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1, ...TAB }}>$15.50</div>
        <div style={{ fontSize: 12, color: "var(--highlight-ink)", lineHeight: 1.4 }}>$13.00 goes back to Sadza Republic + $2.50 yours. Count it, then confirm below — Rufaro confirms the same amount on her phone.</div>
      </Card>
      <Card style={{ padding: 14, marginTop: 10, opacity: .55 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>3 · CODE ENTRY — LOCKED</div>
        <div style={{ display: "flex", gap: 7 }}>
          {["", "", "", "", "", ""].map((d, i) => (
            <span key={i} style={{ flex: 1, height: 52, borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 700, ...TAB }}>{d}</span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.4 }}>Unlocks when you and Rufaro have both confirmed the cash.</div>
      </Card>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
        <Icon name="circle-alert" size={14} color="var(--muted)" />Short or wrong amount? Don't confirm — <span style={{ color: "var(--accent-text)", fontWeight: 700 }}>show the breakdown</span>
      </div>
    </Pad>
  </Screen>
);

/* R3·b1 — wrong code. Same lockout grammar as Express. */
RR.code_wrong = () => (
  <Screen footer={<Button label="Try again" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="At the door" sub="LG-4471 · Rufaro C." />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
          {["4", "1", "8", "3", "0", "9"].map((d, i) => (
            <span key={i} style={{ flex: 1, height: 52, borderRadius: 10, border: "1.5px solid var(--danger)", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 700, color: "var(--danger-ink)", ...TAB }}>{d}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 9, padding: "11px 13px", background: "var(--danger-wash)", borderRadius: 10 }}>
          <Icon name="triangle-alert" size={16} color="var(--danger-ink)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: "var(--danger-ink)", lineHeight: 1.45 }}>That code doesn't match. 2 tries left, then this order locks and support takes over. Ask them to read it from their order screen.</div>
        </div>
      </Card>
      <Button label="The customer can't find their code" variant="ghost" onClick={nop} />
    </Pad>
  </Screen>
);

/* R3·3 — delivered. The fee is earned; the food money still has to ride back to the kitchen. */
RR.delivered = () => (
  <Screen footer={<Button label="Start the return leg · 9 min" onClick={nop} style={{ marginTop: 0 }} />}>
    <Pad style={{ paddingTop: 22, textAlign: "center" }}>
      <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
        <Icon name="circle-check" size={28} color="var(--accent-text)" />
      </div>
      <div style={{ fontSize: 19, fontWeight: 700 }}>Delivered at 10:16</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>Cash confirmed by both of you · code 418 302</div>
      <Card style={{ padding: 14, marginTop: 16, textAlign: "left" }}>
        {[["You collected", "$15.50"], ["Return to the kitchen", "−$13.00"], ["You keep", "$2.50"]].map(([l, v], i, a) => (
          <div key={l} style={{ display: "flex", alignItems: "baseline", padding: "7px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
            <span style={{ flex: 1, fontSize: 13, color: i === a.length - 1 ? "var(--ink)" : "var(--muted)", fontWeight: i === a.length - 1 ? 700 : 400 }}>{l}</span>
            <span style={{ fontSize: i === a.length - 1 ? 18 : 13.5, fontWeight: 700, color: i === a.length - 1 ? "var(--accent-text)" : "var(--ink)", ...TAB }}>{v}</span>
          </div>
        ))}
      </Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 12, fontSize: 12.5, color: "var(--muted)" }}>
        <Icon name="banknote" size={14} color="var(--muted)" />No new offers until Sadza Republic confirms the $13.00 · today: 6 jobs · $14.50 · $4.80/hour
      </div>
      <Card style={{ padding: 14, marginTop: 12, textAlign: "left" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>Rate Rufaro C.</div>
        <div style={{ display: "flex", gap: 8 }}>{[1, 2, 3, 4, 5].map((i) => <span key={i} style={{ fontSize: 26, color: i <= 5 ? "var(--highlight)" : "var(--line)" }}>★</span>)}</div>
      </Card>
    </Pad>
  </Screen>
);

/* R3·4 — the return-the-cash leg. A real job: navigation back, the amount owed pinned in view, and
   no new offers until the kitchen counts and confirms. */
RR.return_cash = () => (
  <Screen pad={false} banner={<Banner tone="warn" icon="banknote" title="Ride the food money back" msg="No new offers until Sadza Republic confirms the cash." />}>
    <div style={{ height: "100%", position: "relative" }}>
      <HarareMap fill phase="return" />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", borderRadius: "18px 18px 0 0", padding: "12px 16px 14px", boxShadow: "0 -6px 22px rgba(20,24,27,.16)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 10px" }} />
        <div style={{ fontSize: 15.5, fontWeight: 700 }}>Back to Sadza Republic · 9 min</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, ...TAB }}>Fife Ave · they know you're coming</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--highlight-wash)", borderRadius: 12, marginBottom: 8 }}>
          <Icon name="banknote" size={17} color="var(--highlight-ink)" />
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "var(--highlight-ink)" }}>Owed to the kitchen</span>
          <Money v="13.00" size={19} color="var(--highlight-ink)" />
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4, marginBottom: 8 }}>You keep $2.50. The cashier counts the $13.00 and confirms it on their tablet — that closes the job and reopens your offers.</div>
        <Button label="Open in Maps" variant="ghost" onClick={nop} style={{ marginTop: 0 }} />
      </div>
    </div>
  </Screen>
);

/* R3·b2 — the customer confirmed the cash, you haven't. The job freezes, support auto-joins, and
   no new offers until it's settled. */
RR.cash_dispute = () => (
  <Screen footer={
    <div>
      <Button label="Confirm · I received $15.50" onClick={nop} style={{ marginTop: 0 }} />
      <Button label="The amount is wrong — talk to support" variant="ghost" onClick={nop} style={{ color: "var(--danger-ink)" }} />
    </div>
  }>
    <AppBar title="Confirm the cash" sub="LG-4471 · Rufaro C." />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 14, background: "var(--danger-wash)", boxShadow: "none" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <Icon name="circle-alert" size={19} color="var(--danger-ink)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--danger-ink)" }}>Rufaro says she gave you $15.50</div>
            <div style={{ fontSize: 12.5, color: "var(--danger-ink)", marginTop: 4, lineHeight: 1.45 }}>She confirmed at 10:14 and you haven't. Support was called automatically at 10:16, and you can't take another job while this is open. Count again and confirm — a mismatch is named in dollars, never guessed at.</div>
          </div>
        </div>
      </Card>
      <Card style={{ padding: 13, marginTop: 10 }}>
        {[["She confirmed giving", "$15.50 · 10:14"], ["You confirmed", "nothing yet"], ["Support", "on the line · 10:16"]].map(([l, v], i) => (
          <div key={l} style={{ display: "flex", alignItems: "baseline", padding: "6px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
            <span style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>{l}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, ...TAB }}>{v}</span>
          </div>
        ))}
      </Card>
    </Pad>
  </Screen>
);

/* R4·1 — nobody answers. A timed window with logged attempts, not a judgement call. */
RR.unreachable = () => (
  <Screen footer={<Button label="Call Rufaro (attempt 3)" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="Nobody's answering" sub="LG-4471 · 12 Lanark Rd" />
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 16px 0" }}>
      <Ring value={196} total={480} label="3:16" sub="wait left" tone="var(--highlight)" />
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 12, textAlign: "center", lineHeight: 1.45 }}>Wait the full 8 minutes and call twice. If they still don't come, you'll be paid your fee and told where to return the food.</div>
      <Card style={{ padding: 13, width: "100%", marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>LOGGED SO FAR</div>
        {[["10:16", "Arrived at the address"], ["10:18", "Called — no answer (18s)"], ["10:22", "Called — no answer (22s)"]].map(([t, l]) => (
          <div key={t} style={{ display: "flex", gap: 10, padding: "4px 0", fontSize: 12.5 }}>
            <span style={{ color: "var(--muted)", minWidth: 38, ...TAB }}>{t}</span><span>{l}</span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>This log is your evidence. It's shown to the customer and to support.</div>
      </Card>
    </div>
  </Screen>
);

/* R4·2 — the return leg. It's a real job with its own navigation, not an afterthought. */
RR.return_rest = () => (
  <Screen pad={false} banner={<Banner tone="warn" icon="triangle-alert" title="Delivery failed — return the food" msg="You'll still be paid your $2.50 fee." />}>
    <div style={{ height: "100%", position: "relative" }}>
      <HarareMap fill phase="return" />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", borderRadius: "18px 18px 0 0", padding: "12px 16px 14px", boxShadow: "0 -6px 22px rgba(20,24,27,.16)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 10px" }} />
        <div style={{ fontSize: 15.5, fontWeight: 700 }}>Back to Sadza Republic · 9 min</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, ...TAB }}>Fife Ave · they've been told you're coming</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--surface)", borderRadius: 12, marginBottom: 8 }}>
          <Icon name="banknote" size={16} color="var(--muted)" />
          <span style={{ flex: 1, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>Your $13.00 comes back from the restaurant when you hand the food over.</span>
        </div>
        <Button label="Open in Maps" variant="ghost" onClick={nop} style={{ marginTop: 0 }} />
      </div>
    </div>
  </Screen>
);

/* R4·3 — hand-back confirm. Both sides acknowledge the same number again. */
RR.handback = () => (
  <Screen footer={<Button label="Confirm hand-back · $13.00 returned" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="Hand the food back" sub="LG-4471 · Sadza Republic" />
    <Pad style={{ paddingTop: 0 }}>
      <Card accent style={{ padding: 16, textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-text)", letterSpacing: ".04em" }}>THEY GIVE YOU BACK</div>
        <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.1, ...TAB }}>$13.00</div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>The exact cash you fronted. Your $2.50 fee is paid separately by LyniaGo.</div>
      </Card>
      <div style={{ display: "flex", gap: 9, marginTop: 12, padding: "11px 13px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
        <Icon name="circle-alert" size={16} color="var(--muted)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>The cashier confirms the same $13.00 on their tablet. If they refuse, don't leave the food — tap “Get help” and support joins the call.</div>
      </div>
      <Button label="Get help with this hand-back" variant="ghost" onClick={nop} />
    </Pad>
  </Screen>
);

/* R4·b1 — phone died mid-delivery. Resume exactly where the job was. */
RR.offline_resume = () => (
  <Screen banner={<Banner tone="info" icon="refresh-cw" title="Job restored" msg="Your phone was off for 6 minutes. The customer saw 'live paused', not 'cancelled'." />}>
    <AppBar title="Your job" sub="LG-4471 · on the way" back={false} />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><Icon name="bike" size={19} color="var(--accent-text)" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>12 Lanark Rd, Belgravia</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Deliver · gate 2, ask for Rufaro</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <span style={{ flex: 1, fontSize: 13, color: "var(--muted)" }}>Collect at the door</span><Money v="15.50" size={18} />
        </div>
      </Card>
      <Button label="Continue delivery" onClick={nop} />
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.45, textAlign: "center" }}>Nothing you'd already confirmed was lost — the $13.00 you paid the restaurant is still recorded.</div>
    </Pad>
  </Screen>
);


/* R2·b1 — cancel a job, before collection only. The consequence is stated before the destructive
   tap: the merchant hands your fronted cash back, and repeat cancels cost you offers. */
RR.cancel_reason = () => (
  <Screen pad={false}>
    <div style={{ opacity: .28, padding: 16 }}><Skeleton height={90} radius={14} /><div style={{ height: 12 }} /><Skeleton height={13} width="60%" /></div>
    <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)" }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", borderRadius: "20px 20px 0 0", padding: "16px 16px 14px" }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 12px" }} />
      <div style={{ fontSize: 16.5, fontWeight: 700 }}>Drop this job?</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5, lineHeight: 1.45 }}>You haven't collected the food yet, so you can still drop it. Sadza Republic keeps cooking while we find someone else.</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", margin: "14px 0 7px" }}>WHY?</div>
      {[["Bike problem", true], ["Restaurant is taking too long", false], ["Too far from me now", false], ["Personal emergency", false]].map(([r, on]) => (
        <div key={r} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", minHeight: 44, boxSizing: "border-box", border: `1.5px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent-wash)" : "var(--bg)", borderRadius: "var(--radius-input)", marginBottom: 7 }}>
          <span style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent)" : "var(--bg)" }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{r}</span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 9, marginTop: 4, padding: "11px 12px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
        <Icon name="banknote" size={16} color="var(--muted)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>You paid nothing yet, so there's nothing to get back. Dropping three jobs in a week pauses your offers for a day.</div>
      </div>
      <Button label="Drop the job" onClick={nop} style={{ background: "var(--danger)" }} />
      <Button label="Keep it" variant="ghost" onClick={nop} />
    </div>
  </Screen>
);

/* R2·b2 — cancel is gone once the food is on the bike. The only routes out are a call, support, or
   the return leg — never an abandoned order. */
RR.cancel_blocked = () => (
  <Screen footer={<Button label="Continue delivery" onClick={nop} style={{ marginTop: 0 }} />}>
    <AppBar title="You're carrying the food" sub="LG-4471 · collected 10:04" />
    <Pad style={{ paddingTop: 0 }}>
      <Card style={{ padding: 12, background: "var(--danger-wash)", boxShadow: "none" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <Icon name="ban" size={19} color="var(--danger-ink)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--danger-ink)" }}>You can't drop a job after collecting</div>
            <div style={{ fontSize: 12.5, color: "var(--danger-ink)", marginTop: 4, lineHeight: 1.45 }}>You already paid Sadza Republic $13.00 and the food is on your bike.</div>
          </div>
        </div>
      </Card>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", margin: "12px 0 7px" }}>WHAT YOU CAN DO INSTEAD</div>
      {[["phone", "Call Rufaro", "Ask for a better spot or a gate code"], ["circle-alert", "Get help from LyniaGo", "Support joins and decides what happens next"], ["refresh-cw", "Return the food to the restaurant", "Only after the 8-minute wait — you keep your fee"]].map(([ic, t, s2]) => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 12px", minHeight: 44, boxSizing: "border-box", border: "1px solid var(--line)", borderRadius: "var(--radius-input)", marginBottom: 7 }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={ic} size={16} color="var(--accent-text)" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.35 }}>{s2}</div>
          </div>
          <Icon name="chevron-right" size={16} color="var(--muted)" />
        </div>
      ))}
    </Pad>
  </Screen>
);
