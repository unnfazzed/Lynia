import { adminFetchResult } from "../lib/api";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { DataTable, type Column } from "../components/DataTable";
import { FilterNav } from "../components/FilterNav";
import { Pill } from "../components/StatusPill";
import { IconBike } from "../components/icons";
import { setKyc } from "./actions";
import { KycSubmitButton } from "./KycSubmitButton";

interface Rider {
  profileId: string;
  name: string;
  phone: string;
  bikeReg: string;
  kycStatus: "pending" | "verified" | "failed" | "expired";
  idVerified: boolean;
  isOnline: boolean;
  accountStatus: "active" | "suspended" | "banned" | "on_hold";
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
  if (r.accountStatus === "on_hold") return <Pill kind="bad">on hold</Pill>;
  if (r.cooldownUntil) return <Pill kind="mut">cooldown</Pill>;
  if (r.isOnline) return <Pill kind="good">online</Pill>;
  return <Pill kind="mut">offline</Pill>;
}

function kycPill(s: Rider["kycStatus"]) {
  if (s === "verified") return <Pill kind="good">verified</Pill>;
  if (s === "failed" || s === "expired") return <Pill kind="bad">{s}</Pill>;
  return <Pill kind="mut">pending</Pill>;
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

  const directoryColumns: Column<Rider>[] = [
    { key: "name", header: "Rider", cell: riderName },
    { key: "phone", header: "Phone", className: "mono", cell: (r) => r.phone },
    { key: "bike", header: "Bike", cell: (r) => r.bikeReg },
    { key: "standing", header: "Standing", cell: standingPill },
    { key: "kyc", header: "KYC", cell: (r) => kycPill(r.kycStatus) },
    { key: "trips", header: "Trips / rating", className: "num", cell: (r) => `${r.tripsCount} / ${r.ratingCount > 0 ? r.ratingAvg.toFixed(1) : "—"}` },
    {
      key: "strikes",
      header: "Strikes",
      className: "num",
      cell: (r) => (r.cancelStrikes > 0 ? `${r.cancelStrikes} strike${r.cancelStrikes === 1 ? "" : "s"}` : "—"),
    },
  ];

  const kycColumns: Column<Rider>[] = [
    { key: "name", header: "Rider", cell: riderName },
    { key: "phone", header: "Phone", className: "mono", cell: (r) => r.phone },
    { key: "bike", header: "Bike", cell: (r) => r.bikeReg },
    { key: "kyc", header: "KYC", cell: (r) => kycPill(r.kycStatus) },
    { key: "trips", header: "Trips / rating", className: "num", cell: (r) => `${r.tripsCount} / ${r.ratingCount > 0 ? r.ratingAvg.toFixed(1) : "—"}` },
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

/** KYC-queue row action: inline reason-less Approve (form → setKyc) + a Review link to the doc-review
 *  screen where the reason-coded decline + document compare live. */
function KycAction({ r }: { r: Rider }) {
  if (r.kycStatus !== "pending") {
    return (
      <a href={`/riders/${r.profileId}/kyc`} style={{ color: "var(--accent-text)", textDecoration: "none" }}>
        Review
      </a>
    );
  }
  return (
    <span style={{ display: "flex", gap: 6 }}>
      <form action={setKyc} style={{ display: "inline" }}>
        <input type="hidden" name="profileId" value={r.profileId} />
        <input type="hidden" name="status" value="verified" />
        <KycSubmitButton label="Approve" solid />
      </form>
      <a className="btn ghost" href={`/riders/${r.profileId}/kyc`}>
        Review
      </a>
    </span>
  );
}
