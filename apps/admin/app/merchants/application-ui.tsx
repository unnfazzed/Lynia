import { MERCHANT_APPLICATION_STATUS_LABELS, MERCHANT_REJECT_REASON_LABELS, type MerchantRejectReason } from "@lynia/shared";
import { Pill, type PillKind } from "../components/StatusPill";
import { KeyValue } from "../components/KeyValue";
import type { MerchantApplication, MerchantApplicationSla, MerchantApplicationStatus, MerchantMetrics } from "../lib/adminTypes";
import { fmtDate, fmtDateTime, money, timeAgo } from "../lib/format";
import { ApplicationActionButton, LicenceButtons, LogCallButton } from "./ApplicationActions";

const STATUS_KIND: Record<MerchantApplicationStatus, PillKind> = {
  applied: "mut",
  reviewing: "mut",
  approved: "good",
  live: "good",
  rejected: "bad",
  suspended: "bad",
};

/** Admin console v2 §5: a business's application state as a pill. */
export function ApplicationStatusPill({ status }: { status: MerchantApplicationStatus }) {
  return <Pill kind={STATUS_KIND[status] ?? "mut"}>{MERCHANT_APPLICATION_STATUS_LABELS[status] ?? status}</Pill>;
}

/** How long an application has waited, amber after 24h and red after 48h. */
export function SlaPill({ sla, since }: { sla: MerchantApplicationSla | null | undefined; since: string }) {
  const kind: PillKind = sla === "red" ? "bad" : sla === "amber" ? "warn" : "mut";
  return <Pill kind={kind}>{timeAgo(since).replace(" ago", "")}</Pill>;
}

export function rejectReasonLabel(code: string | null): string {
  if (!code) return "—";
  return MERCHANT_REJECT_REASON_LABELS[code as MerchantRejectReason] ?? code;
}

const ROW_ACTIONS = ["review", "approve", "reject", "go_live", "resume"] as const;

/**
 * The application card (admin console v2 §5): the data-backed checklist, the licence for a pharmacy, the
 * calls, and the actions the state allows. Shown at the top of the merchant page while it isn't live.
 */
export function ApplicationCard({ app, name, connected }: { app: MerchantApplication; name: string; connected: boolean }) {
  const actions = app.actions.filter((a) => (ROW_ACTIONS as readonly string[]).includes(a));
  return (
    <section className="card" aria-label="Application" style={{ marginBottom: "var(--space-lg)" }}>
      <div className="block-title">
        Application <span className="count">{`${app.score.passed}/${app.score.total} checks`}</span>
        <span className="right" style={{ display: "flex", gap: "var(--space-xs)" }}>
          <ApplicationStatusPill status={app.status} />
          {app.sla ? <SlaPill sla={app.sla} since={app.appliedAt} /> : null}
        </span>
      </div>
      {app.status === "rejected" ? (
        <p className="mut" style={{ fontSize: 13, margin: "0 0 var(--space-md)" }}>
          Told: {rejectReasonLabel(app.rejectReason)}
        </p>
      ) : null}
      <KeyValue
        rows={app.checklist.map((r) => ({
          label: r.required ? r.label : `${r.label} (optional)`,
          value: (
            <span>
              <span aria-label={r.ok ? "Passes" : "Fails"}>{r.ok ? "✅" : "❌"}</span> {r.detail}
              {r.warning ? (
                <span style={{ display: "block", color: "var(--danger)", fontSize: 12 }}>{r.warning}</span>
              ) : null}
            </span>
          ),
        }))}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", marginTop: "var(--space-md)" }}>
        <LogCallButton merchantId={app.merchantId} name={name} connected={connected} />
        {app.isPharmacy ? (
          <LicenceButtons merchantId={app.merchantId} name={name} connected={connected} recorded={!!app.licence} verified={!!app.licence?.verifiedAt} />
        ) : null}
        {actions.map((a) => (
          <ApplicationActionButton key={a} merchantId={app.merchantId} name={name} action={a} connected={connected} />
        ))}
      </div>
      {app.status === "reviewing" && !app.canApprove ? (
        <p className="mut" style={{ fontSize: 12, margin: "var(--space-sm) 0 0" }}>
          Approve shows once every required check passes.
        </p>
      ) : null}
      {app.calls.length > 0 ? (
        <div style={{ marginTop: "var(--space-md)", fontSize: 12 }}>
          <div className="field-label">Calls</div>
          <ul style={{ margin: 0, paddingLeft: "var(--space-lg)" }}>
            {app.calls.slice(0, 3).map((c) => (
              <li key={c.id}>
                {fmtDateTime(c.at)} · {c.outcome === "reached" ? "Spoke to the business" : c.outcome === "no_answer" ? "No answer" : "Call"}
                {c.note ? ` · ${c.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}

function mins(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)} min`;
}

function acceptTime(seconds: number | null): string {
  if (seconds == null) return "—";
  return seconds < 90 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;
}

/**
 * Admin console v2 §5: how the business performs — the last 30 days, or since recording began when that is
 * later. "—" wherever there is no data yet.
 */
export function MetricsCard({ m }: { m: MerchantMetrics }) {
  const hours =
    m.hoursOpen != null && m.hoursScheduled != null && m.hoursScheduled > 0
      ? `${Math.round(m.hoursOpen)} of ${Math.round(m.hoursScheduled)} h (${Math.round((m.hoursOpen / m.hoursScheduled) * 100)}%)`
      : "—";
  return (
    <section className="card" aria-label="Performance">
      <div className="block-title">
        Performance
        <span className="right">{m.short ? `since ${fmtDate(m.since)}` : `last ${m.windowDays} days`}</span>
      </div>
      <KeyValue
        rows={[
          { label: "Orders", value: m.orders },
          { label: "Accept time", value: m.acceptSample ? `${acceptTime(m.acceptMedianSeconds)} median` : "—" },
          { label: "Missed orders", value: m.orders ? `${pct(m.missedPct)} (${m.missed})` : "—" },
          { label: "Prep time", value: m.prepSample ? `${mins(m.prepMedianMinutes)} vs ${mins(m.promisedMedianMinutes)} promised` : "—" },
          { label: "Out of stock", value: m.lines ? `${pct(m.outOfStockPct)} of items ordered` : "—" },
          { label: "Hours open", value: hours },
          { label: "Rating", value: m.rating ? `${m.rating.avg.toFixed(1)} (${m.rating.count})` : "—" },
          { label: "Open debt", value: m.openDebtCount ? `${money(m.openDebtAmount)} · ${m.openDebtCount}` : money(m.openDebtAmount) },
        ]}
      />
    </section>
  );
}
