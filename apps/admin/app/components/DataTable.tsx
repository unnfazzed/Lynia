import type { ReactNode } from "react";

/**
 * The console's workhorse table — the `table.data` pattern from the kit (13px body, muted 12px
 * header, hairline top-rules, `.mono`/`.num`/`.mut` cell classes). Server component: generic over
 * columns + rows, no client JS.
 *
 * Row navigation uses the CSS stretched-link trick (`.row-stretch` over a positioned `tr.rowlink`)
 * so a whole row is clickable without an onClick handler — keeps the table a server component.
 */
export interface Column<T> {
  /** Stable key + default header text source. */
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Space-separated cell classes, e.g. "mono", "num", "num mut". */
  className?: string;
  align?: "right";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** When set, each row becomes a full-row link to this href. */
  getRowHref?: (row: T) => string;
  rowLabel?: (row: T) => string;
  /** Rendered as a single full-width row when `rows` is empty. */
  empty?: ReactNode;
}

export function DataTable<T>({ columns, rows, rowKey, getRowHref, rowLabel, empty }: DataTableProps<T>) {
  return (
    <table className="data">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={c.align === "right" ? { textAlign: "right" } : undefined}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} style={{ padding: 0 }}>
              {empty ?? <div className="empty">Nothing here yet.</div>}
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const href = getRowHref?.(row);
            return (
              <tr key={rowKey(row)} className={href ? "rowlink" : undefined}>
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={c.className}
                    style={c.align === "right" ? { textAlign: "right" } : undefined}
                  >
                    {href && ci === 0 ? (
                      <a className="row-stretch" href={href} aria-label={rowLabel?.(row) ?? "View details"} />
                    ) : null}
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
