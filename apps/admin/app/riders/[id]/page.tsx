import { formatPhoneLocal, tokens } from "@lynia/shared";
import { adminFetch, adminFetchResult } from "../../lib/api";
import type { RiderDetail, TripRow, WalletView, WalletLedgerEntry } from "../../lib/adminTypes";
import { DataTable, type Column } from "../../components/DataTable";
import { KpiCard } from "../../components/KpiCard";
import { KeyValue } from "../../components/KeyValue";
import { StatusPill, Pill } from "../../components/StatusPill";
import { RiderActions } from "./RiderActions";
import { WalletCreditButton, WalletFreezeActions } from "./WalletActions";
import { ReportsCallout } from "../../components/ReportsCallout";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle, SubsectionUnavailable } from "../../components/states";
import { IconAlert, IconBike } from "../../components/icons";

/** Format a wallet balance, rendering a negative (owed) balance as "−$X.XX" to match the ledger's
 *  signed amounts (rather than a raw "$-X.XX"). */
function fmtBalance(b: string): string {
  const v = Number(b);
  return v < 0 ? `−$${Math.abs(v).toFixed(2)}` : `$${b}`;
}

/** Humanize a commission-ledger entry type for the wallet ledger table. */
const LEDGER_TYPE_LABEL: Record<WalletLedgerEntry["type"], string> = {
  ride_commission: "Ride commission",
  topup: "Top-up",
  grace: "Grace credit",
  adjustment: "Adjustment",
  reversal: "Reversal",
};

/** Rider profile (kit `riders.html` detail): trips, rating, completion, cancel strikes, cooldown,
 *  cash owed, recent trips; suspend / lift / ban actions each reason-coded through <ConfirmModal>. */
function ratingTxt(r: RiderDetail): string {
  return r.rating ? `★ ${r.rating} · ${r.ratingCount}` : "★ new";
}

function riderPill(r: RiderDetail) {
  if (r.status === "online") return <Pill kind="good" dot>online</Pill>;
  if (r.status === "suspended") return <Pill kind="bad">suspended</Pill>;
  if (r.status === "banned") return <Pill kind="bad">banned</Pill>;
  if (r.status === "on_hold") return <Pill kind="bad">on hold</Pill>;
  if (r.status === "cooldown") return <Pill>cooldown · {r.cooldown}</Pill>;
  return <Pill kind="mut">offline</Pill>;
}

export default async function RiderProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawWalletCursor = sp.walletCursor;
  const walletCursor = typeof rawWalletCursor === "string" ? rawWalletCursor : undefined;
  const res = await adminFetchResult<RiderDetail>(`/admin/riders/${id}`);

  if (!("data" in res)) {
    const reason = res.reason;
    return (
      <main className="content">
        <header className="page">
          <a className="back" href="/riders">
            ← Riders
          </a>
          <h1 style={{ fontSize: 18 }}>Rider profile</h1>
          <Conn connected={false} reason={reason} />
        </header>
        <OfflineBanner reason={reason} />
        <section className="card">
          <EmptyState
            icon={<IconBike />}
            title={reasonTitle(reason, "Profile")}
            line={reasonLine(reason, "this rider")}
          />
        </section>
      </main>
    );
  }

  const r = res.data;
  // Past the guard `r` is live data → connected; suspend/lift/ban actions are enabled.
  const connected = true;
  // DOC-16-03: the prepaid-wallet view (balance + a ledger page). Best-effort — null if the endpoint is
  // absent (older API) or unreachable, in which case the wallet card degrades to a "not available" note.
  // LC-D07: `walletCursor` pages further back past the first 20 entries via the "Load older" link below.
  const wallet = await adminFetch<WalletView>(
    `/admin/riders/${id}/wallet${walletCursor ? `?cursor=${encodeURIComponent(walletCursor)}` : ""}`,
  );

  // `commission_freeze` state (design OV-4A). `undefined` today for EVERY rider — no admin read surface
  // reports `Rider.heldReason`, so this is "unknown", never "not frozen" (see `WalletView.frozen`).
  // The frozen branches below are the kit's specified states, ready for the day the API serves the field.
  const walletFrozen = wallet?.frozen;

  const ledgerCols: Column<WalletLedgerEntry>[] = [
    { key: "at", header: "When", className: "mut", cell: (l) => new Date(l.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
    { key: "type", header: "Type", cell: (l) => LEDGER_TYPE_LABEL[l.type] ?? l.type },
    {
      key: "amount",
      header: "Amount",
      className: "num",
      cell: (l) => {
        const v = Number(l.amount);
        return <span style={{ color: v < 0 ? tokens.color.danger : tokens.color.accentText, fontWeight: 600 }}>{v < 0 ? "−" : "+"}${Math.abs(v).toFixed(2)}</span>;
      },
    },
    { key: "balanceAfter", header: "Balance", className: "num", cell: (l) => `$${l.balanceAfter}` },
    { key: "note", header: "Note", className: "mut", cell: (l) => l.note ?? "—" },
  ];

  const tripCols: Column<TripRow>[] = [
    { key: "id", header: "Order", className: "mono", cell: (t) => t.id },
    { key: "route", header: "Route", cell: (t) => t.route },
    { key: "status", header: "Status", cell: (t) => <StatusPill status={t.status} /> },
    { key: "fare", header: "Fare", className: "num", cell: (t) => `$${t.fare}` },
    { key: "when", header: "When", className: "mut", cell: (t) => t.when },
  ];

  const telHref = `tel:${r.phone.replace(/[^\d+]/g, "")}`;
  const suspended = r.status === "suspended";
  const banned = r.status === "banned";
  const onHold = r.status === "on_hold";
  // A suspend/ban only blocks going online going forward — it doesn't touch an order this rider is
  // already mid-delivery on, and the customer isn't told their rider's standing changed. Ops needs
  // this flagged so they can decide (via the trip row below) whether to step in on that live order.
  const hasOrphanedActiveOrder = (suspended || banned) && r.activeOrders > 0;

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
            <b>Suspended.</b> {r.suspendReason ? `Reason: ${r.suspendReason}. ` : ""}The rider cannot go online until
            the suspension is lifted.
          </span>
        </div>
      ) : null}

      {banned ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>Permanently banned.</b> {r.suspendReason ? `Reason: ${r.suspendReason}. ` : ""}This account is blocked
            and can&apos;t be reinstated from the console.
          </span>
        </div>
      ) : null}

      {onHold ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>On hold.</b> Reliability score {r.reliabilityScore}{" "}is below the threshold to go online — and
            completing deliveries is the only way it recovers, which going online would let them do. Without
            &ldquo;Clear hold&rdquo; below, this rider is stuck permanently.
          </span>
        </div>
      ) : null}

      {hasOrphanedActiveOrder ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>Still on a live delivery.</b> This rider has {r.activeOrders} order{r.activeOrders > 1 ? "s" : ""} in
            progress — {suspended ? "suspending" : "banning"} them does not cancel or reassign it. Check the trip
            below and cancel it from the order page if it shouldn&apos;t continue.
          </span>
        </div>
      ) : null}

      <ReportsCallout reports={r.reportLog} subject="rider" />

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
        {/* Commission/balance is shown once, authoritatively, in the Prepaid-wallet card below — not
            repeated as a KPI + a Details row (which read as three different figures for one number). */}
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
                { label: "Phone", value: <span className="mono">{formatPhoneLocal(r.phone)}</span> },
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
                // Commission/balance intentionally lives only in the Prepaid-wallet card below.
              ]}
            />
          </section>

          <section className="card">
            <div className="block-title">Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <RiderActions
                id={r.id}
                name={r.name}
                suspended={suspended}
                banned={banned}
                onHold={onHold}
                suspendSummary={`${r.trips} trips · ${ratingTxt(r)}`}
                telHref={telHref}
                connected={connected}
              />
            </div>
            <div style={{ fontSize: 11, color: tokens.color.muted, marginTop: 10 }}>
              Suspensions and bans require a reason code and are recorded in the audit log.
            </div>
          </section>
        </div>
      </div>

      {/* DOC-16-03: prepaid commission wallet — balance, the manual-credit rail, and the ledger. */}
      <section className="card" style={{ marginTop: tokens.space.lg }}>
        <div className="block-title">
          Prepaid wallet ·{" "}
          <a href="/cash" style={{ color: tokens.color.accentText, fontWeight: 400, fontSize: 12, textDecoration: "none" }}>
            commission overview →
          </a>
          <span className="right">
            balance{" "}
            <b style={{ color: wallet && Number(wallet.balance) < 0 ? tokens.color.danger : tokens.color.ink }}>
              {wallet ? fmtBalance(wallet.balance) : "—"}
            </b>
            {walletFrozen ? (
              <>
                {" · "}
                <Pill kind="bad">commission_freeze</Pill>
              </>
            ) : null}
          </span>
        </div>
        {!wallet && <SubsectionUnavailable noun="wallet view" />}

        {/* Kit riders.html:70 — the frozen-wallet warnbar. */}
        {walletFrozen ? (
          <div className="warnbar">
            <IconAlert />
            <span className="t">
              <b>Wallet frozen.</b> A <span className="mono">commission_freeze</span> hold is in place —
              admin-clear only, never self-cleared. Top-ups stay disabled until an admin clears it.
            </span>
          </div>
        ) : null}

        {/* Kit riders.html:256-257 — while frozen, the credit form is replaced by a disabled empty state
            rather than left clickable. */}
        {walletFrozen ? (
          <div style={{ marginBottom: tokens.space.md }}>
            <EmptyState
              icon={<IconAlert />}
              title="Credits are disabled"
              line="Clear the commission_freeze hold before crediting this wallet."
            />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: tokens.space.md, flexWrap: "wrap" }}>
            {/* Only offer a credit once the balance loaded — crediting blind (wallet view failed) would let
                ops act without seeing the current balance. */}
            <WalletCreditButton id={r.id} name={r.name} connected={connected && wallet !== null} />
            {wallet && (
              <span style={{ fontSize: 12, color: tokens.color.muted }}>
                Manual credits are the launch top-up rail — each is reason-coded and lands on the ledger below.
              </span>
            )}
          </div>
        )}

        {/* Kit riders.html:226-228 — the commission_freeze hold actions. Both unwired today; the
            component states that inline and keeps its triggers disabled. */}
        <div style={{ marginBottom: tokens.space.md }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: tokens.color.muted, marginBottom: 8 }}>
            Wallet freeze
          </div>
          <WalletFreezeActions id={r.id} name={r.name} frozen={walletFrozen} />
        </div>
        <DataTable
          columns={ledgerCols}
          rows={wallet?.ledger ?? []}
          rowKey={(l) => l.id}
          empty={
            <div className="mut" style={{ textAlign: "center", padding: 20 }}>
              {wallet ? "No wallet activity yet — no top-ups or ride commission recorded." : "Wallet view unavailable."}
            </div>
          }
        />
        {/* LC-D07: the ledger is paged server-side (20/page) — disclose it and link further back instead
            of silently truncating. `walletCursor` clears to reset to the newest page. */}
        {wallet && (wallet.nextCursor || walletCursor) ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: tokens.color.muted, marginTop: 12 }}>
            <span>Showing 20 entries per page.</span>
            <span style={{ display: "flex", gap: 12 }}>
              {walletCursor ? (
                <a href={`/riders/${id}`} style={{ color: tokens.color.accentText }}>
                  ↺ Back to latest
                </a>
              ) : null}
              {wallet.nextCursor ? (
                <a href={`/riders/${id}?walletCursor=${encodeURIComponent(wallet.nextCursor)}`} style={{ color: tokens.color.accentText }}>
                  Load older →
                </a>
              ) : null}
            </span>
          </div>
        ) : null}
      </section>
    </main>
  );
}
