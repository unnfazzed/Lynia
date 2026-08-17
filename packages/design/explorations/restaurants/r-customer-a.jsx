/* LyniaGo Restaurants — CUSTOMER screens, part A: the tab appears → discover → menu → cart →
   checkout. Static frozen states; registers into window.RC. */

const P = window.RParts;
const { Button, Card, Field, EmptyState, Icon, Skeleton, Money, Pad, AppBar, Screen, Banner, PayTag,
  PriceMath, RestRow, MenuRow, RailRow, ServiceTiles, HomeHead, FoodThumb, EtaLine, CoverPhoto, ShopLogo, SHOP, REST, MENU, CART, ORDER_NOTE, ORDER, RAILS, nop, TAB } = P;

const RC = (window.RC = window.RC || {});
const { AppHome: DSAppHome, BrandHeader, LiveOrderCard, ReorderRail, RestaurantCard } = P.DSR;
/* Guard: if the page loads a bundle compiled before AppHome existed, show a note instead of
   throwing through React reconciliation (which would unmount the whole gallery). */
const AppHome = DSAppHome || (() => <div style={{ padding: 20, fontSize: 12, color: "var(--muted)" }}>Home needs a design-system rebuild (AppHome missing from the bundle).</div>);

/* Photo drop-slot — same ids + sidecar as Home Explorations, so dropped photos carry across. */
function Slot({ id, label, h, w = "100%", shape = "rect", style }) {
  return (
    <div style={{ position: "relative", width: w, height: h, background: "var(--surface)", overflow: "hidden", flexShrink: 0, borderRadius: shape === "circle" ? "50%" : 0, ...style }}>
      <image-slot id={id} shape={shape} placeholder={label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}></image-slot>
    </div>
  );
}
/* Restaurants-near-you data — DS RestaurantCards with drop-slot photos; the card stays the way in. */
const RC_HOME_VENUES = REST.slice(0, 3).map((r) => ({ ...r, photo: <Slot id={`hxp-r-${r.id}`} label={`photo — ${r.name}`} h={84} /> }));

/* The two running jobs the home mock depicts — one per product, food first (newest). */
const RC_LIVE_FOOD = { id: "food", title: "Sadza Republic · 6 min away", meta: "Cash at the door · $15.50", step: 4, icon: "utensils" };
const RC_LIVE_RIDE = { id: "ride", title: "Parcel to Msasa · rider 4 min away", meta: "Delivery code 4192 · $3.36", step: 5 };

/* Home body — the PRE-8c home (DS AppHome: green brand header → 62px round-square service tiles →
   a bordered live-order card per running job → a horizontal restaurants rail).

   RETIRED 2026-08-17 by the home-8c redesign (see RC.home below). Kept, unreferenced by any gallery
   tile, purely as the lineage record for the 2a → 7a/7b → 8a → 8b → 8c exploration: nothing may be
   aligned to it, and a screen that renders it is by definition off-design. */
function HomeBody({ live, ride }) {
  const jobs = [];
  if (live) jobs.push(RC_LIVE_FOOD);
  if (ride) jobs.push(RC_LIVE_RIDE);
  return <AppHome address="12 Lanark Rd, Belgravia" live={jobs} restaurants={RC_HOME_VENUES} onAddress={nop} onSearch={nop} onBell={nop} onProfile={nop} onSeeAll={nop} />;
}

/* R0·1 — home. THE home screen for the app: both Send and Food ship at launch, so services are
   tiles from day one (Pharmacy is already the third tile, carrying its SOON chip).

   2026-08-17: this is now **home 8c** (explorations/home-redesign/home-8c.jsx, handoff package at
   handoff/home-8c/, DS card ui_kits/mobile/home-8c.html) — a mint header with a time-aware greeting
   and the DETECTED CURRENT LOCATION, flat-sticker service tiles with the label inside, a single
   mint tracker pill, and a two-column "Popular near you" grid. The screen root is --accent-wash so
   the status bar sits on mint; `dark` is off because the mint header carries dark ink. */
RC.home = () =>
  window.HOME8C ? (
    <window.HOME8C.Home8c />
  ) : (
    <Screen tab="home" bg="var(--accent-wash)">
      <div style={{ padding: 20, fontSize: 12, color: "var(--muted)" }}>Home 8c needs explorations/home-redesign/home-8c.jsx on the page.</div>
    </Screen>
  );

/* R0·2 — Orders: one list across every service, so a vertical never needs its own history. */
RC.orders = () => (
  <Screen tab="orders">
    <div style={{ padding: "8px 16px" }}>
      <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>Your orders</div>
      <Card accent style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><Icon name="utensils" size={17} color="var(--accent-text)" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Sadza Republic</div>
            <div style={{ fontSize: 12, color: "var(--accent-text)", fontWeight: 600 }}>On the way · 6 min</div>
          </div>
          <Money v="15.50" size={14} />
        </div>
      </Card>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>EARLIER</div>
      {[["utensils", "Huku House", "Fri · delivered", "9.00"], ["package", "Parcel to Msasa", "Thu · delivered", "2.40"], ["utensils", "Café Msasa", "Wed · refunded", "7.50"]].map(([ic, n, s, v]) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center" }}><Icon name={ic} size={16} color="var(--muted)" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{n}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{s}</div>
          </div>
          <Money v={v} size={13} weight={600} color="var(--muted)" />
        </div>
      ))}
    </div>
  </Screen>
);

/* R1·1 — restaurant list. Corridor-scoped, distance-sorted, closed shops kept visible. */
RC.list = () => (
  <Screen>
    <div style={{ height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Icon name="chevron-right" size={20} color="var(--ink)" style={{ transform: "rotate(180deg)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em" }}>FOOD · DELIVER TO</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>12 Lanark Rd, Belgravia</span>
              <Icon name="chevron-down" size={15} color="var(--muted)" />
            </div>
          </div>
          <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center" }}><Icon name="search" size={18} color="var(--ink)" /></span>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
          {[["Open now", true], ["Nearest", false], ["Under $2 fee", false], ["Top rated", false]].map(([l, on]) => (
            <span key={l} style={{ fontSize: 12.5, fontWeight: 700, padding: "8px 12px", borderRadius: 999, background: on ? "var(--accent-wash)" : "var(--bg)", color: on ? "var(--accent-text)" : "var(--muted)", border: `1px solid ${on ? "#bfe7cf" : "var(--line)"}`, whiteSpace: "nowrap" }}>{l}</span>
          ))}
        </div>
      </div>
      <div style={{ padding: "6px 16px 0" }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>5 places deliver to Belgravia · 25–45 min</div>
        {REST.map((r, i) => <RestRow key={r.id} r={r} hero={i === 0} closingSoon={i === 2} />)}
      </div>
    </div>
  </Screen>
);

/* R1·2 — loading. Content-shaped skeletons, never a spinner (layout must not jump on 3G). */
RC.list_loading = () => (
  <Screen>
    <div style={{ padding: "14px 16px" }}>
      <Skeleton height={12} width="30%" /><div style={{ height: 6 }} /><Skeleton height={17} width="70%" />
      <div style={{ height: 16 }} />
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <Skeleton width={76} height={76} radius={14} />
            <div style={{ flex: 1 }}>
              <Skeleton height={15} width="65%" /><div style={{ height: 8 }} />
              <Skeleton height={12} width="45%" /><div style={{ height: 10 }} />
              <Skeleton height={12} width="80%" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  </Screen>
);

/* R1·3 — nobody open. The highest-leverage screen: icon + one sentence + one action. */
RC.list_empty = () => (
  <Screen>
    <div style={{ padding: "10px 16px" }}>
      <AppBar title="Restaurants" sub="Belgravia · 22:40" />
      <Card style={{ padding: "10px 16px 18px", marginTop: 40 }}>
        <EmptyState icon="utensils" title="No kitchens are open right now" message="Most places in your corridor close by 21:00. Sadza Republic opens at 09:00 — we can ping you then.">
          <Button label="Notify me when they open" onClick={nop} />
          <Button label="Send a parcel instead" variant="ghost" onClick={nop} />
        </EmptyState>
      </Card>
    </div>
  </Screen>
);

/* R1·4 — offline / fetch failed. Same shape as empty, honest reason, one retry. */
RC.list_error = () => (
  <Screen banner={<Banner tone="offline" icon="wifi-off" title="You're offline" msg="Showing what we had at 09:12." action="Retry" />}>
    <div style={{ padding: "10px 16px" }}>
      <AppBar title="Restaurants" sub="Last updated 09:12" />
      <Card style={{ padding: "10px 16px 18px", marginTop: 30 }}>
        <EmptyState icon="wifi-off" title="We can't reach the kitchens" message="Your connection dropped. Nothing was ordered and nothing was charged.">
          <Button label="Try again" onClick={nop} />
        </EmptyState>
      </Card>
    </div>
  </Screen>
);

/* R1·5 — search. Recents first; typing filters dishes as well as places. */
RC.search = () => (
  <Screen>
    <Pad style={{ paddingTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, border: "1.5px solid var(--accent)", borderRadius: "var(--radius-input)", padding: "10px 12px", marginBottom: 14 }}>
        <Icon name="search" size={17} color="var(--muted)" />
        <span style={{ fontSize: 14.5, color: "var(--ink)", fontWeight: 600 }}>sadza</span>
        <span style={{ flex: 1 }} /><Icon name="x" size={16} color="var(--muted)" />
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>PLACES</div>
      <RestRow r={REST[0]} />
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", margin: "12px 0 4px" }}>DISHES</div>
      {[["Sadza & beef stew", "Sadza Republic · $4.50"], ["Sadza & mazondo", "Mbuya's Kitchen · $4.00"]].map(([n, s]) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--line)", minHeight: 44 }}>
          <Icon name="utensils" size={16} color="var(--muted)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{n}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", ...TAB }}>{s}</div>
          </div>
          <Icon name="chevron-right" size={16} color="var(--muted)" />
        </div>
      ))}
    </Pad>
  </Screen>
);

/* R2·1 — menu. Header carries the honest delivery math before anything is added. */
RC.menu = () => (
  <Screen footer={
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>2 items</div>
        <Money v="11.50" size={17} />
      </div>
      <Button label="View cart" onClick={nop} block={false} style={{ marginTop: 0, paddingLeft: 26, paddingRight: 26 }} />
    </div>
  }>
    <div style={{ height: "100%", overflow: "hidden" }}>
      <CoverPhoto height={92}>
        <span style={{ position: "absolute", left: 12, top: 10, width: 40, height: 40, borderRadius: "50%", background: "var(--bg)", display: "grid", placeItems: "center", boxShadow: "var(--shadow-card)" }}>
          <Icon name="chevron-right" size={18} color="var(--ink)" style={{ transform: "rotate(180deg)" }} />
        </span>
        <span style={{ position: "absolute", right: 12, top: 10, width: 40, height: 40, borderRadius: "50%", background: "var(--bg)", display: "grid", placeItems: "center", boxShadow: "var(--shadow-card)" }}>
          <Icon name="search" size={17} color="var(--ink)" />
        </span>
        <ShopLogo size={52} style={{ position: "absolute", left: 14, bottom: -22 }} />
      </CoverPhoto>
      <div style={{ padding: "26px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{SHOP.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>{SHOP.price}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>{SHOP.tagline}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 6, fontSize: 12.5, color: "var(--muted)", ...TAB }}>
          <span style={{ color: "var(--ink)", fontWeight: 700 }}><span style={{ color: "var(--highlight)" }}>★</span> 4.7 (210)</span>
          <span>1.2 km</span>
          <span style={{ color: "var(--ink)", fontWeight: 700 }}>25–35 min</span>
          <span style={{ color: "var(--accent-text)", fontWeight: 700 }}>$1.50 delivery</span>
        </div>
        <div style={{ display: "flex", gap: 6, margin: "11px -16px 4px", padding: "0 16px 8px", borderBottom: "1px solid var(--line)", overflow: "hidden" }}>
          {["Mains", "Sides", "Drinks", "Combos"].map((c, i) => (
            <span key={c} style={{ fontSize: 12.5, fontWeight: 700, padding: "8px 13px", borderRadius: 999, background: i === 0 ? "var(--accent-wash)" : "var(--bg)", color: i === 0 ? "var(--accent-text)" : "var(--muted)", border: `1px solid ${i === 0 ? "#bfe7cf" : "var(--line)"}`, whiteSpace: "nowrap" }}>{c}</span>
          ))}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)", letterSpacing: ".04em", margin: "8px 0 2px" }}>MAINS</div>
        {MENU.slice(0, 2).map((i) => <MenuRow key={i.id} i={i} qty={i.id === "m1" ? 2 : 0} />)}
      </div>
    </div>
  </Screen>
);

/* R2·2 — closed restaurant. Browsable, never orderable; the action is a reminder, not a dead end. */
RC.menu_closed = () => (
  <Screen banner={<Banner tone="warn" icon="clock" title="Kombi Grill is closed" msg="Opens today at 11:00. You can look, but you can't order yet." />} footer={
    <Button label="Remind me when they open" variant="ghost" onClick={nop} style={{ marginTop: 0 }} />
  }>
    <div style={{ height: "100%", overflow: "hidden", opacity: .82 }}>
      <CoverPhoto height={78} name="Kombi Grill" photo={false} />
      <div style={{ padding: "12px 16px 0" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Kombi Grill</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, ...TAB }}>Braai · Takeaway · 4.0 km · Mon–Sat 11:00–21:00</div>
        <div style={{ marginTop: 8 }}>{MENU.slice(0, 3).map((i) => <MenuRow key={i.id} i={{ ...i, oos: true }} />)}</div>
      </div>
    </div>
  </Screen>
);

/* R2·3 — item sheet. Options are radio-simple; note is free text; price updates live. */
RC.item = () => (
  <Screen>
    <div style={{ opacity: .3, padding: 16 }}><Skeleton height={90} radius={14} /><div style={{ height: 12 }} /><Skeleton height={14} width="60%" /></div>
    <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.4)" }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 74, background: "var(--bg)", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px 0", flex: 1, overflow: "hidden" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 17, fontWeight: 700 }}>Sadza & beef stew</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>Sadza, slow-cooked beef, muriwo on the side.</div>
        <Money v="4.50" size={16} style={{ display: "inline-block", marginTop: 8 }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", margin: "14px 0 6px" }}>PORTION · pick one</div>
        {[["Standard", "", true], ["Large sadza", "+$0.75", false]].map(([l, extra, on]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px", minHeight: 44, boxSizing: "border-box", border: `1.5px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent-wash)" : "var(--bg)", borderRadius: "var(--radius-input)", marginBottom: 8 }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent)" : "var(--bg)", display: "grid", placeItems: "center" }}>{on ? <Icon name="check" size={12} color="#fff" /> : null}</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{l}</span>
            {extra ? <span style={{ fontSize: 13, color: "var(--muted)", ...TAB }}>{extra}</span> : null}
          </div>
        ))}
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", margin: "12px 0 6px" }}>NOTE FOR THE KITCHEN</div>
        <Field value="" onChange={nop} placeholder="No chilli, please" />
      </div>
      <div style={{ padding: "8px 16px 12px", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 44, height: 44, borderRadius: "50%", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}><Icon name="minus" size={18} color="var(--accent-text)" /></span>
          <span style={{ fontSize: 17, fontWeight: 700, minWidth: 16, textAlign: "center", ...TAB }}>2</span>
          <span style={{ width: 44, height: 44, borderRadius: "50%", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}><Icon name="plus" size={18} color="var(--accent-text)" /></span>
        </div>
        <Button label="Add · $9.00" onClick={nop} style={{ marginTop: 0, flex: 1 }} />
      </div>
    </div>
  </Screen>
);

/* R2·b1 — the kitchen closes while you're browsing. Interrupt once, keep the cart, offer a path. */
RC.closed_interrupt = () => (
  <Screen>
    <div style={{ opacity: .28, padding: 16 }}><Skeleton height={70} radius={14} /><div style={{ height: 10 }} /><Skeleton height={13} width="55%" /><div style={{ height: 18 }} /><Skeleton height={13} width="80%" /></div>
    <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", display: "grid", placeItems: "center", padding: 18 }}>
      <Card style={{ padding: 18, width: "100%" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--highlight-wash)", display: "grid", placeItems: "center", marginBottom: 10 }}>
          <Icon name="clock" size={21} color="var(--highlight-ink)" />
        </div>
        <div style={{ fontSize: 16.5, fontWeight: 700 }}>Sadza Republic just closed</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5, lineHeight: 1.45 }}>They stopped taking orders at 21:00. Your cart is saved for tomorrow — nothing was ordered.</div>
        <Button label="See places still open" onClick={nop} />
        <Button label="Keep my cart for tomorrow" variant="ghost" onClick={nop} />
      </Card>
    </div>
  </Screen>
);

/* R3·1 — cart. ETA promised before payment; the fee is explained here (once, not twice). */
RC.cart = () => (
  <Screen footer={<Button label="Go to checkout · $15.50" onClick={nop} style={{ marginTop: 0 }} />}>
    <div style={{ height: "100%", overflow: "hidden" }}>
      <AppBar title="Your cart" sub="Sadza Republic" />
      <Pad style={{ paddingTop: 0 }}>
        <div style={{ marginBottom: 12 }}><EtaLine range="30–40 min" arrive="10:11–10:21" /></div>
        <Card style={{ padding: 14, marginBottom: 10 }}>
          {CART.map((c, i) => (
            <div key={c.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: i ? "1px solid var(--line)" : "none", minHeight: 44, boxSizing: "border-box" }}>
              <span style={{ minWidth: 28, height: 28, borderRadius: 8, background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, ...TAB }}>{c.qty}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                {c.note ? (
                  <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                    <Icon name="pencil" size={12} color="var(--accent-text)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 12, color: "var(--accent-text)", lineHeight: 1.35 }}>{c.note}</span>
                  </div>
                ) : null}
              </div>
              <Money v={c.price} size={14} weight={600} />
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
            <Icon name="pencil" size={13} color="var(--muted)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>NOTE FOR THE WHOLE ORDER</div>
              <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.35 }}>{ORDER_NOTE}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--accent-text)", fontWeight: 700, minHeight: 44 }}>
              <Icon name="plus" size={15} color="var(--accent-text)" />Add more items
            </span>
          </div>
        </Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 7 }}>ADD A DRINK?</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, overflow: "hidden" }}>
          {[["Mazoe orange 500ml", "1.50", "drinks"], ["Still water 500ml", "0.80", "drinks"]].map(([n, v, c]) => (
            <div key={n} style={{ width: 132, flexShrink: 0, border: "1px solid var(--line)", borderRadius: 12, padding: 8 }}>
              <FoodThumb name={n} cat={c} size={116} radius={9} style={{ width: "100%", height: 54 }} />
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 6, lineHeight: 1.25 }}>{n}</div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
                <Money v={v} size={13} /><span style={{ flex: 1 }} />
                <span style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}><Icon name="plus" size={15} color="var(--accent-text)" /></span>
              </div>
            </div>
          ))}
        </div>
        <Card style={{ padding: 14 }}>
          <PriceMath goods="13.00" fee="2.50" km="3.1" total="15.50" note="LyniaGo sets the delivery fee by distance. The restaurant sets the food price. Nothing else is added — no service fee, no tip expected." />
        </Card>
      </Pad>
    </div>
  </Screen>
);

/* R3·b1 — an item sold out between adding and checkout. Fix it in place, re-total honestly. */
RC.cart_oos = () => (
  <Screen banner={<Banner tone="warn" icon="triangle-alert" title="Muriwo une dovi just sold out" msg="We removed it and updated your total. Nothing was ordered." />}
    footer={<Button label="Go to checkout · $13.00" onClick={nop} style={{ marginTop: 0 }} />}>
    <div style={{ height: "100%", overflow: "hidden" }}>
      <AppBar title="Your cart" sub="Sadza Republic · 25–35 min" />
      <Pad style={{ paddingTop: 0 }}>
        <Card style={{ padding: 14, marginBottom: 12 }}>
          {[{ name: "Half roast huku", qty: 1, price: "6.00" }, { name: "Sadza & beef stew", qty: 1, price: "4.50" }].map((c, i) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
              <span style={{ minWidth: 26, height: 26, borderRadius: 8, background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 800, ...TAB }}>{c.qty}</span>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{c.name}</span>
              <Money v={c.price} size={13.5} weight={600} />
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--line)", opacity: .55 }}>
            <span style={{ minWidth: 26, height: 26, borderRadius: 8, background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 800, ...TAB }}>1</span>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, textDecoration: "line-through" }}>Muriwo une dovi</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Removed</span>
          </div>
        </Card>
        <Card style={{ padding: 14 }}>
          <PriceMath goods="10.50" fee="2.50" km="3.1" total="13.00" />
        </Card>
      </Pad>
    </div>
  </Screen>
);

/* R3·b2 — the restaurant re-priced a dish. Show old → new, require an explicit accept. */
RC.cart_price = () => (
  <Screen footer={
    <div>
      <Button label="Accept the new total · $16.50" onClick={nop} style={{ marginTop: 0 }} />
      <Button label="Remove that item" variant="ghost" onClick={nop} />
    </div>
  }>
    <div style={{ height: "100%", overflow: "hidden" }}>
      <AppBar title="Your cart" sub="Prices changed" />
      <Pad style={{ paddingTop: 0 }}>
        <Card style={{ padding: 14, marginBottom: 12, borderLeft: "none" }}>
          <div style={{ display: "flex", gap: 9, marginBottom: 10 }}>
            <Icon name="circle-alert" size={17} color="var(--highlight-ink)" />
            <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.45 }}>Sadza Republic changed a price while you were shopping. Check it before you order.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <span style={{ minWidth: 28, height: 28, borderRadius: 8, background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, ...TAB }}>1</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Half roast huku</span>
            <span style={{ fontSize: 13, color: "var(--muted)", textDecoration: "line-through", marginRight: 6, ...TAB }}>$6.00</span>
            <Money v="7.00" size={14} />
          </div>
        </Card>
        <Card style={{ padding: 14 }}><PriceMath goods="14.00" fee="2.50" km="3.1" total="16.50" note="Huku $7.00 + sadza & beef stew $4.50 + muriwo une dovi $2.50." /></Card>
      </Pad>
    </div>
  </Screen>
);

/* R3·b3 — empty cart. */
RC.cart_empty = () => (
  <Screen>
    <AppBar title="Your cart" />
    <Pad style={{ paddingTop: 24 }}>
      <Card style={{ padding: "10px 16px 18px" }}>
        <EmptyState icon="shopping-bag" title="Your cart is empty" message="Add something from a kitchen near you — we'll show the delivery fee before you order.">
          <Button label="Browse restaurants" onClick={nop} />
        </EmptyState>
      </Card>
    </Pad>
  </Screen>
);

/* R4·1 — checkout, CASH. ETA promised, door amount stated, cancellation consequence up front. */
RC.checkout_cash = () => (
  <Screen footer={<Button label="Place order · pay $15.50 cash" onClick={nop} style={{ marginTop: 0 }} />}>
    <div style={{ height: "100%", overflow: "hidden" }}>
      <AppBar title="Checkout" sub="Sadza Republic" />
      <Pad style={{ paddingTop: 0 }}>
        <div style={{ marginBottom: 10 }}><EtaLine range="30–40 min" arrive="10:11–10:21" /></div>
        <Card style={{ padding: 13, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minHeight: 44 }}>
            <Icon name="map-pin" size={18} color="var(--accent-text)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>12 Lanark Rd, Belgravia</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Gate 2, ask for Rufaro · 3.1 km away</div>
            </div>
            <Icon name="chevron-right" size={17} color="var(--muted)" />
          </div>
        </Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", margin: "6px 0 7px" }}>HOW YOU'LL PAY</div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 12px", border: "1.5px solid var(--accent)", background: "var(--accent-wash)", borderRadius: "var(--radius-input)", marginBottom: 8 }}>
          <Icon name="banknote" size={21} color="var(--accent-text)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Cash at the door</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Pay the rider $15.50 when the food arrives</div>
          </div>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center" }}><Icon name="check" size={13} color="#fff" /></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 12px", border: "1px solid var(--line)", borderRadius: "var(--radius-input)", marginBottom: 12 }}>
          <Icon name="wallet" size={21} color="var(--muted)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Mobile money</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Pay the restaurant after they accept</div>
          </div>
          <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--line)" }} />
        </div>
        <Card style={{ padding: 14 }}><PriceMath goods="13.00" fee="2.50" km="3.1" total="15.50" note="Have the exact amount if you can — riders carry little change." /></Card>
        <div style={{ display: "flex", gap: 8, marginTop: 10, padding: "10px 12px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
          <Icon name="circle-alert" size={15} color="var(--muted)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>Free to cancel until the rider collects your food. After that the food is cooked and paid for, and cancelling costs the full $15.50.</div>
        </div>
      </Pad>
    </div>
  </Screen>
);

/* R4·2 — checkout, WALLET selected. No cash cap any more — mobile money is a first-class choice
   beside cash, never a steering. */
RC.checkout_wallet = () => (
  <Screen footer={<Button label="Place order · pay after they accept" onClick={nop} style={{ marginTop: 0 }} />}>
    <div style={{ height: "100%", overflow: "hidden" }}>
      <AppBar title="Checkout" sub="Sadza Republic" />
      <Pad style={{ paddingTop: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", margin: "0 0 7px" }}>HOW YOU'LL PAY</div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 12px", border: "1px solid var(--line)", borderRadius: "var(--radius-input)", marginBottom: 8 }}>
          <Icon name="banknote" size={21} color="var(--muted)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Cash at the door</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>Pay the rider $15.50 when the food arrives</div>
          </div>
          <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--line)" }} />
        </div>
        <div style={{ padding: "12px", border: "1.5px solid var(--accent)", background: "var(--accent-wash)", borderRadius: "var(--radius-input)", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Icon name="wallet" size={21} color="var(--accent-text)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Mobile money</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>EcoCash · InnBucks · O'mari</div>
            </div>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center" }}><Icon name="check" size={13} color="#fff" /></span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid #cdeadb" }}>
            <Icon name="clock" size={15} color="var(--accent-text)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.45 }}><b>You pay only after the restaurant accepts.</b> They'll call you to confirm, then send the payment request — no deadline, the kitchen starts once it lands.</div>
          </div>
        </div>
        <Card style={{ padding: 14 }}><PriceMath goods="13.00" fee="2.50" km="3.1" total="15.50" note="Paid straight to Sadza Republic. LyniaGo never holds your money." /></Card>
      </Pad>
    </div>
  </Screen>
);

/* R4·b1 — offline mid-checkout. Nothing is placed; the draft is kept locally. */
RC.checkout_offline = () => (
  <Screen banner={<Banner tone="offline" icon="wifi-off" title="No connection" msg="Your order is saved on this phone. We'll place it the moment you're back." />}
    footer={<Button label="Place order · $15.50" onClick={nop} disabled style={{ marginTop: 0 }} />}>
    <div style={{ height: "100%", overflow: "hidden", opacity: .75 }}>
      <AppBar title="Checkout" sub="Waiting for a connection" />
      <Pad style={{ paddingTop: 0 }}>
        <Card style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name="banknote" size={18} color="var(--muted)" />
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>Cash at the door</span>
            <Money v="15.50" size={14} />
          </div>
        </Card>
        <Card style={{ padding: 14 }}><PriceMath goods="13.00" fee="2.50" km="3.1" total="15.50" /></Card>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, fontSize: 12.5, color: "var(--muted)" }}>
          <Icon name="refresh-cw" size={14} color="var(--muted)" />Retrying every 10 seconds…
        </div>
      </Pad>
    </div>
  </Screen>
);

/* R3·b4 — under the minimum. Never a blocked button without the gap named and a way to close it. */
RC.cart_min = () => (
  <Screen footer={
    <div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center", marginBottom: 6 }}>Add $1.50 more, or pay the $1 small-order fee.</div>
      <Button label="Go to checkout · $6.00" onClick={nop} style={{ marginTop: 0 }} />
    </div>
  }>
    <div style={{ height: "100%", overflow: "hidden" }}>
      <AppBar title="Your cart" sub="Sadza Republic" />
      <Pad style={{ paddingTop: 0 }}>
        <Card style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}>
            <span style={{ minWidth: 28, height: 28, borderRadius: 8, background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, ...TAB }}>1</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Muriwo une dovi</span>
            <Money v="2.50" size={14} weight={600} />
          </div>
        </Card>
        <Card style={{ padding: 14, marginBottom: 10, background: "var(--highlight-wash)", boxShadow: "none" }}>
          <div style={{ display: "flex", gap: 9 }}>
            <Icon name="circle-alert" size={17} color="var(--highlight-ink)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Minimum order is $4.00</div>
              <div style={{ fontSize: 12.5, color: "var(--highlight-ink)", marginTop: 3, lineHeight: 1.45 }}>A rider crosses town either way, so tiny orders carry a $1.00 small-order fee. Add $1.50 of food and it disappears.</div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: 14 }}>
          <PriceMath goods="2.50" fee="2.50" km="3.1" total="6.00" note="Includes a $1.00 small-order fee." />
        </Card>
      </Pad>
    </div>
  </Screen>
);

/* R0·b1 — Orders, empty. */
RC.orders_empty = () => (
  <Screen tab="orders">
    <div style={{ padding: "8px 16px" }}>
      <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>Your orders</div>
      <Card style={{ padding: "10px 16px 18px", marginTop: 24 }}>
        <EmptyState icon="receipt" title="Nothing here yet" message="Parcels and food orders both land on this screen — you'll be able to reorder from here in one tap.">
          <Button label="Find food near you" onClick={nop} />
          <Button label="Send a parcel" variant="ghost" onClick={nop} />
        </EmptyState>
      </Card>
    </div>
  </Screen>
);

/* R4·b2 — placing. One skeleton beat, no spinner-on-white. */
RC.placing = () => (
  <Screen>
    <div style={{ height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 14 }}>
      <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}>
        <Icon name="receipt" size={26} color="var(--accent-text)" />
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, textAlign: "center" }}>Sending your order to the kitchen…</div>
      <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", lineHeight: 1.45 }}>Don't close the app. If this fails, nothing is ordered and nothing is paid.</div>
      <div style={{ width: "100%", marginTop: 6 }}><Skeleton height={10} radius={5} /><div style={{ height: 8 }} /><Skeleton height={10} width="70%" radius={5} /></div>
    </div>
  </Screen>
);


/* R3·2 — the note. Two levels, deliberately: a note on a dish (leg not breast) travels with that
   line on the kitchen ticket, and one note for the whole order sits at the bottom of it. Free text,
   because Zimbabwean kitchens improvise and a fixed option list can't cover it. */
RC.cart_note = () => (
  <Screen pad={false}>
    <div style={{ opacity: .28, padding: 16 }}><Skeleton height={90} radius={14} /><div style={{ height: 12 }} /><Skeleton height={13} width="60%" /></div>
    <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)" }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", borderRadius: "20px 20px 0 0", padding: "16px 16px 14px" }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 12px" }} />
      <div style={{ fontSize: 16.5, fontWeight: 700 }}>Note for the kitchen</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}><b style={{ color: "var(--ink)" }}>Half roast huku</b> — tell them how you want it. This sits next to the dish on their ticket.</div>
      <div style={{ marginTop: 12, border: "1.5px solid var(--accent)", borderRadius: "var(--radius-input)", padding: "11px 12px", minHeight: 76 }}>
        <div style={{ fontSize: 14.5, color: "var(--ink)", lineHeight: 1.45 }}>Leg portion please, not breast. No chilli.</div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 12, color: "var(--muted)", marginTop: 4, ...TAB }}>42 / 140</div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
        {["Leg portion", "No chilli", "Extra gravy", "Pack separately"].map((s, i) => (
          <span key={s} style={{ minHeight: 40, display: "inline-flex", alignItems: "center", fontSize: 13, fontWeight: 700, padding: "9px 13px", borderRadius: 999, border: `1px solid ${i < 2 ? "#bfe7cf" : "var(--line)"}`, background: i < 2 ? "var(--accent-wash)" : "var(--bg)", color: i < 2 ? "var(--accent-text)" : "var(--muted)" }}>{i < 2 ? "✓ " : "+ "}{s}</span>
        ))}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", margin: "14px 0 6px" }}>NOTE FOR THE WHOLE ORDER</div>
      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: "10px 12px" }}>
        <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.4 }}>{ORDER_NOTE}</div>
      </div>
      <div style={{ display: "flex", gap: 9, marginTop: 10, padding: "10px 12px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
        <Icon name="circle-alert" size={15} color="var(--muted)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>A note can't change the price. If what you want costs more, the kitchen will call you before cooking.</div>
      </div>
      <Button label="Save notes" onClick={nop} />
    </div>
  </Screen>
);
