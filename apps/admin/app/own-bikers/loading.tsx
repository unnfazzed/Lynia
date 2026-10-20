import { OBA } from "../lib/own-bikers-copy";

/** Fleets · loading (OB-A1): the table's head over four skeleton rows. */
const WIDTHS = [70, 80, 30, 50, 50, 60, 50];

export default function Loading() {
  return (
    <main className="content ob">
      <header className="page">
        <h1>{OBA.title}</h1>
        <span className="conn off">○ connecting</span>
      </header>
      <section className="card" style={{ padding: "16px 24px" }}>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                {OBA.cols.map((c, i) => (
                  <th key={c} style={i >= 3 && i <= 5 ? { textAlign: "right" } : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((r) => (
                <tr key={r}>
                  {WIDTHS.map((w, c) => (
                    <td key={c}>
                      <span className="skel" style={{ display: "block", width: `${w}%` }}>
                        —
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
