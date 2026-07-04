import { tokens } from "@lynia/shared";
import { adminFetch } from "../../../lib/api";
import type { KycReview } from "../../../lib/adminTypes";
import { KeyValue } from "../../../components/KeyValue";
import { Pill } from "../../../components/StatusPill";
import { KycDecision } from "../../../components/KycDecision";
import { Conn, EmptyState, OfflineBanner } from "../../../components/states";
import { IconAlert, IconIdCard } from "../../../components/icons";

/**
 * KYC doc-review screen (kit `kyc.html` detail — admin A-02). Reproduces the ID + selfie document
 * placeholders, the Didit checks panel (face-match vs the 0.85 auto-approve line / 0.6–0.85 needs-
 * review band / liveness), the applicant KeyValue block, and Approve / Decline decisions through
 * <ConfirmModal> (decline reason-coded) → the audit seam + the real KYC write.
 *
 * A-02 lock states: after the first decline the rider gets ONE resubmit (a warnbar flags "attempt 2 —
 * a second decline locks"); after the second decline the application is locked → support only, and
 * the decision actions disappear. Degrades to the offline state when `adminFetch` returns null.
 */

/** Kit's Didit `checkRow`: label + value + pass/needs-review/fail pill. */
function CheckRow({ label, value, kind }: { label: string; value: string; kind: "good" | "" | "bad" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderTop: `1px solid ${tokens.color.line}`,
        fontSize: 13,
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      <span className="mut num" style={{ fontSize: 12 }}>
        {value}
      </span>
      <Pill kind={kind}>{kind === "good" ? "pass" : kind === "bad" ? "fail" : "needs review"}</Pill>
    </div>
  );
}

function statusPill(status: KycReview["status"]) {
  if (status === "verified") return <Pill kind="good">verified</Pill>;
  if (status === "failed") return <Pill kind="bad">failed</Pill>;
  return <Pill kind="mut">pending</Pill>;
}

export default async function KycReviewPage({ params }: { params: { id: string } }) {
  const r = await adminFetch<KycReview>(`/admin/riders/${params.id}/kyc`);

  if (!r) {
    return (
      <main className="content">
        <header className="page">
          <a className="back" href="/riders?kyc=pending">
            ← KYC queue
          </a>
          <h1 style={{ fontSize: 18 }}>KYC review</h1>
          <Conn connected={false} />
        </header>
        <OfflineBanner />
        <section className="card">
          <EmptyState
            icon={<IconIdCard />}
            title="Review not connected"
            line="Set API_BASE_URL (and ADMIN_API_TOKEN) to load this rider's KYC review."
          />
        </section>
      </main>
    );
  }

  const connected = true;
  const decided = r.status !== "pending";
  // Resubmission warning: the rider has used their one resubmit and this is the last review before the
  // lock (attempt 2, still pending). A decline now locks the application.
  const resubmitWarn = r.status === "pending" && r.attempt >= 2;

  // Didit's per-check scores aren't persisted in the pilot — only the overall verdict lands in
  // `status`. Drive the checks panel off that: a pending review needs a manual compare (needs-review),
  // verified reads as pass, failed as fail (with the recorded reason surfaced below).
  const checkKind: "good" | "" | "bad" = r.status === "verified" ? "good" : r.status === "failed" ? "bad" : "";
  const checkValue =
    r.status === "pending"
      ? "score not captured — compare by eye"
      : r.status === "verified"
        ? "Didit verdict: verified"
        : "Didit verdict: failed";

  return (
    <main className="content">
      <header className="page">
        <a className="back" href="/riders?kyc=pending">
          ← KYC queue
        </a>
        <h1 style={{ fontSize: 18 }}>{r.name}</h1>
        <span style={{ display: "flex", gap: 6 }}>{statusPill(r.status)}</span>
        <Conn connected={connected} />
      </header>

      {r.locked ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>Locked — two attempts used.</b> This application declined twice and can&apos;t be resubmitted. The rider
            must contact support to proceed.
          </span>
        </div>
      ) : resubmitWarn ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>Resubmission — attempt 2.</b>{" "}
            {r.declineReason ? `Previously declined: ${r.declineReason}. ` : ""}
            One resubmit left — a second decline locks the application and the rider must contact support.
          </span>
        </div>
      ) : null}

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          <section className="card">
            <div className="block-title">Documents</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: tokens.space.md }}>
              <div>
                <div className="doc-ph" style={{ height: 170 }}>
                  national ID — front
                  <br />
                  (photo from rider&apos;s phone)
                </div>
                <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 6 }}>
                  National ID · <span className="mono">{r.idNumber ?? "—"}</span>
                </div>
              </div>
              <div>
                <div className="doc-ph" style={{ height: 170 }}>
                  live selfie
                  <br />
                  (Didit liveness capture)
                </div>
                <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 6 }}>
                  Submitted {new Date(r.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="block-title">Automated checks — Didit</div>
            <CheckRow label="Selfie ↔ ID face match" value={checkValue} kind={checkKind} />
            <CheckRow label="Document authenticity" value={checkValue} kind={checkKind} />
            <CheckRow label="Liveness" value={checkValue} kind={checkKind} />
            <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 10 }}>
              Didit auto-approves a face match ≥ 0.85; 0.6–0.85 needs a human compare, below 0.6 auto-declines. The
              pilot doesn&apos;t persist the per-check scores — confirm the ID number and compare the two photos before
              deciding.
              {r.status === "failed" && r.declineReason ? (
                <>
                  {" "}
                  Last decision: <b style={{ color: tokens.color.danger }}>{r.declineReason}</b>.
                </>
              ) : null}
            </div>
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          <section className="card">
            <div className="block-title">Applicant</div>
            <KeyValue
              rows={[
                { label: "Full name", value: r.name },
                { label: "Phone", value: <span className="mono">{r.phone}</span> },
                { label: "National ID", value: <span className="mono">{r.idNumber ?? "—"}</span> },
                { label: "Bike reg", value: <span className="mono">{r.bike}</span> },
                { label: "Attempt", value: <span className="num">{r.attempt} of 2</span> },
              ]}
            />
          </section>

          <section className="card">
            <div className="block-title">Decision</div>
            {decided ? (
              <div style={{ fontSize: 13 }}>
                {r.status === "verified" ? (
                  <span style={{ color: tokens.color.accentText, fontWeight: 600 }}>
                    ✓ Verified — this rider can go online.
                  </span>
                ) : (
                  <span>
                    <span style={{ color: tokens.color.danger, fontWeight: 600 }}>Declined.</span>{" "}
                    <span className="mut">{r.declineReason ?? ""}</span>
                    <div style={{ marginTop: 8, color: tokens.color.muted }}>
                      {r.locked
                        ? "Locked — no further resubmission. Route the rider to support."
                        : "The rider can fix the issue and resubmit once."}
                    </div>
                  </span>
                )}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: tokens.color.muted, marginBottom: 14 }}>
                  Approving lets this rider go online immediately. Declining shows them the reason in the app; they can
                  resubmit once before the application locks.
                </div>
                <KycDecision profileId={r.id} name={r.name} attempt={r.attempt} connected={connected} />
              </>
            )}
            <div style={{ fontSize: 11, color: tokens.color.muted, marginTop: 10 }}>
              KYC decisions require a reason code on decline and are recorded in the audit log.
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
