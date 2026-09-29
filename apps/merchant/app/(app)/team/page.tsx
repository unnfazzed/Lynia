"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MerchantProfileResponse, MerchantTeamInviteResponse, MerchantTeamMemberResponse } from "@lynia/shared";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { Icon } from "../../components/icons";
import { RetryableError } from "../../components/RetryableError";
import { cardStyle, dangerGhostButtonStyle, disabledStyle, ghostButtonStyle, primaryButtonStyle } from "../../components/queue/styles";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { loadBusiness } from "../../lib/business";
import {
  type InviteErrors,
  type InviteForm,
  ROLE_LABEL,
  removeWarning,
  staffCanLine,
  teamInviteLink,
  teamInviteMessage,
  validateInvite,
} from "../../lib/team";
import { cancelInvite, getTeam, invitePerson, removeMember } from "../../lib/team-api";

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      members: MerchantTeamMemberResponse[];
      invites: MerchantTeamInviteResponse[];
      business: MerchantProfileResponse | null;
    }
  | { status: "staff"; business: MerchantProfileResponse }
  | { status: "unavailable"; business: MerchantProfileResponse | null }
  | { status: "error"; message: string };

const EMPTY_FORM: InviteForm = { name: "", phone: "" };

/**
 * Team (merchant web upgrade L4, design doc "L4 — Team"): everyone who signs in for the business, each with
 * their own number and code. Inside Shop, owner only. The owner adds a name and a number and sends the
 * sign-in link from their own WhatsApp; the person chooses Join or Not me when they sign in. Adding a number
 * never says whether it works somewhere else. Undrawn, ledgered as D-46.
 */
export default function TeamPage() {
  const { signOut, actionsDisabled } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<InviteForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<InviteErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [ready, setReady] = useState<MerchantTeamInviteResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const actingRef = useRef(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const business = await loadBusiness();
    if (business?.myRole === "staff") {
      setState({ status: "staff", business });
      return;
    }
    try {
      const { members, invites } = await getTeam();
      setState({ status: "ready", members, invites, business });
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      // An API from before L4 has no such route yet: say it's coming, not that something broke.
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: "unavailable", business });
        return;
      }
      setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your team." });
    }
  }, [signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const business = state.status === "ready" || state.status === "unavailable" || state.status === "staff" ? state.business : null;
  const businessName = business?.name ?? "our business";
  const signInUrl = typeof window === "undefined" ? "/login" : `${window.location.origin}/login`;

  function update<K extends keyof InviteForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (actingRef.current || state.status !== "ready") return;
    const found = validateInvite(form);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;
    actingRef.current = true;
    setBusy("invite");
    try {
      const invite = await invitePerson({ name: form.name.trim(), phone: form.phone.trim() });
      // A re-invite refreshes the same invite, so it replaces rather than repeats.
      setState((s) => (s.status === "ready" ? { ...s, invites: [...s.invites.filter((i) => i.id !== invite.id), invite] } : s));
      setReady(invite);
      setForm(EMPTY_FORM);
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      const reason = err instanceof ApiError ? err.reason : undefined;
      const message = err instanceof ApiError ? err.message : "Couldn't make the invite. Try again.";
      // Refusals about the number sit under the number; the daily limit above the form.
      if (reason === "bad_phone" || reason === "already_on_team") setErrors({ phone: message });
      else setBanner(message);
    } finally {
      setBusy(null);
      actingRef.current = false;
    }
  }

  async function onCancelInvite(id: string) {
    if (actingRef.current) return;
    actingRef.current = true;
    setBusy(id);
    setBanner(null);
    try {
      await cancelInvite(id);
      setState((s) => (s.status === "ready" ? { ...s, invites: s.invites.filter((i) => i.id !== id) } : s));
      if (ready?.id === id) setReady(null);
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setBanner(err instanceof ApiError ? err.message : "Couldn't cancel the invite. Try again.");
    } finally {
      setBusy(null);
      actingRef.current = false;
    }
  }

  async function onRemove(profileId: string) {
    if (actingRef.current) return;
    actingRef.current = true;
    setBusy(profileId);
    setBanner(null);
    try {
      await removeMember(profileId);
      setState((s) => (s.status === "ready" ? { ...s, members: s.members.filter((m) => m.profileId !== profileId) } : s));
      setConfirmRemove(null);
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setBanner(err instanceof ApiError ? err.message : "Couldn't remove them. Try again.");
    } finally {
      setBusy(null);
      actingRef.current = false;
    }
  }

  const disabled = actionsDisabled || busy !== null;

  return (
    <Kitchen active="shop">
      <div className="kitchen-page" style={{ overflow: "auto", height: "100%" }}>
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Link href="/shop" style={backLinkStyle}>
              <Icon name="chevron-left" size={16} /> Shop
            </Link>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>Team</div>
            {business && (
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, lineHeight: 1.45 }}>{staffCanLine(business.businessType)}</div>
            )}
          </div>

          {state.status === "loading" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading your team…</div>}
          {state.status === "error" && <RetryableError message={state.message} onRetry={() => void load()} />}
          {state.status === "unavailable" && (
            <div style={{ ...cardStyle, fontSize: 14, lineHeight: 1.5 }}>
              <b>Team is on its way.</b> You'll add the people who work with you here, each signing in with their own phone.
            </div>
          )}
          {state.status === "staff" && (
            <div style={{ ...cardStyle, fontSize: 14, lineHeight: 1.5 }}>Only the owner can see and change the team.</div>
          )}

          {banner && (
            <div role="alert" style={bannerStyle}>
              {banner}
            </div>
          )}

          {state.status === "ready" && (
            <section aria-label="Your team" style={{ display: "grid", gap: 10 }}>
              {state.members.map((m) => (
                <PersonRow
                  key={m.profileId}
                  name={m.name}
                  line={m.you ? `${m.phoneMasked} · you` : m.phoneMasked}
                  tag={ROLE_LABEL[m.role]}
                  tone={m.role === "owner" ? "accent" : "plain"}
                >
                  {m.role === "staff" && !m.you && confirmRemove !== m.profileId && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(m.profileId)}
                      disabled={disabled}
                      style={{ ...dangerGhostButtonStyle, ...disabledStyle(disabled) }}
                    >
                      Remove
                    </button>
                  )}
                  {confirmRemove === m.profileId && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <span style={{ fontSize: 14, lineHeight: 1.45 }}>
                        Remove <b>{m.name}</b> from the team? {removeWarning(m.name)}
                      </span>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => void onRemove(m.profileId)}
                          disabled={disabled}
                          style={{ ...dangerGhostButtonStyle, ...disabledStyle(disabled) }}
                        >
                          {busy === m.profileId ? "Removing…" : "Yes, remove"}
                        </button>
                        <button type="button" onClick={() => setConfirmRemove(null)} style={ghostButtonStyle}>
                          Keep
                        </button>
                      </div>
                    </div>
                  )}
                </PersonRow>
              ))}
              {state.invites.map((i) => (
                <PersonRow key={i.id} name={i.name} line={`${i.phoneMasked} · invited, hasn't joined yet`} tag="Invited" tone="highlight">
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <a
                      href={teamInviteLink(i.invitePhone, teamInviteMessage(i.name, businessName, signInUrl))}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...ghostButtonStyle, textDecoration: "none", display: "inline-block" }}
                    >
                      Send the link on WhatsApp
                    </a>
                    <button
                      type="button"
                      onClick={() => void onCancelInvite(i.id)}
                      disabled={disabled}
                      style={{ ...dangerGhostButtonStyle, ...disabledStyle(disabled) }}
                    >
                      {busy === i.id ? "Cancelling…" : "Cancel invite"}
                    </button>
                  </div>
                </PersonRow>
              ))}
            </section>
          )}

          {state.status === "ready" && !adding && (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setReady(null);
              }}
              style={{ ...primaryButtonStyle, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Icon name="plus" size={17} />
              Add someone
            </button>
          )}

          {state.status === "ready" && adding && (
            <form onSubmit={onInvite} noValidate style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Add someone</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px" }}>
                  <label htmlFor="team-name" style={labelStyle}>
                    Their name
                  </label>
                  <input
                    id="team-name"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    maxLength={60}
                    placeholder="e.g. Tendai"
                    style={inputStyle}
                  />
                  {errors.name && (
                    <div role="alert" style={fieldErrorStyle}>
                      {errors.name}
                    </div>
                  )}
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <label htmlFor="team-phone" style={labelStyle}>
                    Their phone number
                  </label>
                  <input
                    id="team-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    maxLength={20}
                    placeholder="0771234567"
                    style={inputStyle}
                  />
                  {errors.phone && (
                    <div role="alert" style={fieldErrorStyle}>
                      {errors.phone}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="submit" disabled={disabled} style={{ ...primaryButtonStyle, ...disabledStyle(disabled) }}>
                  {busy === "invite" ? "Inviting…" : "Invite"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setErrors({});
                  }}
                  style={ghostButtonStyle}
                >
                  Done
                </button>
              </div>
              {ready && (
                <div role="status" style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 }}>
                  <div style={{ fontSize: 13.5, color: "var(--muted)" }}>Invite ready. Send them the link on WhatsApp.</div>
                  <a
                    href={teamInviteLink(ready.invitePhone, teamInviteMessage(ready.name, businessName, signInUrl))}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...ghostButtonStyle, textDecoration: "none", display: "inline-block", alignSelf: "flex-start" }}
                  >
                    Send them the link on WhatsApp
                  </a>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </Kitchen>
  );
}

type Tone = "accent" | "plain" | "highlight";

const TAG_TONE: Record<Tone, { bg: string; fg: string; border: string }> = {
  accent: { bg: "var(--accent-wash)", fg: "var(--accent-text)", border: "var(--accent-wash)" },
  plain: { bg: "var(--surface)", fg: "var(--muted)", border: "var(--line)" },
  highlight: { bg: "var(--highlight-wash)", fg: "var(--highlight-ink)", border: "var(--highlight-border)" },
};

function PersonRow({ name, line, tag, tone, children }: { name: string; line: string; tag: string; tone: Tone; children?: React.ReactNode }) {
  const t = TAG_TONE[tone];
  return (
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            background: "var(--surface)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            fontWeight: 800,
            color: "var(--muted)",
          }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, overflowWrap: "anywhere" }}>{name}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{line}</div>
        </div>
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
          {tag}
        </span>
      </div>
      {children}
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  minHeight: "var(--target-min)",
  color: "var(--accent-text)",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
};
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
