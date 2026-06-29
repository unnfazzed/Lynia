# Lynia — QA / full-flow testing (no vendors)

> Lets you exercise the **entire** product end-to-end on real devices against the live API
> (`https://lyniago.lyniafinance.com`) **without** the WhatsApp BSP (OTP) or Didit (KYC) vendors —
> so vendor onboarding never blocks testing. This is a **test configuration of the production
> deployment**; there are no real users yet. The flip-to-launch checklist at the bottom turns the
> real vendors back on.

## Fail-safe model: QA is OPT-IN via repo variables

The deploy **defaults to launch-safe** (`OTP_CHANNEL=whatsapp`, `KYC_PROVIDER=didit`, `PUSH_PROVIDER=fcm`).
Test mode is turned on **only** by setting the matching repo Variables — so a vendor-free, auto-KYC build
can never reach the public URL by accident, and turning it off is just clearing the vars.

| Variable to set | Test value | Effect |
|---|---|---|
| `OTP_CHANNEL` | `console` | OTP codes logged, not sent via WhatsApp |
| `OTP_TEST_PHONES` | your test numbers (comma-sep) | `POST /auth/otp` returns the code **in the response** — ONLY for these numbers |
| `KYC_PROVIDER` | `stub` | rider KYC **auto-verifies** (no Didit) so riders can go online |
| `PUSH_PROVIDER` | `noop` | no Firebase needed; pushes logged, not sent |

Security: the OTP code is exposed **only** for `OTP_TEST_PHONES` numbers, **only** on the `console`
channel. An arbitrary phone can never retrieve a code (it's not an account-takeover hole). Rate limits
(per-phone / per-IP / global) still apply. Match is format-tolerant (spaces/dashes ignored) but uses the
exact number — `+263…` and `0…` prefixes are still different.

## Turn QA mode ON

```bash
gh variable set OTP_CHANNEL --body "console"
gh variable set KYC_PROVIDER --body "stub"
gh variable set PUSH_PROVIDER --body "noop"
gh variable set OTP_TEST_PHONES --body "+263771234567,+263770000002"   # your test number(s)
gh workflow run release.yml --ref main      # redeploy to apply
```
(Ad-hoc, no redeploy: `gcloud run services update lynia-api --region africa-south1 --update-env-vars '^@^OTP_CHANNEL=console@KYC_PROVIDER=stub@PUSH_PROVIDER=noop@OTP_TEST_PHONES=+263771234567'`.)

## Test the full customer flow
1. **Sign up / log in:** `POST /auth/otp {phone}` → response includes `devCode` (your allowlisted number).
   `POST /auth/otp/verify {phone, code}` → tokens. (On a device, the app calls these; read the `devCode`
   from the response while testing.)
2. Complete profile → **create an order** (pickup/dropoff, item, suggested fare).
3. From a **second account** (a rider — see below), make an offer; back on the customer, **select** it.
4. Watch **live tracking** (Socket.IO), then **rate** after delivery.

## Test the full rider flow
1. Log in with a second allowlisted test number → **become a rider** (`POST /riders/become`). With the
   stub provider this returns `kycStatus: "verified"` immediately — no Didit, no admin step.
2. **Go online** (`PATCH /riders/online`) — allowed because KYC passed.
3. See the broadcast order → **bid** → once selected, drive the lifecycle: mark collected → en route →
   **deliver with the handover OTP** → done. Earnings appear in the ledger.

> Want to test the **manual** KYC path (admin approval) instead of auto-verify? Deploy with
> `KYC_MODE=manual` — riders stay `pending` and an admin approves via `POST /admin/riders/:id/kyc`.

## ✅ Flip to launch (turn QA mode OFF)

Because QA is opt-in, launch = **clear the variables** (then redeploy):
```bash
gh variable delete OTP_CHANNEL      # back to default: whatsapp
gh variable delete KYC_PROVIDER     # back to default: didit
gh variable delete PUSH_PROVIDER    # back to default: fcm
gh variable delete OTP_TEST_PHONES  # no code ever returned
gh workflow run release.yml --ref main
```
Then complete the real-vendor wiring in `FOUNDER-RUNBOOK.md` (WhatsApp BSP, Didit keys, Firebase).

Fail-safe: with no vars set the deploy is already launch-safe; and the OTP code is never returned on the
`whatsapp`/`sms` channels regardless of `OTP_TEST_PHONES`. There is no committed default that ships test
mode — you must explicitly opt in.
