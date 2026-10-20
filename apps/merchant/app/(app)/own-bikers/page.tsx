"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FleetBikerRow, FleetInviteLinkResponse, FleetInviteRow, FleetSuggestion, OwnerFleetResponse } from "@lynia/shared";
import { Icon } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { AppBar } from "../../components/m/AppBar";
import { FleetInviteSheet } from "../../components/m/FleetInviteSheet";
import { CashChip, RosterStateChip } from "../../components/m/RosterChips";
import { useToast } from "../../components/m/Toast";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { useBusiness } from "../../lib/business";
import {
  createFleetInvite,
  dismissFleetSuggestions,
  getFleet,
  getFleetBills,
  getFleetInviteLink,
  removeFleetBiker,
  revokeFleetInvite,
} from "../../lib/fleet-api";
import { INVITE_STATE_LABEL, sharedAgo, sortBikers, sortInvites } from "../../lib/own-bikers";
import { OBM } from "../../lib/own-bikers-copy";
import { initials } from "../../lib/team";

type Load =
  | { status: "loading" }
  | { status: "ready"; fleet: OwnerFleetResponse; week: { rides: number; total: string; everBilled: boolean } | null }
  | { status: "error" };

type Sheet =
  | null
  | { kind: "biker"; biker: FleetBikerRow }
  | { kind: "remove"; biker: FleetBikerRow }
  | { kind: "invite"; initial?: FleetInviteLinkResponse };

/**
 * OB-M2–M5, M7 · Own bikers (handoff own-bikers-v1, ledger D-117), pushed from Account › Orders & people.
 *
 * - Owner: "This week: 23 rides · $34.50", YOUR BIKERS (on a job › online › offline; state chip, cash chip, cancels),
 *   INVITES (Share again + Revoke; an expired link gets New link), the pinned "Invite a biker". A biker opens their
 *   sheet (Call, home branch, cash, cancels, Remove), Remove its destructive confirm.
 * - Staff (OB-M3): the lock strip, the same rows without cash, actions or the bar.
 * - First time (OB-M4): EmptyState with "Invite a biker". The owner's old Preferred riders are offered once (OB-M5).
 * - The first biker joined (OB-M7): a mint banner to book their first delivery, until the first ride.
 * - Loading (skeleton), couldn't load (T14b) and offline (the last list stays, with a toast).
 */
export default function OwnBikersPage() {
  const router = useRouter();
  const business = useBusiness();
  const { signOut, actionsDisabled } = useKitchenConnection();
  const toast = useToast();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [invitedSuggestions, setInvitedSuggestions] = useState<ReadonlySet<string>>(new Set());
  const actingRef = useRef(false);
  // A list is on screen: a failed refresh then keeps it, with the offline toast, instead of the error screen.
  const shownRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const fleet = await getFleet();
      if (!fleet.enabled) {
        router.replace("/account");
        return;
      }
      // The week line is the owner's bill (E6); a failed read just leaves it out.
      const week =
        fleet.role === "owner" ? await getFleetBills().then((b) => ({ ...b.thisWeek, everBilled: b.bills.length > 0 }), () => null) : null;
      shownRef.current = true;
      setLoad({ status: "ready", fleet, week });
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      // The merchant vertical is off (503) or this business has none: back to Account, where the row isn't drawn.
      if (err instanceof ApiError && (err.status === 503 || err.status === 404)) {
        router.replace("/account");
        return;
      }
      if (shownRef.current) toast(OBM.offlineToast, { tone: "offline" });
      else setLoad({ status: "error" });
    }
  }, [router, signOut, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Offline (OB-M2 states): the last list stays, and a toast says it may be out of date.
  const wasOffline = useRef(actionsDisabled);
  useEffect(() => {
    // Not over a sheet: the invite sheet says "Can't reach LyniaGo" itself.
    if (actionsDisabled && !wasOffline.current && load.status === "ready" && !sheet) toast(OBM.offlineToast, { tone: "offline" });
    if (!actionsDisabled && wasOffline.current) void refresh();
    wasOffline.current = actionsDisabled;
  }, [actionsDisabled, load.status, refresh, toast, sheet]);

  const fleet = load.status === "ready" ? load.fleet : null;
  const owner = fleet?.role === "owner";
  const branch = business?.name ?? "";
  const disabled = actionsDisabled || busy;

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
      const message = err instanceof ApiError && err.status !== 0 ? err.message : fallback;
      if (sheet) setSheetError(message);
      else toast(message);
      return false;
    } finally {
      setBusy(false);
      actingRef.current = false;
    }
  }

  function close() {
    setSheet(null);
    setSheetError(null);
  }

  /** A link was made (new, or the same again): put it in INVITES. */
  function upsertInvite(invite: FleetInviteRow) {
    setLoad((s) => (s.status === "ready" ? { ...s, fleet: { ...s.fleet, invites: [invite, ...s.fleet.invites.filter((i) => i.id !== invite.id)] } } : s));
  }

  function shareAgain(invite: FleetInviteRow) {
    void act(async () => {
      setSheet({ kind: "invite", initial: await getFleetInviteLink(invite.id) });
    }, OBM.cantCreate);
  }

  /** "New link": the lapsed invite's number gets a fresh link (the API ends the old one). */
  function newLink(invite: FleetInviteRow) {
    void act(async () => {
      const old = await getFleetInviteLink(invite.id);
      const fresh = await createFleetInvite({ name: invite.name, phone: `+${old.phone}` });
      setLoad((s) =>
        s.status === "ready" ? { ...s, fleet: { ...s.fleet, invites: [fresh.invite, ...s.fleet.invites.filter((i) => i.id !== invite.id && i.id !== fresh.invite.id)] } } : s,
      );
      setSheet({ kind: "invite", initial: fresh });
    }, OBM.cantCreate);
  }

  function revoke(invite: FleetInviteRow) {
    void act(async () => {
      await revokeFleetInvite(invite.id);
      setLoad((s) => (s.status === "ready" ? { ...s, fleet: { ...s.fleet, invites: s.fleet.invites.filter((i) => i.id !== invite.id) } } : s));
    }, "Couldn't revoke the link. Try again.");
  }

  function inviteSuggestion(s: FleetSuggestion) {
    void act(async () => {
      const res = await createFleetInvite({ name: s.name, phone: s.phone });
      upsertInvite(res.invite);
      setInvitedSuggestions((prev) => new Set(prev).add(s.phone));
      setSheet({ kind: "invite", initial: res });
    }, OBM.cantCreate);
  }

  function dismissSuggestions() {
    void act(async () => {
      await dismissFleetSuggestions();
      setLoad((s) => (s.status === "ready" ? { ...s, fleet: { ...s.fleet, suggestions: [] } } : s));
    }, "Couldn't dismiss them. Try again.");
  }

  async function remove(biker: FleetBikerRow) {
    const ok = await act(async () => {
      await removeFleetBiker(biker.riderId);
      setLoad((s) => (s.status === "ready" ? { ...s, fleet: { ...s.fleet, bikers: s.fleet.bikers.filter((b) => b.riderId !== biker.riderId) } } : s));
    }, "Couldn't remove them. Try again.");
    if (ok) close();
  }

  const bikers = fleet ? sortBikers(fleet.bikers) : [];
  const invites = fleet ? sortInvites(fleet.invites) : [];
  const empty = fleet !== null && bikers.length === 0 && invites.length === 0;
  const now = Date.now();
  // OB-M7: the first biker is in and no ride has happened yet (none this week, and no bill before).
  const firstBiker = owner && bikers.length > 0 && load.status === "ready" && load.week?.rides === 0 && !load.week.everBilled ? [...bikers].sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt))[0] : null;
  const showWeek = owner && load.status === "ready" && load.week && !firstBiker;

  return (
    <Kitchen active="own-bikers" tabs={false}>
      <div className="m-page">
        <AppBar back="/account" title={OBM.rosterTitle} />

        {load.status === "loading" && <RosterSkeleton />}

        {load.status === "error" && (
          <div className="m-ob-fail">
            <span className="m-ob-fail-ic">
              <Icon name="wifi-off" size={24} />
            </span>
            <b>{OBM.loadFailT}</b>
            <p>{OBM.loadFailB}</p>
            <button
              type="button"
              className="m-btn2"
              onClick={() => {
                setLoad({ status: "loading" });
                void refresh();
              }}
            >
              <Icon name="rotate-cw" size={16} />
              {OBM.tryAgain}
            </button>
          </div>
        )}

        {fleet && empty && owner && fleet.suggestions.length === 0 && (
          <div className="m-ob-empty">
            <div className="m-ob-empty-mark">
              <span>
                <Icon name="users" size={24} />
              </span>
            </div>
            <b>{OBM.emptyT}</b>
            <p>{OBM.emptyB}</p>
            <button type="button" className="m-ob-pill" disabled={actionsDisabled} onClick={() => setSheet({ kind: "invite" })}>
              <Icon name="user-plus" size={16} />
              {OBM.inviteBiker}
            </button>
          </div>
        )}

        {fleet && !(empty && owner && fleet.suggestions.length === 0) && (
          <div className="m-ob-bd">
            {firstBiker && (
              <Link href="/deliveries/new?mine=1" className="m-ob-ready">
                <span className="m-ob-ready-ic">
                  <Icon name="bike" size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{OBM.readyBanner(firstBiker.name.split(/\s+/)[0] ?? firstBiker.name)}</b>
                  <span>{OBM.bookFirst}</span>
                </div>
                <Icon name="chevron-right" size={20} color="var(--accent-text)" />
              </Link>
            )}

            {owner && fleet.suggestions.length > 0 && (
              <div className="m-ob-sug">
                <div className="m-ob-sug-hd">
                  <h2 className="m-bh" style={{ margin: 0 }}>
                    {OBM.grpPreferred}
                  </h2>
                  <button type="button" className="m-ob-x" aria-label={OBM.dismiss} disabled={disabled} onClick={dismissSuggestions}>
                    <Icon name="x" size={20} />
                  </button>
                </div>
                {fleet.suggestions.map((s) => {
                  const done = invitedSuggestions.has(s.phone);
                  return (
                    <div key={s.phone} className="m-ob-sug-row">
                      <span className="m-ob-av" data-quiet="">
                        {initials(s.name)}
                      </span>
                      <div className="m-ob-t">
                        <b>{s.name}</b>
                        <span className="m-num">{s.phone}</span>
                      </div>
                      {done ? (
                        <span className="m-ob-pill" data-off="">
                          <Icon name="check" size={16} />
                          {OBM.invited}
                        </span>
                      ) : (
                        <button type="button" className="m-ob-pill" disabled={disabled} onClick={() => inviteSuggestion(s)}>
                          <Icon name="user-plus" size={16} />
                          {OBM.invite}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!owner && (
              <div className="m-ob-strip">
                <span className="m-ob-strip-ic">
                  <Icon name="lock" size={16} />
                </span>
                <div>{OBM.staffLock}</div>
              </div>
            )}
            {showWeek && load.week && (
              <p className="m-ob-week" style={{ margin: 0 }}>
                {OBM.thisWeek(load.week.rides, `$${load.week.total}`).lead}
                <b className="m-num">{OBM.thisWeek(load.week.rides, `$${load.week.total}`).value}</b>
              </p>
            )}

            {bikers.length > 0 && (
              <>
                <h2 className="m-bh" style={{ margin: "4px 0 0" }}>
                  {OBM.grpBikers}
                </h2>
                <div className="m-ob-list">
                  {bikers.map((b) => (
                    <button key={b.riderId} type="button" className="m-ob-row" onClick={() => setSheet({ kind: "biker", biker: b })}>
                      <span className="m-ob-av">{initials(b.name)}</span>
                      <div className="m-ob-t">
                        <b>{b.name}</b>
                        <span>{b.homeBranch}</span>
                        <div className="m-ob-chips">
                          <RosterStateChip state={b.state} />
                          {owner && b.cashHeld && <CashChip amount={`$${b.cashHeld}`} />}
                        </div>
                        {b.cancelsThisWeek > 0 && (
                          <span style={{ marginTop: 6 }}>{OBM.cancels(b.cancelsThisWeek)}</span>
                        )}
                      </div>
                      <span className="m-ob-chev">
                        <Icon name="chevron-right" size={20} />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {invites.length > 0 && (
              <>
                <h2 className="m-bh" style={{ margin: "8px 0 0" }}>
                  {OBM.grpInvites}
                </h2>
                <div className="m-ob-list">
                  {invites.map((i) =>
                    i.state === "expired" ? (
                      <div key={i.id} className="m-ob-row" style={{ alignItems: "center" }}>
                        <span className="m-ob-av" data-dash="">
                          <Icon name="user-plus" size={18} />
                        </span>
                        <div className="m-ob-t">
                          <b data-muted="">{i.name}</b>
                          <span>{OBM.inviteExpired}</span>
                        </div>
                        {owner && (
                          <button type="button" className="m-ob-pill" data-out="" disabled={disabled} onClick={() => newLink(i)}>
                            {OBM.newLink}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div key={i.id} className="m-ob-row">
                        <span className="m-ob-av" data-dash="">
                          <Icon name="user-plus" size={18} />
                        </span>
                        <div className="m-ob-t">
                          <b>{i.name}</b>
                          <span>{`${INVITE_STATE_LABEL[i.state]} · ${OBM.sentAgo(sharedAgo(i.sharedAt, now))}`}</span>
                          {owner && (
                            <div className="m-ob-acts">
                              <button type="button" className="m-ob-pill" disabled={disabled} onClick={() => shareAgain(i)}>
                                <Icon name="send" size={16} />
                                {OBM.shareAgain}
                              </button>
                              <button type="button" className="m-ob-pill" data-out="" data-ink="" disabled={disabled} onClick={() => revoke(i)}>
                                {OBM.revoke}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {fleet && owner && !empty && (
          <div className="m-foot">
            <button type="button" className="m-btn" disabled={actionsDisabled} onClick={() => setSheet({ kind: "invite" })}>
              <Icon name="user-plus" size={20} />
              {OBM.inviteBiker}
            </button>
          </div>
        )}
      </div>

      {sheet?.kind === "invite" && (
        <FleetInviteSheet
          branch={branch}
          initial={sheet.initial}
          onLink={(res) => upsertInvite(res.invite)}
          onCopied={() => toast(OBM.copied, { tone: "saved" })}
          onClose={close}
        />
      )}

      {(sheet?.kind === "biker" || sheet?.kind === "remove") && (
        <div className="m-overlay" style={{ zIndex: 70 }}>
          <div className="m-overlay-frame">
            <button type="button" className="m-scrim" aria-label={OBM.keep} onClick={close} />
            {sheet.kind === "biker" ? (
              <div className="m-sheet" role="dialog" aria-modal="true" aria-label={sheet.biker.name}>
                <div className="m-grab" />
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="m-ob-av">{initials(sheet.biker.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 className="m-ob-sheet-t">{sheet.biker.name}</h2>
                    <span className="m-num" style={{ fontSize: 14, color: "var(--muted)" }}>
                      {sheet.biker.phone}
                    </span>
                  </div>
                  {owner && (
                    <a className="m-ob-pill" data-out="" href={`tel:${sheet.biker.phone.replace(/\s/g, "")}`}>
                      <Icon name="phone" size={16} />
                      {OBM.call}
                    </a>
                  )}
                </div>
                <div style={{ display: "flex" }}>
                  <RosterStateChip state={sheet.biker.state} />
                </div>
                <div>
                  <div className="m-ob-kv">
                    <span>{OBM.homeBranch}</span>
                    <b>{sheet.biker.homeBranch}</b>
                  </div>
                  {owner && (
                    <div className="m-ob-kv">
                      <span>{OBM.cashHeld}</span>
                      {sheet.biker.cashHeld ? <CashChip amount={`$${sheet.biker.cashHeld}`} label={`$${sheet.biker.cashHeld}`} /> : <b>{OBM.none}</b>}
                    </div>
                  )}
                  <div className="m-ob-kv">
                    <span>{OBM.cancelsWeek}</span>
                    <b>{sheet.biker.cancelsThisWeek > 0 ? String(sheet.biker.cancelsThisWeek) : OBM.none}</b>
                  </div>
                </div>
                {owner && (
                  <button type="button" className="m-ob-ghost" disabled={actionsDisabled} onClick={() => setSheet({ kind: "remove", biker: sheet.biker })}>
                    {OBM.removeBiker}
                  </button>
                )}
              </div>
            ) : (
              <div className="m-sheet" role="alertdialog" aria-modal="true" aria-label={OBM.removeT(firstName(sheet.biker.name))}>
                <div className="m-grab" />
                <h2 className="m-ob-sheet-t">{OBM.removeT(firstName(sheet.biker.name))}</h2>
                <p className="m-ob-sheet-s">{OBM.removeB(firstName(sheet.biker.name), branch)}</p>
                {sheet.biker.cashHeld && (
                  <div className="m-ob-strip" data-tone="gold">
                    <span className="m-ob-strip-ic">
                      <Icon name="banknote" size={16} />
                    </span>
                    <div>{OBM.removeCashB(firstName(sheet.biker.name), `$${sheet.biker.cashHeld}`)}</div>
                  </div>
                )}
                {sheetError && (
                  <div className="m-alert" role="alert">
                    {sheetError}
                  </div>
                )}
                <button type="button" className="m-btn m-danger" disabled={disabled} onClick={() => void remove(sheet.biker)}>
                  {OBM.removeYes}
                </button>
                <button type="button" className="m-btn2" onClick={close}>
                  {OBM.keep}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Kitchen>
  );
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Loading: the real layout in skeleton (handoff "Roster · loading"). */
function RosterSkeleton() {
  return (
    <div className="m-ob-bd" aria-busy="true">
      <p className="m-ob-week" style={{ margin: 0 }}>
        {OBM.loading}
      </p>
      <span className="m-ob-sk" style={{ width: "30%", height: 12, borderRadius: 6 }} />
      <div className="m-ob-list" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="m-ob-row">
            <span className="m-ob-sk" style={{ width: 40, height: 40, borderRadius: 20 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="m-ob-sk" style={{ width: "50%", height: 14 }} />
              <span className="m-ob-sk" style={{ width: "30%", height: 12 }} />
              <span className="m-ob-sk" style={{ width: 64, height: 24, borderRadius: 12 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
