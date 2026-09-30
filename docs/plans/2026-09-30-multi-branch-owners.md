# Multi-branch owners — one owner, several shops

Status: **server shipped in this PR (phase 1); app screens wait on a design (phase 2).**
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

## Phase 2 — the app (blocked on design)

The merchant mobile handoff (`packages/design/handoff/merchant-mobile/`, ledger D-48) draws **no branch
switcher and no "Add branch" screen**. Under the pixel-parity rule (*not drawn ⇒ not rendered*), the
screens wait for a design export. Needed from the design tool:

1. **Switcher** — the business name in the Orders header opens a list of the owner's branches (name +
   landmark, the active one marked, "Not live yet" for a dormant one). Only shown with 2+ branches.
2. **Add branch** — Account → "Add branch": name, the location step reused from sign-up, and a
   "Copy my menu" toggle. Ends on the new branch's setup checklist.

Once the export lands: wire `GET/POST /merchant/branches` and `…/switch` into `apps/merchant`, and
re-subscribe the kitchen socket after a switch. Until then nobody sees a change: the endpoints exist, but
no screen calls them.

## Rollout

The API is additive and behaves identically for everyone on one business, so phase 1 ships dark. Ops
switch each new branch on individually (`pilotEnabled`), after the usual go-live call.
