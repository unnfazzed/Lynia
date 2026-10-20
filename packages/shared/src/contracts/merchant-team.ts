/**
 * Contracts: merchant branches, team and invites. Re-exported by ../contracts.ts (the front door).
 */
import { z } from "zod";
import { MerchantBusinessType, MerchantLocationInput, MerchantMemberRole } from "./merchant";

/* ── Multi-branch owners (docs/plans/2026-09-30-multi-branch-owners.md) ─────────────────────────── */

/** An owner opens at most this many branches (each is a business of its own). */
export const MERCHANT_BRANCHES_MAX = 20;

/** One business the signed-in person is on (`GET /merchant/branches`). */
export const MerchantBranchResponse = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    /** Where it is, as riders read it at pickup. Null until the business has a pin. */
    landmark: z.string().nullable(),
    role: MerchantMemberRole,
    /** The branch every other merchant call is working on. Exactly one is active. */
    active: z.boolean(),
    /** Switched on by LyniaGo ops (restaurants: customers can order from it). */
    pilotEnabled: z.boolean(),
  })
  .strict();
export type MerchantBranchResponse = z.infer<typeof MerchantBranchResponse>;

/** The active branch first. A person on one business gets a list of one. */
export const MerchantBranchesResponse = z.object({ branches: z.array(MerchantBranchResponse) }).strict();
export type MerchantBranchesResponse = z.infer<typeof MerchantBranchesResponse>;

/** `POST /merchant/branches/switch` — work on another branch. Answers with that branch's `/merchant/me`.
 *  Reconnect the kitchen socket after it: the old branch's feed is left server-side. */
export const SwitchMerchantBranchRequest = z.object({ merchantId: z.string().uuid() }).strict();
export type SwitchMerchantBranchRequest = z.infer<typeof SwitchMerchantBranchRequest>;

/** `POST /merchant/branches` (owner only) — open a new branch from the active one. It copies the shop
 *  front (logo, cover, description, tags, price level), hours and cash rule, and the menu when asked; it
 *  starts dormant until ops switch it on, and becomes the active branch. */
export const CreateMerchantBranchRequest = z
  .object({
    /** As customers will see it, e.g. "Mama's Kitchen · Avondale". Unique among the owner's branches. */
    name: z.string().trim().min(1).max(120),
    location: MerchantLocationInput,
    copyMenu: z.boolean().optional(),
  })
  .strict();
export type CreateMerchantBranchRequest = z.infer<typeof CreateMerchantBranchRequest>;

/* ── Merchant web upgrade L4: Team (docs/designs/merchant-web-upgrade.md "L4 — Team") ──────────── */

/** An invite lasts this long before the person must be invited again. */
export const MERCHANT_INVITE_TTL_DAYS = 14;
/** A business sends at most this many invites a day (rate-limited and audit-logged). */
export const MERCHANT_INVITES_PER_DAY = 10;

/** One person on the business's team (`GET /merchant/team`, owner only). */
export const MerchantTeamMemberResponse = z
  .object({
    profileId: z.string().uuid(),
    /** The name the business knows them by. */
    name: z.string(),
    phoneMasked: z.string(),
    role: MerchantMemberRole,
    /** The signed-in person themselves. */
    you: z.boolean(),
    joinedAt: z.string(),
    /** Order flow v2 (BRIEF §13): may approve or decline prescriptions. Absent on older servers. */
    isPharmacist: z.boolean().optional(),
  })
  .strict();
export type MerchantTeamMemberResponse = z.infer<typeof MerchantTeamMemberResponse>;

/** An invite still waiting for the person's Join or Not me. */
export const MerchantTeamInviteResponse = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    phoneMasked: z.string(),
    /** International digits, so the owner can send the link from their own WhatsApp. */
    invitePhone: z.string(),
    createdAt: z.string(),
    expiresAt: z.string(),
  })
  .strict();
export type MerchantTeamInviteResponse = z.infer<typeof MerchantTeamInviteResponse>;

export const MerchantTeamResponse = z
  .object({
    members: z.array(MerchantTeamMemberResponse),
    invites: z.array(MerchantTeamInviteResponse),
  })
  .strict();
export type MerchantTeamResponse = z.infer<typeof MerchantTeamResponse>;

/** `POST /merchant/team/members/:profileId/pharmacist` (owner only, BRIEF §13). */
export const SetMerchantPharmacistRequest = z.object({ isPharmacist: z.boolean() }).strict();
export type SetMerchantPharmacistRequest = z.infer<typeof SetMerchantPharmacistRequest>;

/** `POST /merchant/team/invites` (owner only). Never reveals whether the number works elsewhere. */
export const CreateMerchantInviteRequest = z
  .object({
    name: z.string().trim().min(1).max(60),
    phone: z.string().trim().min(6).max(20),
  })
  .strict();
export type CreateMerchantInviteRequest = z.infer<typeof CreateMerchantInviteRequest>;

/** An invite waiting for the signed-in person (`GET /merchant/invites`): "{Owner} added you to {Business}". */
export const MyMerchantInviteResponse = z
  .object({
    id: z.string().uuid(),
    businessName: z.string(),
    businessType: MerchantBusinessType,
    /** The owner's first name, as the invite line says it. */
    ownerName: z.string(),
    role: MerchantMemberRole,
    /** The name the owner gave, which the person confirms or corrects at Join. */
    name: z.string(),
    expiresAt: z.string(),
  })
  .strict();
export type MyMerchantInviteResponse = z.infer<typeof MyMerchantInviteResponse>;

export const MyMerchantInvitesResponse = z.object({ invites: z.array(MyMerchantInviteResponse) }).strict();
export type MyMerchantInvitesResponse = z.infer<typeof MyMerchantInvitesResponse>;

/** `POST /merchant/invites/:id/join`: the person's name as they want it, and the one-tap terms line. */
export const JoinMerchantInviteRequest = z
  .object({
    name: z.string().trim().min(1).max(60),
    termsAccepted: z.literal(true),
  })
  .strict();
export type JoinMerchantInviteRequest = z.infer<typeof JoinMerchantInviteRequest>;
