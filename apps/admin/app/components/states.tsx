import type { ReactNode } from "react";
import type { AdminReason } from "../lib/api";
import { IconWifiOff } from "./icons";

/** Empty state — the kit's `.empty` (icon / bold title / muted line). */
export function EmptyState({ icon, title, line }: { icon: ReactNode; title: ReactNode; line: ReactNode }) {
  return (
    <div className="empty">
      <span style={{ display: "inline-flex", fontSize: 26 }}>{icon}</span>
      <b>{title}</b>
      {line}
    </div>
  );
}

/**
 * Diagnostic banner shown when a read produced no data. The copy matches WHY (QA D-3): an unset
 * `API_BASE_URL` is the demo/offline path; an unreachable API is an outage; a 404 means the endpoint
 * simply hasn't shipped even though the API is healthy — so the operator isn't told to "connect the
 * console" when it already is. Defaults to `unconfigured` for legacy callers.
 */
export function OfflineBanner({ reason = "unconfigured" }: { reason?: AdminReason }) {
  if (reason === "not-implemented") {
    return (
      <div className="offline-banner">
        <IconWifiOff />
        <span>
          <b>This section isn&apos;t available yet.</b> The API is connected, but this endpoint hasn&apos;t shipped. It
          will show live data once the endpoint lands; actions here stay disabled until then.
        </span>
      </div>
    );
  }
  if (reason === "unreachable") {
    return (
      <div className="offline-banner">
        <IconWifiOff />
        <span>
          <b>API unreachable.</b> The console can&apos;t reach <span className="mono">API_BASE_URL</span>. Live data and
          actions are unavailable until the connection recovers.
        </span>
      </div>
    );
  }
  if (reason === "error") {
    return (
      <div className="offline-banner">
        <IconWifiOff />
        <span>
          <b>API error.</b> The endpoint returned an unexpected error. Live data and actions are unavailable until it
          recovers.
        </span>
      </div>
    );
  }
  // unconfigured — the demo/offline path
  return (
    <div className="offline-banner">
      <IconWifiOff />
      <span>
        <b>API not connected.</b> Set <span className="mono">API_BASE_URL</span> (and{" "}
        <span className="mono">ADMIN_API_TOKEN</span>) to show live data. Actions are disabled until the console is
        connected.
      </span>
    </div>
  );
}

/** The "○ …" label for a disconnected header pill, matched to the failure reason. */
export function connOffLabel(reason?: AdminReason): string {
  return reason === "not-implemented"
    ? "○ not available yet"
    : reason === "unreachable"
      ? "○ API unreachable"
      : reason === "error"
        ? "○ API error"
        : "○ API not connected";
}

/** Connection indicator for the page header (● live / ○ reason). */
export function Conn({ connected, reason }: { connected: boolean; reason?: AdminReason }) {
  if (connected) return <span className="conn">● live</span>;
  return <span className="conn off">{connOffLabel(reason)}</span>;
}

/** Empty-state title for a failed read: "not available yet" for a 404, "not connected" otherwise. */
export function reasonTitle(reason: AdminReason, subject: string): string {
  return reason === "not-implemented" ? `${subject} not available yet` : `${subject} not connected`;
}

/** Empty-state line matching the failure reason. `noun` completes "… to load {noun}". */
export function reasonLine(reason: AdminReason, noun: string): string {
  switch (reason) {
    case "not-implemented":
      return `This endpoint hasn't shipped yet — ${noun} will load once it lands.`;
    case "unreachable":
      return `The API is unreachable — ${noun} can't be loaded right now.`;
    case "error":
      return `The API returned an error while loading ${noun}.`;
    default:
      return `Set API_BASE_URL (and ADMIN_API_TOKEN) to load ${noun}.`;
  }
}
