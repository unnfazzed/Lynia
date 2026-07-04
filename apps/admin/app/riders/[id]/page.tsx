import { tokens } from "@lynia/shared";
import { adminFetch } from "../../lib/api";
import { REASONS } from "../../lib/reasons";
import type { RiderDetail, TripRow } from "../../lib/adminTypes";
import { DataTable, type Column } from "../../components/DataTable";
import { KpiCard } from "../../components/KpiCard";
import { KeyValue } from "../../components/KeyValue";
import { StatusPill, Pill } from "../../components/StatusPill";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Conn, EmptyState, OfflineBanner } from "../../components/states";
import { IconAlert, IconBike, IconPhone } from "../../components/icons";

/** Rider profile (kit `riders.html` detail): trips, rating, completion, cancel strikes, cooldown,
 *  cash owed, recent trips; suspend / lift / ban actions each reason-coded through <ConfirmModal>. */
function ratingTxt(r: RiderDetail): string {
  return r.rating ? `★ ${r.rating} · ${r.ratingCount}` : "★ new";
}

function riderPill(r: RiderDetail) {
  if (r.status === "online") return <Pill kind="good" dot>online</Pill>;
  if (r.status === "suspended") return <Pill kind="bad">suspended</Pill>;
  if (r.status === "cooldown") return <Pill>cooldown · {r.cooldown}</Pill>;
  return <Pill kind="mut">offline</Pill>;
}

export default async function RiderProfilePage({ params }: { params: { id: string } }) {
  const r = await adminFetch<RiderDetail>(`/admin/riders/${params.id}`);
  const path = `/riders/${params.id}`;

  if (!r) {
    return (
      <main className="content">
        <header className="page">
          <a className="back" href="/riders">
            ← Riders
          </a>
          <h1 style={{ fontSize: 18 }}>Rider profile</h1>
          <Conn connected={false} />
        </header>
        <OfflineBanner />
        <section className="card">
          <EmptyState
            icon={<IconBike />}
            title="Profile not connected"
            line="Set API_BASE_URL (and ADMIN_API_TOKEN) to load this rider."
          />
        </section>
      </main>
    );
  }

  // Past the guard `r` is non-null → connected; suspend/lift/ban actions are enabled.
  const connected = true;

  const tripCols: Column<TripRow>[] = [
    { key: "id", header: "Order", className: "mono", cell: (t) => t.id },
    { key: "route", header: "Route", cell: (t) => t.route },
    { key: "status", header: "Status", cell: (t) => <StatusPill status={t.status} /> },
    { key: "fare", header: "Fare", className: "num", cell: (t) => `$${t.fare}` },
    { key: "when", header: "When", className: "mut", cell: (t) => t.when },
  ];

  const telHref = `tel:${r.phone.replace(/[^\d+]/g, "")}`;
  const suspended = r.status === "suspended";

  return (
    <main className="content">
      <header className="page">
        <a className="back" href="/riders">
          ← Riders
        </a>
        <h1 style={{ fontSize: 18 }}>{r.name}</h1>
        <span style={{ display: "flex", gap: 6 }}>
          {riderPill(r)}
          <Pill kind={r.kyc === "verified" ? "good" : "mut"}>{r.kyc}</Pill>
        </span>
        <Conn connected={connected} />
      </header>

      {suspended ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>Suspended.</b> {r.suspendReason ? `${r.suspendReason} ` : ""}The rider cannot go online until the
            suspension is lifted.
          </span>
        </div>
      ) : null}

      <section className="panels" style={{ marginBottom: tokens.space.lg }}>
        <KpiCard label="Trips" value={r.trips} hint={`since ${r.joined}`} size={22} />
        <KpiCard label="Rating" value={ratingTxt(r)} hint={r.ratingCount ? `${r.ratingCount} ratings` : "no ratings yet"} size={22} />
        <KpiCard label="Completion" value={r.completion} hint="accepted → delivered" size={22} />
        <KpiCard
          label="Cancel strikes"
          value={r.strikes}
          hint={r.status === "cooldown" ? `cooldown ${r.cooldown}` : "3 strikes = auto-cooldown"}
          size={22}
        />
        <KpiCard
          label="Cash owed"
          value={`$${r.cashOwed}`}
          hint={r.cashOverdue ? <span style={{ color: tokens.color.danger }}>settlement overdue</span> : "commission to settle"}
          size={22}
        />
      </section>

      <div className="detail-grid">
        <section className="card">
          <div className="block-title">Recent trips</div>
          <DataTable
            columns={tripCols}
            rows={r.trail}
            rowKey={(t) => t.id}
            getRowHref={(t) => `/orders/${t.id}`}
            empty={
              <div className="mut" style={{ textAlign: "center", padding: 20 }}>
                No trips yet — this rider hasn&apos;t gone online.
              </div>
            }
          />
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          <section className="card">
            <div className="block-title">Details</div>
            <KeyValue
              rows={[
                { label: "Phone", value: <span className="mono">{r.phone}</span> },
                { label: "Bike reg", value: <span className="mono">{r.bike}</span> },
                { label: "Joined", value: r.joined },
                {
                  label: "KYC",
                  value: (
                    <span>
                      {r.kyc} ·{" "}
                      <a href="/riders?kyc=pending" style={{ color: tokens.color.accentText }}>
                        {r.kyc === "verified" ? "view queue" : "in queue"}
                      </a>
                    </span>
                  ),
                },
                {
                  label: "Settlement",
                  value: (
                    <span>
                      ${r.cashOwed} owed ·{" "}
                      <a href="/cash" style={{ color: tokens.color.accentText }}>
                        cash &amp; settlements
                      </a>
                    </span>
                  ),
                },
              ]}
            />
          </section>

          <section className="card">
            <div className="block-title">Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {suspended ? (
                <>
                  <ConfirmModal
                    action="rider.lift_suspension"
                    target={r.name}
                    path={path}
                    triggerLabel="Lift suspension…"
                    triggerVariant="solid"
                    disabled={!connected}
                    title={`Lift suspension for ${r.name}?`}
                    consequence="They can go online again immediately. Their strike count stays as it is."
                    reasons={REASONS.riderLift}
                    confirmLabel="Lift suspension"
                  />
                  <ConfirmModal
                    action="rider.ban"
                    target={r.name}
                    path={path}
                    triggerLabel="Ban permanently…"
                    triggerVariant="danger"
                    danger
                    disabled={!connected}
                    title={`Permanently ban ${r.name}?`}
                    consequence={
                      <span>
                        <b>This can&apos;t be undone from the console.</b> Their account, bike registration and national ID
                        are blocked from re-registering.
                      </span>
                    }
                    reasons={REASONS.riderBan}
                    noteRequired
                    notePlaceholder="Required — describe the incident and evidence."
                    confirmLabel="Ban rider"
                  />
                </>
              ) : (
                <>
                  <a className="btn ghost" href={telHref}>
                    <span style={{ display: "inline-flex", fontSize: 14 }}>
                      <IconPhone />
                    </span>
                    Call rider
                  </a>
                  <ConfirmModal
                    action="rider.suspend"
                    target={r.name}
                    path={path}
                    triggerLabel="Suspend rider…"
                    triggerVariant="danger"
                    danger
                    disabled={!connected}
                    title={`Suspend ${r.name}?`}
                    consequence={
                      <span>
                        They are taken offline immediately and can&apos;t accept work.{" "}
                        <b>
                          {r.trips} trips · {ratingTxt(r)}
                        </b>
                        . Suspension holds until an admin lifts it.
                      </span>
                    }
                    reasons={REASONS.riderSuspend}
                    noteRequired
                    notePlaceholder="What happened? The rider sees this context when they contact support."
                    confirmLabel="Suspend rider"
                  />
                </>
              )}
            </div>
            <div style={{ fontSize: 11, color: tokens.color.muted, marginTop: 10 }}>
              Suspensions and bans require a reason code and are recorded in the audit log.
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
