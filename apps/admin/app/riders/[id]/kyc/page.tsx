import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../../../lib/api";
import type { KycReview } from "../../../lib/adminTypes";
import { KeyValue } from "../../../components/KeyValue";
import { Pill } from "../../../components/StatusPill";
import { KycDecision } from "../../../components/KycDecision";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../../components/states";
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
  if (status === "expired") return <Pill kind="bad">expired</Pill>;
  return <Pill kind="mut">pending</Pill>;
}

export default async function KycReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await adminFetchResult<KycReview>(`/admin/riders/${id}/kyc`);

  if (!("data" in res)) {
    const reason = res.reason;
    return (
      <main className="content">
        <header className="page">
          <a className="back" href="/riders?kyc=pending">
            ← KYC queue
          </a>
          <h1 style={{ fontSize: 18 }}>KYC review</h1>
          <Conn connected={false} reason={reason} />
        </header>
        <OfflineBanner reason={reason} />
        <section className="card">
          <EmptyState
            icon={<IconIdCard />}
            title={reasonTitle(reason, "Review")}
            line={reasonLine(reason, "this rider's KYC review")}
          />
        </section>
      </main>
    );
  }

  const r = res.data;
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

      {/* A-04 duplicate-account guard: this national ID is already on other account(s). A flag, not a
          block — a legit re-entry and a ban-evading second SIM look identical, so ops decides. */}
      {r.duplicateIdAccounts.length > 0 || r.duplicateIdFlag ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>Duplicate ID — needs review.</b>{" "}
            {r.duplicateIdAccounts.length > 0 ? (
              <>
                This national ID (<span className="mono">{r.idNumber ?? "—"}</span>) is also on{" "}
                {r.duplicateIdAccounts.length} other account
                {r.duplicateIdAccounts.length === 1 ? "" : "s"}:{" "}
                {r.duplicateIdAccounts
                  .map(
                    (a) =>
                      `${a.name || "(no name)"} · ${a.phone} · ${a.role}${
                        a.accountStatus ? ` (${a.accountStatus})` : ""
                      }`,
                  )
                  .join("; ")}
                . Confirm this isn&apos;t a banned rider re-registering on a new number before approving.
              </>
            ) : (
              <>
                This ID matched another account at onboarding but no collision remains now (the other
                account was edited or removed). Verify before approving.
              </>
            )}
          </span>
        </div>
      ) : null}

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          <section className="card">
            <div className="block-title">Documents</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: tokens.space.md }}>
              <div>
                {r.photoUrl ? (
                  // The rider's OWN photo, captured in the app at signup ("Your photo" in become.tsx) —
                  // NOT a scan of the physical national ID card. The ID-card scan and liveness selfie are
                  // run and held by Didit, surfaced through the automated-checks panel below, never as an
                  // image here. A short-lived signed GCS URL, so a plain <img>, not next/image.
                  <img
                    src={r.photoUrl}
                    alt="The rider, captured in the app at signup"
                    style={{ width: "100%", height: 170, objectFit: "cover", borderRadius: tokens.radius.input, border: `1px solid ${tokens.color.line}` }}
                  />
                ) : (
                  <div className="doc-ph" style={{ height: 170 }}>
                    rider photo
                    <br />
                    {/* Either no photo was ever submitted (legacy/incomplete signup), or the signed
                        URL failed to mint (see AdminRidersService.getKycReview) — either way, the
                        review doesn't hard-fail on it. */}
                    (photo unavailable)
                  </div>
                )}
                <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 6 }}>
                  Rider photo (in-app) · National ID no. <span className="mono">{r.idNumber ?? "—"}</span>
                </div>
              </div>
              <div>
                <div className="doc-ph" style={{ height: 170 }}>
                  ID document &amp; liveness
                  <br />
                  {/* Honest placeholder: Lynia never receives the ID-card scan or the liveness capture —
                      Didit runs and holds them. The reviewer relies on the automated-checks panel below
                      plus the ID number, not an image comparison here. Wiring Didit's session images in is
                      a separate vendor-integration task. */}
                  (verified by Didit — see checks below)
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
