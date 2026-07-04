import type { ReactNode } from "react";
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
 * "Not connected" banner — the real-app equivalent of the kit's offline state. Rendered when
 * `adminFetch` returns null (API_BASE_URL unset or unreachable), which is also the signal every page
 * uses to disable mutating actions.
 */
export function OfflineBanner() {
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

/** Connection indicator for the page header (● live / ○ not connected). */
export function Conn({ connected }: { connected: boolean }) {
  return <span className={connected ? "conn" : "conn off"}>{connected ? "● live" : "○ API not connected"}</span>;
}
