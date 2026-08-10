/* LyniaGo Restaurants — merchant tablet: SHIPPED-STATES alignment wave (2026-08, SH·).
   Per-item "don't have it" in the queue (answer with what you have, customer confirms the new
   total before you cook) and the pickup-code reveal step (code hidden until the rider is at the
   counter). Same conventions as r-merchant.jsx (frozen state, 1024×680). Extends window.RM.
   Sheet + logic notes: ui_kits/mobile/shipped-states.html. */
(() => {
const M = window.RParts;
window.RM = window.RM || {};
const { Button, Card, Icon, Money, Kitchen, PayTag, PickupCode, nop, TAB } = M;

const Body = ({ children, style }) => <div style={{ height: "100%", overflow: "hidden", padding: 20, boxSizing: "border-box", ...style }}>{children}</div>;
const H = ({ children, sub }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.01em" }}>{children}</div>
    {sub ? <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }} className="lynia-tabular">{sub}</div> : null}
  </div>
);
const Big = ({ v, size = 38 }) => <div style={{ fontSize: size, fontWeight: 800, ...TAB }}>${v}</div>;

const ITEMS = [
  { q: "1", n: "Half roast huku", p: "6.00", out: false },
  { q: "1", n: "Sadza & beef stew", p: "4.50", out: false },
  { q: "1", n: "Muriwo une dovi", p: "2.50", out: true },
];

/* ── SH10a · Per-item "don't have it" — answer with what you have ── */
window.RM.item_out = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <div style={{ display: "flex", gap: 18, height: "100%" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <H sub="LG-4471 · Rufaro C. · Belgravia · CASH">Answer with what you have</H>
          <Card style={{ padding: 20 }}>
            {ITEMS.map((it) => (
              <div key={it.n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--line)", background: it.out ? "var(--danger-wash)" : "transparent", borderRadius: it.out ? 10 : 0, paddingLeft: it.out ? 10 : 0, paddingRight: it.out ? 10 : 0 }}>
                <span style={{ minWidth: 30, height: 30, borderRadius: 8, background: it.out ? "transparent" : "var(--surface)", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800, color: it.out ? "var(--danger-ink)" : "var(--ink)", ...TAB }}>{it.q}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: it.out ? "var(--danger-ink)" : "var(--ink)" }}>{it.n}</span>
                  {it.out ? <div style={{ fontSize: 12, color: "var(--danger-ink)", marginTop: 1 }}>Marked out — Rufaro will be asked before you cook</div> : null}
                </div>
                <Money v={it.p} size={15} weight={600} color={it.out ? "var(--danger-ink)" : "var(--ink)"} />
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 14px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--bg)", fontSize: 13, fontWeight: 700, color: it.out ? "var(--accent-text)" : "var(--danger-ink)", flexShrink: 0 }}>
                  {it.out ? "Put it back" : "Don't have it"}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingTop: 14 }}>
              <span style={{ fontSize: 14, color: "var(--muted)" }}>New total <s style={{ marginLeft: 6, ...TAB }}>$13.00</s></span>
              <span style={{ flex: 1 }} /><Big v="10.50" size={32} />
            </div>
          </Card>
        </div>
        <div style={{ width: 300, display: "flex", flexDirection: "column", gap: 12 }}>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>WHAT HAPPENS NEXT</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>Rufaro sees the new total and confirms — or cancels — before you cook. Marking an item out never cancels the order by itself, and it doesn't touch tomorrow's menu (use "Out of stock today" for that).</div>
          </Card>
          <Button label="Accept 2 of 3 · $10.50 · 20 min" onClick={nop} style={{ minHeight: 68, fontSize: 17, marginTop: 0 }} />
          <Button label="Can't take any of it" variant="ghost" onClick={nop} style={{ color: "var(--danger-ink)", marginTop: 0 }} />
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* ── SH10a · Waiting on the customer's yes — no clock, one honest exit ── */
window.RM.item_out_wait = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <div style={{ display: "flex", gap: 18, height: "100%" }}>
        <div style={{ flex: 1 }}>
          <H sub="LG-4471 · Rufaro C. · CASH">Waiting for Rufaro to confirm the change</H>
          <Card style={{ padding: 22 }}>
            {[["09:44", "You marked Muriwo une dovi as out"], ["09:44", "Rufaro was asked to confirm the new $10.50 total"], ["—", "Waiting — do not cook until they say yes"]].map(([t, l], i, a) => (
              <div key={l} style={{ display: "flex", gap: 12, padding: "7px 0", borderTop: i ? "1px solid var(--line)" : "none", fontSize: 14.5, color: i === a.length - 1 ? "var(--muted)" : "var(--ink)" }}>
                <span style={{ color: "var(--muted)", minWidth: 48, ...TAB }}>{t}</span><span style={{ fontWeight: i === a.length - 1 ? 400 : 600 }}>{l}</span>
              </div>
            ))}
            <Button label="They said yes on the phone — start cooking" onClick={nop} style={{ minHeight: 60, fontSize: 17, marginTop: 16 }} />
            <Button label="Put the item back — cook the full order" variant="ghost" onClick={nop} />
          </Card>
        </div>
        <div style={{ width: 280 }}>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>NO CLOCK ON THIS</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>Most customers answer inside a minute. If they cancel instead, nothing was cooked and nothing is owed — the order simply closes.</div>
          </Card>
        </div>
      </div>
    </Body>
  </Kitchen>
);

/* ── SH10b · Pickup code — hidden until the rider is at the counter, then read face-to-face ── */
window.RM.pickup_reveal = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <div style={{ display: "flex", gap: 18, height: "100%" }}>
        <div style={{ flex: 1 }}>
          <H sub="LG-4471 · ready 10:01 · Tendai M. marked arrived">Rider at the counter?</H>
          <Card style={{ padding: 24, textAlign: "center" }}>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 12 }}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} style={{ width: 52, height: 64, borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 26, fontWeight: 800, color: "var(--muted)" }}>•</span>
              ))}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, maxWidth: 420, margin: "0 auto" }}>The code proves the person at your counter is the assigned rider. Reveal it only face-to-face — never over the phone, never to someone "picking up for" them.</div>
            <Button label="Rider is here — reveal the code" onClick={nop} style={{ minHeight: 64, fontSize: 17, maxWidth: 380, margin: "16px auto 0" }} />
          </Card>
        </div>
        <div style={{ width: 280 }}>
          <Card style={{ padding: 18, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>YOU WILL BE PAID</div>
            <Big v="13.00" size={40} />
            <div style={{ marginTop: 8 }}><PayTag pay="CASH" /></div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, marginTop: 10 }}>Count the cash before the food leaves the counter.</div>
          </Card>
        </div>
      </div>
    </Body>
  </Kitchen>
);
window.RM.pickup_revealed = () => (
  <Kitchen nav="queue" bar={{ orders: 4 }}>
    <Body>
      <div style={{ display: "flex", gap: 18, height: "100%" }}>
        <div style={{ flex: 1 }}>
          <H sub="LG-4471 · Tendai M. at the counter">Ask the rider to read it back</H>
          <Card style={{ padding: 24, textAlign: "center" }}>
            <PickupCode code="7241" tone="tablet" />
            <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, maxWidth: 420, margin: "12px auto 0" }}>The rider types it into their app. When it matches, count the cash, then hand the food over.</div>
            <Button label="Code matches — hand it over" onClick={nop} style={{ minHeight: 64, fontSize: 17, maxWidth: 380, margin: "16px auto 0" }} />
            <Button label="Wrong code — don't release the food" variant="ghost" onClick={nop} style={{ color: "var(--danger-ink)", maxWidth: 380, margin: "8px auto 0" }} />
          </Card>
        </div>
        <div style={{ width: 280 }}>
          <Card style={{ padding: 18, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>YOU WILL BE PAID</div>
            <Big v="13.00" size={40} />
            <div style={{ marginTop: 8 }}><PayTag pay="CASH" /></div>
          </Card>
        </div>
      </div>
    </Body>
  </Kitchen>
);

})();
