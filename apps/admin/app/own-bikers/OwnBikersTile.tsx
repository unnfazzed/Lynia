import { IconStore } from "../components/icons";
import type { LiveAlerts } from "../lib/adminTypes";
import { OBA, OBA_FRAME } from "../lib/own-bikers-copy";

/**
 * OB-A4 · the Overview tile (Own bikers v1, ledger D-117): "Own bikers live: 3 fleets · 14 bikers online · 2 overdue",
 * the overdue in words on a danger wash, and "Open Own bikers". Nothing while no business runs its own bikers.
 */
export function OwnBikersTile({ ownBikers }: { ownBikers: LiveAlerts["ownBikers"] }) {
  if (!ownBikers || ownBikers.fleets === 0) return null;
  const t = OBA.tile(ownBikers.fleets, ownBikers.bikersOnline, ownBikers.overdueFleets ?? ownBikers.overdueBills);
  return (
    <section className="card ob" style={{ padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }} aria-label={OBA.nav}>
      <span
        aria-hidden="true"
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "var(--accent-wash)",
          color: "var(--accent-text)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
        }}
      >
        <IconStore width={20} height={20} />
      </span>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
        {t.lead}
        {t.overdue ? (
          <>
            {" · "}
            <span style={{ color: "var(--danger-ink)", background: "var(--danger-wash)", borderRadius: 999, padding: "2px 8px" }}>{t.overdue}</span>
          </>
        ) : null}
      </div>
      <a className="btn ghost" href="/own-bikers">
        {OBA_FRAME.open}
      </a>
    </section>
  );
}
