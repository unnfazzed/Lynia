import type { CSSProperties } from "react";
import type { MerchantShopFront } from "../lib/adminTypes";
import { KeyValue } from "../components/KeyValue";
import { Pill } from "../components/StatusPill";
import { money } from "../lib/format";

const DAY_LABEL: Record<MerchantShopFront["hours"][number]["day"], string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** "No photo" / "No logo" — the same muted box wherever a picture is missing. */
function Missing({ label, style }: { label: string; style: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface)",
        color: "var(--muted)",
        fontSize: 11,
        textAlign: "center",
        ...style,
      }}
    >
      {label}
    </div>
  );
}

/**
 * What customers will see, so ops reviews it before approving (owner, 2026-10-18): the cover banner and round
 * logo, the "about", tags and price level, the week's hours, and the first items as listed. Built from the
 * kit's card, KeyValue and pill (ledger D-106); the photos are short-lived signed URLs, so plain <img>.
 */
export function ShopFrontCard({ name, shopFront: s, shop }: { name: string; shopFront: MerchantShopFront; shop: boolean }) {
  const photoMissing = (has: boolean) => (has ? "Couldn't load" : "No photo");
  return (
    <section className="card" aria-label="Shop front" style={{ marginBottom: "var(--space-lg)" }}>
      <div className="block-title">
        Shop front <span className="count">what customers see</span>
      </div>

      {/* The logo hangs 28px below the banner, so the gap under it clears that first. */}
      <div style={{ position: "relative", marginBottom: "calc(28px + var(--space-lg))" }}>
        {s.coverPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
          <img src={s.coverPhotoUrl} alt={`${name} cover`} style={{ width: "100%", aspectRatio: "3 / 1", objectFit: "cover", borderRadius: "var(--radius-input)", display: "block" }} />
        ) : (
          <Missing label={s.hasCover ? "Cover couldn't load" : "No cover photo"} style={{ width: "100%", aspectRatio: "3 / 1", borderRadius: "var(--radius-input)" }} />
        )}
        <div style={{ position: "absolute", left: "var(--space-md)", bottom: -28, borderRadius: "50%", boxShadow: "var(--shadow-card)", background: "var(--bg)", padding: 3 }}>
          {s.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
            <img src={s.logoUrl} alt={`${name} logo`} style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", display: "block" }} />
          ) : (
            <Missing label={s.hasLogo ? "Logo couldn't load" : "No logo"} style={{ width: 64, height: 64, borderRadius: "50%" }} />
          )}
        </div>
      </div>

      <KeyValue
        rows={[
          { label: "About", value: s.about ?? <span className="mut">Not written yet</span> },
          {
            label: shop ? "Tags" : "Cuisine",
            value: s.tags.length ? (
              <span style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)" }}>
                {s.tags.map((t) => (
                  <Pill key={t} kind="mut">
                    {t}
                  </Pill>
                ))}
              </span>
            ) : (
              <span className="mut">None</span>
            ),
          },
          { label: "Price level", value: s.priceLevel ? "$".repeat(s.priceLevel) : <span className="mut">Not set</span> },
          {
            label: "Hours",
            value: s.hours.every((h) => !h.open) ? (
              <span className="mut">Not set</span>
            ) : (
              <span style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 var(--space-md)" }}>
                {s.hours.map((h) => (
                  <span key={h.day} style={{ display: "contents" }}>
                    <span className="mut">{DAY_LABEL[h.day]}</span>
                    <span>{h.open && h.close ? `${h.open}–${h.close}` : "Closed"}</span>
                  </span>
                ))}
              </span>
            ),
          },
        ]}
      />

      <div style={{ marginTop: "var(--space-lg)", fontSize: 12, fontWeight: 600 }}>
        {shop ? "Items" : "Menu"} · {s.itemCount === 0 ? "none yet" : s.itemCount > s.items.length ? `first ${s.items.length} of ${s.itemCount}` : `${s.itemCount}`}
      </div>
      {s.items.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-sm) 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--space-md)" }}>
          {s.items.map((d) => (
            <li key={d.id} style={{ fontSize: 12 }}>
              {d.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
                <img src={d.photoUrl} alt={d.name} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: "var(--radius-input)", display: "block" }} />
              ) : (
                <Missing label={photoMissing(d.hasPhoto)} style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: "var(--radius-input)" }} />
              )}
              <div style={{ fontWeight: 600, marginTop: "var(--space-xs)", overflowWrap: "anywhere" }}>{d.name}</div>
              <div className="mut" style={{ display: "flex", gap: "var(--space-xs)", alignItems: "center", flexWrap: "wrap" }}>
                {money(d.priceUsd)} · {d.category}
                {d.draft ? <Pill kind="warn">draft</Pill> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
