import type { PillKind } from "../components/StatusPill";
import type { AdminReferralRow, ReferralFlag, ReferralStage } from "../lib/adminTypes";

/** Biker referrals (D-112): the words the console uses for a referral's stage and its warnings. */
export const STAGE_LABEL: Record<ReferralStage, string> = {
  joined: "joined",
  verified: "verified",
  riding: "riding",
};

export const STAGE_KIND: Record<ReferralStage, PillKind> = {
  joined: "mut",
  verified: "good",
  riding: "good",
};

export const FLAG_LABEL: Record<ReferralFlag, string> = {
  same_device: "same phone as referrer",
  same_id: "same ID as referrer",
  duplicate_id: "ID seen on another account",
  referrer_not_verified: "referrer not verified",
  not_active: "suspended or banned",
};

/** What the Stage column says, e.g. "riding · 3 jobs". */
export function stageText(r: AdminReferralRow): string {
  if (r.stage === "joined") return r.friend.kycStatus === "failed" ? "ID check failed" : "ID check not passed yet";
  return `${r.friend.trips} ${r.friend.trips === 1 ? "job" : "jobs"}`;
}
