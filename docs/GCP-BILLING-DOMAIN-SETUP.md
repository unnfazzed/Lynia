# GCP billing domain setup

Runbook for: **"Your Billing account ID admin email domain must match the website domain. Please
reach out to your billing account admin."** — hit while trying to make `shepherd@lyniafinance.com`
a billing admin on the GCP project (`lynia-500911`), currently owned by the consumer Gmail
`smahupa@gmail.com` (`infra/terraform/variables.tf:8` default project; the "consumer-gmail owner"
framing is `infra/terraform/admin.tf:87`).

## Root cause

`shepherd@lyniafinance.com` isn't a Google identity yet. Attempting to use it anywhere in Google's
console fails with a second, earlier error — **"Email addresses and domains must be associated with
an active Google Account, Google Workspace account, or Cloud Identity account"** — because no Google
identity product has ever provisioned that address. A custom-domain mailbox doesn't become a Google
identity just by existing; it has to be created through Workspace or Cloud Identity, which also
requires proving ownership of `lyniafinance.com` itself (which is what the "domain must match"
check is really verifying).

This matches what's already in the repo:

- `infra/terraform/admin.tf:86-88` notes the admin console's IAP had to use a hand-created **custom**
  OAuth client instead of Google's managed one, specifically because *"this project's org has no
  Cloud Identity directory."* `lyniafinance.com` has never been verified with Google.
- Nothing in the repo provisions a real inbox for the domain — `support@lyniafinance.com` is
  referenced as the contact address (`docs/PLAY-STORE-SUBMISSION.md`, `apps/api/src/legal/legal.content.ts`,
  `apps/mobile/src/config.ts`'s `SUPPORT_URL`) but there's no mail-hosting config anywhere, so it's
  likely not a live mailbox today.

## Fix: stand up Google Workspace for lyniafinance.com

Workspace is the right call here rather than the free Cloud Identity-only option, because there's no
existing email hosting for the domain to preserve — Workspace solves both problems at once: a real
Google identity **and** an actual inbox for `shepherd@`/`support@lyniafinance.com`.

1. Go to workspace.google.com → **Get started**.
2. Business name (e.g. "Lynia Finance"), employee count, country.
3. "Does your business have a domain?" → Yes → `lyniafinance.com`.
4. Create the first user with username `shepherd` → becomes `shepherd@lyniafinance.com` and is the
   new org's Super Admin by default.
5. **Verify domain ownership.** Google offers a TXT record (fastest) or an HTML-file/meta-tag
   alternative. `lyniafinance.com`'s DNS is on Cloudflare (`docs/CLOUDFLARE.md`) — add the record in
   the Cloudflare dashboard for the zone. (The `cloudflare` MCP server registered in this repo could
   do it too, but it's OAuth-gated per user and has to be authorized in an interactive session first —
   see `docs/CLOUDFLARE.md` "First-time authorization"; that flow can't complete from this
   non-interactive session.) Click Verify once the record is live — usually resolves within minutes.
6. `shepherd@lyniafinance.com` is now an active Google Workspace account.
7. Point an MX record at Google (the setup wizard supplies the exact records) so `@lyniafinance.com`
   mail actually delivers — this is also what turns `support@lyniafinance.com` from a string in the
   config into a real, receivable inbox.

Cheaper alternative — **Cloud Identity Free** (workspace.google.com/gcpidentity/): same
domain-verification flow, gives you the Google identity for IAM/console purposes at no cost, but no
Gmail hosting. Only worth it if email for this domain is (or will be) hosted elsewhere; nothing in
this repo suggests that's the case today, so Workspace is the better default.

## Then: add shepherd@ as a GCP billing admin

8. Sign in to console.cloud.google.com/billing as `smahupa@gmail.com` (still the account owner).
9. Select the billing account linked to `lynia-500911` → **Account management** → **Add principal**.
10. Add `shepherd@lyniafinance.com`, role **Billing Account Administrator** (`roles/billing.admin`).

If the specific check that produced the original error requires the billing account to have been
*created* by a matching-domain identity (rather than just granted admin after the fact), sign in as
`shepherd@lyniafinance.com` and create/claim a new billing account directly, then move
`lynia-500911`'s billing to it (Billing → select project → **Change billing account**) instead of
only granting IAM on the existing one.

## Why this isn't Terraform-managed

`infra/terraform/variables.tf:6` already calls billing-account linkage "the founder-gated,
non-codeable step" for project creation. Domain verification and Workspace signup are the same kind
of action — a manual, externally-credentialed step nothing in CI can perform on your behalf — so this
stays a runbook rather than a `.tf` resource, consistent with how the Didit/Play-publisher vendor
credentials are handled elsewhere in the infra docs.

## Optional follow-up

Once `lyniafinance.com` has a real Cloud Identity/Workspace directory, the admin console's IAP
(`infra/terraform/admin.tf`) could switch from its hand-created custom OAuth client to Google's
managed client scoped to the new directory. Not required to fix the billing error — just a future
cleanup this unblocks.
