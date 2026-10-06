import React from "react";
import type { KycOutcomeId } from "../../logic/kyc-outcome";
import type { IconName } from "../Icon";
import { RO } from "../onboarding/copy";
import { KYF } from "../rider/copy";
import { PinnedFooter, ExitButton, type PinnedFooterProps } from "./actions";
import { TipChips, TriesMeter } from "./bits";
import { KY, PD } from "./copy";
import { Body, HeroDisc, HeroPanel, SplitTitle } from "./hero";
import type { FrTone } from "./metrics";
import { FirstRunScreen } from "./screen";
import { KycChecklist } from "./steps";

/**
 * First Run v2 F1–F8 — the ID-check outcomes in ONE shell (README §2 F, BRIEF 14, `fr-states.js` F*,
 * ledger D-80): the ✕ over the hero's top-left (the only way out — no tab bar, no mint top card, no
 * "Order food" / "Send a parcel" secondary, owner D-80 §2 #3), the hero + disc, the split title, the
 * body, then the 3-step checklist / tips / tries meter, and at most one CTA + one link. Never names the
 * vendor. Which page shows is decided by `kycScreenFor` (src/logic/kyc-outcome.ts).
 */
export interface IdCheckOutcomeProps {
  id: KycOutcomeId;
  /** F3 "Almost there, {firstName}". */
  firstName?: string | null;
  /** F4: self-serve tries left (the meter is drawn at 1 left — the only state a decline can be in). */
  triesLeft?: number;
  /** F6: when the ID expired. Not served yet (NEEDS BACKEND, D-80 §4) — the body drops the date then. */
  expiredAt?: Date | null;
  /** ✕: switch to the customer side (Home). */
  onExit: () => void;
  /** F3 finish, F4 try again, F6 re-verify, F7 try again — reopens the ID check. */
  onRetry: () => void;
  retrying?: boolean;
  /** WhatsApp: F2 / F4 / F7 link, F5 / F5dup CTA. */
  onHelp: () => void;
}

interface Page {
  tone: FrTone;
  icon?: IconName;
  spinner?: boolean;
  a: string;
  b: string;
  body?: string;
  checklist?: { step2: "active" | "next"; label: string };
  chips?: readonly { icon: IconName; label: string }[];
  tries?: boolean;
  primary?: "retry" | "help";
  primaryLabel?: string;
  primaryIcon?: IconName;
  primaryAfter?: boolean;
  link?: boolean;
}

/** Each frame as `fr-states.js` composes it (F8 F1 F3 F5 F6 F2 F4a–d F7). */
function pageFor(id: KycOutcomeId, firstName: string | null | undefined, expiredAt: Date | null | undefined): Page {
  switch (id) {
    case "F8":
      // `kyc('a','…')` — the drawn ellipsis while the check is being sent.
      return { tone: "mint", spinner: true, a: KY.justA, b: KY.justB, body: KY.justBody, checklist: { step2: "active", label: "…" } };
    case "F1":
      return { tone: "mint", icon: "clock", a: KY.reviewA, b: KY.reviewB, body: KY.reviewBody, checklist: { step2: "active", label: RO.inReview } };
    case "F2":
      return { tone: "mint", icon: "shield-check", a: KY.heldA, b: KY.heldB, body: KY.heldBody, checklist: { step2: "active", label: RO.inReview }, link: true };
    case "F3":
      return {
        tone: "mint",
        icon: "id-card",
        a: KY.unfA,
        b: KYF.unfName(firstName),
        body: KY.unfBody,
        checklist: { step2: "next", label: RO.stepIdTime },
        primary: "retry",
        primaryLabel: KY.unfCta,
        primaryIcon: "arrow-right",
        primaryAfter: true,
      };
    case "F4a":
      return {
        tone: "danger",
        icon: "camera",
        a: KY.blurryA,
        b: KY.blurryB,
        chips: [
          { icon: "sun", label: KY.blurryTip1 },
          { icon: "id-card", label: KY.blurryTip2 },
          { icon: "check", label: KY.blurryTip3 },
        ],
        tries: true,
        primary: "retry",
        primaryLabel: KY.tryAgain,
        primaryIcon: "camera",
        link: true,
      };
    case "F4b":
      return {
        tone: "danger",
        icon: "user",
        a: KY.faceA,
        b: KY.faceB,
        chips: [
          { icon: "user", label: KY.faceTip1 },
          { icon: "x", label: KY.faceTip2 },
          { icon: "x", label: KY.faceTip3 },
        ],
        tries: true,
        primary: "retry",
        primaryLabel: KY.tryAgain,
        primaryIcon: "camera",
        link: true,
      };
    case "F4c":
      return { tone: "danger", icon: "id-card", a: KY.docA, b: KY.docB, body: KY.docBody, tries: true, primary: "retry", primaryLabel: KY.tryAgain, primaryIcon: "camera", link: true };
    case "F4d":
      return { tone: "danger", icon: "circle-alert", a: KY.otherA, b: KY.otherB, body: KY.otherBody, tries: true, primary: "retry", primaryLabel: KY.tryAgain, primaryIcon: "camera", link: true };
    case "F5":
      return { tone: "mint", icon: "message-circle", a: KY.lockedA, b: KY.lockedB, body: KY.lockedBody, primary: "help", primaryLabel: KY.msg, primaryIcon: "message-circle" };
    case "F5dup":
      // F5's shell for a decline as a duplicate (owner 2026-10-06, D-80 §4): "Both tries are used" would be
      // false, so the body is PD's one-ID-one-account words (drawn for D4): "This ID is on another account.
      // One ID, one account. Message us and we'll sort it." — the sentence is undrawn on an F page.
      return { tone: "mint", icon: "message-circle", a: KY.lockedA, b: KY.lockedB, body: `${PD.takenA} ${PD.takenB}. ${PD.takenBody}`, primary: "help", primaryLabel: KY.msg, primaryIcon: "message-circle" };
    case "F6":
      return { tone: "danger", icon: "id-card", a: KY.expA, b: KY.expB, body: KYF.expBody(expiredAt ?? null), primary: "retry", primaryLabel: KY.expCta, primaryIcon: "camera" };
    case "F7":
      return {
        tone: "danger",
        icon: "wifi-off",
        a: KY.cantA,
        b: KY.cantB,
        body: KY.cantBody,
        chips: [
          { icon: "wifi-off", label: KY.cant1 },
          { icon: "camera", label: KY.cant2 },
        ],
        primary: "retry",
        primaryLabel: KY.tryAgain,
        primaryIcon: "refresh-cw",
        link: true,
      };
  }
}

export function IdCheckOutcome({ id, firstName, triesLeft, expiredAt, onExit, onRetry, retrying, onHelp }: IdCheckOutcomeProps): React.ReactElement {
  const p = pageFor(id, firstName, expiredAt);
  const footer: PinnedFooterProps = {};
  if (p.primary && p.primaryLabel) {
    footer.primary = {
      label: p.primaryLabel,
      icon: p.primaryIcon,
      iconAfter: p.primaryAfter,
      onPress: p.primary === "help" ? onHelp : onRetry,
      loading: p.primary === "retry" ? retrying : undefined,
      testID: "outcome-primary",
    };
  }
  if (p.link) footer.link = { label: KY.help, icon: "message-circle", onPress: onHelp, testID: "outcome-help" };
  const hasFooter = !!(footer.primary || footer.link);
  return (
    <FirstRunScreen testID={`kyc-outcome-${id}`} footer={hasFooter ? <PinnedFooter {...footer} /> : undefined}>
      <HeroPanel tone={p.tone} topLeft={<ExitButton onPress={onExit} />}>
        <HeroDisc icon={p.icon} spinner={p.spinner} />
      </HeroPanel>
      <SplitTitle a={p.a} b={p.b} tone={p.tone} />
      {p.body ? <Body>{p.body}</Body> : null}
      {p.chips ? <TipChips items={p.chips} /> : null}
      {/* `KY.triesLeft` is the only drawn meter label ("1 try left"): a decline below the lock is always 1 left. */}
      {p.tries && triesLeft === 1 ? <TriesMeter left={1} label={KY.triesLeft} /> : null}
      {p.checklist ? <KycChecklist step2={p.checklist.step2} label={p.checklist.label} /> : null}
    </FirstRunScreen>
  );
}
