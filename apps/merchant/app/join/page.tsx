"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MyMerchantInviteResponse } from "@lynia/shared";
import { getAlarmController } from "../components/alarm-singleton";
import { AppBar } from "../components/m/AppBar";
import { RetryableError } from "../components/RetryableError";
import { ApiError, getMyMerchant } from "../lib/api-client";
import { homePath } from "../lib/booking";
import { primeBusiness } from "../lib/business";
import { clearMerchantSession } from "../lib/session";
import { ROLE_LABEL, validateJoinName } from "../lib/team";
import { declineInvite, joinInvite, listMyInvites } from "../lib/team-api";

type LoadState = { status: "checking" } | { status: "ready"; invites: MyMerchantInviteResponse[] } | { status: "error"; message: string };

/** Where "Set up my own business" goes: the sign-up, without being sent back here. */
const OWN_BUSINESS_PATH = "/onboarding?own=1";

/**
 * A5 · Join a team (packages/design/handoff/merchant-mobile): what a signed-in number with a pending
 * invite sees instead of "Set up your business". The business's tile, "Join Siyaso Spares", "Farai
 * added you as **Staff**.", your name, then **Join**, or **Not me** (deletes the invite) · **Start my
 * own business**. The privacy notice was accepted on the sign-in screen (README A1), so there is no
 * tick here. "One business per phone" is settled by the API at Join. With more than one invite, the
 * next one shows once the first is joined or declined.
 *
 * Outside the `(app)` group, like the sign-up: no tab bar and no queue socket.
 */
export default function JoinPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "checking" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const actingRef = useRef(false);

  const signOut = useCallback(() => {
    clearMerchantSession();
    router.replace("/login");
  }, [router]);

  const openInvite = useCallback((invite: MyMerchantInviteResponse) => {
    setOpenId(invite.id);
    setName(invite.name);
    setErrors({});
  }, []);

  const load = useCallback(async () => {
    setState({ status: "checking" });
    try {
      // Already on a business (a second tab, or the back button after joining): go to its home.
      const merchant = await getMyMerchant();
      router.replace(homePath(merchant));
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return signOut();
      if (!(err instanceof ApiError && err.status === 403)) {
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your account." });
        return;
      }
    }
    try {
      const { invites } = await listMyInvites();
      if (invites.length === 0) {
        router.replace(OWN_BUSINESS_PATH);
        return;
      }
      setState({ status: "ready", invites });
      // The first invite's Join form is open from the start.
      if (invites[0]) openInvite(invites[0]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return signOut();
      // An API without Team yet has no invites to show.
      if (err instanceof ApiError && err.status === 404) {
        router.replace(OWN_BUSINESS_PATH);
        return;
      }
      setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your invites." });
    }
  }, [openInvite, router, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  function dropInvite(id: string) {
    setState((s) => {
      if (s.status !== "ready") return s;
      const invites = s.invites.filter((i) => i.id !== id);
      if (invites.length === 0) router.replace(OWN_BUSINESS_PATH);
      return { status: "ready", invites };
    });
    if (openId === id) setOpenId(null);
  }

  // Declined (or gone), the next invite opens; the screen shows one business at a time.
  useEffect(() => {
    if (state.status !== "ready") return;
    const first = state.invites[0];
    if (first && !state.invites.some((i) => i.id === openId)) openInvite(first);
  }, [state, openId, openInvite]);

  async function onJoin(e: React.FormEvent, invite: MyMerchantInviteResponse) {
    e.preventDefault();
    if (actingRef.current) return;
    const nameError = validateJoinName(name);
    const found = nameError ? { name: nameError } : {};
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;
    actingRef.current = true;
    setBusy(invite.id);
    try {
      const merchant = await joinInvite(invite.id, { name: name.trim(), termsAccepted: true });
      primeBusiness(merchant);
      // The Join tap is a gesture: a restaurant's order alarm is ready from the first screen.
      getAlarmController().arm();
      router.replace(homePath(merchant));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return signOut();
      const message = err instanceof ApiError ? err.message : "Couldn't join. Try again.";
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        dropInvite(invite.id);
        setBanner(err.status === 404 ? "That invite isn't there any more. Ask the owner to send a new one." : message);
      } else {
        setBanner(message);
      }
      setBusy(null);
      actingRef.current = false;
    }
  }

  async function onNotMe(invite: MyMerchantInviteResponse) {
    if (actingRef.current) return;
    actingRef.current = true;
    setBusy(`decline:${invite.id}`);
    setBanner(null);
    try {
      await declineInvite(invite.id);
      dropInvite(invite.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return signOut();
      if (err instanceof ApiError && err.status === 404) dropInvite(invite.id);
      else setBanner(err instanceof ApiError ? err.message : "Couldn't do that. Try again.");
    } finally {
      setBusy(null);
      actingRef.current = false;
    }
  }

  const invite = state.status === "ready" ? state.invites.find((i) => i.id === openId) : undefined;

  return (
    <div className="m-app">
      <AppBar onBack={signOut} />
      {state.status === "checking" && <div className="m-bd" aria-busy="true" />}
      {state.status === "error" && (
        <div className="m-bd" style={{ padding: "16px 20px" }}>
          <RetryableError message={state.message} onRetry={() => void load()} />
        </div>
      )}
      {invite && (
        <form className="m-bd" style={{ flex: 1, padding: "16px 20px 20px", gap: 16 }} onSubmit={(e) => void onJoin(e, invite)} noValidate>
          <div className={`m-th ${invite.businessType === "shop" ? "m-tile-shop" : "m-tile-food"}`} style={{ width: 64, height: 64, borderRadius: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static illustrations from /public */}
            <img src={invite.businessType === "shop" ? "/brand/biz-small-business.svg" : "/brand/food.svg"} alt="" style={{ width: 58 }} />
          </div>
          <div>
            <h1 className="m-h1">Join {invite.businessName}</h1>
            <p className="m-sub" style={{ marginTop: 8 }}>
              {invite.ownerName ? `${invite.ownerName} added you` : "You were added"} as <b style={{ color: "var(--ink)" }}>{ROLE_LABEL[invite.role]}</b>.
            </p>
          </div>
          <div className="m-fld">
            <label htmlFor="join-name">Your name</label>
            <div className="m-in" data-invalid={errors.name ? true : undefined}>
              <input id="join-name" value={name} autoComplete="name" aria-invalid={errors.name ? true : undefined} onChange={(e) => setName(e.target.value)} />
            </div>
            {errors.name && <span className="m-err">{errors.name}</span>}
          </div>
          {banner && (
            <div className="m-alert" role="alert">
              {banner}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <button type="submit" className="m-btn" disabled={busy !== null}>
            {busy === invite.id ? "Joining…" : `Join ${invite.businessName}`}
          </button>
          <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
            <button type="button" className="m-lnk" disabled={busy !== null} onClick={() => void onNotMe(invite)}>
              Not me
            </button>
            <span className="m-lnk m-muted" aria-hidden="true">
              ·
            </span>
            <button type="button" className="m-lnk" onClick={() => router.push(OWN_BUSINESS_PATH)}>
              Start my own business
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
