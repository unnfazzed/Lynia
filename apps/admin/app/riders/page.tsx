import { adminFetchResult } from "../lib/api";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { DataTable, type Column } from "../components/DataTable";
import { FilterNav } from "../components/FilterNav";
import { Pill } from "../components/StatusPill";
import { IconBike } from "../components/icons";
import { KycApproveButton } from "./KycSubmitButton";

interface Rider {
  profileId: string;
  name: string;
  phone: string;
  bikeReg: string;
  kycStatus: "pending" | "verified" | "failed" | "expired";
  idVerified: boolean;
  isOnline: boolean;
  accountStatus: "active" | "suspended" | "banned";
  /** Separate reliability-hold flag (accountStatus has no on_hold member). */
  onHold: boolean;
  ratingAvg: number;
  ratingCount: number;
  tripsCount: number;
  cancelStrikes: number;
  cooldownUntil: string | null;
}

const KYC_TABS = ["pending", "verified", "failed", "expired", "all"] as const;

/** Account-standing chip — lets the directory flag a suspended/banned/held rider at a glance (A-04). */
function standingPill(r: Rider) {
  if (r.accountStatus === "banned") return <Pill kind="bad">banned</Pill>;
  if (r.accountStatus === "suspended") return <Pill kind="bad">suspended</Pill>;
  if (r.onHold) return <Pill kind="bad">on hold</Pill>;
  if (r.cooldownUntil) return <Pill kind="mut">cooldown</Pill>;
  if (r.isOnline) return <Pill kind="good">online</Pill>;
  return <Pill kind="mut">offline</Pill>;
}

function kycPill(s: Rider["kycStatus"]) {
  if (s === "verified") return <Pill kind="good">verified</Pill>;
  if (s === "failed" || s === "expired") return <Pill kind="bad">{s}</Pill>;
  return <Pill kind="mut">pending</Pill>;
}

/** Kit's `ratingTxt` (riders.html) — "★ 4.8 · 118", or "★ new" before the first rating. Matches the
 *  rider profile page, which already renders the rating this way. */
function ratingTxt(r: Rider) {
  return r.ratingCount > 0 ? `★ ${r.ratingAvg.toFixed(1)} · ${r.ratingCount}` : "★ new";
}

/** Strikes cell — the kit colours the count danger from 2 strikes (3 = auto-cooldown), so a rider one
 *  strike away from a cooldown reads as such at a glance. */
function strikesCell(r: Rider) {
  if (r.cancelStrikes === 0) return "—";
  return (
    <span style={r.cancelStrikes >= 2 ? { color: "var(--danger)" } : undefined}>
      {r.cancelStrikes} strike{r.cancelStrikes === 1 ? "" : "s"}
    </span>
  );
}

function riderName(r: Rider) {
  return (
    <a href={`/riders/${r.profileId}`} style={{ color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}>
      {r.name || r.profileId.slice(0, 8)}
    </a>
  );
}

export default async function RidersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).kyc;
  // KYC-queue mode when a (valid) ?kyc= filter is present; otherwise the full rider DIRECTORY.
  const kycMode = typeof raw === "string" && (KYC_TABS as readonly string[]).includes(raw);
  const kycFilter = kycMode ? (raw as string) : "";
  const query = kycMode && kycFilter !== "all" ? `?kyc=${kycFilter}` : "";
  const res = await adminFetchResult<Rider[]>(`/admin/riders${query}`);
  const riders = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = riders !== null;

  // Column set + ORDER follow the kit's directory table (riders.html `<thead>`): Rider · Phone · Bike ·
  // KYC · Trips / rating · Strikes · Status — standing is the row's verdict, so it reads last.
  const directoryColumns: Column<Rider>[] = [
    { key: "name", header: "Rider", cell: riderName },
    { key: "phone", header: "Phone", className: "mono", cell: (r) => r.phone },
    { key: "bike", header: "Bike", className: "mono", cell: (r) => r.bikeReg },
    { key: "kyc", header: "KYC", cell: (r) => kycPill(r.kycStatus) },
    { key: "trips", header: "Trips / rating", className: "num", cell: (r) => `${r.tripsCount} · ${ratingTxt(r)}` },
    { key: "strikes", header: "Strikes", className: "num", cell: strikesCell },
    { key: "standing", header: "Status", cell: standingPill },
  ];

  const kycColumns: Column<Rider>[] = [
    { key: "name", header: "Rider", cell: riderName },
    { key: "phone", header: "Phone", className: "mono", cell: (r) => r.phone },
    // Kit's KYC queue names this column "Bike reg" (kyc.html), matching the review screen's KeyValue.
    { key: "bike", header: "Bike reg", className: "mono", cell: (r) => r.bikeReg },
    { key: "kyc", header: "KYC", cell: (r) => kycPill(r.kycStatus) },
    { key: "trips", header: "Trips / rating", className: "num", cell: (r) => `${r.tripsCount} · ${ratingTxt(r)}` },
    { key: "action", header: "Action", cell: (r) => <KycAction r={r} /> },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>{kycMode ? "Riders — KYC review" : "Riders"}</h1>
        <span className="sub">{kycMode ? "Didit verification queue — approve or review each application" : "Rider directory — standing, KYC, trips & strikes"}</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      {kycMode ? (
        <FilterNav
          items={KYC_TABS.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
          active={kycFilter}
          hrefFor={(v) => `/riders?kyc=${v}`}
        />
      ) : null}

      <section className="card">
        <DataTable
          columns={kycMode ? kycColumns : directoryColumns}
          rows={riders ?? []}
          rowKey={(r) => r.profileId}
          // Directory rows are pure links to the profile; KYC rows carry an inline Approve form, so no
          // stretched row-link there (it would sit under the button).
          getRowHref={kycMode ? undefined : (r) => `/riders/${r.profileId}`}
          rowLabel={kycMode ? undefined : (r) => `Open ${r.name || r.profileId.slice(0, 8)}`}
          empty={
            connected ? (
              <EmptyState icon={<IconBike />} title={kycMode ? "No riders in this view" : "No riders yet"} line={kycMode ? "Try a different KYC filter." : "Riders appear here once they sign up."} />
            ) : (
              <EmptyState
                icon={<IconBike />}
                title={reasonTitle(reason ?? "unconfigured", "Riders")}
                line={reasonLine(reason ?? "unconfigured", "riders")}
              />
            )
          }
        />
        {riders && riders.length >= 100 ? (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
            Showing the latest 100 riders — older records aren&apos;t listed. Filter to narrow the view.
          </div>
        ) : null}
      </section>
    </main>
  );
}

/** KYC-queue row action: inline reason-less Approve (KycApproveButton) + a Review link to the
 *  doc-review screen where the reason-coded decline + document compare live. */
function KycAction({ r }: { r: Rider }) {
  if (r.kycStatus !== "pending") {
    return (
      <a href={`/riders/${r.profileId}/kyc`} style={{ color: "var(--accent-text)", textDecoration: "none" }}>
        Review
      </a>
    );
  }
  return (
    <span style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
      <KycApproveButton profileId={r.profileId} />
      <a className="btn ghost" href={`/riders/${r.profileId}/kyc`}>
        Review
      </a>
    </span>
  );
}
