"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantPreferredRiderResponse, MerchantProfileResponse, MerchantRiderStatus } from "@lynia/shared";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { Icon } from "../../components/icons";
import { RetryableError } from "../../components/RetryableError";
import { cardStyle, dangerGhostButtonStyle, disabledStyle, ghostButtonStyle, primaryButtonStyle } from "../../components/queue/styles";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { loadBusiness } from "../../lib/business";
import { addRider, listRiders, removeRider } from "../../lib/riders-api";
import {
  type AddRiderErrors,
  type AddRiderForm,
  RIDER_STATUS_LABEL,
  riderInviteLink,
  riderInviteMessage,
  riderTrackRecord,
  validateAddRider,
} from "../../lib/riders";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; riders: MerchantPreferredRiderResponse[]; cap: number; business: MerchantProfileResponse | null }
  | { status: "unavailable"; business: MerchantProfileResponse | null }
  | { status: "error"; message: string };

const EMPTY_FORM: AddRiderForm = { label: "", phone: "" };

/**
 * Your riders (merchant web upgrade L3): the riders a business already works with, by the number each signs
 * in to LyniaGo with. The owner adds and removes; the team sees the list. What the page knows about a
 * number is deliberately little (the API's three statuses, the rider's own name only after they've
 * delivered for the business). A shop's nav item; inside Shop for a restaurant. Undrawn, ledgered as D-45.
 */
export default function RidersPage() {
  const { signOut, actionsDisabled } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [form, setForm] = useState<AddRiderForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<AddRiderErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
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
        setState({ status: "unavailable", business });
        return;
      }
      setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your riders." });
    }
  }, [signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const business = state.status === "ready" || state.status === "unavailable" ? state.business : null;
  const owner = business?.myRole === "owner";
  const shop = business?.businessType === "shop";

  function update<K extends keyof AddRiderForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (actingRef.current || state.status !== "ready") return;
    const found = validateAddRider(form);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;
    actingRef.current = true;
    setBusy("add");
    try {
      const added = await addRider({ label: form.label.trim(), phone: form.phone.trim() });
      setState((s) => (s.status === "ready" ? { ...s, riders: [...s.riders, added] } : s));
      setForm(EMPTY_FORM);
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      const reason = err instanceof ApiError ? err.reason : undefined;
      const message = err instanceof ApiError ? err.message : "Couldn't add the rider. Try again.";
      // Refusals about the number sit under the number; the rest (the cap, the daily limit) above the form.
      if (reason === "bad_phone" || reason === "already_added" || reason === "team_member") setErrors({ phone: message });
      else setBanner(message);
    } finally {
      setBusy(null);
      actingRef.current = false;
    }
  }

  async function onRemove(id: string) {
    if (actingRef.current) return;
    actingRef.current = true;
    setBusy(id);
    setBanner(null);
    try {
      await removeRider(id);
      setState((s) => (s.status === "ready" ? { ...s, riders: s.riders.filter((r) => r.id !== id) } : s));
      setConfirmRemove(null);
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setBanner(err instanceof ApiError ? err.message : "Couldn't remove the rider. Try again.");
    } finally {
      setBusy(null);
      actingRef.current = false;
    }
  }

  const disabled = actionsDisabled || busy !== null;
  const full = state.status === "ready" && state.riders.length >= state.cap;

  return (
    <Kitchen active={shop ? "riders" : "shop"}>
      <div className="kitchen-page" style={{ overflow: "auto", height: "100%" }}>
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>Your riders</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, lineHeight: 1.45 }}>
                {shop
                  ? "Riders you already work with. When one offers on your booking, they're marked “Your rider” and listed first."
                  : "Riders you already work with. They're offered your orders first when they're nearby, and marked “Your rider” when you book one."}
              </div>
            </div>
            {state.status === "ready" && (
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", paddingTop: 4 }}>
                {state.riders.length} of {state.cap}
              </div>
            )}
          </div>

          {state.status === "loading" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading your riders…</div>}
          {state.status === "error" && <RetryableError message={state.message} onRetry={() => void load()} />}
          {state.status === "unavailable" && (
            <div style={{ ...cardStyle, fontSize: 14, lineHeight: 1.5 }}>
              <b>Your riders is on its way.</b> You'll add the riders you already work with here.
            </div>
          )}

          {banner && (
            <div role="alert" style={bannerStyle}>
              {banner}
            </div>
          )}

          {state.status === "ready" && owner && (
            <form onSubmit={onAdd} noValidate style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Add a rider</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px" }}>
                  <label htmlFor="rider-label" style={labelStyle}>
                    Their name
                  </label>
                  <input
                    id="rider-label"
                    value={form.label}
                    onChange={(e) => update("label", e.target.value)}
                    maxLength={40}
                    placeholder="e.g. Blessing"
                    style={inputStyle}
                    disabled={full}
                  />
                  {errors.label && (
                    <div role="alert" style={fieldErrorStyle}>
                      {errors.label}
                    </div>
                  )}
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <label htmlFor="rider-phone" style={labelStyle}>
                    The number they sign in to LyniaGo with
                  </label>
                  <input
                    id="rider-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    maxLength={20}
                    placeholder="0771234567"
                    style={inputStyle}
                    disabled={full}
                  />
                  {errors.phone && (
                    <div role="alert" style={fieldErrorStyle}>
                      {errors.phone}
                    </div>
                  )}
                </div>
              </div>
              {full ? (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>You have {state.cap} riders, the most you can keep. Remove one to add another.</div>
              ) : (
                <button type="submit" disabled={disabled} style={{ ...primaryButtonStyle, alignSelf: "flex-start", ...disabledStyle(disabled) }}>
                  {busy === "add" ? "Adding…" : "Add rider"}
                </button>
              )}
            </form>
          )}

          {state.status === "ready" && !owner && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Only the owner can add or remove riders.</div>
          )}

          {state.status === "ready" && state.riders.length === 0 && (
            <div style={{ ...cardStyle, textAlign: "center", padding: "24px 20px" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--accent-wash)", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
                <Icon name="bike" size={22} color="var(--accent-text)" />
              </div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>No riders yet</div>
              <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5, maxWidth: 400, marginInline: "auto" }}>
                Add the riders you already use, by the number they sign in to LyniaGo with. Someone who isn't on LyniaGo yet gets a
                sign-up link from you on WhatsApp.
              </div>
            </div>
          )}

          {state.status === "ready" && state.riders.length > 0 && (
            <section aria-label="Your riders" style={{ display: "grid", gap: 10 }}>
              {state.riders.map((r) => (
                <RiderRow
                  key={r.id}
                  rider={r}
                  businessName={business?.name ?? "us"}
                  owner={owner}
                  disabled={disabled}
                  removing={busy === r.id}
                  confirming={confirmRemove === r.id}
                  onAskRemove={() => setConfirmRemove(r.id)}
                  onKeep={() => setConfirmRemove(null)}
                  onRemove={() => void onRemove(r.id)}
                />
              ))}
            </section>
          )}
        </div>
      </div>
    </Kitchen>
  );
}

function RiderRow({
  rider,
  businessName,
  owner,
  disabled,
  removing,
  confirming,
  onAskRemove,
  onKeep,
  onRemove,
}: {
  rider: MerchantPreferredRiderResponse;
  businessName: string;
  owner: boolean;
  disabled: boolean;
  removing: boolean;
  confirming: boolean;
  onAskRemove: () => void;
  onKeep: () => void;
  onRemove: () => void;
}) {
  const record = riderTrackRecord(rider);
  return (
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            background: "var(--surface)",
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
            flexShrink: 0,
            fontWeight: 800,
            color: "var(--muted)",
          }}
        >
          {rider.rider?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed rider photo URL, not a static asset
            <img src={rider.rider.photoUrl} alt="" width={42} height={42} style={{ objectFit: "cover" }} />
          ) : (
            rider.label.charAt(0).toUpperCase()
          )}
        </span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700 }}>{rider.label}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {rider.phoneMasked}
            {rider.rider ? ` · ${rider.rider.name} on LyniaGo` : ""}
          </div>
          {record && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{record}</div>}
        </div>
        <StatusPill status={rider.status} />
      </div>

      {(rider.invitePhone || owner) && !confirming && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {rider.invitePhone && (
            <a
              href={riderInviteLink(rider.invitePhone, riderInviteMessage(rider.label, businessName))}
              target="_blank"
              rel="noreferrer"
              style={{ ...ghostButtonStyle, textDecoration: "none", display: "inline-block" }}
            >
              Send the sign-up link on WhatsApp
            </a>
          )}
          {owner && (
            <button type="button" onClick={onAskRemove} disabled={disabled} style={{ ...dangerGhostButtonStyle, ...disabledStyle(disabled) }}>
              Remove
            </button>
          )}
        </div>
      )}

      {confirming && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, flex: "1 1 180px" }}>
            Remove <b>{rider.label}</b> from your riders?
          </span>
          <button type="button" onClick={onRemove} disabled={disabled} style={{ ...dangerGhostButtonStyle, ...disabledStyle(disabled) }}>
            {removing ? "Removing…" : "Yes, remove"}
          </button>
          <button type="button" onClick={onKeep} style={ghostButtonStyle}>
            Keep
          </button>
        </div>
      )}
    </div>
  );
}

const TONE: Record<MerchantRiderStatus, { bg: string; fg: string; border: string }> = {
  on_lyniago: { bg: "var(--accent-wash)", fg: "var(--accent-text)", border: "#bfe7cf" },
  not_on_lyniago: { bg: "var(--surface)", fg: "var(--muted)", border: "var(--line)" },
  unavailable: { bg: "var(--highlight-wash)", fg: "var(--highlight-ink)", border: "var(--highlight-border)" },
};

function StatusPill({ status }: { status: MerchantRiderStatus }) {
  const t = TONE[status];
  return (
    <span
      style={{
        borderRadius: 8,
        padding: "4px 9px",
        fontSize: 12,
        fontWeight: 800,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {RIDER_STATUS_LABEL[status]}
    </span>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 };
const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 52,
  fontSize: 16,
  padding: "0 14px",
  borderRadius: "var(--radius-input)",
  border: "1.5px solid var(--line)",
  fontFamily: "inherit",
  background: "var(--bg)",
  color: "var(--ink)",
};
const fieldErrorStyle: React.CSSProperties = { fontSize: 12.5, color: "var(--danger-ink)", marginTop: 6 };
const bannerStyle: React.CSSProperties = { color: "var(--danger-ink)", background: "var(--danger-wash)", borderRadius: 10, padding: "10px 12px", fontSize: 13 };
