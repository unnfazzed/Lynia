"use client";

import { useCallback, useEffect, useState } from "react";
import type { MerchantHours, MerchantProfileResponse } from "@lynia/shared";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { RetryableError } from "../../components/RetryableError";
import { cardStyle, ghostButtonStyle, primaryButtonStyle } from "../../components/queue/styles";
import { ApiError, isSessionExpiredError } from "../../lib/api-client";
import { DAY_KEYS, DAY_LABELS, isValidWindow, rightNowStatus, type DayKey, type PartialMerchantHours } from "../../lib/hours";
import { getMerchantProfile, setBusyMode, updateHours } from "../../lib/menu-api";
import { useNow } from "../../lib/use-now";

type LoadState = { status: "loading" } | { status: "ready"; profile: MerchantProfileResponse } | { status: "error"; message: string };

const DEFAULT_WINDOW = { open: "09:00", close: "21:00" };

export default function HoursPage() {
  const { actionsDisabled, signOut } = useKitchenConnection();
  const now = useNow(60_000);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [draft, setDraft] = useState<PartialMerchantHours>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySaving, setBusySaving] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setState({ status: "loading" });
    getMerchantProfile()
      .then((profile) => {
        setState({ status: "ready", profile });
        setDraft(profile.hours ?? {});
      })
      .catch((err: unknown) => {
        if (isSessionExpiredError(err)) {
          signOut();
          return;
        }
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your hours." });
      });
  }, [signOut]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function toggleDay(day: DayKey) {
    setDraft((prev) => {
      const next = { ...prev };
      if (next[day]) delete next[day];
      else next[day] = { ...DEFAULT_WINDOW };
      return next;
    });
  }

  function setWindowField(day: DayKey, field: "open" | "close", value: string) {
    setDraft((prev) => ({ ...prev, [day]: { ...(prev[day] ?? DEFAULT_WINDOW), [field]: value } }));
  }

  const allValid = DAY_KEYS.every((d) => !draft[d] || isValidWindow(draft[d]!));

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      // draft is genuinely partial (absent day = closed) — MerchantHours' zod .record() schema
      // validates that shape at runtime; only its TS inference collapses to a full Record (see
      // PartialMerchantHours's own doc comment in lib/hours.ts).
      const profile = await updateHours({ hours: draft as MerchantHours });
      setState({ status: "ready", profile });
    } catch (err) {
      if (isSessionExpiredError(err)) {
        signOut();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleBusy() {
    if (state.status !== "ready") return;
    setBusySaving(true);
    setBusyError(null);
    try {
      const profile = await setBusyMode({ active: !state.profile.busy });
      setState({ status: "ready", profile });
    } catch (err) {
      // LC-D04: this used to have no catch at all — a dropped connection mid-tap left the button
      // re-enabled with zero indication anything failed, so busy mode silently stayed off during
      // exactly the slammed-kitchen moment it exists for.
      if (isSessionExpiredError(err)) {
        signOut();
        return;
      }
      setBusyError(err instanceof ApiError ? err.message : "Couldn't update busy mode — try again.");
    } finally {
      setBusySaving(false);
    }
  }

  const disabled = actionsDisabled || saving;

  return (
    <Kitchen active="hours">
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18, overflow: "auto", height: "100%" }}>
        {state.status === "loading" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading your hours…</div>}

        {state.status === "error" && <RetryableError message={state.message} onRetry={refresh} />}

        {state.status === "ready" && (
          <>
            <div>
              <div style={{ fontSize: 21, fontWeight: 800 }}>Opening hours</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Customers can browse when you&apos;re closed, but can&apos;t order.</div>
            </div>

            <div style={{ display: "flex", gap: 18 }}>
              <div style={{ ...cardStyle, flex: 1, padding: "4px 18px" }}>
                {DAY_KEYS.map((day) => {
                  const window = draft[day];
                  const on = !!window;
                  const invalid = on && !isValidWindow(window!);
                  return (
                    <div key={day} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                      <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{DAY_LABELS[day]}</span>
                      {on ? (
                        <>
                          <input
                            type="time"
                            value={window!.open}
                            onChange={(e) => setWindowField(day, "open", e.target.value)}
                            disabled={disabled}
                            style={timeInputStyle}
                          />
                          <span style={{ color: "var(--muted)" }}>–</span>
                          <input
                            type="time"
                            value={window!.close}
                            onChange={(e) => setWindowField(day, "close", e.target.value)}
                            disabled={disabled}
                            style={timeInputStyle}
                          />
                        </>
                      ) : (
                        <span style={{ fontSize: 15, color: "var(--muted)" }}>Closed</span>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleDay(day)}
                        disabled={disabled}
                        aria-label={`${on ? "Close" : "Open"} on ${DAY_LABELS[day]}`}
                        style={{ width: 44, height: 26, borderRadius: 999, background: on ? "var(--accent)" : "var(--line)", position: "relative", border: "none", cursor: "pointer", flexShrink: 0 }}
                      >
                        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff" }} />
                      </button>
                      {invalid && <span style={{ fontSize: 11.5, color: "var(--danger-ink)", whiteSpace: "nowrap" }}>Start before end</span>}
                    </div>
                  );
                })}

                {error && <div style={{ fontSize: 13, color: "var(--danger-ink)", marginTop: 12, fontWeight: 700 }}>{error}</div>}

                <div style={{ padding: "16px 0 4px" }}>
                  <button
                    type="button"
                    disabled={disabled || !allValid}
                    onClick={onSave}
                    style={{ ...primaryButtonStyle, opacity: disabled || !allValid ? 0.5 : 1 }}
                  >
                    {saving ? "Saving…" : "Save hours"}
                  </button>
                </div>
              </div>

              <div style={{ width: 300, flexShrink: 0 }}>
                <div style={{ ...cardStyle, marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>RIGHT NOW</div>
                  {(() => {
                    const right = rightNowStatus(state.profile.hours, new Date(now));
                    return (
                      <div style={{ fontSize: 17, fontWeight: 700, color: right.open ? "var(--accent-text)" : "var(--muted)" }}>{right.label}</div>
                    );
                  })()}
                </div>

                <div style={cardStyle}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Busy mode</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, marginBottom: 12 }}>
                    Adds 10 minutes to every new order&apos;s prep time. Kitchens reject orders when they&apos;re slammed —
                    this keeps the order and tells the customer the truth instead.
                  </div>
                  <button
                    type="button"
                    disabled={actionsDisabled || busySaving}
                    onClick={onToggleBusy}
                    style={{
                      ...ghostButtonStyle,
                      width: "100%",
                      opacity: actionsDisabled || busySaving ? 0.5 : 1,
                      ...(state.profile.busy ? { color: "var(--highlight-ink)", borderColor: "var(--highlight-border)", background: "var(--highlight-wash)" } : {}),
                    }}
                  >
                    {state.profile.busy ? "Busy mode is ON · turn off" : "Turn on busy mode · +10 min"}
                  </button>
                  {busyError && <div style={{ fontSize: 12.5, color: "var(--danger-ink)", marginTop: 10, fontWeight: 700 }}>{busyError}</div>}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Kitchen>
  );
}

const timeInputStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  color: "var(--ink)",
};
