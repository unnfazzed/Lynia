/* LyniaGo Restaurants — MERCHANT dashboard screens (Next.js web app, tablet-first 1024×680,
   degrades to phone). Static frozen states; registers window.RM. */

const M = window.RParts;
const { Button, Card, Field, EmptyState, Icon, Skeleton, Money, Kitchen, Banner, PayTag, PickupCode, RAILS, QUEUE, nop, TAB } = M;

const RM = (window.RM = window.RM || {});

const Body = ({ children, style }) => <div style={{ height: "100%", overflow: "hidden", padding: 20, boxSizing: "border-box", ...style }}>{children}</div>;
const H = ({ children, sub }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>{children}</div>
    {sub ? <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{sub}</div> : null}
  </div>
);
const Big = ({ v, size = 64 }) => <span style={{ fontSize: size, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1, ...TAB }}>${v}</span>;

/* Queue row — the list state of an order, with the clock that says which one is closest to burning. */
function QRow({ o, state = "new", ago, clock }) {
  const tone = { new: ["var(--accent)", "var(--accent-wash)"], cooking: ["var(--highlight)", "var(--highlight-wash)"], ready: ["var(--ink)", "var(--surface)"] }[state];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", background: "var(--bg)", borderRadius: 14, boxShadow: "var(--shadow-card)", marginBottom: 10, borderLeft: `5px solid ${tone[0]}` }}>
      <div style={{ minWidth: 96 }}>
        <div style={{ fontSize: 15, fontWeight: 800, ...TAB }}>{o.id}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{ago || o.ago}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{o.name} · {o.area}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{o.items} items</div>
      </div>
      {clock ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800, color: tone[0] === "var(--highlight)" ? "var(--highlight-ink)" : "var(--ink)", background: tone[1], borderRadius: 8, padding: "6px 10px", ...TAB }}>
          <Icon name="timer" size={15} color={tone[0] === "var(--highlight)" ? "var(--highlight-ink)" : "var(--ink)"} />{clock}
        </span>
      ) : null}
      <PayTag pay={o.pay} />
      <Money v={o.total} size={19} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: "var(--cta-fill)", borderRadius: 999, padding: "9px 18px" }}>Open</span>
    </div>
  );
}

/* Kitchen board — three columns, because at three live orders a flat list stops telling you which
   one is closest to burning. */
function BoardCol({ title, tint, count, children, note }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: "var(--bg)", borderRadius: 14, boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: tint }} />
        <span style={{ fontSize: 14.5, fontWeight: 800 }}>{title}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", ...TAB }}>{count}</span>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {children}
        {note ? <div style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center", marginTop: 6, lineHeight: 1.45 }}>{note}</div> : null}
      </div>
    </div>
  );
}
function BoardCard({ id, who, items, pay, total, clock, clockTone = "var(--ink)", action, actionGhost }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 800, ...TAB }}>{id}</span>
        <span style={{ flex: 1 }} />
        <PayTag pay={pay} />
      </div>
      <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 3 }}>{who} · {items} items</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 9 }}>
        {clock ? <span style={{ fontSize: 20, fontWeight: 800, color: clockTone, ...TAB }}>{clock}</span> : null}
        <span style={{ flex: 1 }} />
        <Money v={total} size={17} />
      </div>
      <div style={{ marginTop: 10, display: "grid", placeItems: "center", height: 40, borderRadius: 999, background: actionGhost ? "var(--bg)" : "var(--cta-fill)", border: actionGhost ? "1px solid var(--line)" : "none", color: actionGhost ? "var(--accent-text)" : "#fff", fontSize: 13.5, fontWeight: 700 }}>{action}</div>
    </div>
  );
}

/* M0·1 — login. The OTP tap doubles as the browser audio unlock; say so plainly. */
RM.login = () => (
  <Kitchen chrome={false}>
    <div style={{ height: "100%", display: "grid", placeItems: "center", background: "var(--surface)" }}>
      <Card style={{ width: 420, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}><M.Dove size={32} on="white" /><M.Wordmark size={22} /></div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Kitchen sign-in</div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>Enter the code we sent to +263 77 •• •• 302.</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {["4", "9", "1", "0", "", ""].map((d, i) => (
            <span key={i} style={{ width: 52, height: 60, borderRadius: 12, border: `1.5px solid ${i === 4 ? "var(--accent)" : "var(--line)"}`, display: "grid", placeItems: "center", fontSize: 26, fontWeight: 700, ...TAB }}>{d}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 9, padding: "11px 13px", background: "var(--accent-wash)", borderRadius: 12, marginBottom: 4 }}>
          <Icon name="volume-2" size={17} color="var(--accent-text)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.45 }}>Signing in turns the order alarm on for this tablet. Keep this tab open and the volume up.</div>
        </div>
        <Button label="Sign in & start the alarm" onClick={nop} />
      </Card>
    </div>
  </Kitchen>
);

/* M0·2 — first login: four things before you can go live. */
RM.setup = () => (
  <Kitchen nav="queue" bar={{ open: false, orders: 0 }}>
    <Body>
      <H sub="Four things and you're taking orders. About 10 minutes.">Set up Sadza Republic</H>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[["utensils", "Add your menu", "6 dishes added", true], ["clock", "Set your hours", "Mon–Sat 09:00–21:00", true],
          ["wallet", "Merchant payment numbers", "EcoCash, InnBucks — needed for wallet orders", false],
          ["volume-2", "Test the order alarm", "Play it once so the kitchen knows the sound", false]].map(([ic, t, s, done]) => (
          <Card key={t} style={{ padding: 16, display: "flex", gap: 13, alignItems: "flex-start" }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: done ? "var(--accent-wash)" : "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Icon name={done ? "circle-check" : ic} size={20} color={done ? "var(--accent-text)" : "var(--muted)"} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{t}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>{s}</div>
              {!done ? <span style={{ display: "inline-block", marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#fff", background: "var(--cta-fill)", borderRadius: 999, padding: "8px 16px" }}>Do it now</span> : null}
            </div>
          </Card>
        ))}
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>You go live once payment numbers and the alarm test are done.</span>
      </div>
    </Body>
  </Kitchen>
);

/* M0·b1 — tablet rebooted mid-shift: resume, don't reset. */
RM.reboot = () => (
  <Kitchen nav="queue" bar={{ orders: 2 }}>
    <Body style={{ padding: 0 }}>
      <Banner tone="info" icon="refresh-cw" title="Welcome back — you were signed in" msg="The tablet restarted at 12:41. Two orders were waiting; nothing was lost. Tap once to turn the alarm back on." action="Turn alarm on" />
      <div style={{ padding: 20 }}>
        <H sub="Two live orders carried over the restart.">Live orders</H>
        <QRow o={QUEUE[1]} state="cooking" ago="waiting 6 min" clock="7:20 left" />
        <QRow o={QUEUE[2]} state="ready" ago="ready · waiting for rider" clock="waiting 4:10" />
      </div>
    </Body>
  </Kitchen>
);

/* M1·1 — open, nothing to cook. The empty state is the shift's resting screen, so it works. */
RM.queue_empty = () => (
  <Kitchen nav="queue" bar={{ orders: 0 }}>
    <Body>
      <H sub="Sunday 27 July · open since 09:00">Orders</H>
      <Card style={{ padding: "16px 20px 26px", marginTop: 30 }}>
        <EmptyState icon="inbox" title="No orders right now" message="You're open and visible to everyone within 5 km. The alarm is armed — you'll hear it before you see it.">
          <Button label="Play the alarm to test it" variant="ghost" onClick={nop} />
        </EmptyState>
      </Card>
        <div style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 18, fontSize: 13, color: "var(--muted)", ...TAB }}>
          <span><b style={{ color: "var(--ink)" }}>14</b> orders today</span>
          <span><b style={{ color: "var(--ink)" }}>$168.50</b> food sales</span>
          <span><b style={{ color: "var(--ink)" }}>18 min</b> average prep</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, border: "1px solid var(--line)", borderRadius: 999, padding: "9px 16px" }}><Icon name="timer" size={15} color="var(--accent-text)" />Busy mode · add 10 min</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, border: "1px solid var(--line)", borderRadius: 999, padding: "9px 16px" }}><Icon name="receipt" size={15} color="var(--accent-text)" />Test ticket printer</span>
        </div>
    </Body>
  </Kitchen>
);

/* M1·4 — the board. Three live orders, three columns, one clock each. */
RM.queue_board = () => (
  <Kitchen nav="queue" bar={{ orders: 3 }}>
    <Body>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <div style={{ flex: 1 }}><H sub="Sunday 27 July · 3 live · average prep 18 min">Kitchen board</H></div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, color: "var(--highlight-ink)", background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", borderRadius: 999, padding: "10px 16px" }}>
          <Icon name="timer" size={16} color="var(--highlight-ink)" />Busy mode · +10 min on new orders
        </span>
      </div>
      <div style={{ display: "flex", gap: 14, height: "calc(100% - 74px)" }}>
        <BoardCol title="New" tint="var(--accent)" count="1">
          <BoardCard id="LG-4473" who="Chipo M." items="2" pay="WALLET" total="9.50" clock="2:41" clockTone="var(--accent-text)" action="Answer now" />
        </BoardCol>
        <BoardCol title="Cooking" tint="var(--highlight)" count="2">
          <BoardCard id="LG-4471" who="Rufaro C." items="3" pay="CASH" total="15.50" clock="6:12 left" clockTone="var(--highlight-ink)" action="Mark ready" />
          <BoardCard id="LG-4472" who="Tapiwa K." items="1" pay="WALLET" total="6.00" clock="11:40 left" clockTone="var(--highlight-ink)" action="Mark ready" actionGhost />
        </BoardCol>
        <BoardCol title="Ready · waiting for rider" tint="var(--ink)" count="1">
          <BoardCard id="LG-4469" who="Nyasha D." items="2" pay="CASH" total="11.00" clock="waiting 3:05" action="Confirm pickup" />
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>Tendai M. is 2 min away · plate AEE 4471.</div>
        </BoardCol>
      </div>
    </Body>
  </Kitchen>
);

/* M1·2 — loading the queue. */
RM.queue_loading = () => (
  <Kitchen nav="queue" bar={{ orders: 0 }}>
    <Body>
      <Skeleton height={22} width={180} /><div style={{ height: 18 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px", background: "var(--bg)", borderRadius: 14, marginBottom: 10 }}>
          <Skeleton width={90} height={16} /><div style={{ flex: 1 }}><Skeleton height={15} width="45%" /><div style={{ height: 8 }} /><Skeleton height={12} width="25%" /></div>
          <Skeleton width={70} height={22} radius={8} /><Skeleton width={64} height={20} />
        </div>
      ))}
    </Body>
  </Kitchen>
);

/* M1·3 — NEW ORDER. Whole-screen state change + looping alarm + wake lock. Impossible to miss. */
RM.queue_new = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <div style={{ height: "100%", background: "var(--cta-fill)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 22px", background: "rgba(0,0,0,.12)" }}>
        <Icon name="volume-2" size={20} color="#fff" />
        <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: ".04em" }}>NEW ORDER — ALARM RINGING</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", ...TAB }}>2:41 left to accept</span>
      </div>
      <div style={{ flex: 1, display: "flex", gap: 18, padding: 22, minHeight: 0 }}>
        <div style={{ flex: 1, background: "#fff", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 26, fontWeight: 800, ...TAB }}>LG-4471</div>
              <div style={{ fontSize: 14, color: "var(--muted)" }}>Rufaro C. · Belgravia · 3.1 km</div>
            </div>
            <PayTag pay="CASH" size="lg" />
          </div>
          <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
          {[["1", "Half roast huku", "6.00"], ["1", "Sadza & beef stew", "4.50"], ["1", "Muriwo une dovi", "2.50"]].map(([q, n, p]) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0" }}>
              <span style={{ minWidth: 30, height: 30, borderRadius: 8, background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800, ...TAB }}>{q}</span>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{n}</span>
              <Money v={p} size={15} weight={600} />
            </div>
          ))}
          <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--highlight-wash)", borderRadius: 10, fontSize: 13.5, color: "var(--highlight-ink)" }}>2 notes: leg portion on the huku · pack the sadza separately.</div>
          <span style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>Food total you'll be paid in cash</span>
            <span style={{ flex: 1 }} /><Big v="13.00" size={38} />
          </div>
        </div>
        <div style={{ width: 300, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>PREP TIME</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["10", "15", "20", "30", "45"].map((t) => (
                <span key={t} style={{ fontSize: 16, fontWeight: 700, padding: "12px 16px", borderRadius: 12, border: `2px solid ${t === "20" ? "var(--accent)" : "var(--line)"}`, background: t === "20" ? "var(--accent-wash)" : "#fff", color: t === "20" ? "var(--accent-text)" : "var(--ink)", ...TAB }}>{t}m</span>
              ))}
            </div>
          </div>
          <span style={{ display: "grid", placeItems: "center", height: 84, borderRadius: 16, background: "var(--cta-fill)", color: "#fff", fontSize: 22, fontWeight: 800 }}>Accept · 20 min</span>
          <span style={{ display: "grid", placeItems: "center", height: 56, borderRadius: 16, background: "#fff", color: "var(--danger-ink)", fontSize: 16, fontWeight: 700, border: "1px solid var(--line)" }}>Can't take it</span>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.92)", lineHeight: 1.45, marginTop: 2 }}>The alarm stops the moment you tap either button — nothing else silences it.</div>
        </div>
      </div>
    </div>
  </Kitchen>
);

/* M1·b1 — two land at once. Queued, not stacked: one is active, the next is counted and waiting. */
RM.two_orders = () => (
  <Kitchen nav="queue" bar={{ orders: 5 }}>
    <div style={{ height: "100%", background: "var(--cta-fill)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 22px", background: "rgba(0,0,0,.12)" }}>
        <Icon name="volume-2" size={20} color="#fff" />
        <span style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>2 NEW ORDERS — answer them one at a time</span>
        <span style={{ flex: 1 }} /><span style={{ fontSize: 14, fontWeight: 700, color: "#fff", ...TAB }}>2:12 left on LG-4471</span>
      </div>
      <div style={{ flex: 1, padding: 22, display: "flex", gap: 18, minHeight: 0 }}>
        <div style={{ flex: 1, background: "#fff", borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent-text)", background: "var(--accent-wash)", borderRadius: 999, padding: "4px 10px" }}>ANSWERING NOW · 1 of 2</span>
            <span style={{ flex: 1 }} /><PayTag pay="CASH" />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, ...TAB }}>LG-4471 · Rufaro C.</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>3 items · Belgravia · 3.1 km</div>
          <Big v="13.00" size={40} />
          <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
            <span style={{ flex: 1, display: "grid", placeItems: "center", height: 64, borderRadius: 14, background: "var(--cta-fill)", color: "#fff", fontSize: 18, fontWeight: 800 }}>Accept · 20 min</span>
            <span style={{ width: 150, display: "grid", placeItems: "center", height: 64, borderRadius: 14, border: "1px solid var(--line)", color: "var(--danger-ink)", fontSize: 15, fontWeight: 700 }}>Can't take it</span>
          </div>
        </div>
        <div style={{ width: 290, background: "rgba(255,255,255,.92)", borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--muted)", marginBottom: 10 }}>NEXT IN LINE</div>
          <div style={{ fontSize: 19, fontWeight: 800, ...TAB }}>LG-4472</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 10 }}>Tapiwa K. · Avenues · 1 item</div>
          <PayTag pay="WALLET" />
          <div style={{ marginTop: 10 }}><Money v="6.00" size={22} /></div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12, lineHeight: 1.45 }}>Its own 3-minute clock starts when you finish with LG-4471. We never show two decisions at once.</div>
        </div>
      </div>
    </div>
  </Kitchen>
);

/* M1·b2 — the wifi drops. Unmissable, honest about what still works, auto-reconnecting. */
RM.offline = () => (
  <Kitchen nav="queue" bar={{ orders: 2, offline: true }}>
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 22px", background: "var(--danger)" }}>
        <Icon name="wifi-off" size={24} color="#fff" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>Connection lost — you are not receiving orders</div>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.9)" }}>Since 12:48 · reconnecting automatically (attempt 6)</div>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--danger-ink)", background: "#fff", borderRadius: 999, padding: "10px 18px" }}>Retry now</span>
      </div>
      <div style={{ flex: 1, padding: 20, opacity: .55 }}>
        <H sub="Frozen at 12:48. Buttons are disabled until you're back.">Orders</H>
        <QRow o={QUEUE[1]} state="cooking" ago="last seen 12:46" />
        <QRow o={QUEUE[2]} state="ready" ago="last seen 12:44" />
      </div>
      <div style={{ padding: "12px 22px", background: "var(--surface)", borderTop: "1px solid var(--line)", fontSize: 13, color: "var(--muted)" }}>
        Keep cooking what's already accepted — those orders are safe. New orders will arrive as soon as the tablet is back online.
      </div>
    </div>
  </Kitchen>
);

/* M1·b3 — reconnected, and an order arrived while dark. Never silently swallowed. */
RM.offline_order = () => (
  <Kitchen nav="queue" bar={{ orders: 3 }}>
    <Body style={{ padding: 0 }}>
      <Banner tone="warn" icon="triangle-alert" title="You were offline for 4 minutes — 1 order came in" msg="LG-4473 arrived at 12:50 and is still waiting. Its accept clock was paused while you were dark." action="Open it" />
      <div style={{ padding: 20 }}>
        <H sub="Back online at 12:52.">Orders</H>
        <QRow o={{ id: "LG-4473", name: "Chipo M.", area: "Avondale", items: 2, pay: "WALLET", total: "9.50" }} state="new" ago="waiting 2 min" />
        <QRow o={QUEUE[1]} state="cooking" ago="cooking · 6 min left" />
      </div>
    </Body>
  </Kitchen>
);

/* M2·1 — accept with a prep time. The number the customer will see, so it is chosen deliberately. */
RM.order_accept = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <div style={{ display: "flex", gap: 18, height: "100%" }}>
        <div style={{ flex: 1 }}>
          <H sub="Rufaro C. · Belgravia · 3.1 km · placed 09:41">Order LG-4471</H>
          <Card style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>TAP AN ITEM YOU DON'T HAVE — THE REST STILL COOKS</span>
            </div>
            {[["1", "Half roast huku", "6.00", false, "Leg portion, not breast · no chilli"], ["1", "Sadza & beef stew", "4.50", false, ""], ["1", "Muriwo une dovi", "2.50", true, ""]].map(([q, n, p, off, note]) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--line)", opacity: off ? .5 : 1 }}>
                <span style={{ minWidth: 28, height: 28, borderRadius: 8, background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800, ...TAB }}>{q}</span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 600, textDecoration: off ? "line-through" : "none" }}>{n}{note ? <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--highlight-ink)", marginTop: 2 }}>↳ {note}</span> : null}</span>
                <Money v={p} size={14.5} weight={600} />
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34, fontSize: 12.5, fontWeight: 700, color: off ? "var(--danger-ink)" : "var(--muted)", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 12px" }}>
                  <Icon name={off ? "ban" : "minus"} size={14} color={off ? "var(--danger-ink)" : "var(--muted)"} />{off ? "Not available" : "Don't have it"}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "baseline", paddingTop: 12 }}>
              <span style={{ flex: 1, fontSize: 14, color: "var(--muted)" }}>Food total (yours)</span><Money v="10.50" size={22} />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", paddingTop: 6 }}>
              <span style={{ flex: 1, fontSize: 13, color: "var(--muted)" }}>Delivery fee (LyniaGo's, paid by the customer)</span><Money v="2.50" size={14} weight={600} color="var(--muted)" />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12, padding: "11px 13px", background: "var(--highlight-wash)", borderRadius: 10 }}>
              <Icon name="pencil" size={17} color="var(--highlight-ink)" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.45 }}><b>Note for the whole order:</b> pack the sadza separately from the stew.</div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, padding: "11px 13px", background: "var(--surface)", borderRadius: 10 }}>
              <Icon name="circle-alert" size={17} color="var(--muted)" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>Can't do a note? Call Rufaro before you accept — a note never changes the price.</div>
            </div>
          </Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, border: "1px solid var(--line)", borderRadius: 999, padding: "10px 16px" }}>
              <Icon name="phone" size={15} color="var(--accent-text)" />Call Rufaro (+263 7• ••• ••90)
            </span>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Number is masked — the call goes through LyniaGo.</span>
          </div>
        </div>
        <div style={{ width: 320 }}>
          <Card style={{ padding: 18 }}>
            <PayTag pay="CASH" size="lg" />
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 10, lineHeight: 1.45 }}>The rider pays you <b style={{ color: "var(--ink)" }}>$10.50</b> in cash when they collect.</div>
            <div style={{ fontSize: 12.5, color: "var(--highlight-ink)", marginTop: 4, lineHeight: 1.4 }}>Down from $13.00 — you marked the muriwo unavailable.</div>
            <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>HOW LONG WILL IT TAKE?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["10", "15", "20", "30", "45"].map((t) => (
                <span key={t} style={{ fontSize: 16, fontWeight: 700, padding: "12px 15px", borderRadius: 12, border: `2px solid ${t === "20" ? "var(--accent)" : "var(--line)"}`, background: t === "20" ? "var(--accent-wash)" : "#fff", color: t === "20" ? "var(--accent-text)" : "var(--ink)", ...TAB }}>{t}m</span>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.45 }}>Rufaro sees this number. Don't start cooking yet — wait for “rider secured”.</div>
            <Button label="Accept · 20 min" onClick={nop} style={{ minHeight: 62, fontSize: 18 }} />
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <Button label="Print ticket" variant="ghost" onClick={nop} style={{ flex: 1, marginTop: 0 }} />
              <Button label="Can't take it" variant="ghost" onClick={nop} style={{ flex: 1, marginTop: 0, color: "var(--danger-ink)" }} />
            </div>
          </Card>
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* M2·2 — reject with a reason. The reason writes the customer's apology copy. */
RM.reject_sheet = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <div style={{ height: "100%", position: "relative" }}>
      <Body style={{ opacity: .25 }}><H>Order LG-4471</H><Card style={{ height: 300 }} /></Body>
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", display: "grid", placeItems: "center" }}>
        <Card style={{ width: 520, padding: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Why can't you take LG-4471?</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 14 }}>Rufaro sees your reason, so pick the true one. Rejections don't affect your rating — mystery ones do.</div>
          {[["Out of an ingredient", true], ["Kitchen is too busy right now", false], ["We're closing early today", false], ["Something else", false]].map(([l, on]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent-wash)" : "#fff", borderRadius: 12, marginBottom: 8 }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent)" : "#fff" }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{l}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <Button label="Keep the order" variant="ghost" onClick={nop} style={{ flex: 1, marginTop: 0 }} />
            <Button label="Reject LG-4471" onClick={nop} style={{ flex: 1, marginTop: 0, background: "var(--danger)" }} />
          </div>
        </Card>
      </div>
    </div>
  </Kitchen>
);

/* M2·3 — accepted, rider not secured. The screen's whole job is: DO NOT COOK. */
RM.waiting_rider = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <H sub="Rufaro C. · Belgravia · accepted 09:44 · 20 min prep">Order LG-4471</H>
      <Card style={{ padding: 26, textAlign: "center" }}>
        <div style={{ width: 68, height: 68, borderRadius: "50%", background: "var(--highlight-wash)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
          <Icon name="bike" size={30} color="var(--highlight-ink)" />
        </div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>Don't start cooking yet</div>
        <div style={{ fontSize: 15, color: "var(--muted)", marginTop: 6, lineHeight: 1.5, maxWidth: 520, margin: "6px auto 0" }}>
          We're finding a rider for this order. The screen turns <b style={{ color: "var(--accent-text)" }}>green</b> the second one is secured — that's your signal to cook. Usually under 2 minutes.
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 18 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i === 0 ? "var(--highlight)" : "var(--line)" }} />)}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 14, ...TAB }}>Searching for 0:38 · we stop at 6:00 and cancel the order for you</div>
      </Card>
    </Body>
  </Kitchen>
);

/* M2·4 — rider secured: the fire-the-kitchen moment. Green, loud, with a countdown. */
RM.cook_now = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <div style={{ height: "100%", background: "var(--cta-fill)", display: "flex", flexDirection: "column", padding: 22, boxSizing: "border-box", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon name="circle-check" size={24} color="#fff" />
        <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>RIDER SECURED — START COOKING</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", ...TAB }}>Tendai M. arrives in ~7 min</span>
      </div>
      <div style={{ flex: 1, background: "#fff", borderRadius: 16, padding: 22, display: "flex", gap: 22, minHeight: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 800, ...TAB }}>LG-4471 · Rufaro C.</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 14 }}>3 items · 2 notes on this ticket</div>
          {[["1", "Half roast huku", "Leg portion, not breast · no chilli"], ["1", "Sadza & beef stew", ""], ["1", "Muriwo une dovi", ""]].map(([q, n, note]) => (
            <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ minWidth: 32, height: 32, borderRadius: 8, background: "var(--accent-wash)", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800, color: "var(--accent-text)", ...TAB }}>{q}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{n}</div>
                {note ? <div style={{ fontSize: 14, fontWeight: 700, color: "var(--highlight-ink)", marginTop: 2 }}>↳ {note}</div> : null}
              </div>
            </div>
          ))}
        </div>
        <div style={{ width: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ width: "100%", padding: "10px 12px", background: "var(--highlight-wash)", borderRadius: 10, textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", letterSpacing: ".04em" }}>NOTE FOR THE WHOLE ORDER</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginTop: 2, lineHeight: 1.35 }}>Pack the sadza separately from the stew.</div>
          </div>
          <M.Ring value={17} total={20} label="17:00" sub="prep left" size={128} />
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", lineHeight: 1.4 }}>Tap when the food is packed and waiting on the counter.</div>
          <Button label="Mark ready" onClick={nop} style={{ minHeight: 58, fontSize: 17 }} />
        </div>
      </div>
    </div>
  </Kitchen>
);

/* M2·5 — ready, waiting for the rider to walk in. */
RM.mark_ready = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <H sub="Marked ready at 10:01 · Tendai M. is 2 min away">Order LG-4471</H>
      <Card style={{ padding: 24, display: "flex", gap: 24, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Waiting for Tendai M.</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>Red Honda · ★ 4.8. When he arrives, confirm the cash before the food leaves your counter.</div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, border: "1px solid var(--line)", borderRadius: 999, padding: "10px 16px" }}><Icon name="phone" size={15} color="var(--accent-text)" />Call the rider</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, color: "var(--danger-ink)", border: "1px solid var(--line)", borderRadius: 999, padding: "10px 16px" }}><Icon name="triangle-alert" size={15} color="var(--danger-ink)" />Rider hasn't come</span>
          </div>
        </div>
        <div style={{ width: 280, background: "var(--surface)", borderRadius: 14, padding: 18, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>YOU WILL BE PAID</div>
          <Big v="13.00" size={44} />
          <div style={{ marginTop: 8 }}><PayTag pay="CASH" /></div>
        </div>
      </Card>
    </Body>
  </Kitchen>
);

/* M2·b1 — no rider was found. The kitchen never cooked; that is the headline. */
RM.no_rider_merchant = () => (
  <Kitchen nav="queue" bar={{ orders: 3 }}>
    <Body>
      <H sub="Rufaro C. · Belgravia">Order LG-4471 · cancelled</H>
      <Card style={{ padding: "16px 20px 26px" }}>
        <EmptyState icon="bike" title="No rider was available — we cancelled it for you" message="We searched for 6 minutes and found nobody free near Fife Ave. You never started cooking, so nothing was wasted. Rufaro has been told and can order again.">
          <Button label="Back to orders" onClick={nop} />
        </EmptyState>
      </Card>
      <div style={{ display: "flex", gap: 10, marginTop: 14, padding: "12px 16px", background: "var(--surface)", borderRadius: 12 }}>
        <Icon name="circle-alert" size={17} color="var(--muted)" />
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>Cancelled-for-no-rider does not count against your acceptance rate.</div>
      </div>
    </Body>
  </Kitchen>
);

/* M2·6 — WALLET orders: call the customer, then request payment. The call replaces every payment
   clock — there is no window and no auto-cancel. */
RM.call_confirm = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <div style={{ display: "flex", gap: 18, height: "100%" }}>
        <div style={{ flex: 1 }}>
          <H sub="LG-4472 · Tapiwa K. · accepted 09:44 · mobile money">Call to confirm, then request payment</H>
          <Card style={{ padding: 22 }}>
            {[["Accept the order", "done · 09:44"], ["Call Tapiwa — confirm the order and the $6.00 total", "now"], ["Request payment", "next"], ["Confirm it landed in your EcoCash, then cook", ""]].map(([l, s], i) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: s === "done · 09:44" ? "var(--accent)" : s === "now" ? "var(--accent-wash)" : "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  {s === "done · 09:44" ? <Icon name="check" size={15} color="#fff" /> : <span style={{ fontSize: 13, fontWeight: 800, color: s === "now" ? "var(--accent-text)" : "var(--muted)", ...TAB }}>{i + 1}</span>}
                </span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: s === "now" ? 700 : 600, color: s === "now" || s.startsWith("done") ? "var(--ink)" : "var(--muted)" }}>{l}</span>
                {s ? <span style={{ fontSize: 12.5, color: "var(--muted)", ...TAB }}>{s}</span> : null}
              </div>
            ))}
            <Button label="Call Tapiwa K. · +263 7• ••• ••31" onClick={nop} style={{ minHeight: 60, fontSize: 17, marginTop: 14 }} />
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>The call is logged on the order.</div>
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <Button label="Request payment · $6.00" onClick={nop} disabled style={{ flex: 1, marginTop: 0 }} />
              <Button label="They confirmed another way" variant="ghost" onClick={nop} style={{ flex: 1, marginTop: 0 }} />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>Unlocks after a logged call — or use the override if they confirmed in person or on WhatsApp.</div>
          </Card>
        </div>
        <div style={{ width: 280 }}>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>WHY CALL FIRST</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>A confirmed human beats a countdown. There's no payment window and no auto-cancel — the order simply waits until the money lands, you release it, or the day ends. You never cook on an unconfirmed order.</div>
            <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>THE ORDER</div>
            {[["1 × Rice & chicken stew", "$5.00"], ["1 × Mazoe orange crush", "$1.00"]].map(([l, v]) => (
              <div key={l} style={{ display: "flex", alignItems: "baseline", padding: "5px 0", fontSize: 13 }}>
                <span style={{ flex: 1 }}>{l}</span><span style={{ fontWeight: 700, ...TAB }}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* M2·7 — awaiting payment. No clock. The order waits in its own lane, never blocking the board,
   with one honest exit. */
RM.awaiting_payment = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <div style={{ display: "flex", gap: 18, height: "100%" }}>
        <div style={{ flex: 1 }}>
          <H sub="LG-4472 · Tapiwa K. · mobile money">Waiting for the money to land</H>
          <Card style={{ padding: 22 }}>
            {[["09:46", "You called — Tapiwa confirmed (1:12)"], ["09:47", "Payment requested · $6.00 · EcoCash"], ["—", "Watching your statement — confirm when you see it"]].map(([t, l], i, a) => (
              <div key={l} style={{ display: "flex", gap: 12, padding: "7px 0", borderTop: i ? "1px solid var(--line)" : "none", fontSize: 14.5, color: i === a.length - 1 ? "var(--muted)" : "var(--ink)" }}>
                <span style={{ color: "var(--muted)", minWidth: 48, ...TAB }}>{t}</span><span style={{ fontWeight: i === a.length - 1 ? 400 : 600 }}>{l}</span>
              </div>
            ))}
            <Button label="It landed — enter the reference" onClick={nop} style={{ minHeight: 60, fontSize: 17, marginTop: 16 }} />
            <Button label="Release this order — they never paid" variant="ghost" onClick={nop} style={{ color: "var(--danger-ink)" }} />
          </Card>
        </div>
        <div style={{ width: 280 }}>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>NO CLOCK ON THIS</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>Unpaid orders sit in their own lane and never block your board. Releasing one carries no penalty — the customer is told, and nothing is charged. Anything still unpaid closes by itself when you close for the day.</div>
            <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>Your prep time starts when you confirm the money — not when you accepted.</div>
          </Card>
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* M3·1 — CASH pickup confirm. The number is the screen; confirming means acknowledging it. */
RM.pickup_cash = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <div style={{ display: "flex", gap: 18, height: "100%" }}>
        <div style={{ flex: 1 }}>
          <H sub="Tendai M. is at your counter · LG-4471">Confirm the cash</H>
          <Card style={{ padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", letterSpacing: ".04em" }}>COUNT WHAT THE RIDER HANDS YOU</div>
            <div style={{ margin: "10px 0 6px" }}><Big v="13.00" size={82} /></div>
            <div style={{ fontSize: 14.5, color: "var(--muted)" }}>Food only. The $2.50 delivery fee is not yours — the customer pays that to the rider.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px auto 0", maxWidth: 460, padding: "14px 16px", border: "2px solid var(--line)", borderRadius: 12, textAlign: "left" }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, border: "2px solid var(--accent)", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="check" size={16} color="#fff" /></span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>I counted $13.00 in my hand</span>
            </div>
            <Button label="Confirm $13.00 received · release the food" onClick={nop} style={{ minHeight: 64, fontSize: 18, maxWidth: 460, margin: "16px auto 0" }} />
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10 }}>Short or no cash? <span style={{ color: "var(--danger-ink)", fontWeight: 700 }}>Don't release the food — report it here.</span></div>
          </Card>
        </div>
        <div style={{ width: 280 }}>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>THE RIDER</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center" }}><Icon name="user" size={20} color="var(--muted)" /></span>
              <div><div style={{ fontSize: 15, fontWeight: 700 }}>Tendai M.</div><div style={{ fontSize: 12.5, color: "var(--muted)", ...TAB }}>★ 4.8 · red Honda · AEE 4471</div></div>
            </div>
            <div style={{ marginTop: 12 }}><PickupCode code="7241" tone="tablet" /></div>
            <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>He fronted this money himself and collects $15.50 from the customer at the door. If the cash is short, it's his problem to fix — not yours to absorb.</div>
          </Card>
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* M3·2 — WALLET confirm, BEFORE cooking. EcoCash is paid at acceptance (sometimes outside the app
   by USSD); the merchant matches the reference against their own statement, and only that confirm
   starts the kitchen. From here the order is PAID — the rider sees it and collects nothing. */
RM.pickup_wallet = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <div style={{ display: "flex", gap: 18, height: "100%" }}>
        <div style={{ flex: 1 }}>
          <H sub="LG-4472 · Tapiwa K. · says they've paid · confirm before you cook">Confirm the payment landed</H>
          <Card style={{ padding: 22 }}>
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>EXPECTED IN YOUR ECOCASH</div>
                <Big v="6.00" size={58} />
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Food only · sent by Tapiwa K. at 09:52</div>
              </div>
              <div style={{ width: 300 }}>
                <Field label="Transaction reference" value="EC-0771182-4472" onChange={nop} />
                <Field label="Amount you received" value="6.00" onChange={nop} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 16, padding: "14px 16px", background: "var(--danger-wash)", borderRadius: 12 }}>
              <Icon name="triangle-alert" size={20} color="var(--danger-ink)" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 13.5, color: "var(--danger-ink)", lineHeight: 1.5 }}>
                <b>Check your own EcoCash statement.</b> Never accept a payment screen shown to you on someone else's phone — those are easy to fake. If it isn't in your statement, the money isn't yours.
              </div>
            </div>
            <Button label="Confirm $6.00 received · start cooking" onClick={nop} style={{ minHeight: 62, fontSize: 17 }} />
          </Card>
        </div>
        <div style={{ width: 260 }}>
          <Card style={{ padding: 18 }}>
            <PayTag pay="WALLET" size="lg" />
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 12, lineHeight: 1.5 }}>Confirming marks the order <b style={{ color: "var(--ink)" }}>PAID</b> and starts your prep clock. The rider we secure will see it — they collect nothing at pickup or at the door.</div>
            <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>LAST 3 WALLET ORDERS</div>
            {[["LG-4468", "$8.50", "ref …9921"], ["LG-4461", "$12.00", "ref …8814"], ["LG-4455", "$5.50", "ref …8720"]].map(([id, amt, ref]) => (
              <div key={id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 0", borderTop: "1px solid var(--line)", fontSize: 12.5, ...TAB }}>
                <span style={{ fontWeight: 700 }}>{id}</span><span style={{ flex: 1, color: "var(--muted)" }}>{ref}</span><span style={{ fontWeight: 700 }}>{amt}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* M3·b1 — the typed amount is short. Block the release, name the gap. */
RM.wallet_mismatch = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <H sub="LG-4472 · Tapiwa K.">Confirm the payment landed</H>
      <Card style={{ padding: 22 }}>
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>EXPECTED</div>
            <Big v="6.00" size={58} />
          </div>
          <div style={{ width: 300 }}>
            <Field label="Transaction reference" value="EC-0771182-4472" onChange={nop} />
            <Field label="Amount you received" value="4.00" onChange={nop} error="That's $2.00 short of the order total." />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 14, padding: "14px 16px", background: "var(--danger-wash)", borderRadius: 12 }}>
          <Icon name="ban" size={20} color="var(--danger-ink)" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 13.5, color: "var(--danger-ink)", lineHeight: 1.5 }}>
            <b>Don't release the food.</b> Ask the customer to send the missing $2.00 — the rider can call them from his app. If they won't, reject the order and refund what they did send.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Button label="Confirm $4.00 received" onClick={nop} disabled style={{ flex: 1 }} />
          <Button label="Reject & refund $4.00" variant="ghost" onClick={nop} style={{ flex: 1, color: "var(--danger-ink)" }} />
        </div>
      </Card>
    </Body>
  </Kitchen>
);

/* M3·3 — handed over. Short confirmation, then straight back to the queue. */
RM.pickup_done = () => (
  <Kitchen nav="queue" bar={{ orders: 3 }}>
    <Body>
      <Card style={{ padding: 30, textAlign: "center", marginTop: 40 }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
          <Icon name="circle-check" size={34} color="var(--accent-text)" />
        </div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>LG-4471 handed over</div>
        <div style={{ fontSize: 15, color: "var(--muted)", marginTop: 6 }}>$13.00 cash received at 10:04 · Tendai M. is on the way to Belgravia.</div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 16 }}>Back to orders in 5s</div>
      </Card>
    </Body>
  </Kitchen>
);

/* M3·1b — CASH pickup under collect-and-return (this shop's rule): the food leaves against a
   recorded debt, and the rider brings the cash back right after the drop. */
RM.pickup_collect = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <div style={{ display: "flex", gap: 18, height: "100%" }}>
        <div style={{ flex: 1 }}>
          <H sub="Tendai M. is at your counter · LG-4471">Release the food — the cash comes back</H>
          <Card style={{ padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", letterSpacing: ".04em" }}>TENDAI RETURNS AFTER THE DROP</div>
            <div style={{ margin: "10px 0 6px" }}><Big v="13.00" size={82} /></div>
            <div style={{ fontSize: 14.5, color: "var(--muted)" }}>He collects $15.50 at the door, keeps his $2.50 fee, and rides your $13.00 straight back — about 25 minutes. He can't take another job until you confirm it.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px auto 0", maxWidth: 460, padding: "14px 16px", border: "2px solid var(--line)", borderRadius: 12, textAlign: "left" }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, border: "2px solid var(--accent)", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="check" size={16} color="#fff" /></span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>I'm releasing LG-4471 unpaid — Tendai owes me $13.00</span>
            </div>
            <Button label="Release the food · Tendai owes $13.00" onClick={nop} style={{ minHeight: 64, fontSize: 18, maxWidth: 460, margin: "16px auto 0" }} />
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10 }}>Prefer cash before the food leaves? Switch your rule to “pay me upfront” under <b>Shop</b>.</div>
          </Card>
        </div>
        <div style={{ width: 280 }}>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>THE RIDER</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center" }}><Icon name="user" size={20} color="var(--muted)" /></span>
              <div><div style={{ fontSize: 15, fontWeight: 700 }}>Tendai M.</div><div style={{ fontSize: 12.5, color: "var(--muted)", ...TAB }}>★ 4.8 · 212 returns, 0 missed</div></div>
            </div>
            <div style={{ marginTop: 12 }}><PickupCode code="7241" tone="tablet" /></div>
            <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>If the cash never comes back, the loss is yours — and the rider is suspended and named to every kitchen. Your rule is the trade: upfront cash from fewer riders, or every rider and a short wait.</div>
          </Card>
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* M3·4 — the cash comes back. Same D-06 grammar as every money confirm: count it, acknowledge the
   number, release the debt. */
RM.cash_return = () => (
  <Kitchen nav="queue" bar={{ orders: 3 }}>
    <Body>
      <div style={{ display: "flex", gap: 18, height: "100%" }}>
        <div style={{ flex: 1 }}>
          <H sub="Tendai M. is back · LG-4471 · delivered 10:16">Count the returned cash</H>
          <Card style={{ padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", letterSpacing: ".04em" }}>COUNT WHAT TENDAI HANDS YOU</div>
            <div style={{ margin: "10px 0 6px" }}><Big v="13.00" size={82} /></div>
            <div style={{ fontSize: 14.5, color: "var(--muted)" }}>The customer paid $15.50 — $2.50 was Tendai's fee. This $13.00 is yours.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px auto 0", maxWidth: 460, padding: "14px 16px", border: "2px solid var(--line)", borderRadius: 12, textAlign: "left" }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, border: "2px solid var(--accent)", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="check" size={16} color="#fff" /></span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>I counted $13.00 in my hand</span>
            </div>
            <Button label="Confirm $13.00 returned · close LG-4471" onClick={nop} style={{ minHeight: 64, fontSize: 18, maxWidth: 460, margin: "16px auto 0" }} />
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10 }}>Short or nothing? <span style={{ color: "var(--danger-ink)", fontWeight: 700 }}>Don't confirm — report it here.</span> Support already knows he owes this order.</div>
          </Card>
        </div>
        <div style={{ width: 280 }}>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>THIS ORDER'S CASH TRAIL</div>
            {[["09:58", "Food released unpaid — debt recorded"], ["10:14", "Customer confirmed giving $15.50"], ["10:15", "Tendai confirmed receiving $15.50"], ["10:25", "Tendai back at your counter"]].map(([t, l]) => (
              <div key={t} style={{ display: "flex", gap: 10, padding: "5px 0", fontSize: 13 }}>
                <span style={{ color: "var(--muted)", minWidth: 42, ...TAB }}>{t}</span><span>{l}</span>
              </div>
            ))}
            <div style={{ height: 1, background: "var(--line)", margin: "12px 0" }} />
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Confirming closes the order and reopens Tendai's offers. This trail sits on your weekly statement.</div>
          </Card>
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* M5·4 — the shop's cash rule. The merchant chooses who carries the risk window: every rider with
   a return leg, or upfront cash from riders carrying float. */
RM.cash_rule = () => (
  <Kitchen nav="shop" bar={{ orders: 2 }}>
    <Body>
      <H sub="Applies to every cash order · mobile-money orders are unaffected">How riders pay you</H>
      <div style={{ maxWidth: 640 }}>
        <div style={{ padding: "16px 18px", border: "2px solid var(--accent)", background: "var(--accent-wash)", borderRadius: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="check" size={13} color="#fff" /></span>
            <span style={{ fontSize: 17, fontWeight: 800 }}>Collect and return</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", color: "var(--accent-text)", background: "var(--bg)", borderRadius: 999, padding: "3px 10px" }}>RECOMMENDED</span>
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink)", marginTop: 8, lineHeight: 1.55 }}>The rider takes the food, collects at the door, and rides your food money back — usually within 30 minutes. Every rider can take your orders, so food leaves faster.</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>The risk is yours for that window: if the cash never returns, the loss is yours and the rider is suspended and named.</div>
        </div>
        <div style={{ padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--line)", flexShrink: 0 }} />
            <span style={{ fontSize: 17, fontWeight: 800 }}>Pay me upfront</span>
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink)", marginTop: 8, lineHeight: 1.55 }}>The rider hands you the food money before anything leaves the counter. No risk window at all.</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>Only riders carrying enough cash can take the job — pickups can be slower, and big orders sometimes find no rider.</div>
        </div>
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--surface)", borderRadius: 12 }}>
          <Icon name="circle-alert" size={17} color="var(--muted)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Changes apply from your next order. Riders see your rule on the offer before they accept.</div>
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* M3·b2 — the rider never showed. Food is cooked; this screen protects the merchant. */
RM.rider_noshow = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <H sub="LG-4471 · ready since 10:01">The rider hasn't arrived</H>
      <Card style={{ padding: 22 }}>
        <div style={{ display: "flex", gap: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.55 }}>Tendai M. was 2 minutes away at 10:03 and hasn't checked in. Tell us now and we'll send another rider — the food stays on your counter and you are not out of pocket.</div>
            <div style={{ marginTop: 16 }}>
              {[["10:01", "You marked the order ready"], ["10:03", "Rider 2 min away"], ["10:14", "No arrival — you reported it"]].map(([t, l]) => (
                <div key={t} style={{ display: "flex", gap: 12, padding: "5px 0", fontSize: 13.5 }}>
                  <span style={{ color: "var(--muted)", minWidth: 46, ...TAB }}>{t}</span><span>{l}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ width: 300 }}>
            <Button label="Send another rider" onClick={nop} style={{ minHeight: 58, fontSize: 16 }} />
            <Button label="Call the rider" variant="ghost" onClick={nop} />
            <Button label="Cancel the order" variant="ghost" onClick={nop} style={{ color: "var(--danger-ink)" }} />
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.45 }}>Cancelling here flags the rider, not you. Cooked food is logged for the weekly statement.</div>
          </div>
        </div>
      </Card>
    </Body>
  </Kitchen>
);

/* M3·b3 — rejecting after the customer already paid: the refund is an act with a reference. */
RM.refund_exec = () => (
  <Kitchen nav="queue" bar={{ orders: 3 }}>
    <Body>
      <H sub="LG-4472 · Tapiwa K. paid $6.00 by EcoCash at 09:52">Refund before you reject</H>
      <div style={{ display: "flex", gap: 18 }}>
        <Card style={{ flex: 1, padding: 22 }}>
          <div style={{ display: "flex", gap: 12, padding: "14px 16px", background: "var(--highlight-wash)", borderRadius: 12, marginBottom: 16 }}>
            <Icon name="circle-alert" size={20} color="var(--highlight-ink)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 13.5, color: "var(--highlight-ink)", lineHeight: 1.5 }}>This customer has already paid you. LyniaGo never held the money, so <b>you</b> send it back — from the same number, right now, while they're watching their phone.</div>
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>SEND BACK</div>
              <Big v="6.00" size={58} />
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>to +263 7• ••• ••44 · EcoCash</div>
            </div>
            <div style={{ width: 300 }}>
              <Field label="Your refund reference" value="" onChange={nop} placeholder="EC-…" hint="From your own EcoCash confirmation SMS." />
            </div>
          </div>
          <Button label="I've refunded $6.00 — reject the order" onClick={nop} style={{ minHeight: 58, fontSize: 16 }} />
        </Card>
        <Card style={{ width: 280, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>WHAT TAPIWA SEES</div>
          <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>“Sadza Republic couldn't take your order — refund pending” changes to “Refunded” with your reference the moment you confirm.</div>
          <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>Refunds owed for more than 2 hours are escalated to LyniaGo support and shown on your statement.</div>
        </Card>
      </div>
    </Body>
  </Kitchen>
);

/* Merchant-defined menu categories. The merchant creates these first; every dish belongs to one,
   and the customer's menu rail is rendered from this exact list and order. */
const CATS = [
  { id: "c1", name: "Mains", n: 3, hours: "All day" },
  { id: "c2", name: "Sides", n: 1, hours: "All day" },
  { id: "c3", name: "Drinks", n: 1, hours: "All day" },
  { id: "c4", name: "Breakfast", n: 1, hours: "07:00 – 11:00", off: true },
];
const BY_CAT = { c1: ["m1", "m2", "m3"], c2: ["m4"], c3: ["m6"], c4: ["m5"] };
const ITEM = (id) => M.MENU.find((x) => x.id === id);
const dishes = (n) => (n === 1 ? "1 dish" : n + " dishes");

/* Drag grip — visible, because the row copy promises dragging. */
const Grip = () => (
  <span style={{ display: "flex", flexDirection: "column", gap: 3, padding: "0 2px", flexShrink: 0 }}>
    {[0, 1, 2].map((i) => <span key={i} style={{ width: 12, height: 2, borderRadius: 1, background: "var(--line)" }} />)}
  </span>
);

function ItemRow({ i, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <Grip />
      {i.photo === false
        ? <M.FoodThumb name={i.name} size={44} radius={10} />
        : <M.PhotoSlot id={`hxp-m-${i.id}`} label="dish" h={44} w={44} style={{ borderRadius: 10 }} />}
      <div style={{ flex: 1, minWidth: 0, opacity: i.oos ? .55 : 1 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700 }}>{i.name}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{i.desc}</div>
      </div>
      <Money v={i.price} size={16} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: i.oos ? "var(--muted)" : "var(--accent-text)" }}>
        <span style={{ width: 44, height: 26, borderRadius: 999, background: i.oos ? "var(--line)" : "var(--accent)", position: "relative" }}>
          <span style={{ position: "absolute", top: 3, left: i.oos ? 3 : 21, width: 20, height: 20, borderRadius: "50%", background: "#fff" }} />
        </span>
        {i.oos ? "Out of stock" : "Available"}
      </span>
      <Icon name="pencil" size={17} color="var(--muted)" />
    </div>
  );
}

/* M4·1 — the menu editor, grouped by the merchant's own categories. Dishes are added INTO a
   category, so the customer's menu rail is always the merchant's structure. */
RM.catalog = () => (
  <Kitchen nav="catalog" bar={{ orders: 2 }}>
    <Body>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}><H sub="4 categories · 6 dishes · 1 out of stock today">Menu</H></div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, border: "1px solid var(--line)", borderRadius: 999, padding: "11px 18px" }}><Icon name="pencil" size={15} color="var(--accent-text)" />Edit categories</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#fff", background: "var(--cta-fill)", borderRadius: 999, padding: "11px 20px" }}><Icon name="plus" size={16} color="#fff" />Add a dish</span>
      </div>
      <div style={{ display: "flex", gap: 18, height: "calc(100% - 80px)" }}>
        <div style={{ width: 210, flexShrink: 0 }}>
          <Card style={{ padding: "8px 0" }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--muted)", letterSpacing: ".04em", padding: "4px 14px 8px" }}>CATEGORIES</div>
            {CATS.map((c, idx) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", background: idx === 0 ? "var(--accent-wash)" : "transparent", borderLeft: `3px solid ${idx === 0 ? "var(--accent)" : "transparent"}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: c.off ? "var(--muted)" : "var(--ink)" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", ...TAB }}>{dishes(c.n)} · {c.hours}</div>
                </div>
                {c.off ? <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", background: "var(--surface)", borderRadius: 999, padding: "2px 8px" }}>Off</span> : null}
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderTop: "1px solid var(--line)", marginTop: 6, fontSize: 13.5, fontWeight: 700, color: "var(--accent-text)" }}>
              <Icon name="plus" size={15} color="var(--accent-text)" />New category
            </div>
          </Card>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {CATS.slice(0, 2).map((c) => (
            <Card key={c.id} style={{ padding: "6px 18px 10px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0 8px", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: 15.5, fontWeight: 800 }}>{c.name}</span>
                <span style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap", ...TAB }}>{dishes(c.n)} · {c.hours}</span>
                <span style={{ flex: 1 }} />
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)" }}><Icon name="pencil" size={14} color="var(--accent-text)" />Rename</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)" }}><Icon name="plus" size={14} color="var(--accent-text)" />Add dish here</span>
              </div>
              {BY_CAT[c.id].map((id, k, arr) => <ItemRow key={id} i={ITEM(id)} last={k === arr.length - 1} />)}
            </Card>
          ))}
          <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "0 4px" }}>Drag a dish to move it between categories. Customers see these groups, in this order, as the tabs on your menu.</div>
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* M4·7 — manage categories: rename, reorder, time-limit, hide, delete. */
RM.category_manage = () => (
  <Kitchen nav="catalog" bar={{ orders: 2 }}>
    <Body>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}><H sub="This is exactly what customers see as the tabs on your menu — same names, same order.">Categories</H></div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#fff", background: "var(--cta-fill)", borderRadius: 999, padding: "11px 20px" }}><Icon name="plus" size={16} color="#fff" />New category</span>
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        <Card style={{ flex: 1, padding: "4px 18px" }}>
          {CATS.map((c, idx) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: idx === CATS.length - 1 ? "none" : "1px solid var(--line)" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, color: "var(--muted)" }}>
                <Icon name="chevron-up" size={15} color="var(--muted)" /><Icon name="chevron-down" size={15} color="var(--muted)" />
              </span>
              <span style={{ minWidth: 26, fontSize: 15, fontWeight: 800, color: "var(--muted)", ...TAB }}>{idx + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: c.off ? "var(--muted)" : "var(--ink)" }}>{c.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", ...TAB }}>{dishes(c.n)} · {c.hours}</div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: c.off ? "var(--muted)" : "var(--accent-text)" }}>
                <span style={{ width: 44, height: 26, borderRadius: 999, background: c.off ? "var(--line)" : "var(--accent)", position: "relative" }}>
                  <span style={{ position: "absolute", top: 3, left: c.off ? 3 : 21, width: 20, height: 20, borderRadius: "50%", background: "#fff" }} />
                </span>
                {c.off ? "Hidden" : "Showing"}
              </span>
              <Icon name="pencil" size={17} color="var(--muted)" />
              <Icon name="trash-2" size={17} color={c.n ? "var(--line)" : "var(--danger-ink)"} />
            </div>
          ))}
        </Card>
        <Card style={{ width: 300, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>How customers see it</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {CATS.filter((c) => !c.off).map((c, i) => (
              <span key={c.id} style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 12px", borderRadius: 999, background: i === 0 ? "var(--accent-wash)" : "var(--bg)", color: i === 0 ? "var(--accent-text)" : "var(--muted)", border: `1px solid ${i === 0 ? "#bfe7cf" : "var(--line)"}` }}>{c.name}</span>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>A hidden category and its dishes disappear from the app immediately — orders already placed are untouched. Deleting is only possible once a category is empty.</div>
        </Card>
      </div>
    </Body>
  </Kitchen>
);

/* M4·8 — create / rename a category. Time-limited categories (Breakfast) are the reason this isn't
   just a text field. `rename` shows the edit variant, with delete gated on being empty. */
function CategoryDialog({ rename }) {
  return (
    <Kitchen nav="catalog" bar={{ orders: 2 }}>
      <div style={{ height: "100%", position: "relative" }}>
        <Body style={{ opacity: .25 }}><H>Categories</H><Card style={{ height: 300 }} /></Body>
        <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", display: "grid", placeItems: "center" }}>
          <Card style={{ width: 540, padding: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{rename ? "Edit category" : "New category"}</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 14 }}>
              {rename ? "Renaming changes the tab customers see straight away. The 3 dishes inside it stay where they are." : "Customers see this name as a tab on your menu. Keep it short — “Breakfast”, “Combos”, “Kids”."}
            </div>
            <Field label="Category name" value={rename ? "Mains" : "Combos"} onChange={nop} hint="Up to 20 characters." />
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", margin: "14px 0 7px" }}>WHEN IS IT AVAILABLE?</div>
            {[["All day, whenever you're open", true], ["Only between set times", false]].map(([l, on]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent-wash)" : "#fff", borderRadius: 12, marginBottom: 8 }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent)" : "#fff" }} />
                <span style={{ fontSize: 15, fontWeight: 600 }}>{l}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 14, marginTop: 6, opacity: .45 }}>
              <div style={{ flex: 1 }}><Field label="From" value="07:00" onChange={nop} /></div>
              <div style={{ flex: 1 }}><Field label="To" value="11:00" onChange={nop} /></div>
            </div>
            {rename ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "12px 14px", background: "var(--surface)", borderRadius: 12 }}>
                <Icon name="trash-2" size={17} color="var(--muted)" />
                <div style={{ flex: 1, fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>Delete this category — available once it's empty. Move or delete its 3 dishes first.</div>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
              <Button label="Cancel" variant="ghost" onClick={nop} style={{ flex: 1, marginTop: 0 }} />
              <Button label={rename ? "Save changes" : "Create category"} onClick={nop} style={{ flex: 1, marginTop: 0 }} />
            </div>
          </Card>
        </div>
      </div>
    </Kitchen>
  );
}
RM.category_edit = () => <CategoryDialog />;
RM.category_rename = () => <CategoryDialog rename />;

/* M4·b1 — no categories yet: you cannot add a dish into nothing, so this is the first-run screen. */
RM.catalog_empty = () => (
  <Kitchen nav="catalog" bar={{ orders: 0, open: false }}>
    <Body>
      <H sub="Build the structure first, then fill it.">Menu</H>
      <Card style={{ padding: "16px 20px 26px", marginTop: 24 }}>
        <EmptyState icon="utensils" title="Start with a category" message="Dishes live inside categories — Mains, Sides, Drinks, whatever fits your kitchen. Create one and you can add dishes straight into it.">
          <Button label="Create your first category" onClick={nop} />
        </EmptyState>
      </Card>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>Common starting points:</span>
        {["Mains", "Sides", "Drinks", "Breakfast"].map((s) => (
          <span key={s} style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", background: "var(--accent-wash)", borderRadius: 999, padding: "6px 12px" }}>+ {s}</span>
        ))}
      </div>
    </Body>
  </Kitchen>
);

/* M4·2 — edit a dish. Category is a picker over the merchant's own list, never free text. */
RM.item_edit = () => (
  <Kitchen nav="catalog" bar={{ orders: 2 }}>
    <Body>
      <H sub="Changes apply to new orders only — never to an order already placed.">Edit dish</H>
      <div style={{ display: "flex", gap: 18 }}>
        <Card style={{ flex: 1, padding: 20 }}>
          <Field label="Name" value="Sadza & beef stew" onChange={nop} />
          <Field label="Description" value="Sadza, slow-cooked beef, muriwo on the side" onChange={nop} />
          <div style={{ display: "flex", gap: 14, marginTop: -4 }}>
            <div style={{ flex: 1 }}><Field label="Price (USD)" value="4.50" onChange={nop} /></div>
            <div style={{ flex: 1 }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", margin: "8px 0 7px" }}>CATEGORY</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {CATS.map((c, i) => (
              <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, fontSize: 13, fontWeight: 700, padding: "10px 12px", borderRadius: 999, border: `2px solid ${i === 0 ? "var(--accent)" : "var(--line)"}`, background: i === 0 ? "var(--accent-wash)" : "#fff", color: i === 0 ? "var(--accent-text)" : "var(--ink)" }}>
                {i === 0 ? <Icon name="check" size={14} color="var(--accent-text)" /> : null}{c.name}
              </span>
            ))}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, fontSize: 13, fontWeight: 700, padding: "10px 12px", borderRadius: 999, border: "1px dashed var(--line)", color: "var(--accent-text)" }}>
              <Icon name="plus" size={14} color="var(--accent-text)" />New
            </span>
          </div>
          
          <Button label="Save changes" onClick={nop} />
        </Card>
        <Card style={{ width: 300, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>DISH PHOTO</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--danger-ink)", background: "var(--danger-wash)", borderRadius: 999, padding: "2px 8px" }}>REQUIRED</span>
          </div>
          <div style={{ height: 104, borderRadius: 12, background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 11.5, color: "var(--muted)", fontFamily: "ui-monospace, monospace", textAlign: "center", lineHeight: 1.5 }}>
            dish photo · 1:1
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <span style={{ flex: 1, display: "grid", placeItems: "center", minHeight: 40, borderRadius: 999, border: "1px solid var(--line)", fontSize: 13, fontWeight: 700, color: "var(--accent-text)" }}>Reposition</span>
            <span style={{ flex: 1, display: "grid", placeItems: "center", minHeight: 40, borderRadius: 999, border: "1px solid var(--line)", fontSize: 13, fontWeight: 700, color: "var(--accent-text)" }}>Replace</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, marginTop: 10 }}>Every dish needs one photo before it goes live — dishes with photos are ordered about twice as often. Pick the file from this tablet; we shrink it for you.</div>
        </Card>
      </div>
    </Body>
  </Kitchen>
);

/* M4·3 — mid-rush out-of-stock. Two taps, with an automatic reset so it can't be forgotten. */
RM.oos_sheet = () => (
  <Kitchen nav="catalog" bar={{ orders: 3 }}>
    <div style={{ height: "100%", position: "relative" }}>
      <Body style={{ opacity: .25 }}><H>Menu</H><Card style={{ height: 320 }} /></Body>
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", display: "grid", placeItems: "center" }}>
        <Card style={{ width: 500, padding: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Mark “Mazondo” out of stock</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>Customers still see it, greyed out, so they know you normally have it.</div>
          {[["Until I turn it back on", false], ["For the rest of today", true], ["For 1 hour", false]].map(([l, on]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent-wash)" : "#fff", borderRadius: 12, marginBottom: 8 }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent)" : "#fff" }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{l}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <Button label="Cancel" variant="ghost" onClick={nop} style={{ flex: 1, marginTop: 0 }} />
            <Button label="Mark out of stock" onClick={nop} style={{ flex: 1, marginTop: 0 }} />
          </div>
        </Card>
      </div>
    </div>
  </Kitchen>
);

/* M4·4 — hours. Closing early is the common case, so it's a button, not a settings dive. */
RM.hours = () => (
  <Kitchen nav="hours" bar={{ orders: 2 }}>
    <Body>
      <H sub="Customers can browse when you're closed, but can't order.">Opening hours</H>
      <div style={{ display: "flex", gap: 18 }}>
        <Card style={{ flex: 1, padding: "4px 18px" }}>
          {[["Monday", "09:00 – 21:00", true], ["Tuesday", "09:00 – 21:00", true], ["Wednesday", "09:00 – 21:00", true], ["Thursday", "09:00 – 21:00", true], ["Friday", "09:00 – 22:00", true], ["Saturday", "10:00 – 22:00", true], ["Sunday", "Closed", false]].map(([d, h, on]) => (
            <div key={d} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{d}</span>
              <span style={{ fontSize: 15, color: on ? "var(--ink)" : "var(--muted)", ...TAB }}>{h}</span>
              <span style={{ width: 44, height: 26, borderRadius: 999, background: on ? "var(--accent)" : "var(--line)", position: "relative" }}>
                <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff" }} />
              </span>
            </div>
          ))}
        </Card>
        <Card style={{ width: 300, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>RIGHT NOW</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--accent-text)" }}>Open until 21:00</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>Pausing stops new orders immediately. Orders you've already accepted are unaffected.</div>
          <Button label="Pause orders for 30 min" variant="ghost" onClick={nop} />
          <Button label="Close for today" variant="ghost" onClick={nop} style={{ color: "var(--danger-ink)" }} />
        </Card>
      </div>
    </Body>
  </Kitchen>
);

/* M4·5 — weekly statement. 0% commission, and the accrual is shown anyway. */
RM.statement = () => (
  <Kitchen nav="money" bar={{ orders: 2 }}>
    <Body>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <div style={{ flex: 1 }}><H sub="Mon 21 – Sun 27 July">Weekly statement</H></div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, border: "1px solid var(--line)", borderRadius: 999, padding: "10px 16px" }}><Icon name="receipt" size={15} color="var(--accent-text)" />Download PDF</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, border: "1px solid var(--line)", borderRadius: 999, padding: "10px 16px" }}><Icon name="arrow-right" size={15} color="var(--accent-text)" />Send to WhatsApp</span>
      </div>
      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        {[["Orders delivered", "68", ""], ["Food sales", "$742.50", "paid to you directly"], ["Commission charged", "$0.00", "0% at launch"], ["Would have been (10%)", "$74.25", "shown for transparency"]].map(([l, v, s]) => (
          <Card key={l} style={{ flex: 1, padding: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>{l}</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, ...TAB }}>{v}</div>
            {s ? <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{s}</div> : null}
          </Card>
        ))}
      </div>
      <Card style={{ padding: "4px 18px" }}>
        {[["LG-4471", "Sun 10:04", "CASH", "13.00", "0.00"], ["LG-4470", "Sun 09:38", "WALLET", "6.00", "0.00"], ["LG-4469", "Sat 20:11", "CASH", "11.00", "0.00"], ["LG-4468", "Sat 19:44", "WALLET", "8.50", "0.00"]].map(([id, when, pay, amt, com]) => (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: "1px solid var(--line)", fontSize: 14, ...TAB }}>
            <span style={{ fontWeight: 700, minWidth: 90 }}>{id}</span>
            <span style={{ color: "var(--muted)", minWidth: 90 }}>{when}</span>
            <span style={{ flex: 1 }}><PayTag pay={pay} /></span>
            <span style={{ fontWeight: 700 }}>${amt}</span>
            <span style={{ color: "var(--muted)", minWidth: 70, textAlign: "right" }}>−${com}</span>
          </div>
        ))}
      </Card>
      <div style={{ display: "flex", gap: 10, marginTop: 14, padding: "12px 16px", background: "var(--surface)", borderRadius: 12 }}>
        <Icon name="receipt" size={17} color="var(--muted)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Commission is 0% while we grow the corridor. When a rate starts, you'll see it here for a full week before the first charge — never as a surprise deduction.</div>
      </div>
    </Body>
  </Kitchen>
);

/* M4·6 — end of day. What the owner actually asks at closing time. */
RM.eod = () => (
  <Kitchen nav="money" bar={{ orders: 0, open: false }}>
    <Body>
      <H sub="Sunday 27 July · closed at 21:00">Today's summary</H>
      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        {[["Delivered", "14"], ["Cash taken", "$96.50"], ["Mobile money", "$72.00"], ["Rejected", "1"], ["Average prep", "18 min"]].map(([l, v]) => (
          <Card key={l} style={{ flex: 1, padding: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>{l}</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, ...TAB }}>{v}</div>
          </Card>
        ))}
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        <Card style={{ flex: 1, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Check your cash drawer</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ flex: 1, fontSize: 14, color: "var(--muted)" }}>Cash LyniaGo riders paid you today</span><Money v="96.50" size={22} />
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Count it against your till before you lock up. Every amount here was confirmed by you on the pickup screen.</div>
        </Card>
        <Card style={{ width: 320, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>One thing to fix tomorrow</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>Mazondo was out of stock from 18:00 and 4 people looked at it. Set stock in the morning so it doesn't sit greyed out all evening.</div>
        </Card>
      </div>
    </Body>
  </Kitchen>
);


/* ── Shop profile: the banner, logo and blurb customers see above the menu ───────────────────── */

/* Crop frame — the uploaded file inside the aspect box, draggable, with a zoom rail. */
function CropFrame({ ratio = "3:1", w = 420, h = 140, label = "uploaded file · drag to reposition" }) {
  return (
    <div>
      <div style={{ width: w, height: h, borderRadius: 12, background: "var(--surface)", position: "relative", overflow: "hidden", display: "grid", placeItems: "center" }}>
        <span style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>{label}</span>
        <span style={{ position: "absolute", inset: 8, border: "2px dashed var(--accent)", borderRadius: 8, pointerEvents: "none" }} />
        <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: "flex", alignItems: "center", gap: 6, background: "rgba(20,24,27,.72)", color: "#fff", fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "6px 12px" }}>
          <Icon name="navigation" size={13} color="#fff" />Drag to move
        </span>
        <span style={{ position: "absolute", right: 10, top: 8, fontSize: 11.5, fontWeight: 700, color: "var(--muted)", background: "var(--bg)", borderRadius: 999, padding: "3px 9px" }}>{ratio}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <Icon name="minus" size={16} color="var(--muted)" />
        <span style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--line)", position: "relative" }}>
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "46%", borderRadius: 3, background: "var(--accent)" }} />
          <span style={{ position: "absolute", left: "46%", top: -7, width: 20, height: 20, borderRadius: "50%", background: "#fff", border: "2px solid var(--accent)", boxShadow: "var(--shadow-card)" }} />
        </span>
        <Icon name="plus" size={16} color="var(--muted)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", minWidth: 42, textAlign: "right", ...TAB }}>1.4×</span>
      </div>
    </div>
  );
}

/* Miniature of the customer's restaurant page — the merchant edits against what shoppers see. */
function CustomerPreview({ wide }) {
  return (
    <div style={{ width: wide ? 300 : 260, borderRadius: 16, border: "1px solid var(--line)", overflow: "hidden", background: "var(--bg)" }}>
      <M.CoverPhoto height={78}>
        <M.ShopLogo size={46} style={{ position: "absolute", left: 12, bottom: -20 }} />
      </M.CoverPhoto>
      <div style={{ padding: "24px 12px 14px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{M.SHOP.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>{M.SHOP.price}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>{M.SHOP.tagline}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {M.SHOP.tags.map((t) => (
            <span key={t} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-text)", background: "var(--accent-wash)", borderRadius: 999, padding: "4px 9px" }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* M5·1 — shop profile. Everything a customer sees above the menu, edited in one place. */
RM.shop = () => (
  <Kitchen nav="shop" bar={{ orders: 2 }}>
    <Body>
      <H sub="This is your shop front. Changes go live straight away.">Shop profile</H>
      <div style={{ display: "flex", gap: 18, height: "calc(100% - 72px)" }}>
        <Card style={{ flex: 1, padding: 16, overflow: "hidden" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>COVER BANNER · 3:1</div>
          <M.CoverPhoto height={72} label="cover banner · 1200×400 · under 250 KB">
            <M.ShopLogo size={54} style={{ position: "absolute", left: 16, bottom: -22 }} />
          </M.CoverPhoto>
          <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 13.5, fontWeight: 700, color: "#fff", background: "var(--cta-fill)", borderRadius: 999, padding: "11px 18px" }}><Icon name="plus" size={15} color="#fff" />Choose a file</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 13.5, fontWeight: 700, border: "1px solid var(--line)", borderRadius: 999, padding: "11px 18px" }}><Icon name="navigation" size={15} color="var(--accent-text)" />Reposition</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 13.5, fontWeight: 700, color: "var(--danger-ink)", border: "1px solid var(--line)", borderRadius: 999, padding: "11px 18px" }}><Icon name="trash-2" size={15} color="var(--danger-ink)" />Remove</span>
          </div>
          <div style={{ height: 1, background: "var(--line)", margin: "10px 0" }} />
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ width: 220 }}><Field label="Shop name" value="Sadza Republic" onChange={nop} /></div>
            <div style={{ flex: 1 }}><Field label="One line customers read" value="Home-style sadza and slow-cooked stews, cnr Fife Ave & 5th St." onChange={nop} hint="Up to 80 characters." /></div>
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 7 }}>WHAT YOU COOK · up to 3</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[["Zimbabwean", true], ["Grills", true], ["Sadza", true], ["Chicken", false]].map(([t, on]) => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40, fontSize: 13, fontWeight: 700, padding: "9px 12px", borderRadius: 999, border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent-wash)" : "#fff", color: on ? "var(--accent-text)" : "var(--ink)" }}>
                    {on ? <Icon name="check" size={13} color="var(--accent-text)" /> : null}{t}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ width: 190 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 7 }}>PRICE LEVEL</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["$", "$$", "$$$"].map((p) => (
                  <span key={p} style={{ flex: 1, display: "grid", placeItems: "center", minHeight: 40, fontSize: 15, fontWeight: 800, borderRadius: 999, border: `2px solid ${p === "$$" ? "var(--accent)" : "var(--line)"}`, background: p === "$$" ? "var(--accent-wash)" : "#fff", color: p === "$$" ? "var(--accent-text)" : "var(--ink)" }}>{p}</span>
                ))}
              </div>
              
            </div>
          </div>
        </Card>
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>WHAT CUSTOMERS SEE</div>
          <CustomerPreview wide />
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12, lineHeight: 1.5 }}>A real photo of your food beats a logo on the banner. Shoot in daylight, no flash — and keep the left edge clear, your logo sits there.</div>
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* M5·2 — reposition the banner inside the 3:1 frame, against a live customer preview. */
RM.shop_crop = () => (
  <Kitchen nav="shop" bar={{ orders: 2 }}>
    <div style={{ height: "100%", position: "relative" }}>
      <Body style={{ opacity: .25 }}><H>Shop profile</H><Card style={{ height: 320 }} /></Body>
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", display: "grid", placeItems: "center" }}>
        <Card style={{ width: 800, padding: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Position your banner</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>Drag the picture and pinch or slide to zoom. Anything outside the dashed frame is cut off.</div>
          <div style={{ display: "flex", gap: 22 }}>
            <div style={{ flex: 1 }}>
              <CropFrame ratio="3:1" w={430} h={150} />
              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                <Button label="Cancel" variant="ghost" onClick={nop} style={{ flex: 1, marginTop: 0 }} />
                <Button label="Save banner" onClick={nop} style={{ flex: 1, marginTop: 0 }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>LIVE PREVIEW</div>
              <CustomerPreview />
            </div>
          </div>
        </Card>
      </div>
    </div>
  </Kitchen>
);

/* M5·3 — uploading. We compress on the merchant's behalf and say so; the tablet is slow and the
   file straight off a phone camera is 4 MB. */
RM.shop_upload = () => (
  <Kitchen nav="shop" bar={{ orders: 2 }}>
    <div style={{ height: "100%", position: "relative" }}>
      <Body style={{ opacity: .25 }}><H>Shop profile</H><Card style={{ height: 320 }} /></Body>
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", display: "grid", placeItems: "center" }}>
        <Card style={{ width: 520, padding: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Uploading your banner</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>braai-lunch.jpg · 4.2 MB — we're shrinking it to 240 KB so it opens fast on your customers' phones.</div>
          <div style={{ height: 10, borderRadius: 5, background: "var(--line)", overflow: "hidden" }}>
            <div style={{ width: "62%", height: "100%", background: "var(--accent)", borderRadius: 5 }} />
          </div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 13, color: "var(--muted)", ...TAB }}>
            <span style={{ flex: 1 }}>62%</span><span>about 20 seconds left</span>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, padding: "12px 14px", background: "var(--surface)", borderRadius: 12 }}>
            <Icon name="circle-alert" size={17} color="var(--muted)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>Keep this tab open. Orders still arrive while an upload is running — the alarm will interrupt this screen if one lands.</div>
          </div>
          <Button label="Cancel upload" variant="ghost" onClick={nop} />
        </Card>
      </div>
    </div>
  </Kitchen>
);

/* M5·b1 — upload failed offline. The file is kept and retried; nothing has to be found again. */
RM.shop_upload_failed = () => (
  <Kitchen nav="shop" bar={{ orders: 2, offline: true }}>
    <div style={{ height: "100%", position: "relative" }}>
      <Body style={{ opacity: .25 }}><H>Shop profile</H><Card style={{ height: 320 }} /></Body>
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", display: "grid", placeItems: "center" }}>
        <Card style={{ width: 520, padding: "16px 20px 22px" }}>
          <EmptyState icon="wifi-off" title="Upload paused — you're offline" message="braai-lunch.jpg is saved on this tablet and will finish uploading by itself when the wifi is back. Your current banner is still showing to customers.">
            <Button label="Try again now" onClick={nop} />
            <Button label="Keep waiting" variant="ghost" onClick={nop} />
          </EmptyState>
        </Card>
      </div>
    </div>
  </Kitchen>
);

/* M4·7 — dish photo crop, 1:1. Same mechanics as the banner, different frame. */
RM.dish_photo = () => (
  <Kitchen nav="catalog" bar={{ orders: 2 }}>
    <div style={{ height: "100%", position: "relative" }}>
      <Body style={{ opacity: .25 }}><H>Edit dish</H><Card style={{ height: 320 }} /></Body>
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", display: "grid", placeItems: "center" }}>
        <Card style={{ width: 660, padding: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Position the dish photo</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>Sadza &amp; beef stew · square crop. Fill the frame with the food, not the table.</div>
          <div style={{ display: "flex", gap: 22 }}>
            <div style={{ flex: 1 }}>
              <CropFrame ratio="1:1" w={240} h={240} label="uploaded file" />
              <div style={{ display: "flex", gap: 12, marginTop: 16, width: 240 }}>
                <Button label="Cancel" variant="ghost" onClick={nop} style={{ flex: 1, marginTop: 0 }} />
                <Button label="Save photo" onClick={nop} style={{ flex: 1, marginTop: 0 }} />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>HOW IT LOOKS ON THE MENU</div>
              <div style={{ border: "1px solid var(--line)", borderRadius: 14, padding: "4px 14px", background: "var(--bg)" }}>
                <M.MenuRow i={M.MENU[0]} qty={0} />
                <M.MenuRow i={M.MENU[1]} qty={0} />
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.45 }}>Customers scan photos before they read names. One clear daylight shot per dish is enough.</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </Kitchen>
);

/* M4·b2 — a dish with no photo can't go live. It sits as a draft, visible only to the kitchen. */
RM.dish_draft = () => (
  <Kitchen nav="catalog" bar={{ orders: 2 }}>
    <Body>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}><H sub="4 categories · 7 dishes · 1 draft waiting for a photo">Menu</H></div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#fff", background: "var(--cta-fill)", borderRadius: 999, padding: "11px 20px" }}><Icon name="plus" size={16} color="#fff" />Add a dish</span>
      </div>
      <Card style={{ padding: 16, marginBottom: 12, background: "var(--highlight-wash)", boxShadow: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 54, height: 54, borderRadius: 12, background: "var(--bg)", border: "2px dashed var(--highlight)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="plus" size={20} color="var(--highlight-ink)" />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Beef trotters &amp; rice</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--highlight-ink)", background: "var(--bg)", borderRadius: 999, padding: "2px 9px" }}>DRAFT</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--highlight-ink)", marginTop: 3, lineHeight: 1.45 }}>Saved, but customers can't see it yet — every dish needs one photo before it goes live.</div>
          </div>
          <Money v="5.50" size={17} />
          <span style={{ display: "grid", placeItems: "center", minHeight: 44, borderRadius: 999, background: "var(--cta-fill)", color: "#fff", fontSize: 13.5, fontWeight: 700, padding: "0 20px" }}>Add a photo</span>
        </div>
      </Card>
      <Card style={{ padding: "6px 18px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0 8px", borderBottom: "1px solid var(--line)" }}>
          <span style={{ fontSize: 15.5, fontWeight: 800 }}>Mains</span>
          <span style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap", ...TAB }}>3 dishes · All day</span>
        </div>
        {["m1", "m2"].map((id, k) => <ItemRow key={id} i={ITEM(id)} last={k === 1} />)}
      </Card>
    </Body>
  </Kitchen>
);


/* M2·b2 — the rider cancelled AFTER being secured. The kitchen was already told to cook, so this
   screen has to do two things at once: re-dispatch, and tell the cook whether to stop. */
RM.rider_cancelled = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 22px", background: "var(--highlight-wash)", borderBottom: "2px solid var(--highlight)" }}>
        <Icon name="triangle-alert" size={22} color="var(--highlight-ink)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--highlight-ink)" }}>Tendai cancelled — we're finding another rider</div>
          <div style={{ fontSize: 13.5, color: "var(--highlight-ink)" }}>LG-4471 · cancelled 10:06 · nobody has collected your food</div>
        </div>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--highlight-ink)", background: "var(--bg)", border: "1px solid var(--highlight-border)", borderRadius: 999, padding: "8px 16px", ...TAB }}>searching 0:42</span>
      </div>
      <Body style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 18, height: "100%" }}>
          <Card style={{ flex: 1, padding: 20 }}>
            <div style={{ fontSize: 21, fontWeight: 800 }}>Order LG-4471 · Rufaro C.</div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 14 }}>3 items · Belgravia · cash on delivery</div>
            <div style={{ display: "flex", gap: 12, padding: "14px 16px", background: "var(--surface)", borderRadius: 12 }}>
              <Icon name="timer" size={20} color="var(--ink)" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>
                <b>Your prep clock is paused at 6:12.</b> It restarts the moment a new rider is secured, so you're not judged on time you didn't lose.
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              {[["09:46", "Tendai secured — you started cooking"], ["10:06", "Tendai cancelled (bike problem)"], ["10:06", "Searching for another rider nearby"]].map(([t, l]) => (
                <div key={t + l} style={{ display: "flex", gap: 12, padding: "5px 0", fontSize: 13.5 }}>
                  <span style={{ color: "var(--muted)", minWidth: 46, ...TAB }}>{t}</span><span>{l}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, padding: "12px 14px", background: "var(--accent-wash)", borderRadius: 12 }}>
              <Icon name="circle-check" size={18} color="var(--accent-text)" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.45 }}>You keep the order either way. If nobody takes it within 6 minutes we cancel it and the cooked food goes on your weekly statement as a loss we cover.</div>
            </div>
          </Card>
          <div style={{ width: 300 }}>
            <Card style={{ padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 10 }}>WHAT DO YOU WANT TO DO?</div>
              <Button label="Keep cooking — wait for a rider" onClick={nop} style={{ minHeight: 58, fontSize: 16, marginTop: 0 }} />
              <Button label="Stop cooking, hold the order" variant="ghost" onClick={nop} />
              <Button label="Cancel the order" variant="ghost" onClick={nop} style={{ color: "var(--danger-ink)" }} />
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.45 }}>Rufaro has been told and is watching the same search. Cancelling here doesn't count against your acceptance rate.</div>
            </Card>
          </div>
        </div>
      </Body>
    </div>
  </Kitchen>
);
