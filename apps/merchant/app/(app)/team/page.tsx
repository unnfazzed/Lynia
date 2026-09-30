"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantProfileResponse, MerchantTeamInviteResponse, MerchantTeamMemberResponse } from "@lynia/shared";
import { Icon } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { AppBar } from "../../components/m/AppBar";
import { useToast } from "../../components/m/Toast";
import { RetryableError } from "../../components/RetryableError";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { loadBusiness } from "../../lib/business";
import {
  type InviteErrors,
  type InviteForm,
  invitedAgo,
  longMasked,
  removeConsequence,
  ROLE_LABEL,
  shortMasked,
  teamInviteLink,
  teamInviteMessage,
  validateInvite,
} from "../../lib/team";
import { cancelInvite, getTeam, invitePerson, removeMember } from "../../lib/team-api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; members: MerchantTeamMemberResponse[]; invites: MerchantTeamInviteResponse[]; business: MerchantProfileResponse | null }
  | { status: "staff" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

type Sheet = null | { kind: "add" } | { kind: "person"; member: MerchantTeamMemberResponse } | { kind: "invite"; invite: MerchantTeamInviteResponse };

const EMPTY_FORM: InviteForm = { name: "", phone: "" };

/**
 * E2 · Team and E3 · Person sheet (packages/design/handoff/merchant-mobile, ledger D-48). Rows: the
 * owner (you) with a mint Owner pill; staff with a grey pill; invited people with "Invited 2 days ago ·
 * Resend" and a gold pill. "+ Add someone" is pinned at the bottom. Tapping a staff member opens E3:
 * their number, the red-wash consequence, "Remove Tendai" and "Keep". The owner sends the sign-in
 * link from their own WhatsApp; the person chooses Join or Not me when they sign in (L4, D-46).
 */
export default function TeamPage() {
  const { signOut, actionsDisabled } = useKitchenConnection();
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [form, setForm] = useState<InviteForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<InviteErrors>({});
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [made, setMade] = useState<MerchantTeamInviteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const actingRef = useRef(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const business = await loadBusiness();
    if (business?.myRole === "staff") {
      setState({ status: "staff" });
      return;
    }
    try {
      const { members, invites } = await getTeam();
      setState({ status: "ready", members, invites, business });
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      // An API from before L4 has no such route yet: say it's coming, not that something broke.
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your team." });
    }
  }, [signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const businessName = (state.status === "ready" && state.business?.name) || "our business";
  const signInUrl = typeof window === "undefined" ? "/login" : `${window.location.origin}/login`;
  const whatsApp = (i: MerchantTeamInviteResponse) => teamInviteLink(i.invitePhone, teamInviteMessage(i.name, businessName, signInUrl));

  function close() {
    setSheet(null);
    setSheetError(null);
    setErrors({});
    setMade(null);
    setForm(EMPTY_FORM);
  }

  async function act(fn: () => Promise<void>, fallback: string) {
    if (actingRef.current) return;
    actingRef.current = true;
    setBusy(true);
    setSheetError(null);
    try {
      await fn();
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      const reason = err instanceof ApiError ? err.reason : undefined;
      const message = err instanceof ApiError ? err.message : fallback;
      // Refusals about the number sit under the number; anything else above the buttons.
      if (reason === "bad_phone" || reason === "already_on_team") setErrors({ phone: message });
      else setSheetError(message);
    } finally {
      setBusy(false);
      actingRef.current = false;
    }
  }

  function onInvite(e: React.FormEvent) {
    e.preventDefault();
    const found = validateInvite(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void act(async () => {
      const invite = await invitePerson({ name: form.name.trim(), phone: form.phone.trim() });
      // A re-invite refreshes the same invite, so it replaces rather than repeats.
      setState((s) => (s.status === "ready" ? { ...s, invites: [...s.invites.filter((i) => i.id !== invite.id), invite] } : s));
      setMade(invite);
      setForm(EMPTY_FORM);
    }, "Couldn't make the invite. Try again.");
  }

  const disabled = actionsDisabled || busy;
  const now = new Date();

  return (
    <Kitchen active="team" tabs={false}>
      <div className="m-page">
        <AppBar back="/account" title="Team" />
        <div className="m-bd">
          {state.status === "loading" && <div className="m-hint">Loading your team…</div>}
          {state.status === "error" && <RetryableError message={state.message} onRetry={() => void load()} />}
          {state.status === "unavailable" && (
            <p className="m-sub">
              <b>Team is on its way.</b> You&apos;ll add the people who work with you here, each signing in with their own phone.
            </p>
          )}
          {state.status === "staff" && <p className="m-sub">Only the owner can see and change the team.</p>}

          {state.status === "ready" && (
            <section aria-label="Your team">
              {state.members.map((m) => {
                const row = (
                  <>
                    <span className="m-av">{m.name.charAt(0).toUpperCase()}</span>
                    <div className="m-t">
                      <b>{m.you ? `${m.name} (you)` : m.name}</b>
                      <span className="m-num">{shortMasked(m.phoneMasked)}</span>
                    </div>
                    <span className={`m-pl ${m.role === "owner" ? "m-wal" : "m-grey"}`}>{ROLE_LABEL[m.role]}</span>
                  </>
                );
                return m.role === "staff" && !m.you ? (
                  <button key={m.profileId} type="button" className="m-li" onClick={() => setSheet({ kind: "person", member: m })}>
                    {row}
                    <Icon name="chevron-right" size={18} color="var(--muted)" />
                  </button>
                ) : (
                  <div key={m.profileId} className="m-li">
                    {row}
                  </div>
                );
              })}
              {state.invites.map((i) => (
                <div key={i.id} className="m-li">
                  <span className="m-av m-av-gold">{i.name.charAt(0).toUpperCase()}</span>
                  <div className="m-t">
                    <button type="button" className="m-stretch" aria-label={`Open ${i.name}'s invite`} onClick={() => setSheet({ kind: "invite", invite: i })}>
                      <b>{i.name}</b>
                    </button>
                    <span>
                      {invitedAgo(i.createdAt, now)} ·{" "}
                      <a href={whatsApp(i)} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                        Resend
                      </a>
                    </span>
                  </div>
                  <span className="m-pl m-gold-out">Invited</span>
                  <Icon name="chevron-right" size={18} color="var(--muted)" />
                </div>
              ))}
            </section>
          )}
        </div>
        {state.status === "ready" && (
          <div className="m-foot">
            <button type="button" className="m-btn" disabled={actionsDisabled} onClick={() => setSheet({ kind: "add" })}>
              <Icon name="plus" size={20} /> Add someone
            </button>
          </div>
        )}
      </div>

      {sheet && (
        <div className="m-overlay" style={{ zIndex: 70 }}>
          <div className="m-overlay-frame">
            <button type="button" className="m-scrim" aria-label="Keep" onClick={close} />
            <div className="m-sheet" role="dialog" aria-modal="true" aria-label={sheet.kind === "add" ? "Add someone" : sheet.kind === "person" ? sheet.member.name : sheet.invite.name}>
              <div className="m-grab" />

              {sheet.kind === "person" && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="m-av" style={{ width: 48, height: 48, fontSize: 18 }}>
                      {sheet.member.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="m-t" style={{ flex: 1 }}>
                      <b style={{ fontSize: 18, display: "block" }}>{sheet.member.name}</b>
                      <span className="m-num" style={{ fontSize: 13, color: "var(--muted)" }}>
                        {longMasked(sheet.member.phoneMasked)} · {ROLE_LABEL[sheet.member.role]}
                      </span>
                    </div>
                  </div>
                  <div className="m-alert">{removeConsequence(sheet.member.name)}</div>
                  {sheetError && (
                    <div className="m-alert" role="alert">
                      {sheetError}
                    </div>
                  )}
                  <button
                    type="button"
                    className="m-btn m-danger"
                    disabled={disabled}
                    onClick={() =>
                      void act(async () => {
                        const { member } = sheet;
                        await removeMember(member.profileId);
                        setState((s) => (s.status === "ready" ? { ...s, members: s.members.filter((x) => x.profileId !== member.profileId) } : s));
                        close();
                        toast(`${member.name} removed`);
                      }, "Couldn't remove them. Try again.")
                    }
                  >
                    Remove {sheet.member.name}
                  </button>
                  <button type="button" className="m-lnk" onClick={close}>
                    Keep
                  </button>
                </>
              )}

              {sheet.kind === "invite" && (
                <>
                  <b style={{ fontSize: 18 }}>{sheet.invite.name}</b>
                  <p className="m-sub m-num">
                    {longMasked(sheet.invite.phoneMasked)} · {invitedAgo(sheet.invite.createdAt, now)}, hasn&apos;t joined yet
                  </p>
                  {sheetError && (
                    <div className="m-alert" role="alert">
                      {sheetError}
                    </div>
                  )}
                  <a className="m-btn" href={whatsApp(sheet.invite)} target="_blank" rel="noreferrer">
                    Send the link on WhatsApp
                  </a>
                  <button
                    type="button"
                    className="m-lnk m-red"
                    disabled={disabled}
                    onClick={() =>
                      void act(async () => {
                        const { invite } = sheet;
                        await cancelInvite(invite.id);
                        setState((s) => (s.status === "ready" ? { ...s, invites: s.invites.filter((x) => x.id !== invite.id) } : s));
                        close();
                        toast("Invite cancelled");
                      }, "Couldn't cancel the invite. Try again.")
                    }
                  >
                    Cancel invite
                  </button>
                </>
              )}

              {sheet.kind === "add" && (
                <form onSubmit={onInvite} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <b style={{ fontSize: 18 }}>Add someone</b>
                  <div className="m-fld">
                    <label htmlFor="team-name">Their name</label>
                    <span className="m-in" data-invalid={!!errors.name}>
                      <input id="team-name" value={form.name} maxLength={60} placeholder="e.g. Tendai" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                    </span>
                    {errors.name && (
                      <span className="m-err" role="alert">
                        {errors.name}
                      </span>
                    )}
                  </div>
                  <div className="m-fld">
                    <label htmlFor="team-phone">Their phone number</label>
                    <span className="m-in" data-invalid={!!errors.phone}>
                      <input
                        id="team-phone"
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
                  {made ? (
                    <div role="status" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <p className="m-sub">Invite ready. Send them the link on WhatsApp.</p>
                      <a className="m-btn" href={whatsApp(made)} target="_blank" rel="noreferrer">
                        Send them the link on WhatsApp
                      </a>
                    </div>
                  ) : (
                    <button type="submit" className="m-btn" disabled={disabled}>
                      {busy ? "Inviting…" : "Invite"}
                    </button>
                  )}
                  <button type="button" className="m-lnk" onClick={close}>
                    Done
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </Kitchen>
  );
}
