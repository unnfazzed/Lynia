import { formatPhoneLocal } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { DataTable, type Column } from "../components/DataTable";
import { FilterNav } from "../components/FilterNav";
import { Pill } from "../components/StatusPill";
import { IconBike } from "../components/icons";
import { KycApproveButton } from "./KycSubmitButton";
import { PlateConfirmButton } from "./PlateConfirm";

interface Rider {
  profileId: string;
  name: string;
  phone: string;
  bikeReg: string;
  /** First Run v2 E4 (D-82): ops' check of the plate. Absent on older APIs. */
  plateStatus?: "none" | "checking" | "verified";
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
/** First Run v2 E4 (D-82): the directory vs the plate review queue (`?plate=checking`). */
const PLATE_TABS = [
  { value: "all", label: "all riders" },
  { value: "checking", label: "plates to check" },
] as const;

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
  const sp = await searchParams;
  const raw = sp.kyc;
  // Plate-review mode (First Run v2 E4, D-82): plates riders added or changed, waiting on ops.
  const plateMode = typeof raw !== "string" && sp.plate === "checking";
  // KYC-queue mode when a (valid) ?kyc= filter is present; otherwise the full rider DIRECTORY.
  const kycMode = typeof raw === "string" && (KYC_TABS as readonly string[]).includes(raw);
  const kycFilter = kycMode ? (raw as string) : "";
  const query = kycMode && kycFilter !== "all" ? `?kyc=${kycFilter}` : plateMode ? "?plate=checking" : "";
  const res = await adminFetchResult<Rider[]>(`/admin/riders${query}`);
  const riders = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = riders !== null;

  // Column set + ORDER follow the kit's directory table (riders.html `<thead>`): Rider · Phone · Bike ·
  // KYC · Trips / rating · Strikes · Status — standing is the row's verdict, so it reads last.
  const directoryColumns: Column<Rider>[] = [
    { key: "name", header: "Rider", cell: riderName },
    { key: "phone", header: "Phone", className: "mono", cell: (r) => formatPhoneLocal(r.phone) },
    { key: "bike", header: "Bike", className: "mono", cell: (r) => r.bikeReg },
    { key: "kyc", header: "KYC", cell: (r) => kycPill(r.kycStatus) },
    { key: "trips", header: "Trips / rating", className: "num", cell: (r) => `${r.tripsCount} · ${ratingTxt(r)}` },
    { key: "strikes", header: "Strikes", className: "num", cell: strikesCell },
    { key: "standing", header: "Status", cell: standingPill },
  ];

  const kycColumns: Column<Rider>[] = [
    { key: "name", header: "Rider", cell: riderName },
    { key: "phone", header: "Phone", className: "mono", cell: (r) => formatPhoneLocal(r.phone) },
    // Kit's KYC queue names this column "Bike reg" (kyc.html), matching the review screen's KeyValue.
    { key: "bike", header: "Bike reg", className: "mono", cell: (r) => r.bikeReg },
    { key: "kyc", header: "KYC", cell: (r) => kycPill(r.kycStatus) },
    { key: "trips", header: "Trips / rating", className: "num", cell: (r) => `${r.tripsCount} · ${ratingTxt(r)}` },
    { key: "action", header: "Action", cell: (r) => <KycAction r={r} /> },
  ];

  const plateColumns: Column<Rider>[] = [
    { key: "name", header: "Rider", cell: riderName },
    { key: "phone", header: "Phone", className: "mono", cell: (r) => formatPhoneLocal(r.phone) },
    { key: "plate", header: "Plate", className: "mono", cell: (r) => r.bikeReg },
    { key: "kyc", header: "KYC", cell: (r) => kycPill(r.kycStatus) },
    { key: "trips", header: "Trips / rating", className: "num", cell: (r) => `${r.tripsCount} · ${ratingTxt(r)}` },
    {
      key: "action",
      header: "Action",
      cell: (r) => <PlateConfirmButton id={r.profileId} name={r.name || r.profileId.slice(0, 8)} plate={r.bikeReg} connected={connected} path="/riders" />,
    },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>{kycMode ? "Riders — KYC review" : plateMode ? "Riders — plate review" : "Riders"}</h1>
        <span className="sub">
          {kycMode
            ? "Didit verification queue — approve or review each application"
            : plateMode
              ? "Plates riders added or changed — check each against the bike, then confirm"
              : "Rider directory — standing, KYC, trips & strikes"}
        </span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      {kycMode ? (
        <FilterNav
          items={KYC_TABS.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
          active={kycFilter}
          hrefFor={(v) => `/riders?kyc=${v}`}
        />
      ) : (
        <FilterNav
          items={PLATE_TABS.map((t) => ({ value: t.value, label: t.label }))}
          active={plateMode ? "checking" : "all"}
          hrefFor={(v) => (v === "checking" ? "/riders?plate=checking" : "/riders")}
        />
      )}

      <section className="card">
        <DataTable
          columns={kycMode ? kycColumns : plateMode ? plateColumns : directoryColumns}
          rows={riders ?? []}
          rowKey={(r) => r.profileId}
          // Directory rows are pure links to the profile; KYC rows carry an inline Approve form, so no
          // stretched row-link there (it would sit under the button).
          getRowHref={kycMode || plateMode ? undefined : (r) => `/riders/${r.profileId}`}
          rowLabel={kycMode || plateMode ? undefined : (r) => `Open ${r.name || r.profileId.slice(0, 8)}`}
          empty={
            connected ? (
              plateMode ? (
                <EmptyState icon={<IconBike />} title="No plates to check" line="New and changed plates appear here until you confirm them." />
              ) : (
                <EmptyState icon={<IconBike />} title={kycMode ? "No riders in this view" : "No riders yet"} line={kycMode ? "Try a different KYC filter." : "Riders appear here once they sign up."} />
              )
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
