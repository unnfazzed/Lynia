import { redirect } from "next/navigation";
import { adminFetchResult } from "../lib/api";
import type { SearchHit, SearchResults } from "../lib/adminTypes";
import { SearchBox } from "../components/SearchBox";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { IconSearch } from "../components/icons";
import { onlyHit, SEARCH_GROUPS } from "./groups";

/**
 * Search results (admin console v2 §4, route (b) D-106): the console search box's GET target. One card per group
 * that has hits; exactly one hit anywhere goes straight to that record ("Enter to go").
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const res = q.replace(/^#/, "").length >= 3 ? await adminFetchResult<SearchResults>(`/admin/search?q=${encodeURIComponent(q)}`) : null;

  if (res && "data" in res) {
    const only = onlyHit(res.data);
    if (only) redirect(only.href);
  }

  return (
    <main className="content">
      <header className="page">
        <h1>Search</h1>
        {q ? <span className="sub">“{q}”</span> : null}
        {res ? <Conn connected={"data" in res} reason={"reason" in res ? res.reason : undefined} /> : null}
      </header>
      {res && "reason" in res ? <OfflineBanner reason={res.reason} /> : null}

      {/* Phone only: the shell's search lives behind the menu there, so the results page carries a box to refine in. */}
      <section className="card phone-only" style={{ marginBottom: "var(--space-lg)" }}>
        <SearchBox id="search-page" defaultValue={q} />
      </section>

      {!res ? (
        <section className="card">
          <EmptyState icon={<IconSearch />} title="Type at least 3 characters" line="A phone, a name, an order id like #a1b2c3, or a Paynow reference." />
        </section>
      ) : "reason" in res ? (
        <section className="card">
          <EmptyState icon={<IconSearch />} title={reasonTitle(res.reason, "Search")} line={reasonLine(res.reason, "search results")} />
        </section>
      ) : res.data.total === 0 ? (
        <section className="card">
          <EmptyState icon={<IconSearch />} title="No matches" line="Try the full phone number, a last name, or the order's short id." />
        </section>
      ) : (
        <div className="detail-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
          {SEARCH_GROUPS.filter((g) => res.data.groups[g.key].length > 0).map((g) => (
            <section className="card" key={g.key}>
              <div className="block-title">
                {g.label} <span className="count">{res.data.groups[g.key].length}</span>
              </div>
              <HitList hits={res.data.groups[g.key]} />
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function HitList({ hits }: { hits: SearchHit[] }) {
  return (
    <ul className="hit-list">
      {hits.map((h) => (
        <li key={h.id}>
          <a href={h.href}>
            <b>{h.label}</b>
            <span className="mut">{h.sub}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
