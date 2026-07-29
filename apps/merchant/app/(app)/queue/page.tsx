"use client";

import { useEffect, useState } from "react";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { ApiError, getMyMerchant, type MerchantProfile } from "../../lib/api-client";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; merchant: MerchantProfile }
  | { status: "not-a-merchant" }
  | { status: "error"; message: string };

/**
 * The queue landing screen (M1·1 in the gallery). E1 scope: prove the authenticated shell, alarm,
 * and reconnect discipline work end-to-end. The real order queue (accept/reject, prep chips, the
 * NEW ORDER takeover) is E2's job — this is deliberately the resting/empty state only.
 */
export default function QueuePage() {
  const { alarm, signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
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

  return (
    <Kitchen active="queue">
      <div style={{ padding: 20 }}>
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

        {state.status === "error" && (
          <div
            style={{
              background: "var(--danger-wash)",
              color: "var(--danger-ink)",
              borderRadius: 16,
              padding: 20,
              maxWidth: 480,
            }}
          >
            {state.message}
          </div>
        )}

        {state.status === "ready" && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>{state.merchant.name}</div>
            </div>
            <div
              style={{
                background: "var(--bg)",
                borderRadius: 16,
                boxShadow: "var(--shadow-card)",
                padding: "16px 20px 26px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 700 }}>No orders right now</div>
              <div style={{ fontSize: 13.5, color: "var(--muted)", maxWidth: 380 }}>
                {alarm.muted
                  ? "The alarm is muted — you won't hear new orders arrive."
                  : "The alarm is armed — you'll hear it before you see it."}
              </div>
              <button type="button" onClick={alarm.testRing} style={ghostButtonStyle}>
                Play the alarm to test it
              </button>
            </div>
            <div style={{ marginTop: 24 }}>
              <button type="button" onClick={signOut} style={ghostButtonStyle}>
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
