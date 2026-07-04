/** Loading-state skeletons — the fourth screen state (kit `AdminShell.skelRows`). Used by the
 *  route-level loading.tsx files that Next renders while a server component's data resolves. */

export function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <table className="data">
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c}>
                <span className="skel">{"—".repeat(c === 1 ? 8 : 4)}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PageSkeleton({ title, cols }: { title: string; cols: number }) {
  return (
    <main className="content">
      <header className="page">
        <h1>{title}</h1>
        <span className="conn off">○ connecting</span>
      </header>
      <section className="card">
        <SkeletonRows cols={cols} />
      </section>
    </main>
  );
}
