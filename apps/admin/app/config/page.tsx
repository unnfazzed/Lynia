import type { ReactNode } from "react";
import { adminFetchResult } from "../lib/api";
import type { AdminConfig } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { KeyValue } from "../components/KeyValue";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { Pill } from "../components/StatusPill";
import { IconAlert } from "../components/icons";
import { money } from "../lib/format";

/** A setting's label with the deploy variable it comes from, so ops can say which one to change. */
function Label({ children, env }: { children: ReactNode; env?: string }) {
  return (
    <>
      {children}
      {env ? (
        <span className="mono" style={{ display: "block", fontSize: 11, wordBreak: "break-all" }}>
          {env}
        </span>
      ) : null}
    </>
  );
}

const OnOff = ({ on }: { on: boolean }) => (on ? <Pill kind="good">On</Pill> : <Pill kind="mut">Off</Pill>);

const RAIL_LABEL: Record<string, string> = { ecocash: "EcoCash", innbucks: "InnBucks", omari: "O'mari" };

type SlaRow = AdminConfig["sla"][number];

/**
 * Admin console v2 §7 — Settings (undrawn; route (b), D-106). What the services run with, read-only: every one
 * of these is a deploy setting today, so ops could not see what is on. Changing one is a deploy change.
 */
export default async function ConfigPage() {
  const res = await adminFetchResult<AdminConfig>("/admin/config");
  const c = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = c !== null;

  const slaColumns: Column<SlaRow>[] = [
    { key: "stage", header: "Step", cell: (r) => r.label },
    { key: "limit", header: "Limit", className: "num", cell: (r) => <span style={{ whiteSpace: "nowrap" }}>{`${r.limitMinutes} min`}</span> },
    { key: "note", header: "", className: "mut", cell: (r) => r.note ?? "" },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>Settings</h1>
        <span className="sub">What the services run with · read-only, change them in the deploy</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      {c ? (
        <>
          <div className="detail-grid" style={{ marginBottom: "var(--space-lg)" }}>
            <section className="card">
              <div className="block-title">Money</div>
              <KeyValue
                rows={[
                  { label: <Label env="COMMISSION_RATE_PCT">Commission</Label>, value: `${c.commission.ratePct}% of each job` },
                  { label: "Free jobs", value: `First ${c.commission.freeFirstJobs} jobs, no commission` },
                  {
                    label: <Label env="PAYMENT_RAIL">Top-up payments</Label>,
                    value: c.topUps.paymentRail === "paynow" ? "Paynow" : <Pill kind="warn">Stub: nothing is charged</Pill>,
                  },
                  { label: <Label env="TOPUP_RAILS">Top-up on</Label>, value: c.topUps.rails.map((r) => RAIL_LABEL[r] ?? r).join(", ") || "—" },
                  {
                    label: <Label env="TOPUP_FEE_PCT">Top-up fee</Label>,
                    value: `${c.topUps.feePct}%, added by ${c.topUps.feeMode === "server" ? "LyniaGo" : "Paynow"}`,
                  },
                  { label: "Top-up size", value: `${money(c.commission.minTopUp)} to ${money(c.commission.maxTopUp)}` },
                  { label: <Label env="WALLET_MANUAL_CREDIT_CAP_USD">Manual credit cap</Label>, value: `${money(c.wallet.manualCreditCapUsd)} each` },
                  { label: "Reversal cap", value: `${money(c.wallet.reversalCapUsd)} each` },
                ]}
              />
            </section>
            <section className="card">
              <div className="block-title">Rules</div>
              <KeyValue
                rows={[
                  {
                    label: <Label env="PENALTIES_SUSPENDED">Penalties</Label>,
                    value: c.penaltiesSuspended ? <Pill kind="warn">Suspended</Pill> : <Pill kind="good">On</Pill>,
                  },
                  {
                    label: <Label env="KYC_MODE">ID checks</Label>,
                    value: c.kyc.mode === "manual" ? "Manual review" : `Automatic (${c.kyc.provider === "didit" ? "Didit" : "stub: passes everyone"})`,
                  },
                  { label: <Label env="GPS_RETENTION_DAYS">GPS kept</Label>, value: `${c.gpsRetentionDays} days` },
                  { label: <Label env="NODE_ENV">Environment</Label>, value: c.environment },
                ]}
              />
            </section>
          </div>

          <div className="detail-grid" style={{ marginBottom: "var(--space-lg)" }}>
            <section className="card">
              <div className="block-title">Services</div>
              <KeyValue
                rows={[
                  { label: <Label env="RESTAURANTS_ENABLED">Restaurants</Label>, value: <OnOff on={c.verticals.restaurants} /> },
                  { label: <Label env="SHOPS_ENABLED">Shops</Label>, value: <OnOff on={c.verticals.shops} /> },
                  { label: <Label env="PHARMACY_ENABLED">Pharmacy</Label>, value: <OnOff on={c.verticals.pharmacy} /> },
                  { label: <Label env="RX_ENABLED">Prescriptions</Label>, value: <OnOff on={c.verticals.prescriptions} /> },
                  { label: <Label env="MERCHANT_DISPATCH_AUTO_ENABLED">Auto biker search</Label>, value: <OnOff on={c.verticals.autoDispatch} /> },
                  { label: <Label env="MERCHANT_WALLET_ENABLED">Mobile money for food</Label>, value: <OnOff on={c.verticals.merchantWallet} /> },
                  { label: <Label env="NOTIFICATIONS_FEED_ENABLED">Notifications feed</Label>, value: <OnOff on={c.verticals.notificationsFeed} /> },
                ]}
              />
            </section>
            <section className="card">
              <div className="block-title">
                Live time limits
                <span className="right">The Live page</span>
              </div>
              <DataTable columns={slaColumns} rows={c.sla} rowKey={(r) => r.stage} />
            </section>
          </div>
        </>
      ) : (
        <section className="card">
          <EmptyState icon={<IconAlert />} title={reasonTitle(reason ?? "unconfigured", "Settings")} line={reasonLine(reason ?? "unconfigured", "settings")} />
        </section>
      )}
    </main>
  );
}
