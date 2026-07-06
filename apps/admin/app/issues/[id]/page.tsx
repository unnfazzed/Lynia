import { tokens, ISSUE_TYPE_LABELS, type IssueResolution } from "@lynia/shared";
import { adminFetchResult } from "../../lib/api";
import type { IssueDetail } from "../../lib/adminTypes";
import { KeyValue } from "../../components/KeyValue";
import { Pill } from "../../components/StatusPill";
import { ResolveActions } from "./ResolveActions";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../components/states";
import { IconAlert } from "../../components/icons";

/** Dispute investigation (kit `issues.html` detail): what happened, the OTP-not-entered evidence
 *  callout + delivery timeline, both statements, masked phones, and resolve → refund / rider strike /
 *  close, each reason-coded through <ConfirmModal>. A resolved issue shows its outcome read-only. */
const RESOLUTION_LABELS: Record<IssueResolution, string> = {
  refund: "Fare refunded to the customer",
  rider_strike: "Rider given a strike",
  close_no_action: "Closed — no action",
};

/** Status pill: open/investigating stay active (neutral), resolved goes muted. */
const statusPill = (status: IssueDetail["status"]) => <Pill kind={status === "resolved" ? "mut" : ""}>{status}</Pill>;

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await adminFetchResult<IssueDetail>(`/admin/issues/${id}`);

  if (!("data" in res)) {
    const reason = res.reason;
    return (
      <main className="content">
        <header className="page">
          <a className="back" href="/issues">
            ← Issues
          </a>
          <h1 style={{ fontSize: 18 }}>Issue investigation</h1>
          <Conn connected={false} reason={reason} />
        </header>
        <OfflineBanner reason={reason} />
        <section className="card">
          <EmptyState
            icon={<IconAlert />}
            title={reasonTitle(reason, "Investigation")}
            line={reasonLine(reason, "this dispute")}
          />
        </section>
      </main>
    );
  }

  const i = res.data;
  // Past the guard `i` is live data → connected; resolve actions are enabled.
  const connected = true;
  const typeLabel = ISSUE_TYPE_LABELS[i.type] ?? i.type;

  return (
    <main className="content">
      <header className="page">
        <a className="back" href="/issues">
          ← Issues
        </a>
        <h1 style={{ fontSize: 18 }}>
          <span className="mono">{i.id}</span> — {typeLabel}
        </h1>
        <span>{statusPill(i.status)}</span>
        <Conn connected={connected} />
      </header>

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          <section className="card">
            <div className="block-title">What happened</div>
            <div style={{ fontSize: 13, lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: i.facts }} />
            {i.codeNotEntered ? (
              <div className="warnbar" style={{ margin: "14px 0 0" }}>
                <IconAlert />
                <span className="t">
                  <b>Delivery code was not entered.</b> A completed hand-off normally requires the recipient&apos;s
                  one-time code — treat a manual close as unconfirmed delivery.
                </span>
              </div>
            ) : null}
            {i.photos ? (
              <div style={{ marginTop: 14 }}>
                <div className="doc-ph" style={{ height: 120, maxWidth: 280 }}>
                  recipient&apos;s photos ({i.photos})
                </div>
              </div>
            ) : null}
          </section>

          {i.timeline && i.timeline.length > 0 ? (
            <section className="card">
              <div className="block-title">Delivery evidence</div>
              <ul className="tl">
                {i.timeline.map((s, idx) => (
                  <li key={idx} className={s.state ?? ""}>
                    <span className="node">{s.state === "done" ? "✓" : s.state === "stall" ? "!" : String(idx + 1)}</span>
                    <span>
                      <span className="lbl">{s.label}</span>
                      {s.note ? <div className="note">{s.note}</div> : null}
                    </span>
                    <span className="ts">{s.ts ?? ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card">
            <div className="block-title">Statements</div>
            {i.statements.length > 0 ? (
              i.statements.map((s, idx) => (
                <div key={idx} style={{ padding: "10px 0", borderTop: `1px solid ${tokens.color.line}` }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: tokens.color.muted, marginBottom: 3 }}>{s.who}</div>
                  <div style={{ fontSize: 13 }}>{s.text}</div>
                </div>
              ))
            ) : (
              <div className="mut" style={{ fontSize: 13 }}>
                No statements yet — neither party has responded.
              </div>
            )}
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          <section className="card">
            <div className="block-title">Order</div>
            <KeyValue
              rows={[
                { label: "Order", value: <span className="mono">{i.order}</span> },
                { label: "Route", value: i.route },
                { label: "Fare", value: <span className="num">${i.fare} cash</span> },
                {
                  label: "Rider",
                  value: (
                    <span>
                      {i.rider}
                      {i.riderPhone ? <span className="mono mut"> {i.riderPhone}</span> : null} ·{" "}
                      <a href="/riders" style={{ color: tokens.color.accentText }}>profile</a>
                    </span>
                  ),
                },
                {
                  label: "Customer",
                  value: (
                    <span>
                      {i.customer}
                      {i.customerPhone ? <span className="mono mut"> {i.customerPhone}</span> : null} ·{" "}
                      <a href="/customers" style={{ color: tokens.color.accentText }}>profile</a>
                    </span>
                  ),
                },
                {
                  label: "Privacy",
                  value: (
                    <span className="mut" style={{ fontSize: 12 }}>
                      Full numbers show to ops only during an active order.
                    </span>
                  ),
                },
              ]}
            />
            <a className="btn ghost" href={`/orders/${i.order}`} style={{ marginTop: 12 }}>
              Open order record
            </a>
          </section>

          <section className="card">
            <div className="block-title">Resolution</div>
            {i.status === "resolved" ? (
              <div style={{ fontSize: 13 }}>
                <div>
                  <span style={{ color: tokens.color.accentText, fontWeight: 600 }}>✓ Resolved.</span>{" "}
                  {i.resolution ? RESOLUTION_LABELS[i.resolution] ?? i.resolution : "Outcome recorded."}
                  {i.resolution === "refund" && i.refundAmount ? (
                    <span className="num"> · ${i.refundAmount} refunded</span>
                  ) : null}
                </div>
                {i.resolutionNote ? (
                  <div className="mut" style={{ marginTop: 6 }}>
                    {i.resolutionNote}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: tokens.color.muted, marginBottom: 14 }}>
                  Pick an outcome — each is recorded on the order, the rider and the customer.
                </div>
                <ResolveActions id={i.id} order={i.order} rider={i.rider} fare={i.fare} connected={connected} />
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
