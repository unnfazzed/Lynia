"use client";

import { useEffect } from "react";
import { IconAlert } from "./components/icons";

/**
 * UX21-01: this console had zero `error.tsx`/`global-error.tsx` anywhere — any render/action error not
 * already caught by a `ConfirmModal`/`AcknowledgeButton`-style inline handler fell through to Next's
 * generic unstyled crash screen (no sidebar, no order/rider context, no in-place retry). This is the
 * structural backstop for the segments below the root layout; the Sidebar shell (`layout.tsx`) stays
 * mounted, so the operator never loses navigation. `global-error.tsx` is unnecessary here — a failure in
 * `layout.tsx` itself (the sidebar/nav-counts fetch) is a live-monitoring-surface outage class already
 * handled by `adminFetch`'s own null-on-failure contract, not a render throw.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="content">
      <div className="offline-banner" role="alert">
        <IconAlert />
        <span>
          <b>Something went wrong.</b> {error.message || "This page hit an unexpected error."} Try again, or use the
          sidebar to go elsewhere.
        </span>
      </div>
      <button type="button" className="btn solid" style={{ marginTop: 12 }} onClick={reset}>
        Try again
      </button>
    </main>
  );
}
