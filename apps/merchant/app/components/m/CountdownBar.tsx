import { OBM } from "../../lib/own-bikers-copy";

/** "1:24" from milliseconds left (never below 0:00). */
export function clock(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Own bikers v1 new part 1 (handoff README "New parts"): the countdown bar. An 8 px `--line` track with an `--accent`
 * fill, radius 4, and "1:24 left" 14/700 tabular beside it. The bar is a progressbar labelled with the time.
 */
export function CountdownBar({ msLeft, totalMs }: { msLeft: number; totalMs: number }) {
  const pct = Math.round(Math.min(100, Math.max(0, (msLeft / totalMs) * 100)));
  const label = OBM.left(clock(msLeft));
  return (
    <div className="m-ob-count">
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="m-num" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
