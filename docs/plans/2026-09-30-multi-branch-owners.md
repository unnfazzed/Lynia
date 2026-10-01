# Multi-branch owners — one owner, several shops

Status: **phase 1 (server) shipped in PR #999; phase 2 (merchant app screens) built from the 2026-10-01 design export (ledger D-51).**
Owner decision 2026-09-30: *"option 1 is preferred"* — the minimum viable way to support someone with
shops in several places. This reverses the "multi-branch owners" line in the *Explicitly not in scope*
list of `docs/plans/2026-09-29-merchant-web-upgrade-plan.md`.

## The model, in one line

**A branch is an ordinary business. One person can be on several, and works on one at a time.**

Each branch is its own `merchants` row with its own pin, hours, menu, team, kitchen queue, pilot switch,
rating and cash ledger. Customers see each branch as its own restaurant or shop, so distances, ETAs and
rider pickup points are right with no dispatch change. The owner has a `merchant_members` row per branch.
The branch they are working on is the row with the latest `active_at`.

Every merchant call already asks one question, "which business is this person on?"
(`resolveMerchantAccess`). It now answers "the one they last switched to", so switching branch moves the
whole app — orders, menu, team, bookings, riders, money — with no change to any merchant service.

## What changed (phase 1, API)

| Area | Change |
|---|---|
| `merchant_members` | Unique per `(profile_id, merchant_id)` instead of per person (0060 builds it, 0062 drops the old one). New nullable `active_at`. |
| `merchants.owner_profile_id` | No longer unique; a plain index replaces it (0061, then 0062 drops the unique one). |
| `resolveMerchantAccess` / `TrackingService.ownMerchantId` | Pick the active row: latest `active_at`, never-switched rows last, then oldest (`ACTIVE_MEMBERSHIP_ORDER`). A person on one business resolves exactly as before. |
| `GET /merchant/branches` | The businesses the caller is on, active first. Any member. |
| `POST /merchant/branches/switch` `{merchantId}` | Work on another branch. Answers with that branch's `/merchant/me`. A business the caller isn't on is a 404. Audit `merchant.branch.switch`. The caller's sockets leave the old branch's queue; the client re-subscribes. |
| `POST /merchant/branches` `{name, location, copyMenu?}` | **Owner only.** Opens a branch from the active business: copies the shop front (logo, cover, description, tags, price level), hours, cash rule, prep time and type; the menu when `copyMenu` (categories + items, all back in stock, photos shared). Starts **dormant** (`pilotEnabled=false`) until ops switch it on. Becomes the active branch. Audit `merchant.branch.create`. |

Guard rails:

- **Staff still work at one business.** Joining by invite refuses anyone already on another business
  (`member_elsewhere`), same as before. Only an owner opening branches is on several.
- **Sign-up (`/merchant/become`) is still for people on no business.** A second business is opened from
  inside the app as a branch.
- **Support handovers** (`POST /admin/merchants/:id/owner`) still go only to someone on no other business.
  A multi-branch owner who hands one branch over stays on it as Staff, and keeps owning the rest.
- **Account erasure** still refuses anyone who owns a business, so an owner hands every branch over first.
- **Double submits.** The unique index used to stop a double tap landing someone on two businesses. Now
  the person's `profiles` row is locked (`lockMembershipsTx`) in join, sign-up and new-branch, and the
  check is repeated under the lock. A branch name must also be unique among the owner's branches
  (case-insensitive), so a double tap opens one branch.
- **Limit:** 20 branches per owner (`MERCHANT_BRANCHES_MAX`), and at most 5 opened per minute.

Known trade-off: the active branch is **per person, not per device**. An owner switching on their phone
also switches their tablet on its next request. Branch staff are on one business, so this only affects
the owner. It's acceptable for now; a per-device choice would need the branch to travel with every request.

## Not in scope (deliberately)

A parent brand entity, one menu shared across branches, combined reports across branches, shared stock,
moving staff between branches, and an owner inviting themselves as staff elsewhere. Each is a later
feature if chains ask for it.

## Phase 2 — the app (built)

The owner had the screens drawn from a brief and handed over the export on 2026-10-01. It is in
`packages/design/handoff/merchant-mobile/` (README section F, `branches/`), and the app follows it:

- **B1 / D1 header:** a chevron after the business name for an owner with 2+ branches; the name and
  chevron open **C6**.
- **C6 Branches:** a sheet listing the branches, the current one first with a check, "Not live yet" on a
  restaurant ops haven't switched on, and "+ Add a branch" (owner).
- **C4 Account:** a **Branches** row (owner), with the count once there are 2+, which opens **C7**.
- **C7 Add a branch:** name, A4's location block, "Copy my menu / items" with live counts, the four API
  errors in the drawn places, saving and offline states.
- **Not live yet:** an owner's dormant restaurant branch shows "Almost ready" instead of an empty queue.

A switch (or a new branch) re-joins the live order feed for the new branch, re-mounts every screen so it
re-reads its data, and lands on that branch's Orders home with the drawn toast. The order alarm rings only
for the current branch (the export's answer A). The two readings the app had to make, which count as live
and when "Almost ready" shows, are in ledger D-51. Evidence: `docs/parity/MERCHANT-MOBILE-BRANCHES-2026-10-01.png`.

## Rollout

The API is additive and behaves identically for everyone on one business, so phase 1 ships dark. Ops
switch each new branch on individually (`pilotEnabled`), after the usual go-live call.
