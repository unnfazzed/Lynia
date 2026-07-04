import { tokens } from "@lynia/shared";
import { adminFetch } from "../../lib/api";
import { REASONS } from "../../lib/reasons";
import type { IssueDetail } from "../../lib/adminTypes";
import { KeyValue } from "../../components/KeyValue";
import { Pill } from "../../components/StatusPill";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Conn, EmptyState, OfflineBanner } from "../../components/states";
import { IconAlert } from "../../components/icons";

/** Dispute investigation (kit `issues.html` detail): what happened, OTP-not-entered evidence
 *  callout, both statements, photo evidence, and resolve → refund / strike / close, each reason-coded
 *  through <ConfirmModal>. */
export default async function IssueDetailPage({ params }: { params: { id: string } }) {
  const i = await adminFetch<IssueDetail>(`/admin/issues/${params.id}`);
  const path = `/issues/${params.id}`;

  if (!i) {
    return (
      <main className="content">
        <header className="page">
          <a className="back" href="/issues">
            ← Issues
          </a>
          <h1 style={{ fontSize: 18 }}>Issue investigation</h1>
          <Conn connected={false} />
        </header>
        <OfflineBanner />
        <section className="card">
          <EmptyState
            icon={<IconAlert />}
            title="Investigation not connected"
            line="Set API_BASE_URL (and ADMIN_API_TOKEN) to load this dispute."
          />
        </section>
      </main>
    );
  }

  // Past the guard `i` is non-null → connected; resolve actions are enabled.
  const connected = true;
  const issuePill = <Pill kind={i.status === "resolved" ? "mut" : i.status === "open" ? "bad" : ""}>{i.status}</Pill>;

  return (
    <main className="content">
      <header className="page">
        <a className="back" href="/issues">
          ← Issues
        </a>
        <h1 style={{ fontSize: 18 }}>
          {i.id} — {i.type}
        </h1>
        <span>{issuePill}</span>
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
                  <b>Delivery code was not entered.</b> A completed hand-off normally requires the recipient's code —
                  treat a manual close as unconfirmed delivery.
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

          <section className="card">
            <div className="block-title">Statements</div>
            {i.statements.map((s, idx) => (
              <div key={idx} style={{ padding: "10px 0", borderTop: `1px solid ${tokens.color.line}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: tokens.color.muted, marginBottom: 3 }}>{s.who}</div>
                <div style={{ fontSize: 13 }}>{s.text}</div>
              </div>
            ))}
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
                      {i.rider} · <a href="/riders" style={{ color: tokens.color.accentText }}>profile</a>
                    </span>
                  ),
                },
                {
                  label: "Customer",
                  value: (
                    <span>
                      {i.customer} · <a href="/customers" style={{ color: tokens.color.accentText }}>profile</a>
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
                <span style={{ color: tokens.color.accentText, fontWeight: 600 }}>✓ Resolved.</span>{" "}
                <span className="mut">{i.resolution}</span>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: tokens.color.muted, marginBottom: 14 }}>
                  Pick an outcome — each is recorded on the order, the rider and the customer.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <ConfirmModal
                    action="issue.refund"
                    target={i.id}
                    path={path}
                    triggerLabel="Refund the fare…"
                    triggerVariant="ghost"
                    disabled={!connected}
                    title={`Refund $${i.fare} to the customer?`}
                    consequence={
                      <span>
                        Cash refunds are handed to the customer by ops or netted off the rider&apos;s next settlement.
                        Order <b>{i.order}</b>.
                      </span>
                    }
                    reasons={REASONS.issueRefund}
                    confirmLabel="Record refund"
                  />
                  <ConfirmModal
                    action="issue.strike_rider"
                    target={i.rider}
                    path={path}
                    triggerLabel="Strike the rider…"
                    triggerVariant="danger"
                    danger
                    disabled={!connected}
                    title={`Give ${i.rider} a strike?`}
                    consequence="Three strikes trigger an automatic cooldown. Consider a suspension instead if this involves safety or fraud."
                    reasons={REASONS.issueStrike}
                    confirmLabel="Add strike"
                  />
                  <ConfirmModal
                    action="issue.close_no_action"
                    target={i.id}
                    path={path}
                    triggerLabel="Close — no action…"
                    triggerVariant="quiet"
                    disabled={!connected}
                    title={`Close ${i.id} with no action?`}
                    consequence="Both sides are notified that the issue is closed. It stays on record and reopens if new evidence arrives."
                    reasons={REASONS.issueClose}
                    confirmLabel="Close issue"
                  />
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
