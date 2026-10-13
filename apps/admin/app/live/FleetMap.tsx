import type { Fleet } from "../lib/adminTypes";
import { shortId, timeAgo } from "../lib/format";
import { layoutFleet, MAP_H, MAP_W } from "./fleet-map";

/**
 * Admin console v2 §7 — the live map (undrawn; route (b), D-106). Bikers online and active orders' pins on a
 * plain box drawn to scale (no street tiles: the admin app has no Maps key). Kit tokens only. Bikers link to
 * their page, pins to the order. Server component: the page's AutoRefresh redraws it.
 */
const PIN = 9;

function BikerMark({ fresh, onJob }: { fresh: boolean; onJob: boolean }) {
  const ink = fresh ? "var(--accent-text)" : "var(--muted)";
  return <circle r={6} fill={onJob ? ink : "var(--bg)"} stroke={ink} strokeWidth={2} />;
}

function PinMark({ kind, late }: { kind: "pickup" | "dropoff"; late: boolean }) {
  const ink = late ? "var(--danger)" : "var(--ink)";
  return (
    <rect
      x={-PIN / 2}
      y={-PIN / 2}
      width={PIN}
      height={PIN}
      rx={2}
      fill={kind === "pickup" ? ink : "var(--bg)"}
      stroke={ink}
      strokeWidth={2}
    />
  );
}

export function FleetMap({ fleet }: { fleet: Fleet }) {
  const { bikers, orders, unplaced } = layoutFleet(fleet);
  const empty = bikers.length === 0 && orders.length === 0;
  return (
    <figure style={{ margin: 0 }}>
      <svg
        className="live-map"
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        role="img"
        aria-label={`${bikers.length} bikers and ${orders.length} active orders, drawn to scale`}
      >
        {empty ? (
          <text x={MAP_W / 2} y={MAP_H / 2} textAnchor="middle" fill="var(--muted)" fontSize={13}>
            Nothing to show yet
          </text>
        ) : null}
        {orders.map((o) =>
          o.pickup && o.dropoff ? (
            <line key={`l-${o.orderId}`} x1={o.pickup.x} y1={o.pickup.y} x2={o.dropoff.x} y2={o.dropoff.y} stroke="var(--line)" strokeWidth={2} />
          ) : null,
        )}
        {orders.map((o) => (
          <a key={`o-${o.orderId}`} href={`/orders/${o.orderId}`}>
            {o.pickup ? (
              <g transform={`translate(${o.pickup.x} ${o.pickup.y})`}>
                <title>{`${shortId(o.orderId)} pickup${o.breach === "breach" ? " · past the time limit" : ""}`}</title>
                <PinMark kind="pickup" late={o.breach === "breach"} />
              </g>
            ) : null}
            {o.dropoff ? (
              <g transform={`translate(${o.dropoff.x} ${o.dropoff.y})`}>
                <title>{`${shortId(o.orderId)} drop-off${o.breach === "breach" ? " · past the time limit" : ""}`}</title>
                <PinMark kind="dropoff" late={o.breach === "breach"} />
              </g>
            ) : null}
          </a>
        ))}
        {bikers.map((b) => (
          <a key={`b-${b.riderId}`} href={`/riders/${b.riderId}`}>
            <g transform={`translate(${b.x} ${b.y})`}>
              <title>{`${b.name}${b.onJob ? " · on a job" : ""} · ${b.at ? timeAgo(b.at) : "time unknown"}`}</title>
              <BikerMark fresh={b.fresh} onJob={b.onJob} />
            </g>
          </a>
        ))}
      </svg>
      <figcaption className="live-legend">
        <span>
          <svg viewBox="-7 -7 14 14" aria-hidden="true">
            <BikerMark fresh onJob={false} />
          </svg>
          Biker, free
        </span>
        <span>
          <svg viewBox="-7 -7 14 14" aria-hidden="true">
            <BikerMark fresh onJob />
          </svg>
          Biker on a job
        </span>
        <span>
          <svg viewBox="-7 -7 14 14" aria-hidden="true">
            <BikerMark fresh={false} onJob={false} />
          </svg>
          No fix for 2 min
        </span>
        <span>
          <svg viewBox="-7 -7 14 14" aria-hidden="true">
            <PinMark kind="pickup" late={false} />
          </svg>
          Pickup
        </span>
        <span>
          <svg viewBox="-7 -7 14 14" aria-hidden="true">
            <PinMark kind="dropoff" late={false} />
          </svg>
          Drop-off
        </span>
        <span>
          <svg viewBox="-7 -7 14 14" aria-hidden="true">
            <PinMark kind="pickup" late />
          </svg>
          Past the time limit
        </span>
        {unplaced > 0 ? <span>{unplaced === 1 ? "1 biker has" : `${unplaced} bikers have`} no position yet</span> : null}
      </figcaption>
    </figure>
  );
}
