"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Kitchen } from "../../components/Kitchen";
import { QueueBoard } from "../../components/queue/QueueBoard";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { RetryableError } from "../../components/RetryableError";
import { ApiError, getMyMerchant, type MerchantProfile } from "../../lib/api-client";
import { useQueuePoll } from "../../lib/use-queue-poll";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; merchant: MerchantProfile }
  | { status: "not-a-merchant" }
  | { status: "error"; message: string };

/**
 * The queue landing screen (M1·1 in the gallery), now the live kitchen board (E2). Polls
 * `GET /merchant/orders` (Lane C5's realtime socket hasn't merged yet — see useQueuePoll's own
 * doc comment) and renders the NEW ORDER takeover / board / list via QueueBoard.
 */
export default function QueuePage() {
  const { alarm, actionsDisabled, reachability, signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadMerchant = useCallback(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getMyMerchant()
      .then((merchant) => {
        if (!cancelled) setState({ status: "ready", merchant });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setState({ status: "not-a-merchant" });
        } else if (err instanceof ApiError) {
          setState({ status: "error", message: err.message });
        } else {
          setState({ status: "error", message: "Something went wrong loading your kitchen." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => loadMerchant(), [loadMerchant]);

  // LC-D##: before this, a single dropped /merchant/me call at mount left the merchant permanently
  // stuck on the error screen below — useQueuePoll(state.status === "ready") never starts, so the
  // whole order poll + alarm loop never armed, even once the network fully recovered, since nothing
  // re-triggered this load on reconnect. This is the highest-severity page for that gap (it's the
  // alarm loop itself), so it gets an automatic retry the instant reachability flips back to true
  // on top of the manual Retry button below; the other four merchant pages get the manual button
  // only. Deliberately keyed on reachability.reachable alone (not state.status) — this exists only
  // to catch "recovered from an outage while stuck," not to loop on every render.
  useEffect(() => {
    if (state.status === "error" && reachability.reachable) loadMerchant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachability.reachable]);

  const { orders, error: queueError, refetch } = useQueuePoll(state.status === "ready");

  // D-05: rings the whole time ANY order is unanswered, stops the instant none are (the takeover's
  // own accept/reject handlers call refetch() immediately on success, so this doesn't wait a full
  // poll interval to go quiet).
  const unansweredCount = orders.filter((o) => o.merchantPhase === "awaiting_accept").length;
  useEffect(() => {
    if (unansweredCount > 0) alarm.ring();
    else alarm.silence();
  }, [unansweredCount, alarm]);

  // A definitively-dead session (authedFetch's refresh already failed) sends the merchant back to
  // /login, mirroring the E1 shell's own top-level handling.
  useEffect(() => {
    if (queueError?.status === 401) signOut();
  }, [queueError, signOut]);

  // §3 reconnect: name the backfilled order count in the "back online" banner. Snapshots the known
  // order ids the moment reachability drops, diffs against the first post-reconnect fetch.
  const preOutageIdsRef = useRef<Set<string> | null>(null);
  const wasReachableRef = useRef(true);
  const [backfillCount, setBackfillCount] = useState(0);
  useEffect(() => {
    const reachableNow = reachability.reachable;
    if (wasReachableRef.current && !reachableNow) {
      preOutageIdsRef.current = new Set(orders.map((o) => o.id));
    }
    if (!wasReachableRef.current && reachableNow) {
      const before = preOutageIdsRef.current;
      setBackfillCount(before ? orders.filter((o) => !before.has(o.id)).length : 0);
      preOutageIdsRef.current = null;
    }
    wasReachableRef.current = reachableNow;
  }, [reachability.reachable, orders]);

  return (
    <Kitchen active="queue" backfillCount={backfillCount}>
      <div style={{ padding: 20, height: "100%", display: "flex", flexDirection: "column" }}>
        {state.status === "loading" && (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading your kitchen…</div>
        )}

        {state.status === "not-a-merchant" && (
          <div
            style={{
              background: "var(--bg)",
              borderRadius: 16,
              boxShadow: "var(--shadow-card)",
              padding: 24,
              maxWidth: 480,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>This number isn't set up as a merchant yet</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
              This phone signs in fine, but it isn't linked to a kitchen. Contact LyniaGo support to get your
              restaurant set up before using this tablet.
            </div>
            <button type="button" onClick={signOut} style={signOutButtonStyle}>
              Sign out
            </button>
          </div>
        )}

        {state.status === "error" && <RetryableError message={state.message} onRetry={loadMerchant} />}

        {state.status === "ready" && (
          <>
            <div style={{ marginBottom: 14, display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>{state.merchant.name}</div>
              {queueError && queueError.status !== 401 && (
                <div style={{ fontSize: 12.5, color: "var(--danger-ink)" }}>{queueError.message}</div>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
              <QueueBoard orders={orders} disabled={actionsDisabled} refetch={refetch} />
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="button" onClick={alarm.testRing} style={ghostButtonStyle}>
                Play the alarm to test it
              </button>
              <button type="button" onClick={signOut} style={{ ...ghostButtonStyle, marginLeft: 10 }}>
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </Kitchen>
  );
}

const ghostButtonStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  color: "var(--accent-text)",
  background: "var(--bg)",
  border: "1px solid var(--line)",
  borderRadius: 999,
  padding: "10px 18px",
  cursor: "pointer",
};

const signOutButtonStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  color: "#fff",
  background: "var(--cta-fill)",
  border: "none",
  borderRadius: 999,
  padding: "10px 18px",
  cursor: "pointer",
};
