# Lynia — QA / full-flow testing (no vendors)

> Lets you exercise the **entire** product end-to-end on real devices against the live API
> (`https://lyniago.lyniafinance.com`) **without** the WhatsApp BSP (OTP) or Didit (KYC) vendors —
> so vendor onboarding never blocks testing. This is a **test configuration of the production
> deployment**; there are no real users yet. The flip-to-launch checklist at the bottom turns the
> real vendors back on.

## What test mode changes (all via deploy env in `release.yml`)

| Setting | Test value | Effect |
|---|---|---|
| `OTP_CHANNEL` | `console` | OTP codes are logged, not sent via WhatsApp |
| `OTP_TEST_PHONES` | repo variable (your test numbers) | `POST /auth/otp` returns the code **in the response** — but ONLY for these exact numbers |
| `KYC_PROVIDER` | `stub` | rider KYC **auto-verifies** (no Didit) so riders can go online |
| `PUSH_PROVIDER` | `noop` | no Firebase needed; pushes are logged, not sent |

Security note: the OTP code is exposed **only** for numbers you put in `OTP_TEST_PHONES`, only on the
`console` channel. An arbitrary phone can never retrieve a code, so this is not an account-takeover
hole. Rate limits (per-phone / per-IP / global) still apply.

## One-time setup: register your test phone numbers

Set the repo variable with the number(s) you'll test with (E.164 format, exactly as the app sends them),
then redeploy so it takes effect:

```bash
# comma-separated; use the exact format the app submits (e.g. +263...)
gh variable set OTP_TEST_PHONES --body "+263771234567,+263770000002"
gh workflow run release.yml --ref main      # redeploy to pick up the variable
```
(Or change it live without a redeploy: `gcloud run services update lynia-api --region africa-south1 --update-env-vars OTP_TEST_PHONES="+263771234567"`.)

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

## ✅ Flip to launch (turn real vendors back on)

Before real users, revert test mode in `release.yml`'s deploy `--set-env-vars` (and push):
- `OTP_CHANNEL=console` → **`whatsapp`** (after WhatsApp BSP is wired — see `FOUNDER-RUNBOOK.md`)
- remove **`OTP_TEST_PHONES`** (or clear the repo variable) so no code is ever returned
- `KYC_PROVIDER=stub` → **`didit`** (after the Didit account + keys)
- `PUSH_PROVIDER=noop` → **`fcm`** (after the Firebase project + device registration)

Fail-safe: even if you forget `OTP_TEST_PHONES`, it defaults to empty (no exposure); and the code is
never returned on the `whatsapp`/`sms` channels regardless. The one thing that matters for launch is
flipping `OTP_CHANNEL` back to `whatsapp` so real codes are actually delivered.
