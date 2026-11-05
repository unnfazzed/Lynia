"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MyMerchantInviteResponse } from "@lynia/shared";
import { getAlarmController } from "../components/alarm-singleton";
import { AppBar } from "../components/m/AppBar";
import { NameFields } from "../components/m/NameFields";
import { RetryableError } from "../components/RetryableError";
import { ApiError, getMyAccount, getMyMerchant } from "../lib/api-client";
import { homePath } from "../lib/booking";
import { primeBusiness } from "../lib/business";
import { supportWhatsAppUrl } from "../lib/config";
import { signOutSession } from "../lib/sign-out";
import { accountPersonName, EMPTY_PERSON_NAME, joinPersonName, type PersonName, type PersonNameErrors, validatePersonName } from "../lib/person-name";
import { needsSupport } from "../lib/sign-up";
import { ROLE_LABEL } from "../lib/team";
import { declineInvite, joinInvite, listMyInvites } from "../lib/team-api";

type LoadState = { status: "checking" } | { status: "ready"; invites: MyMerchantInviteResponse[] } | { status: "error"; message: string };

/** Where "Set up my own business" goes: the sign-up, without being sent back here. */
const OWN_BUSINESS_PATH = "/onboarding?own=1";

/**
 * A5 · Join a team (packages/design/handoff/merchant-mobile): what a signed-in number with a pending
 * invite sees instead of "Set up your business". The business's tile, "Join Siyaso Spares", "Farai
 * added you as **Staff**.", your name (First name · Surname, D-124), then **Join**, or **Not me** (deletes the invite) · **Start my
 * own business**. The privacy notice was accepted on the sign-in screen (README A1), so there is no
 * tick here. "One business per phone" is settled by the API at Join. With more than one invite, the
 * next one shows once the first is joined or declined.
 *
 * The name boxes start from the person's own LyniaGo account, never from the name the owner typed on the
 * invite (D-124): that one only labels the pending invite on the owner's Team list.
 *
 * Outside the `(app)` group, like the sign-up: no tab bar and no queue socket.
 */
export default function JoinPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "checking" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState<PersonName>(EMPTY_PERSON_NAME);
  const [errors, setErrors] = useState<PersonNameErrors>({});
  const [banner, setBannerText] = useState<string | null>(null);
  const [bannerHelp, setBannerHelp] = useState(false);
  const setBanner = useCallback((text: string | null) => {
    setBannerText(text);
    setBannerHelp(false);
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const actingRef = useRef(false);

  const signOut = useCallback(() => {
    signOutSession();
    router.replace("/login");
  }, [router]);

  const openInvite = useCallback((invite: MyMerchantInviteResponse) => {
    setOpenId(invite.id);
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
      // Their own name, from their account (best effort; empty for a number that never chose one).
      getMyAccount()
        .then((me) => {
          const own = accountPersonName(me);
          setName((n) => ({ firstName: n.firstName || own.firstName, lastName: n.lastName || own.lastName }));
        })
        .catch(() => {});
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
    const found = validatePersonName(name);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;
    actingRef.current = true;
    setBusy(invite.id);
    try {
      const merchant = await joinInvite(invite.id, {
        name: joinPersonName(name),
        firstName: name.firstName.trim(),
        lastName: name.lastName.trim(),
        termsAccepted: true,
      });
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
        // MJ-L12: a held or restricted number is told to message LyniaGo on WhatsApp — give it the link.
        setBannerHelp(err instanceof ApiError && needsSupport(err.reason));
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
  const help = bannerHelp ? supportWhatsAppUrl() : null;

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
          <NameFields
            idPrefix="join"
            value={name}
            errors={errors}
            onChange={(key, v) => {
              setName((n) => ({ ...n, [key]: v }));
              setErrors((e) => ({ ...e, [key]: undefined }));
            }}
          />
          {banner && (
            <div className="m-alert" role="alert">
              {banner}
              {help && (
                <>
                  {" "}
                  <a href={help} target="_blank" rel="noreferrer">
                    Open WhatsApp
                  </a>
                </>
              )}
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
