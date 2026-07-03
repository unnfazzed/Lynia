import React from "react";
import { Skeleton } from "./Skeleton.jsx";
import { Card } from "../core/Card.jsx";

/** A Card-shaped placeholder mirroring a list/board row (title + two meta lines). */
export function SkeletonCard() {
  return (
    <Card>
      <Skeleton width="55%" height={16} />
      <Skeleton width="80%" height={12} style={{ marginTop: "var(--space-sm)" }} />
      <Skeleton width="35%" height={12} style={{ marginTop: "var(--space-sm)" }} />
    </Card>
  );
}

/* Content-shaped loading states — the skeleton must mirror the real layout so nothing reflows
   when data lands (ship-review P1: generic card skeletons caused reflow on history, earnings
   and the §5c stepper screens). */
function StepperSkeleton({ steps = 7 }) {
  return (
    <Card>
      {Array.from({ length: steps }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 26 }}>
            <Skeleton width={22} height={22} radius={11} />
            {i < steps - 1 ? <div style={{ width: 2, height: 16, background: "var(--surface)" }} /> : null}
          </div>
          <div style={{ flex: 1, paddingLeft: "var(--space-sm)", paddingBottom: i < steps - 1 ? "var(--space-md)" : 0 }}>
            <Skeleton width={`${45 + ((i * 13) % 30)}%`} height={13} />
          </div>
        </div>
      ))}
    </Card>
  );
}

function SummarySkeleton() {
  return (
    <Card style={{ background: "var(--accent-wash)", border: "1px solid transparent" }}>
      <Skeleton width="40%" height={12} style={{ background: "#cfeeda" }} />
      <Skeleton width="55%" height={28} style={{ marginTop: "var(--space-sm)", background: "#cfeeda" }} />
      <Skeleton width="30%" height={12} style={{ marginTop: "var(--space-sm)", background: "#cfeeda" }} />
    </Card>
  );
}

/**
 * Content-shaped loading placeholders.
 * variant="card"    — N list/board cards (default)
 * variant="row"     — N row-with-value rows (trip history, earnings rows)
 * variant="stepper" — the §5c journey timeline shape (count = steps, default 7)
 * variant="summary" — one tall accent summary block (earnings total)
 */
export function SkeletonList({ count, variant = "card" }) {
  if (variant === "stepper") {
    return (
      <div aria-label="Loading" aria-busy="true">
        <StepperSkeleton steps={count ?? 7} />
      </div>
    );
  }
  if (variant === "summary") {
    return (
      <div aria-label="Loading" aria-busy="true">
        <SummarySkeleton />
      </div>
    );
  }
  const n = count ?? (variant === "row" ? 4 : 3);
  return (
    <div aria-label="Loading" aria-busy="true">
      {Array.from({ length: n }, (_, i) =>
        variant === "row" ? (
          <Card key={i}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1, paddingRight: "var(--space-sm)" }}>
                <Skeleton width="70%" height={14} />
                <Skeleton width="90%" height={12} style={{ marginTop: "var(--space-sm)" }} />
              </div>
              <Skeleton width={48} height={16} />
            </div>
          </Card>
        ) : (
          <SkeletonCard key={i} />
        ),
      )}
    </div>
  );
}
