import type { ReactNode } from "react";

export interface KeyValueRow {
  label: ReactNode;
  value: ReactNode;
}

/** Definition-list detail block — the kit's `dl.kv` (130px muted label column + value). */
export function KeyValue({ rows }: { rows: KeyValueRow[] }) {
  return (
    <dl className="kv">
      {rows.map((r, i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
