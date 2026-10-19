"use client";

import { countryFlag, HOME_COUNTRY, intlPhoneProblem, nationalDigits, toE164 as intlE164, type Country, type FleetInviteLinkResponse } from "@lynia/shared";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api-client";
import { createFleetInvite } from "../../lib/fleet-api";
import { invitePhone, inviteWhatsApp } from "../../lib/own-bikers";
import { OBM } from "../../lib/own-bikers-copy";
import { formatLocalDigits, LOCAL_DIGITS, localDigits, toE164 } from "../../lib/phone-input";
import { Icon } from "../icons";
import { CountrySheet } from "./CountrySheet";

type Step =
  | { kind: "form" }
  | { kind: "creating" }
  | { kind: "link"; res: FleetInviteLinkResponse }
  | { kind: "fail"; message: string | null }
  | { kind: "net" };

/**
 * OB-M6 · Invite a biker (handoff own-bikers-v1, D-117: no SMS). The owner enters the number (D-116's country
 * picker) and a name; "Get invite link" returns a link bound to that number, valid 7 days. They share it: "Share on
 * WhatsApp" (wa.me to that number with `waText`) or "Copy link" (toast). A number already invited gets the same link
 * ("Already invited · same link"). Couldn't get a link / Can't reach LyniaGo keep the form with Try again.
 *
 * `initial` opens straight on a link (Share again, New link).
 */
export function FleetInviteSheet({
  branch,
  initial,
  onLink,
  onClose,
  onCopied,
}: {
  /** The business the invite is from, for `waText` ("join Chicken Inn Avondale’s bikers"). */
  branch: string;
  initial?: FleetInviteLinkResponse;
  /** A link was made (a new invite, or the same one again): the roster updates its INVITES group. */
  onLink: (res: FleetInviteLinkResponse) => void;
  onClose: () => void;
  onCopied: () => void;
}) {
  const [step, setStep] = useState<Step>(initial ? { kind: "link", res: initial } : { kind: "form" });
  const [country, setCountry] = useState<Country>(HOME_COUNTRY);
  const [digits, setDigits] = useState("");
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const isHome = country.iso === HOME_COUNTRY.iso;

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const phoneOk = isHome ? digits.length === LOCAL_DIGITS : intlPhoneProblem(digits, country) === null;
  const ready = phoneOk && name.trim().length > 0;

  async function getLink() {
    if (busyRef.current) return;
    if (!ready) {
      // Drawn enabled while typing: an incomplete form takes the cursor to what's missing.
      (phoneOk ? nameRef : phoneRef).current?.focus();
      return;
    }
    busyRef.current = true;
    setFieldError(null);
    setStep({ kind: "creating" });
    try {
      const res = await createFleetInvite({ name: name.trim(), phone: isHome ? toE164(digits) : intlE164(country, digits) });
      onLink(res);
      setStep({ kind: "link", res });
    } catch (err) {
      // authedFetch reports a dropped connection as status 0.
      if (!(err instanceof ApiError) || err.status === 0) setStep({ kind: "net" });
      else if (err.status >= 400 && err.status < 500 && err.reason !== "owner_only") {
        // The number itself was refused ("already one of your bikers", "like 0771234567", today's limit): say it
        // where it's fixed, and keep the form.
        setFieldError(err.message);
        setStep({ kind: "form" });
      } else setStep({ kind: "fail", message: null });
    } finally {
      busyRef.current = false;
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      onCopied();
    } catch {
      // No clipboard (an old browser, or no permission): the link is on screen to copy by hand.
    }
  }

  function another() {
    setStep({ kind: "form" });
    setDigits("");
    setName("");
    setFieldError(null);
    phoneRef.current?.focus();
  }

  const busy = step.kind === "creating";
  const got = step.kind === "link" ? step.res : null;

  return (
    <div className="m-overlay" style={{ zIndex: 70 }}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label={OBM.done} onClick={onClose} />
        <div className="m-sheet" role="dialog" aria-modal="true" aria-label={OBM.inviteT}>
          <div className="m-grab" />
          <h2 className="m-ob-sheet-t">{OBM.inviteT}</h2>
          {got ? (
            <>
              <p className="m-sub m-num" style={{ margin: 0 }}>{`${got.invite.name} · ${invitePhone(got.phone)}`}</p>
              <div className="m-ob-link" role="status">
                <div className="m-ob-link-hd">
                  <span className="m-ob-link-ic">
                    <Icon name={got.alreadyInvited ? "user-plus" : "check"} size={18} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{got.alreadyInvited ? OBM.alreadyInvited : OBM.linkReady(got.invite.name)}</b>
                    <span>{OBM.linkSub}</span>
                  </div>
                </div>
                <div className="m-ob-url">
                  <code>{got.link.replace(/^https?:\/\//, "")}</code>
                  <button type="button" className="m-ob-pill" data-out="" onClick={() => void copy(got.link)}>
                    {OBM.copyLink}
                  </button>
                </div>
              </div>
              <a className="m-btn" href={inviteWhatsApp(got.phone, got.invite.name, branch, got.link)} target="_blank" rel="noreferrer">
                <Icon name="message-circle" size={20} />
                {OBM.shareWa}
              </a>
              <button type="button" className="m-btn2" onClick={another}>
                <Icon name="user-plus" size={16} />
                {OBM.inviteAnother}
              </button>
            </>
          ) : (
            <form
              noValidate
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                void getLink();
              }}
            >
              <p className="m-ob-sheet-s">{OBM.inviteB}</p>
              <div className="m-fld">
                <label htmlFor="ob-phone">{OBM.phone}</label>
                <div className="m-in" data-invalid={!!fieldError}>
                  <button
                    type="button"
                    className="m-cc"
                    disabled={busy}
                    aria-label={`Country: ${country.name}, +${country.dial}. Change`}
                    aria-haspopup="dialog"
                    onClick={() => setPicking(true)}
                  >
                    <span className="m-cc-flag" aria-hidden="true">
                      {countryFlag(country.iso)}
                    </span>
                    <span className="m-num">{`+${country.dial}`}</span>
                    <span className="m-cc-chev" aria-hidden="true" />
                  </button>
                  <span style={{ width: 1, height: 22, background: "var(--line)" }} />
                  <input
                    id="ob-phone"
                    ref={phoneRef}
                    className="m-num"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    disabled={busy}
                    placeholder={isHome ? "77 123 4567" : "Mobile number"}
                    aria-describedby="ob-phone-help"
                    value={isHome ? formatLocalDigits(digits) : digits}
                    onChange={(e) => {
                      setFieldError(null);
                      setDigits(isHome ? localDigits(e.target.value) : nationalDigits(e.target.value, country));
                    }}
                  />
                </div>
                <span id="ob-phone-help" className="m-hint" style={{ margin: 0 }}>
                  {OBM.phoneHelp}
                </span>
                {fieldError && (
                  <span className="m-err" role="alert">
                    {fieldError}
                  </span>
                )}
              </div>
              <div className="m-fld">
                <label htmlFor="ob-name">{OBM.name}</label>
                <span className="m-in">
                  <input id="ob-name" ref={nameRef} value={name} maxLength={60} disabled={busy} placeholder={OBM.namePh} onChange={(e) => setName(e.target.value)} />
                </span>
              </div>
              {(step.kind === "fail" || step.kind === "net") && (
                <div className="m-ob-strip" data-tone="bad" data-act="" role="alert">
                  <span className="m-ob-strip-ic">
                    <Icon name={step.kind === "net" ? "wifi-off" : "circle-alert"} size={16} />
                  </span>
                  <div>
                    <b>{step.kind === "net" ? OBM.cantReach : OBM.cantCreate}</b>
                  </div>
                  <button type="submit" className="m-ob-pill">
                    <Icon name="rotate-cw" size={16} />
                    {OBM.tryAgain}
                  </button>
                </div>
              )}
              <button type="submit" className="m-btn" disabled={busy} aria-busy={busy}>
                {busy ? (
                  <>
                    <span className="m-spin" aria-hidden="true" />
                    {OBM.creating}
                  </>
                ) : (
                  <>
                    <Icon name="send" size={20} />
                    {OBM.createLink}
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
      {picking ? (
        <CountrySheet
          selected={country}
          onClose={() => {
            setPicking(false);
            phoneRef.current?.focus();
          }}
          onSelect={(c) => {
            setPicking(false);
            if (c.iso !== country.iso) {
              setCountry(c);
              setDigits((d) => (c.iso === HOME_COUNTRY.iso ? localDigits(d) : nationalDigits(d, c)));
            }
            phoneRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
