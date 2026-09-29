"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MyMerchantInviteResponse } from "@lynia/shared";
import { getAlarmController } from "../components/alarm-singleton";
import { Icon } from "../components/icons";
import { RetryableError } from "../components/RetryableError";
import { disabledStyle, ghostButtonStyle, primaryButtonStyle } from "../components/queue/styles";
import { ApiError, getMyMerchant } from "../lib/api-client";
import { homePath } from "../lib/booking";
import { primeBusiness } from "../lib/business";
import { API_BASE_URL } from "../lib/config";
import { clearMerchantSession } from "../lib/session";
import { ROLE_LABEL, validateJoinName } from "../lib/team";
import { declineInvite, joinInvite, listMyInvites } from "../lib/team-api";

type LoadState = { status: "checking" } | { status: "ready"; invites: MyMerchantInviteResponse[] } | { status: "error"; message: string };

/** Where "Set up my own business" goes: the sign-up, without being sent back here. */
const OWN_BUSINESS_PATH = "/onboarding?own=1";

/**
 * Join (merchant web upgrade L4, design doc "L4 — Team"): what a signed-in number with a pending invite
 * sees instead of "Set up your business". "{Owner} added you to {Business} as Staff", then **Join** — the
 * person confirms or corrects their name and accepts the privacy notice in the same one-tap line as
 * sign-up — or **Not me**, which deletes the invite. "One business per phone" is settled by the API at
 * Join, and only this person hears about it. They can still set up their own business instead.
 *
 * Outside the `(app)` group, like the sign-up: no kitchen chrome, no alarm and no queue socket, because
 * the person isn't on a business yet. Undrawn, ledgered as D-46.
 */
export default function JoinPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "checking" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; terms?: string }>({});
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
    setTerms(false);
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
      // One invite is the usual case: its Join form is open from the start.
      if (invites.length === 1) openInvite(invites[0]!);
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

  async function onJoin(e: React.FormEvent, invite: MyMerchantInviteResponse) {
    e.preventDefault();
    if (actingRef.current) return;
    const nameError = validateJoinName(name);
    const found = { ...(nameError ? { name: nameError } : {}), ...(terms ? {} : { terms: "Tick the box to accept LyniaGo's privacy notice." }) };
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

  return (
    // The sign-up's own screen and card, so the two read as one flow.
    <div className="onboarding-screen">
      <div className="onboarding-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static brand SVG from /public */}
          <img src="/brand/lyniago-mark.svg" alt="" width={32} height={32} />
          <span style={{ fontFamily: "var(--font-wordmark)", fontSize: 22, fontWeight: 600 }}>
            Lynia<span style={{ color: "var(--accent-700)" }}>Go</span>
          </span>
        </div>

        {state.status === "checking" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Checking your invites…</div>}
        {state.status === "error" && <RetryableError message={state.message} onRetry={() => void load()} />}

        {state.status === "ready" && (
          <div>
            <h1 style={titleStyle}>{state.invites.length === 1 ? "You've been added to a team" : "You've been added to a few teams"}</h1>
            <div style={subStyle}>You sign in with your own number and code. A phone works at one business at a time.</div>

            {banner && (
              <div role="alert" style={bannerStyle}>
                {banner}
              </div>
            )}

            <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
              {state.invites.map((invite) => (
                <div key={invite.id} style={{ border: "1.5px solid var(--line)", borderRadius: 14, padding: 14 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent-wash)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <Icon name={invite.businessType === "shop" ? "store" : "utensils"} size={20} color="var(--accent-text)" />
                    </span>
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                      {invite.ownerName} added you to <b>{invite.businessName}</b> as {ROLE_LABEL[invite.role]}.
                    </p>
                  </div>

                  {openId === invite.id ? (
                    <form onSubmit={(e) => void onJoin(e, invite)} noValidate style={{ marginTop: 14 }}>
                      <label htmlFor={`join-name-${invite.id}`} style={labelStyle}>
                        Your name
                      </label>
                      <input
                        id={`join-name-${invite.id}`}
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
                        }}
                        autoComplete="name"
                        maxLength={60}
                        aria-invalid={!!errors.name}
                        style={inputStyle}
                      />
                      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>The team sees you by this name.</div>
                      {errors.name && (
                        <div role="alert" style={fieldErrorStyle}>
                          {errors.name}
                        </div>
                      )}

                      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.45, cursor: "pointer", marginTop: 14 }}>
                        <input
                          type="checkbox"
                          checked={terms}
                          onChange={(e) => {
                            setTerms(e.target.checked);
                            if (errors.terms) setErrors((x) => ({ ...x, terms: undefined }));
                          }}
                          style={{ width: 22, height: 22, margin: 0, flexShrink: 0, accentColor: "var(--cta-fill)" }}
                        />
                        <span>
                          I accept LyniaGo&apos;s{" "}
                          <a href={`${API_BASE_URL}/legal/privacy`} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)", fontWeight: 600 }}>
                            privacy notice
                          </a>
                          .
                        </span>
                      </label>
                      {errors.terms && (
                        <div role="alert" style={fieldErrorStyle}>
                          {errors.terms}
                        </div>
                      )}

                      <button type="submit" disabled={busy !== null} style={{ ...primaryWideStyle, marginTop: 16, ...disabledStyle(busy !== null) }}>
                        {busy === invite.id ? "Joining…" : `Join ${invite.businessName}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onNotMe(invite)}
                        disabled={busy !== null}
                        style={{ ...ghostButtonStyle, width: "100%", marginTop: 10, ...disabledStyle(busy !== null) }}
                      >
                        Not me
                      </button>
                    </form>
                  ) : (
                    <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => openInvite(invite)} disabled={busy !== null} style={{ ...primaryButtonStyle, ...disabledStyle(busy !== null) }}>
                        Join
                      </button>
                      <button type="button" onClick={() => void onNotMe(invite)} disabled={busy !== null} style={{ ...ghostButtonStyle, ...disabledStyle(busy !== null) }}>
                        Not me
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button type="button" onClick={() => router.push(OWN_BUSINESS_PATH)} style={{ ...ghostButtonStyle, width: "100%", marginTop: 16 }}>
              Set up my own business instead
            </button>
            <div style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
              Wrong number?{" "}
              <button type="button" onClick={signOut} style={inlineLinkStyle}>
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const titleStyle: React.CSSProperties = { fontSize: 22, fontWeight: 800, margin: 0 };
const subStyle: React.CSSProperties = { fontSize: 13.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.45 };
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
const primaryWideStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  width: "100%",
  height: "var(--target-primary)",
  padding: "0 16px",
  fontSize: 16,
};
const fieldErrorStyle: React.CSSProperties = { fontSize: 12.5, color: "var(--danger-ink)", marginTop: 6 };
const bannerStyle: React.CSSProperties = {
  color: "var(--danger-ink)",
  background: "var(--danger-wash)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  marginTop: 14,
};
const inlineLinkStyle: React.CSSProperties = {
  minHeight: "var(--target-min)",
  padding: "0 4px",
  border: "none",
  background: "none",
  color: "var(--accent-text)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
