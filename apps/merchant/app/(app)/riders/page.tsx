"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantPreferredRiderResponse, MerchantProfileResponse } from "@lynia/shared";
import { Icon } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { AppBar } from "../../components/m/AppBar";
import { ConfirmSheet } from "../../components/m/ConfirmSheet";
import { useToast } from "../../components/m/Toast";
import { RetryableError } from "../../components/RetryableError";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { loadBusiness } from "../../lib/business";
import { addRider, listRiders, removeRider } from "../../lib/riders-api";
import { type AddRiderErrors, type AddRiderForm, riderInviteLink, riderInviteMessage, riderLine, riderPill, validateAddRider } from "../../lib/riders";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; riders: MerchantPreferredRiderResponse[]; cap: number; business: MerchantProfileResponse | null }
  | { status: "unavailable" }
  | { status: "error"; message: string };

const EMPTY_FORM: AddRiderForm = { label: "", phone: "" };

const PILL_CLASS = { online: "m-wal", offline: "m-grey", paused: "m-gold-out" } as const;

/**
 * E4 · Preferred riders (packages/design/handoff/merchant-mobile, ledger D-48): "4 of 20", then a row
 * per rider with an Online / Offline / Paused pill, their trips for you and rating; a number that
 * isn't on LyniaGo yet gets "Send sign-up link" (from the owner's own WhatsApp). "+ Add a rider"
 * (owner) opens a sheet ("not drawn"). What the business may know stays deliberately little (L3,
 * CEO-8): no reason for a pause, the rider's own name only once they've worked for it.
 */
export default function RidersPage() {
  const { signOut, actionsDisabled } = useKitchenConnection();
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MerchantPreferredRiderResponse | null>(null);
  const [form, setForm] = useState<AddRiderForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<AddRiderErrors>({});
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actingRef = useRef(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const business = await loadBusiness();
    try {
      const { riders, cap } = await listRiders();
      setState({ status: "ready", riders, cap, business });
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      // An API from before L3 has no such route yet: say it's coming, not that something broke.
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your riders." });
    }
  }, [signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const business = state.status === "ready" ? state.business : null;
  const owner = business?.myRole === "owner";
  const full = state.status === "ready" && state.riders.length >= state.cap;

  function closeAdd() {
    setAdding(false);
    setForm(EMPTY_FORM);
    setErrors({});
    setSheetError(null);
  }

  async function act(fn: () => Promise<void>, fallback: string): Promise<boolean> {
    if (actingRef.current) return false;
    actingRef.current = true;
    setBusy(true);
    setSheetError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return false;
      const reason = err instanceof ApiError ? err.reason : undefined;
      const message = err instanceof ApiError ? err.message : fallback;
      // Refusals about the number sit under the number; the rest (the cap, the daily limit) above the button.
      if (reason === "bad_phone" || reason === "already_added" || reason === "team_member") setErrors({ phone: message });
      else setSheetError(message);
      return false;
    } finally {
      setBusy(false);
      actingRef.current = false;
    }
  }

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const found = validateAddRider(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void act(async () => {
      const added = await addRider({ label: form.label.trim(), phone: form.phone.trim() });
      setState((s) => (s.status === "ready" ? { ...s, riders: [...s.riders, added] } : s));
      closeAdd();
      toast(`${added.label} added`);
    }, "Couldn't add the rider. Try again.");
  }

  const disabled = actionsDisabled || busy;

  return (
    <Kitchen active="riders" tabs={false}>
      <div className="m-page">
        <AppBar
          back="/account"
          title="Preferred riders"
          right={
            state.status === "ready" ? (
              <span className="m-num" style={{ fontSize: 13, color: "var(--muted)" }}>
                {state.riders.length} of {state.cap}
              </span>
            ) : undefined
          }
        />
        <div className="m-bd">
          {state.status === "loading" && <div className="m-hint">Loading your riders…</div>}
          {state.status === "error" && <RetryableError message={state.message} onRetry={() => void load()} />}
          {state.status === "unavailable" && (
            <p className="m-sub">
              <b>Your riders is on its way.</b> You&apos;ll add the riders you already work with here.
            </p>
          )}
          {state.status === "ready" && !owner && <p className="m-hint">Only the owner can add or remove riders.</p>}

          {state.status === "ready" && state.riders.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8, paddingTop: 40 }}>
              <Icon name="bike" size={32} color="var(--muted)" />
              <b style={{ fontSize: 17 }}>No riders yet</b>
              <p className="m-sub">
                Add the riders you already use, by the number they sign in to LyniaGo with. Someone who isn&apos;t on LyniaGo yet gets a sign-up link from you on
                WhatsApp.
              </p>
            </div>
          )}

          {state.status === "ready" && state.riders.length > 0 && (
            <section aria-label="Your riders">
              {state.riders.map((r) => {
                const pill = riderPill(r);
                return (
                  <div key={r.id} className="m-li">
                    <span className={`m-av${pill?.tone === "online" ? " m-av-on" : ""}`}>
                      {r.rider?.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a signed rider photo URL, not a static asset
                        <img src={r.rider.photoUrl} alt="" width={40} height={40} style={{ objectFit: "cover", borderRadius: "50%" }} />
                      ) : (
                        r.label.charAt(0).toUpperCase()
                      )}
                    </span>
                    <div className="m-t">
                      {/* Not drawn: the owner taps a rider to remove them (behind the confirm sheet). */}
                      {owner ? (
                        <button type="button" className="m-stretch" aria-label={`Remove ${r.label}`} disabled={disabled} onClick={() => setRemoving(r)}>
                          <b>{r.label}</b>
                        </button>
                      ) : (
                        <b>{r.label}</b>
                      )}
                      <span className="m-num">
                        {riderLine(r)}
                        {r.invitePhone && (
                          <>
                            {" · "}
                            <a href={riderInviteLink(r.invitePhone, riderInviteMessage(r.label, business?.name ?? "us"))} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                              Send sign-up link
                            </a>
                          </>
                        )}
                      </span>
                    </div>
                    {pill && <span className={`m-pl ${PILL_CLASS[pill.tone]}`}>{pill.label}</span>}
                  </div>
                );
              })}
            </section>
          )}
          {full && owner && <p className="m-hint">You have {state.status === "ready" ? state.cap : 20} riders, the most you can keep. Remove one to add another.</p>}
        </div>
        {state.status === "ready" && owner && !full && (
          <div className="m-foot">
            <button type="button" className="m-btn" disabled={actionsDisabled} onClick={() => setAdding(true)}>
              <Icon name="plus" size={20} /> Add a rider
            </button>
          </div>
        )}
      </div>

      {removing && (
        <ConfirmSheet
          title={`Remove ${removing.label}?`}
          body="They stop getting your jobs first. You can add them again."
          confirmLabel="Remove"
          busy={busy}
          error={sheetError}
          onConfirm={() =>
            void act(async () => {
              const r = removing;
              await removeRider(r.id);
              setState((s) => (s.status === "ready" ? { ...s, riders: s.riders.filter((x) => x.id !== r.id) } : s));
              setRemoving(null);
              toast(`${r.label} removed`);
            }, "Couldn't remove the rider. Try again.")
          }
          onCancel={() => {
            setRemoving(null);
            setSheetError(null);
          }}
        />
      )}

      {adding && (
        <div className="m-overlay" style={{ zIndex: 70 }}>
          <div className="m-overlay-frame">
            <button type="button" className="m-scrim" aria-label="Keep" onClick={closeAdd} />
            <form className="m-sheet" role="dialog" aria-modal="true" aria-label="Add a rider" onSubmit={onAdd} noValidate>
              <div className="m-grab" />
              <b style={{ fontSize: 18 }}>Add a rider</b>
              <div className="m-fld">
                <label htmlFor="rider-label">Their name</label>
                <span className="m-in" data-invalid={!!errors.label}>
                  <input id="rider-label" value={form.label} maxLength={40} placeholder="e.g. Blessing" onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
                </span>
                {errors.label && (
                  <span className="m-err" role="alert">
                    {errors.label}
                  </span>
                )}
              </div>
              <div className="m-fld">
                <label htmlFor="rider-phone">The number they sign in to LyniaGo with</label>
                <span className="m-in" data-invalid={!!errors.phone}>
                  <input
                    id="rider-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    value={form.phone}
                    maxLength={20}
                    placeholder="0771234567"
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </span>
                {errors.phone && (
                  <span className="m-err" role="alert">
                    {errors.phone}
                  </span>
                )}
              </div>
              {sheetError && (
                <div className="m-alert" role="alert">
                  {sheetError}
                </div>
              )}
              <button type="submit" className="m-btn" disabled={disabled}>
                {busy ? "Adding…" : "Add rider"}
              </button>
              <button type="button" className="m-lnk" onClick={closeAdd}>
                Keep
              </button>
            </form>
          </div>
        </div>
      )}
    </Kitchen>
  );
}
