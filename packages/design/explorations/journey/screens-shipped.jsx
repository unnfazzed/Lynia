/* file-scoped: Babel classic scripts share one global scope, so every declaration below is
   wrapped in an IIFE — only window.LJ leaves this file. */
(() => {
/* LyniaGo — customer journey: SHIPPED-STATES alignment wave (2026-08, SH·). The states the app
   shipped with no mock: connectivity & cache honesty, composer resilience (draft restore, address
   search down, map fallback, location off), cold-start order restore, rating undo, privacy /
   delete-account / phone masking, real OS-permission rows, and feature-flag-off variants.
   Same conventions as screens.jsx (frozen state, real DS bundle). Extends window.LJ.
   Sheet + logic notes: ui_kits/mobile/shipped-states.html. */

const DS = window.LyniaDesignSystem_94c56a;
const K = window.LyniaKit;
const SUP = window.LyniaSupport;
const { Button, Card, Field, StatusPill, EmptyState, Heading, Sub, Icon, OfflineBanner, SkeletonList, ServiceTiles } = DS;
const AppHome = DS.AppHome || (() => <div style={{ padding: 20, fontSize: 12, color: "var(--muted)" }}>Home needs a design-system rebuild (AppHome missing from the bundle).</div>);
const AppScreen = DS.AppScreen || (({ children }) => <div style={{ height: "100%", overflow: "hidden" }}>{children}</div>);
const { Dove, Wordmark, Pad, Top } = SUP;
const noop = () => {};
const PINS = { a: { x: 26, y: 30 }, b: { x: 76, y: 70 } };
const TAB = { fontVariantNumeric: "tabular-nums" };

/* ── shared bits (same visual vocabulary as screens.jsx) ── */
function OrderHead({ status, tone }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <Heading style={{ marginBottom: 0 }}>Order 8f3a91c2</Heading>
      <div style={{ flex: 1 }} />
      <StatusPill status={status} tone={tone} />
    </div>
  );
}
function TopChrome() {
  return (
    <div style={{ position: "absolute", top: 34, left: 12, right: 12, display: "flex", alignItems: "center", gap: 8, zIndex: 5 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", borderRadius: "var(--radius-pill)", padding: "6px 12px 6px 6px", boxShadow: "var(--shadow-card)", fontWeight: 700, fontSize: 14 }}>
        <Dove size={22} on="white" /><Wordmark size={15} />
      </span>
      <div style={{ flex: 1 }} />
      <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg)", boxShadow: "var(--shadow-card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="user" size={18} color="var(--accent-text)" />
      </span>
    </div>
  );
}
/* Address rows — same anatomy as the composer's AddressFields (screens.jsx). */
function AddrRows({ pickup, drop, dropStyle }) {
  const Row = ({ role, value, ph }) => {
    const color = role === "pickup" ? "var(--accent)" : "var(--danger)";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 11, minHeight: 48, padding: "6px 12px" }}>
        <span style={{ width: 12, height: 12, borderRadius: role === "pickup" ? "50%" : 3, background: value ? color : "var(--bg)", border: `2px solid ${color}`, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>{role === "pickup" ? "PICKUP" : "DROP-OFF"}</div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: value ? "var(--ink)" : "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...(role === "drop" ? dropStyle : null) }}>{value || ph}</div>
        </div>
        <Icon name={value ? "pencil" : "search"} size={16} color="var(--muted)" />
      </div>
    );
  };
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", background: "var(--bg)", marginBottom: 10, overflow: "hidden" }}>
      <Row role="pickup" value={pickup} ph="Set pickup location" />
      <div style={{ height: 1, background: "var(--line)", marginLeft: 35 }} />
      <Row role="drop" value={drop} ph="Where to?" />
    </div>
  );
}

/* ── The composer, parameterised across the shipped resilience states.
      variant: "draft" | "discard" | "mapfail" | "locoff" ── */
function ComposerState({ variant }) {
  const draft = variant === "draft" || variant === "discard";
  const pins = draft ? PINS : null;
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      {variant === "mapfail" ? (
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg, var(--surface), var(--surface) 14px, #eef1f3 14px, #eef1f3 28px)" }}>
          <div style={{ position: "absolute", top: 96, left: 24, right: 24, background: "var(--bg)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: 16, textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", margin: "0 auto 10px" }}>
              <Icon name="map-pin" size={24} color="var(--muted)" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>The map didn't load</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginTop: 4 }}>You can still send — search both addresses below. The pin is optional once an address is set.</div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, minHeight: 40, padding: "0 16px", borderRadius: "var(--radius-pill)", border: "1px solid var(--line)", fontSize: 13, fontWeight: 700, color: "var(--accent-text)" }}>
              <Icon name="refresh-cw" size={14} color="var(--accent-text)" /> Retry the map
            </span>
          </div>
        </div>
      ) : (
        <K.FauxMap fill pins={{ a: pins ? pins.a : null, b: pins ? pins.b : null }} />
      )}
      <TopChrome />
      {variant === "locoff" ? (
        <span style={{ position: "absolute", top: 78, right: 12, zIndex: 5, display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", borderRadius: "var(--radius-pill)", padding: "9px 14px", boxShadow: "var(--shadow-card)", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
          <Icon name="navigation" size={14} color="var(--muted)" /> Location is off
        </span>
      ) : variant !== "mapfail" ? (
        <span style={{ position: "absolute", top: 78, right: 12, zIndex: 5, display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", borderRadius: "var(--radius-pill)", padding: "9px 14px", boxShadow: "var(--shadow-card)", fontSize: 12, fontWeight: 600, color: "var(--accent-text)" }}>
          <Icon name="navigation" size={14} color="var(--accent-text)" /> Use my location
        </span>
      ) : null}
      {variant === "locoff" ? (
        <div style={{ position: "absolute", top: 124, left: 24, right: 24, zIndex: 5, background: "var(--bg)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 9 }}>
            <Icon name="navigation" size={16} color="var(--muted)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Location is off</div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45, marginTop: 2 }}>Search an address or tap the map to place your pins by hand — nothing is blocked.</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", marginTop: 7, minHeight: 24 }}>Turn on location</div>
            </div>
          </div>
        </div>
      ) : null}
      <K.MapSheet expanded={false} onToggle={noop} footer={<Button label="Broadcast request" onClick={noop} disabled={!draft} />}>
        {draft ? (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", background: "var(--accent-wash)", borderRadius: "var(--radius-input)", marginBottom: 10 }}>
            <Icon name="history" size={15} color="var(--accent-text)" />
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "var(--accent-text)", lineHeight: 1.4 }}>Draft restored from Tuesday 18:12.</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", minHeight: 24, display: "inline-flex", alignItems: "center" }}>Discard</span>
          </div>
        ) : null}
        <AddrRows pickup={draft ? "Eastgate Mall, CBD" : ""} drop={draft ? "14 Glenara Ave, Avenues" : ""} />
        <Field label="What are you sending?" value={draft ? "Documents envelope" : ""} onChange={noop} placeholder="Documents envelope" />
        <Field label="Your price (USD)" value={draft ? "3.00" : ""} onChange={noop} inputMode="decimal" hint={draft ? "Suggested $3.36 · 3.1 km · riders here usually accept around $2.96." : "We'll suggest a fair price once your pins are set."} />
      </K.MapSheet>
      {variant === "discard" ? (
        <React.Fragment>
          <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", zIndex: 40 }} />
          <div style={{ position: "absolute", left: 10, right: 10, bottom: 10, zIndex: 41, background: "var(--bg)", borderRadius: "var(--radius-card)", padding: 16, boxShadow: "var(--shadow-card)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Discard the restored draft?</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>The pickup, drop-off, item and price from Tuesday will be cleared. This can't be undone.</div>
            <Button label="Keep editing" onClick={noop} />
            <Button label="Discard draft" variant="ghost" onClick={noop} style={{ color: "var(--danger-ink)" }} />
          </div>
        </React.Fragment>
      ) : null}
    </div>
  );
}

/* ── SH1 · Connectivity & cache honesty ── */
function ConnReconnecting() {
  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <OfflineBanner state="reconnecting" />
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <ComposerState variant="draft" />
      </div>
    </div>
  );
}
const CACHED_ORDERS = [
  { icon: "package", t: "Parcel · Eastgate → Avenues", m: "Delivered Tue 18:44 · $2.50", pill: "delivered" },
  { icon: "utensils", t: "Sadza Republic", m: "Delivered Tue 13:10 · $9.50", pill: "delivered" },
  { icon: "package", t: "Parcel · Avondale → CBD", m: "Cancelled Mon 09:12", pill: "cancelled", tone: "offline" },
];
function StaleStrip({ failed }) {
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
      <Icon name={failed ? "wifi-off" : "history"} size={14} color="var(--muted)" />
      <span style={{ flex: 1, fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>{failed ? "Saved copy from 09:41 — couldn't refresh." : "Saved copy from 09:41 — updating…"}</span>
      {failed ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-text)", minHeight: 24, display: "inline-flex", alignItems: "center" }}>Retry</span> : null}
    </div>
  );
}
function StaleOrders({ empty, failed }) {
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Your orders" onBack={false} /></Pad>
      <StaleStrip failed={failed} />
      {empty ? (
        <Pad>
          <EmptyState icon="wifi-off" title="Nothing saved on this phone yet" message="You're offline and there's no saved copy of your orders to show. They're safe on your account — they'll appear the moment you're back on the network.">
            <Button label="Try again" variant="ghost" onClick={noop} />
          </EmptyState>
        </Pad>
      ) : (
        <div style={{ padding: "4px var(--space-screen) var(--space-screen)" }}>
          {CACHED_ORDERS.map((o) => (
            <div key={o.t} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={o.icon} size={16} color="var(--muted)" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.t}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }} className="lynia-tabular">{o.m}</div>
              </div>
              <StatusPill status={o.pill} tone={o.tone} />
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 12, lineHeight: 1.45 }}>Anything newer than 09:41 isn't shown yet.</div>
        </div>
      )}
    </div>
  );
}

/* ── SH3 · Address search unavailable (no Places) — the pin fallback named honestly ── */
function AddrUnavailable() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ padding: "36px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <Icon name="x" size={20} color="var(--ink)" />
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Set drop-off</span>
          <div style={{ flex: 1 }} />
          <span style={{ width: 11, height: 11, borderRadius: 3, border: "2px solid var(--danger)", background: "var(--bg)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "0 12px", height: 46, border: "1px solid var(--line)" }}>
          <Icon name="search" size={18} color="var(--muted)" />
          <span style={{ flex: 1, fontSize: 15, color: "var(--muted)" }}>Search isn't available right now</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden", padding: "0 16px" }}>
        <div style={{ display: "flex", gap: 10, padding: "11px 12px", borderRadius: "var(--radius-input)", background: "var(--surface)", marginBottom: 6 }}>
          <Icon name="circle-alert" size={16} color="var(--muted)" />
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>Address lookup is down on our side — not your phone. Set the exact point on the map instead: <b style={{ color: "var(--ink)" }}>your rider navigates to the pin</b>; the name below is only the label they read.</div>
        </div>
        {[["map-pin", "Set the pin on the map"], ["navigation", "Use my current location"]].map(([ic, lbl]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--accent-wash)", flexShrink: 0 }}><Icon name={ic} size={16} color="var(--accent-text)" /></span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--accent-text)" }}>{lbl}</span>
            <Icon name="chevron-right" size={16} color="var(--muted)" />
          </div>
        ))}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", margin: "14px 0 4px" }}>HOW YOUR DROP-OFF WILL READ</div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: "var(--radius-input)" }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, border: "2px solid var(--danger)", background: "var(--danger)", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Pinned spot — near Fife Ave &amp; 3rd St</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>No street address · add a landmark note so the rider knows the gate</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── SH5 · Cold start with a live order ── */
function OrderRestore({ error }) {
  const under = window.LJ && window.LJ.home_launcher;
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      {under ? under() : null}
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 70, zIndex: 30 }}>
        {error ? (
          <Card style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <Icon name="circle-alert" size={18} color="var(--muted)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>You have a delivery running</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, marginTop: 2 }}>It didn't load just now — your rider is still on the job and nothing is lost.</div>
              </div>
            </div>
            <Button label="Try again" onClick={noop} />
            <Button label="Open Orders" variant="ghost" onClick={noop} />
          </Card>
        ) : (
          <Card accent style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="bike" size={18} color="var(--accent-text)" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>Your delivery is still running</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }} className="lynia-tabular">Parcel to Avenues · Tendai M. is 4 min away</div>
              </div>
              <Icon name="x" size={17} color="var(--muted)" />
            </div>
            <Button label="Return to your order" onClick={noop} />
          </Card>
        )}
      </div>
    </div>
  );
}

/* ── SH6 · Rating undo window ── */
function RateUndo() {
  return (
    <Pad>
      <OrderHead status="delivered" />
      <Card>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Rating sent</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {[1, 2, 3, 4, 5].map((n) => <span key={n} style={{ fontSize: 30, color: "var(--highlight)" }}>★</span>)}
        </div>
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
          <Icon name="history" size={15} color="var(--muted)" />
          <span style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>You rated Tendai M. 5 stars.</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-text)", minHeight: 24, display: "inline-flex", alignItems: "center" }} className="lynia-tabular">Undo · 0:09</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45, marginTop: 8 }}>You can change it for a few seconds — after that the rating is final, and your rider never sees who rated what.</div>
      </Card>
      <Button label="Back home" onClick={noop} />
    </Pad>
  );
}

/* ── SH7 · Privacy, delete account, phone masking ── */
function Privacy() {
  const rows = [
    ["user", "What we collect", "Your name, phone number and the pins on your deliveries. No ID documents for customers."],
    ["id-card", "What others see", "First name + last initial only. Your phone is shared with your rider just while a delivery runs — then it's masked."],
    ["history", "How long we keep it", "Order records 12 months · SOS logs 90 days · a deleted account is gone after 30 days."],
  ];
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Privacy" /></Pad>
      <Pad style={{ paddingTop: 4 }}>
        {rows.map(([ic, t, m]) => (
          <Card key={t} style={{ padding: 14 }}>
            <div style={{ display: "flex", gap: 11 }}>
              <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={ic} size={17} color="var(--accent-text)" /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{t}</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginTop: 2 }}>{m}</div>
              </div>
            </div>
          </Card>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
          <Icon name="inbox" size={19} color="var(--accent-text)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Request a copy of my data</span>
          <Icon name="chevron-right" size={17} color="var(--muted)" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0" }}>
          <Icon name="trash-2" size={19} color="var(--danger)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--danger)" }}>Delete my account</span>
          <Icon name="chevron-right" size={17} color="var(--muted)" />
        </div>
      </Pad>
    </div>
  );
}
function DeleteAccount() {
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Delete account" /></Pad>
      <Pad style={{ paddingTop: 4 }}>
        <Card>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--danger-wash)", display: "grid", placeItems: "center", marginBottom: 10 }}>
            <Icon name="trash-2" size={22} color="var(--danger-ink)" />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>Delete your account?</div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, marginTop: 4 }}>Your profile, saved places, notifications and order history will be permanently deleted. Records the law makes us keep (payments) are kept only as long as it requires.</div>
        </Card>
        <div style={{ display: "flex", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-input)", background: "var(--accent-wash)", marginBottom: 12 }}>
          <Icon name="check" size={15} color="var(--accent-text)" />
          <span style={{ fontSize: 12.5, color: "var(--accent-text)", lineHeight: 1.45 }}>No delivery is running — you're clear to continue. (A live order blocks deletion until it ends.)</span>
        </div>
        <Button label="Keep my account" onClick={noop} />
        <Button label="Continue to delete" variant="ghost" onClick={noop} style={{ color: "var(--danger-ink)" }} />
      </Pad>
    </div>
  );
}
function DeleteFinal() {
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Delete account" /></Pad>
      <Pad style={{ paddingTop: 4 }}>
        <Card>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--danger-ink)" }}>This is the final step</div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, marginTop: 4 }}>Your account closes now and is permanently deleted after <b style={{ color: "var(--ink)" }}>30 days</b>. Sign back in within 30 days and the deletion is cancelled — after that, nothing can be recovered.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: "var(--radius-input)", border: "1.5px solid var(--accent)", background: "var(--accent-wash)", marginTop: 12, minHeight: 44 }}>
            <span style={{ width: 20, height: 20, borderRadius: 6, background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="check" size={13} color="#fff" /></span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4 }}>I understand my history and saved places will be gone</span>
          </div>
        </Card>
        <Button label="Delete my account" onClick={noop} style={{ background: "var(--danger)" }} />
        <Button label="Keep my account" variant="ghost" onClick={noop} />
      </Pad>
    </div>
  );
}
function PhoneMasked() {
  return (
    <Pad>
      <OrderHead status="completed" />
      <Card>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }} className="lynia-tabular">Agreed fare $2.50 · delivered Tue 18:44</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--surface)", borderRadius: "var(--radius-input)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>Your rider</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Tendai M.</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">+263 7• ••• ••80</div>
          </div>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--line)", flexShrink: 0 }}>
            <Icon name="phone" size={18} color="var(--muted)" />
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45, marginTop: 8 }}>Numbers are masked when a delivery ends — you and your rider can't call each other any more. Need to reach them about this order? Go through Lynia.</div>
      </Card>
      <Button label="Get help with this order" variant="ghost" onClick={noop} />
    </Pad>
  );
}

/* ── SH11 · Settings with REAL OS-permission rows (never a hardcoded "On") ── */
function SettingsPerms({ granted }) {
  const Row = ({ icon, label, value, warn, consequence }) => (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", minHeight: 44 }}>
        <Icon name={icon} size={19} color="var(--accent-text)" />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: warn ? 700 : 400, color: warn ? "var(--danger-ink)" : "var(--muted)" }}>
          {warn ? <Icon name="triangle-alert" size={14} color="var(--danger-ink)" /> : null}{value}
        </span>
        <Icon name="chevron-right" size={17} color="var(--muted)" />
      </div>
      {consequence ? (
        <div style={{ display: "flex", gap: 8, padding: "0 0 12px 31px" }}>
          <div style={{ flex: 1, fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>{consequence} <span style={{ fontWeight: 700, color: "var(--accent-text)" }}>Open system settings</span></div>
        </div>
      ) : null}
    </div>
  );
  return (
    <div>
      <Pad style={{ minHeight: 0, paddingBottom: 0 }}><Top title="Settings" onBack={false} /></Pad>
      <Pad style={{ paddingTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center" }}><Icon name="user" size={24} color="var(--accent-text)" /></div>
          <div><div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Chipo M.</div><div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">+263 77 245 1180</div></div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", margin: "10px 0 2px" }}>PERMISSIONS — READ FROM YOUR PHONE</div>
        {granted ? (
          <React.Fragment>
            <Row icon="navigation" label="Location" value="While using" />
            <Row icon="bell" label="Notifications" value="On" />
          </React.Fragment>
        ) : (
          <React.Fragment>
            <Row icon="navigation" label="Location" value="Ask every time" />
            <Row icon="bell" label="Notifications" value="Off" warn consequence="You won't hear when a rider offers or when your parcel arrives." />
          </React.Fragment>
        )}
        <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45, margin: "8px 0 12px" }}>These show your phone's real settings — LyniaGo re-checks them every time you come back to the app. Changing one opens Android settings.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
          <Icon name="map-pin" size={19} color="var(--accent-text)" /><span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Language</span><span style={{ fontSize: 13, color: "var(--muted)" }}>English</span><Icon name="chevron-right" size={17} color="var(--muted)" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
          <Icon name="banknote" size={19} color="var(--accent-text)" /><span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Payment</span><span style={{ fontSize: 13, color: "var(--muted)" }}>Cash</span><Icon name="chevron-right" size={17} color="var(--muted)" />
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 14 }}>LyniaGo v1.0.0</div>
      </Pad>
    </div>
  );
}

/* ── SH12 · Feature-flag-off variants (food dispatch OFF) ── */
function OnboardFlagOff() {
  return (
    <Pad style={{ display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Dove size={24} on="white" /><Wordmark size={17} /></span>
        <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>Skip</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 6 }}>
        <div style={{ width: 120, height: 120, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", marginBottom: 18 }}>
          <Icon name="banknote" size={52} color="var(--accent-text)" />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>Name your price to send</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--muted)", maxWidth: 240 }}>Say what you'll pay to send a parcel. Riders bid for it — no fixed tariff, no haggling in the street.</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 7, marginBottom: 16 }}>
        {[0, 1].map((n) => <span key={n} style={{ width: n === 0 ? 22 : 7, height: 7, borderRadius: 999, background: n === 0 ? "var(--accent)" : "var(--line)" }} />)}
      </div>
      <Button label="Next" onClick={noop} />
    </Pad>
  );
}
function RoleSelectFlagOff() {
  const Opt = ({ icon, title, desc, selected }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: "var(--radius-card)", border: `1.5px solid ${selected ? "var(--accent)" : "var(--line)"}`, background: selected ? "var(--accent-wash)" : "var(--bg)", marginBottom: 10, boxShadow: selected ? "none" : "var(--shadow-card)" }}>
      <span style={{ width: 46, height: 46, borderRadius: "50%", background: selected ? "var(--accent)" : "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name={icon} size={22} color={selected ? "#fff" : "var(--accent-text)"} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>{desc}</div>
      </div>
      {selected ? <Icon name="check" size={20} color="var(--accent-text)" /> : <Icon name="chevron-right" size={18} color="var(--muted)" />}
    </div>
  );
  return (
    <Pad>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}><Dove size={40} on="white" /><Wordmark size={24} /></div>
      <Heading>How do you want to start?</Heading>
      <Sub>It's one account — pick how you'll use LyniaGo now, and switch anytime.</Sub>
      <Opt icon="package" title="Use LyniaGo" desc="Send parcels across Harare — more services soon." selected={true} />
      <Opt icon="bike" title="Earn as a rider" desc="Deliver parcels near you and get paid in cash." selected={false} />
      <Button label="Continue as a customer" onClick={noop} />
    </Pad>
  );
}
const FLAG_OFF_SERVICES = [
  { id: "send", icon: "package", label: "Send", sub: "Parcel" },
  { id: "food", icon: "utensils", label: "Food", sub: "Soon", bg: "var(--line)", soon: true },
  { id: "pharmacy", icon: "plus", label: "Pharmacy", sub: "Soon", bg: "var(--line)", soon: true },
];
function HomeFlagOff() {
  return (
    <AppScreen tab="home" dark bg="var(--accent)">
      <AppHome address="12 Lanark Rd, Belgravia" services={FLAG_OFF_SERVICES} restaurants={[]} venuesTitle="" live={[{ id: "p1", title: "Parcel to Msasa · rider 4 min away", meta: "Delivery code 4192 · $3.36", step: 5 }]} />
    </AppScreen>
  );
}

const S = (node, o = {}) => <AppScreen tab={o.tab} bg={o.bg} dark={o.dark}>{node}</AppScreen>;

Object.assign(window.LJ, {
  conn_reconnecting: () => S(<ConnReconnecting />),
  stale_cache: () => S(<StaleOrders />, { tab: "orders" }),
  stale_cache_empty: () => S(<StaleOrders empty failed />, { tab: "orders" }),
  draft_restored: () => S(<ComposerState variant="draft" />),
  draft_discard: () => S(<ComposerState variant="discard" />),
  addr_unavailable: () => S(<AddrUnavailable />),
  map_failed: () => S(<ComposerState variant="mapfail" />),
  loc_off: () => S(<ComposerState variant="locoff" />),
  order_restore: () => <OrderRestore />,
  order_restore_error: () => <OrderRestore error />,
  rate_undo: () => S(<RateUndo />),
  privacy: () => S(<Privacy />),
  delete_account: () => S(<DeleteAccount />),
  delete_final: () => S(<DeleteFinal />),
  phone_masked: () => S(<PhoneMasked />),
  settings_perms: () => S(<SettingsPerms />),
  settings_perms_ok: () => S(<SettingsPerms granted />),
  onboard_flag_off: () => S(<OnboardFlagOff />),
  role_select_flag_off: () => S(<RoleSelectFlagOff />),
  home_flag_off: () => <HomeFlagOff />,
});

})();
