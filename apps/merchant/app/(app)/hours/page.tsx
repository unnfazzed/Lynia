"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { MerchantProfileResponse } from "@lynia/shared";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { AppBar } from "../../components/m/AppBar";
import { Segmented } from "../../components/m/Segmented";
import { Switch } from "../../components/m/Switch";
import { useToast } from "../../components/m/Toast";
import { RetryableError } from "../../components/RetryableError";
import { ApiError, apiErrorMessage, redirectIfSessionExpired } from "../../lib/api-client";
import { primeBusiness } from "../../lib/business";
import {
  asSameEveryDay,
  DAY_INITIALS,
  DAY_KEYS,
  DAY_LABELS,
  fromSameEveryDay,
  isValidWindow,
  type DayKey,
  type PartialMerchantHours,
  type SameEveryDay,
} from "../../lib/hours";
import { getMerchantProfile, setBusyMode, updateHours } from "../../lib/menu-api";

type LoadState = { status: "loading" } | { status: "ready"; profile: MerchantProfileResponse } | { status: "error"; message: string };
type Mode = "same" | "per_day";

const DEFAULT_WINDOW = { open: "08:00", close: "22:00" };
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** C5 draws "08:00" as plain 24-hour text: a phone's own time picker shows "08:00 AM" and a clock in
 *  some locales, so the field takes digits and puts the colon in itself. */
function asTime(typed: string): string {
  const d = typed.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

/**
 * C5 · Opening hours (packages/design/handoff/merchant-mobile, ledger D-48): "Same every day | Per
 * day"; Open / Close time fields; days-open chips M–S; a "Busy mode (+10 min)" switch card; "Save
 * hours" pinned at the bottom, which goes back to Account with "Hours saved". "Per day" isn't drawn:
 * it is the same fields, one row per day. Staff read the hours and switch busy mode (L4).
 */
export default function HoursPage() {
  const router = useRouter();
  const toast = useToast();
  const { actionsDisabled, signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [mode, setMode] = useState<Mode>("same");
  const [same, setSame] = useState<SameEveryDay>({ window: DEFAULT_WINDOW, days: [...DAY_KEYS] });
  const [perDay, setPerDay] = useState<PartialMerchantHours>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySaving, setBusySaving] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setState({ status: "loading" });
    getMerchantProfile()
      .then((profile) => {
        setState({ status: "ready", profile });
        const hours = (profile.hours ?? null) as PartialMerchantHours | null;
        const asSame = asSameEveryDay(hours);
        setMode(asSame ? "same" : "per_day");
        if (asSame) setSame(asSame);
        setPerDay(hours ?? {});
      })
      .catch((err: unknown) => {
        if (redirectIfSessionExpired(err, signOut)) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your hours." });
      });
  }, [signOut]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const draft = mode === "same" ? fromSameEveryDay(same) : perDay;
  const allValid = DAY_KEYS.every((d) => !draft[d] || (HM.test(draft[d]!.open) && HM.test(draft[d]!.close) && isValidWindow(draft[d]!)));

  function switchMode(next: Mode) {
    // Carry what's on screen across, so switching never loses an edit.
    if (next === "per_day") setPerDay(fromSameEveryDay(same));
    else setSame(asSameEveryDay(perDay) ?? { window: perDay[DAY_KEYS.find((d) => perDay[d]) ?? "mon"] ?? DEFAULT_WINDOW, days: DAY_KEYS.filter((d) => perDay[d]) });
    setMode(next);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      // An absent day is closed; MerchantHours is a zod partialRecord, so a closed day validates.
      const profile = await updateHours({ hours: draft });
      primeBusiness(profile);
      toast("Hours saved");
      router.push("/account");
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setError(apiErrorMessage(err, "Couldn't save — try again."));
      setSaving(false);
    }
  }

  async function onToggleBusy(active: boolean) {
    if (state.status !== "ready") return;
    setBusySaving(true);
    setBusyError(null);
    try {
      const profile = await setBusyMode({ active });
      setState({ status: "ready", profile });
      primeBusiness(profile);
      toast(active ? "Busy mode on · +10 min" : "Busy mode off");
    } catch (err) {
      // LC-D04: a failed toggle must say so — busy mode exists for the slammed-kitchen moment.
      if (redirectIfSessionExpired(err, signOut)) return;
      setBusyError(apiErrorMessage(err, "Couldn't update busy mode — try again."));
    } finally {
      setBusySaving(false);
    }
  }

  const disabled = actionsDisabled || saving;
  // L4: Staff see the week and switch busy mode; the schedule is the owner's (the permission table).
  const staff = state.status === "ready" && state.profile.myRole === "staff";
  const locked = disabled || staff;

  return (
    <Kitchen active="hours" tabs={false}>
      <div className="m-page">
        <AppBar back="/account" title="Opening hours" />
        <div className="m-bd" style={{ gap: 14 }}>
          {state.status === "loading" && <div className="m-hint">Loading your hours…</div>}
          {state.status === "error" && <RetryableError message={state.message} onRetry={refresh} />}

          {state.status === "ready" && (
            <>
              {staff && <p className="m-hint">Only the owner changes the opening hours. You can turn busy mode on and off.</p>}
              <Segmented
                label="Hours"
                value={mode}
                onChange={(m) => (staff ? setMode(m) : switchMode(m))}
                options={[
                  { value: "same", label: "Same every day" },
                  { value: "per_day", label: "Per day" },
                ]}
              />

              {mode === "same" ? (
                <>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                    <TimeField label="Open" value={same.window.open} disabled={locked} onChange={(open) => setSame((s) => ({ ...s, window: { ...s.window, open } }))} />
                    <span style={{ color: "var(--muted)", fontSize: 15, paddingBottom: 16 }}>to</span>
                    <TimeField label="Close" value={same.window.close} disabled={locked} onChange={(close) => setSame((s) => ({ ...s, window: { ...s.window, close } }))} />
                  </div>
                  <div className="m-fld">
                    <span className="m-label">Days open</span>
                    <div className="m-days" role="group" aria-label="Days open">
                      {DAY_KEYS.map((d) => {
                        const on = same.days.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={on}
                            aria-label={DAY_LABELS[d]}
                            disabled={locked}
                            onClick={() => setSame((s) => ({ ...s, days: on ? s.days.filter((x) => x !== d) : DAY_KEYS.filter((x) => x === d || s.days.includes(x)) }))}
                          >
                            {DAY_INITIALS[d]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  {DAY_KEYS.map((d) => (
                    <DayRow
                      key={d}
                      day={d}
                      window={perDay[d]}
                      disabled={locked}
                      onChange={(w) =>
                        setPerDay((p) => {
                          const next = { ...p };
                          if (w) next[d] = w;
                          else delete next[d];
                          return next;
                        })
                      }
                    />
                  ))}
                </div>
              )}
              {!allValid && <div className="m-err">Times are 24-hour, like 08:00, and the opening time must be before the closing time.</div>}

              <div className="m-card" style={{ flexDirection: "row", alignItems: "center", minHeight: 56, padding: "0 14px" }}>
                <b style={{ flex: 1, fontSize: 15 }}>Busy mode (+10 min)</b>
                <Switch checked={state.profile.busy} label="Busy mode (+10 min)" disabled={actionsDisabled || busySaving} onChange={(v) => void onToggleBusy(v)} />
              </div>
              {busyError && (
                <div className="m-alert" role="alert">
                  {busyError}
                </div>
              )}
              {error && (
                <div className="m-alert" role="alert">
                  {error}
                </div>
              )}
            </>
          )}
        </div>
        {state.status === "ready" && !staff && (
          <div className="m-foot">
            <button type="button" className="m-btn" disabled={disabled || !allValid} onClick={() => void onSave()}>
              {saving ? "Saving…" : "Save hours"}
            </button>
          </div>
        )}
      </div>
    </Kitchen>
  );
}

function TimeField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <label className="m-fld" style={{ flex: 1, minWidth: 0 }}>
      <span className="m-label">{label}</span>
      <span className="m-in m-time">
        <input type="text" inputMode="numeric" placeholder="08:00" maxLength={5} aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(asTime(e.target.value))} />
      </span>
    </label>
  );
}

function DayRow({
  day,
  window,
  disabled,
  onChange,
}: {
  day: DayKey;
  window: { open: string; close: string } | undefined;
  disabled: boolean;
  onChange: (w: { open: string; close: string } | undefined) => void;
}) {
  return (
    <div className="m-li" style={{ gap: 8, flexWrap: "wrap", padding: "8px 0" }}>
      <b style={{ flex: 1, minWidth: 90, fontSize: 14.5 }}>{DAY_LABELS[day]}</b>
      {window ? (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="m-in m-time m-sm">
            <input type="text" inputMode="numeric" maxLength={5} aria-label={`${DAY_LABELS[day]} opens`} value={window.open} disabled={disabled} onChange={(e) => onChange({ ...window, open: asTime(e.target.value) })} />
          </span>
          <span style={{ color: "var(--muted)" }}>–</span>
          <span className="m-in m-time m-sm">
            <input type="text" inputMode="numeric" maxLength={5} aria-label={`${DAY_LABELS[day]} closes`} value={window.close} disabled={disabled} onChange={(e) => onChange({ ...window, close: asTime(e.target.value) })} />
          </span>
        </span>
      ) : (
        <span style={{ color: "var(--muted)", fontSize: 14 }}>Closed</span>
      )}
      <Switch checked={!!window} label={`Open on ${DAY_LABELS[day]}`} disabled={disabled} onChange={(on) => onChange(on ? { ...DEFAULT_WINDOW } : undefined)} />
    </div>
  );
}
