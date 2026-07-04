import type { ReactNode } from "react";

/** KPI tile — the kit's `.card.kpi` (label / big tabular value / hint). `size` shrinks the value for
 *  the denser detail-page stat strips (kit uses 22px there vs 28px on the dashboards). */
export function KpiCard({
  label,
  value,
  hint,
  size = 28,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  size?: number;
}) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: size }}>
        {value}
      </div>
      {hint != null ? <div className="hint">{hint}</div> : null}
    </div>
  );
}
