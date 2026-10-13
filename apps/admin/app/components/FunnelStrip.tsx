import type { FunnelKind, FunnelRange, FunnelStep } from "../lib/adminTypes";
import { fmtDayMonth, fmtMedian } from "../lib/format";

/**
 * Admin console v2 §4: one happy-path funnel as a strip of step tiles (undrawn; route (b), D-106). Each tile is
 * a KPI tile in miniature — the step, how many reached it, a meter of the share of the cohort, the conversion
 * from the step before and the median time it took — and links to the stuck list of the people who didn't
 * reach it. A step whose data only starts with PR 2 says "since <day>". Server component.
 */

/** "13 Oct" from a Harare day "2026-10-13" (noon UTC, so no zone can move it a day). */
function dayLabel(day: string): string {
  return fmtDayMonth(`${day}T12:00:00Z`);
}

export function stuckHref(kind: FunnelKind, range: FunnelRange, list: string): string {
  return `/people?kind=${kind}&range=${range}&list=${list}#stuck`;
}

export function FunnelStrip({
  kind,
  range,
  steps,
  compact = false,
  label,
}: {
  kind: FunnelKind;
  range: FunnelRange;
  steps: FunnelStep[];
  compact?: boolean;
  /** Accessible name for the list. */
  label: string;
}) {
  return (
    <ol className={compact ? "funnel compact" : "funnel"} aria-label={label}>
      {steps.map((s, i) => {
        const since = s.since ?? s.timesSince;
        const hint = [
          i === 0 ? null : s.conversionPct != null ? `${s.conversionPct}%` : "—",
          i > 0 && s.medianMs != null ? fmtMedian(s.medianMs) : null,
        ]
          .filter(Boolean)
          .join(" · ");
        const sinceTitle = since
          ? s.since
            ? `Counted only from ${dayLabel(s.since)}`
            : `Times measured only from ${dayLabel(since)}`
          : undefined;
        const body = (
          <>
            <span className="label">{s.label}</span>
            <span className="value">{s.count}</span>
            <span className="meter" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, s.pctOfCohort ?? 0))}%` }} />
            </span>
            <span className="hint">{hint || " "}</span>
            {since ? (
              <span className="since" title={sinceTitle}>
                since {dayLabel(since)}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={s.key}>
            {s.stuckList ? (
              <a
                className="funnel-step"
                href={stuckHref(kind, range, s.stuckList)}
                aria-label={`${s.label}: ${s.count}${hint ? ` (${hint})` : ""}. See who is stuck.`}
              >
                {body}
              </a>
            ) : (
              <div className="funnel-step">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
