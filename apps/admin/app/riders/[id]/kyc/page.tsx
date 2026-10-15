import { formatPhoneLocal, KYC_THRESHOLDS, tokens } from "@lynia/shared";
import { adminFetchResult } from "../../../lib/api";
import type { KycReview } from "../../../lib/adminTypes";
import { KeyValue } from "../../../components/KeyValue";
import { Pill } from "../../../components/StatusPill";
import { KycDecision } from "../../../components/KycDecision";
import { SelfieCheckActions } from "../../../components/SelfieCheckActions";
import { diditProgressLine, diditSessionUrl, diditUnfinished } from "../../../lib/didit";
import { kycDeclineLabel } from "../../../lib/reasons";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../../components/states";
import { IconAlert, IconIdCard } from "../../../components/icons";
import { fmtDayMonth } from "../../../lib/format";

/**
 * KYC doc-review screen (kit `kyc.html` detail — admin A-02). Shows the rider's in-app photo, the ID
 * document & liveness evidence as a link to the rider's Didit session (Lynia never holds those images),
 * where the rider is in the Didit check plus the overall verdict, the applicant KeyValue block, and
 * Approve / Decline decisions through <ConfirmModal> (decline reason-coded) → the audit seam + the real
 * KYC write. This page is the only place a KYC approval is made: the queue row links here.
 *
 * A-02 lock states: after the first decline the rider gets ONE resubmit (a warnbar flags "attempt 2 —
 * a second decline locks"); after the second decline the application is locked → support. The decision
 * actions stay for every non-verified biker (owner 2026-10-12): approve, or "Reset attempts…" to give a
 * locked biker their tries back. Degrades to the offline state when `adminFetch` returns null.
 */

/** Kit's Didit `checkRow`: label + value + a status pill. */
function CheckRow({
  label,
  value,
  kind,
  pill,
}: {
  label: string;
  value: string;
  kind: "good" | "" | "bad";
  pill: string;
}) {
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
      <Pill kind={kind}>{pill}</Pill>
    </div>
  );
}

/** "Open in Didit ↗" — the reviewer's evidence for the ID document and liveness. */
function DiditLink({ kycRef }: { kycRef: string }) {
  return (
    <a href={diditSessionUrl(kycRef)} target="_blank" rel="noreferrer" style={{ color: tokens.color.accentText }}>
      Open in Didit ↗
    </a>
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
            line={reasonLine(reason, "this biker's KYC review")}
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

  // Didit's per-check scores (face match, document, liveness) aren't persisted — only the overall
  // verdict lands in `status` — so the panel shows that one verdict, not per-check rows it can't back.
  const verdict = {
    pending: { kind: "" as const, value: "awaiting a decision", pill: "needs review" },
    verified: { kind: "good" as const, value: "verified", pill: "pass" },
    failed: { kind: "bad" as const, value: "declined", pill: "fail" },
    expired: { kind: "bad" as const, value: "expired", pill: "expired" },
  }[r.status];
  // Where the rider is in the Didit check (null from an older API that doesn't report it), and whether
  // they never finished it — the approval then needs an explicit, noted acknowledgement.
  const progress = diditProgressLine(r.kycHeld, r.kycVendorStatus);
  const unfinished = !decided && diditUnfinished(r.kycHeld, r.kycVendorStatus);
  // Owner 2026-10-15: verified on the ID, with a selfie the phone's camera couldn't make checkable. Shown on a
  // held check too, so the reviewer deciding it knows the face was never checked.
  const selfieCheck = r.selfieCheck ?? null;
  // Owner 2026-10-15 (option 2): the card couldn't be read a third time, so the check came to a person.
  const unreadableHold = !decided && r.kycHeld === true && r.declineReason === "id_unreadable";

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
            <b>Locked — two attempts used.</b> This application can&apos;t be resubmitted until you reset its attempts.
            The biker must contact support to proceed.
          </span>
        </div>
      ) : resubmitWarn ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>Resubmission — attempt 2.</b>{" "}
            {r.declineReason ? `Previously declined: ${kycDeclineLabel(r.declineReason)}. ` : ""}
            One resubmit left — a second decline locks the application and the biker must contact support.
          </span>
        </div>
      ) : null}

      {selfieCheck ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            {r.status === "verified" ? (
              <>
                <b>ID verified — selfie not checked.</b> The ID check verified{" "}
                <span className="mono">{r.verifiedIdNumber ?? r.idNumber ?? "this biker's ID"}</span>, but{" "}
                {selfieCheck === "recheck_requested"
                  ? "you've asked for a new selfie and they haven't passed one yet"
                  : "their phone's camera couldn't take a selfie Didit could check"}
                {r.selfieCheckReason && r.selfieCheckReason !== "camera_quality" ? (
                  <> (last re-check: {kycDeclineLabel(r.selfieCheckReason)})</>
                ) : null}
                . They can go online. Compare the selfie with the ID photo in Didit, then mark it checked or ask for a
                re-check below.
              </>
            ) : (
              <>
                <b>Selfie not checked.</b> Their phone&apos;s camera couldn&apos;t take a selfie Didit could check, so
                nothing has compared their face with the ID. Compare the selfie with the ID photo in Didit before you
                decide.
              </>
            )}
          </span>
        </div>
      ) : null}

      {unreadableHold ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>ID card couldn&apos;t be read — three tries.</b> This biker is waiting on you, not on another retry. Check
            the card and the selfie in Didit, then approve (say how you checked the ID in the note) or decline.
          </span>
        </div>
      ) : null}

      {unfinished ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>ID check not finished.</b> {progress} Didit hasn&apos;t checked this biker&apos;s ID document or
            liveness, so there&apos;s nothing to compare. Approving needs a note saying how you verified them.
          </span>
        </div>
      ) : null}

      {/* D-75: no national ID on file. New riders type none; the ID check supplies it, and approving
          adopts the number it verified (the API refuses with a 409 if that number is on another live
          account). In manual mode, or when the check returned no number, approving leaves the account
          without one and the approval is audit-flagged. Shown while a decision is still open. */}
      {!decided && r.idOnFile === false ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>No national ID on file.</b>{" "}
            {r.verifiedIdInUse ? (
              <>
                The ID check verified{" "}
                {r.verifiedIdNumber ? <span className="mono">{r.verifiedIdNumber}</span> : "a national ID"}, but it&apos;s
                already on another live account, so approving will be refused. Resolve that account first.
              </>
            ) : r.verifiedIdNumber ? (
              <>
                Approving makes the number the ID check verified, <span className="mono">{r.verifiedIdNumber}</span>, this
                account&apos;s national ID.
              </>
            ) : (
              <>
                There&apos;s no ID-check number to adopt (manual review, or the check returned none), so approving
                verifies this biker without a national ID. The approval is flagged in the audit log for follow-up.
              </>
            )}
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
                {/* D-75: with no ID on file, the shared number is the one the ID check verified. */}
                This national ID (<span className="mono">{r.idNumber ?? r.verifiedIdNumber ?? "—"}</span>) is also on{" "}
                {r.duplicateIdAccounts.length} other account
                {r.duplicateIdAccounts.length === 1 ? "" : "s"}:{" "}
                {r.duplicateIdAccounts
                  .map(
                    (a) =>
                      `${a.name || "(no name)"} · ${formatPhoneLocal(a.phone)} · ${a.role === "rider" ? "biker" : a.role}${
                        a.accountStatus ? ` (${a.accountStatus})` : ""
                      }`,
                  )
                  .join("; ")}
                . Confirm this isn&apos;t a banned biker re-registering on a new number before approving.
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

      {/* IR26-04 vendor-document dedupe: the ID number Didit VERIFIED disagrees with the national ID on
          file — the "real document, someone else's number" ban-evasion tell. Riders no longer type an ID
          (D-75), so the number on file is one an older signup typed or an earlier check adopted. The
          webhook already held this verify for review; the reviewer resolves it here. */}
      {r.verifiedIdMismatch === true ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>ID check doesn&apos;t match the ID on file.</b> The ID check read{" "}
            <span className="mono">{r.verifiedIdNumber ?? "a different number"}</span> from the document, but the
            national ID on file for this account is <span className="mono">{r.idNumber ?? "—"}</span>. Compare the
            document in Didit against the application before deciding — a mismatch is the shape of a banned
            identity re-registering under another number.
          </span>
        </div>
      ) : null}

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          <section className="card">
            <div className="block-title">Documents</div>
            <div className="doc-grid" style={{ display: "grid", gap: tokens.space.md }}>
              <div>
                {r.photoUrl ? (
                  // The photo the rider uploaded in the app — NOT a scan of the physical national ID card. The ID-card scan and liveness selfie are
                  // run and held by Didit, surfaced through the automated-checks panel below, never as an
                  // image here. A short-lived signed GCS URL, so a plain <img>, not next/image.
                  <img
                    src={r.photoUrl}
                    alt="The biker, as uploaded in the app"
                    style={{ width: "100%", height: 170, objectFit: "cover", borderRadius: tokens.radius.input, border: `1px solid ${tokens.color.line}` }}
                  />
                ) : (
                  <div className="doc-ph" style={{ height: 170 }}>
                    biker photo
                    <br />
                    {/* Either no photo was ever submitted (legacy/incomplete signup), or the signed
                        URL failed to mint (see AdminRidersService.getKycReview) — either way, the
                        review doesn't hard-fail on it. */}
                    (photo unavailable)
                  </div>
                )}
                <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 6 }}>
                  Biker photo (in-app) · National ID no. <span className="mono">{r.idNumber ?? "—"}</span>
                </div>
              </div>
              <div>
                <div className="doc-ph" style={{ height: 170 }}>
                  ID document &amp; liveness
                  <br />
                  {/* Lynia never receives the ID-card scan or the liveness capture — Didit runs and holds
                      them — so this points the reviewer at the rider's Didit session instead. */}
                  {r.kycRef ? (
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13 }}>
                      Held by Didit — <DiditLink kycRef={r.kycRef} />
                    </span>
                  ) : (
                    "(no Didit session on record)"
                  )}
                </div>
                <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 6 }}>
                  Submitted {fmtDayMonth(r.submittedAt)}
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="block-title">Automated checks — Didit</div>
            {progress ? (
              <div style={{ fontSize: 13, padding: "8px 0" }}>
                <span className="mut">ID check: </span>
                {progress}
              </div>
            ) : null}
            <CheckRow label="Overall verdict" value={verdict.value} kind={verdict.kind} pill={verdict.pill} />
            {selfieCheck ? (
              <>
                <CheckRow label="ID document" value={r.verifiedIdNumber ?? r.idNumber ?? "verified"} kind="good" pill="pass" />
                <CheckRow
                  label="Selfie"
                  value={selfieCheck === "recheck_requested" ? "re-check asked for" : "not checked (camera)"}
                  kind=""
                  pill={selfieCheck === "recheck_requested" ? "reminded" : "not checked"}
                />
              </>
            ) : null}
            <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 10 }}>
              Decisions are automatic: a face match of {KYC_THRESHOLDS.autoApprove} or more passes, below{" "}
              {KYC_THRESHOLDS.needsReview} is declined, and a check Didit sends to review is declined too. Two exceptions:
              an ID that passed with a selfie the phone&apos;s camera couldn&apos;t make checkable is verified and flagged
              here, and a card that couldn&apos;t be read three times comes here for a person. Lynia doesn&apos;t keep the face-match, document or liveness results — confirm the ID number
              and check them in the biker&apos;s Didit session before overriding a decision.
              {r.kycRef ? (
                <>
                  {" "}
                  <DiditLink kycRef={r.kycRef} />
                </>
              ) : null}
              {r.status === "failed" && r.declineReason ? (
                <>
                  {" "}
                  Last decision: <b style={{ color: tokens.color.danger }}>{kycDeclineLabel(r.declineReason)}</b>.
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
                { label: "Phone", value: <span className="mono">{formatPhoneLocal(r.phone)}</span> },
                { label: "National ID", value: <span className="mono">{r.idNumber ?? "—"}</span> },
                { label: "Bike reg", value: <span className="mono">{r.bike}</span> },
                // KYC-R26-13: only declines that point at the identity (a duplicate, tampering, a mismatched
                // name or number, an admin decline) use a try; a blurry photo or an unmatched face doesn't.
                {
                  label: "Tries used",
                  value: (
                    <span className="num">
                      {Math.min(r.kycAttempts, 2)} of 2 <span className="mut">· fixable declines don&apos;t count</span>
                    </span>
                  ),
                },
              ]}
            />
          </section>

          <section className="card">
            <div className="block-title">Decision</div>
            {decided ? (
              <div style={{ fontSize: 13 }}>
                {r.status === "verified" ? (
                  <>
                    <span style={{ color: tokens.color.accentText, fontWeight: 600 }}>
                      ✓ Verified — this biker can go online.
                    </span>
                    {selfieCheck ? (
                      <div style={{ marginTop: 8, color: tokens.color.muted }}>
                        {selfieCheck === "recheck_requested"
                          ? "Selfie re-check asked for — they've been reminded."
                          : "Verified on the ID; the selfie wasn't checked."}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 14 }}>
                      <SelfieCheckActions profileId={r.id} name={r.name} connected={connected} selfieCheck={selfieCheck} />
                    </div>
                  </>
                ) : r.status === "expired" ? (
                  <span>
                    <span style={{ color: tokens.color.danger, fontWeight: 600 }}>Expired.</span>{" "}
                    <span className="mut">The biker must re-verify before they can go online.</span>
                  </span>
                ) : (
                  <span>
                    <span style={{ color: tokens.color.danger, fontWeight: 600 }}>Declined.</span>{" "}
                    <span className="mut">{r.declineReason ? kycDeclineLabel(r.declineReason) : ""}</span>
                    <div style={{ marginTop: 8, color: tokens.color.muted }}>
                      {r.locked
                        ? "Locked — no further resubmission until you reset their attempts."
                        : "The biker can fix the issue and resubmit."}
                    </div>
                  </span>
                )}
                {/* Owner 2026-10-12: a declined or expired biker can still be approved, or have their tries
                    reset, from here — only a verified one has nothing left to decide. */}
                {r.status !== "verified" ? (
                  <div style={{ marginTop: 14 }}>
                    <KycDecision
                      profileId={r.id}
                      name={r.name}
                      attempt={r.attempt}
                      connected={connected}
                      status={r.status}
                      canReset
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: tokens.color.muted, marginBottom: 14 }}>
                  Approving lets this biker go online immediately. Declining shows them the reason in the app; they can
                  resubmit once before the application locks.
                </div>
                <KycDecision
                  profileId={r.id}
                  name={r.name}
                  attempt={r.attempt}
                  connected={connected}
                  unfinishedCheck={unfinished}
                  status="pending"
                  canReset={r.kycAttempts > 0}
                />
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
