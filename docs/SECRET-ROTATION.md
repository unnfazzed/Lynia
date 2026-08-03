# Secret Rotation Runbook

How to rotate every secret Lynia holds, safely and (where possible) with zero downtime. Companion to
[SECURITY.md](SECURITY.md) (P3-2). All runtime secrets live in **Secret Manager** and are injected at
deploy via `--set-secrets` (see [ARCHITECTURE §3](ARCHITECTURE.md#3-deployment-topology-gcp)); rotating
one means adding a new secret **version** and redeploying.

> Golden rule: **rotate on a schedule, and rotate immediately on any suspicion of exposure** (a leaked
> log, a departed contractor, a compromised laptop). A rotation you never rehearse is one you can't do
> under pressure.

---

## Rotation schedule

| Secret | Cadence | Emergency trigger |
|---|---|---|
| `JWT_SIGNING_SECRET` | 90 days | Any suspected token forgery / secret leak |
| `TOKEN_HASH_SECRET` | Rarely (mass-logout cost) | Suspected DB dump of `sessions`/OTP hashes |
| `DATABASE_URL` password | 180 days | DB credential exposure |
| Redis `AUTH` string | 180 days | Redis credential exposure |
| Vendor keys (WhatsApp, Bird, local SMS gateway, Didit, FCM) | Per vendor policy / 180 days | Vendor breach, key in logs |
| Robot `EXPO_TOKEN` (GitHub secret → EAS builds/submits/OTA; minted 2026-08-03) | 180 days | Token in logs, Expo account breach — revoke at expo.dev → Robots, paste replacement into the GitHub secret |
| Play Developer API service-account JSON key (`id-play-publisher@lynia-500911`, EAS custody; minted 2026-08-03) | 180 days | Key exposure — delete the key in GCP IAM, mint a new one (temporarily lift the org's `iam.disableServiceAccountKeyCreation` policy project-scoped, re-enforce after) and re-upload to EAS |

---

## 1. JWT signing secret — **zero downtime** (dual-secret)

The API accepts a `JWT_SIGNING_SECRET_PREVIOUS` on **verify** while signing new tokens with
`JWT_SIGNING_SECRET` (`apps/api/src/auth/token.service.ts`). That makes rotation seamless: in-flight
access tokens (≤ `ACCESS_TTL_SECONDS`, 15 min) keep verifying against the old secret while everything
new uses the fresh one.

**Prerequisite (one-time): decouple the hash key.** Because refresh-token and OTP hashes were keyed
by the JWT secret historically, set `TOKEN_HASH_SECRET` **once** to the *current* JWT secret value so
existing hashes keep matching after the JWT secret moves:

```
# One-time migration — no behaviour change, just decoupling.
TOKEN_HASH_SECRET = <current JWT_SIGNING_SECRET value>
# deploy
```

**Rotation (repeat every 90 days):**

1. Generate a new 48-char secret: `openssl rand -base64 36` (≥ 32 chars; the prod boot-guard enforces it).
2. In Secret Manager: add the **new** value as a new version of `JWT_SIGNING_SECRET`, and set
   `JWT_SIGNING_SECRET_PREVIOUS` to the **old** value.
3. Redeploy. New tokens are signed with the new secret; old tokens still verify via `_PREVIOUS`.
4. **Wait > `ACCESS_TTL_SECONDS`** (15 min, safely 1 h) so every old access token has expired.
5. Remove `JWT_SIGNING_SECRET_PREVIOUS` (unset it). Redeploy. Rotation complete.

*Acceptance:* during the window both an old and a new access token authorize; after step 5 an old
token is rejected.

---

## 2. Token hash secret — mass-logout rotation

Rotating `TOKEN_HASH_SECRET` invalidates every stored refresh-token hash, so **all users must log in
again** (their access tokens still work until expiry; the next refresh fails → re-auth). Only do this
under real suspicion the hashes were exposed.

1. Set `TOKEN_HASH_SECRET` to a fresh `openssl rand -base64 36` value.
2. Redeploy. Existing refresh tokens no longer validate → users re-authenticate via OTP.
3. Optionally pre-empt confusion by revoking all sessions server-side first
   (`UPDATE sessions SET "revokedAt" = now() WHERE "revokedAt" IS NULL`).

---

## 3. Database password

1. `random_password.db` is Terraform-generated. To rotate, taint it and apply, or set a new value on
   the `google_sql_user.app` resource, then update the `DATABASE_URL` Secret Manager version (Terraform
   `secrets.tf` rebuilds the URL from the password).
2. Redeploy so Cloud Run picks up the new `DATABASE_URL`. Prisma reconnects with the new credential.
3. There is a brief window where old connections use the old password — acceptable for a rolling
   deploy; for zero-gap, add the new user/password, deploy, then remove the old.

---

## 4. Redis AUTH string

Memorystore AUTH rotation regenerates the `auth_string`. Rotate the instance's AUTH, let Terraform
rebuild `REDIS_URL` (`secrets.tf`), and redeploy. Expect a short reconnect blip (OTP/rate-limit +
Socket.IO adapter reconnect); the app degrades gracefully (`maxRetriesPerRequest: null`).

---

## 5. Vendor keys (WhatsApp / Bird / local SMS gateway / Didit / FCM)

1. Mint a new key in the vendor console **without revoking the old one yet**.
2. Add it as a new Secret Manager version (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`,
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `BIRD_ACCESS_KEY`, `LOCAL_SMS_API_KEY`, `DIDIT_API_KEY`,
   `DIDIT_WEBHOOK_SECRET`, …). Redeploy.
3. Verify the flow works end-to-end (send an OTP / run a KYC session / send a push).
4. **Now** revoke the old key in the vendor console.

For `DIDIT_WEBHOOK_SECRET`, rotate the destination secret in Didit and update the Secret Manager
version together — the webhook HMAC check fails closed, so a mismatch rejects callbacks (safe, but
KYC results stall until aligned). `WHATSAPP_APP_SECRET` has the same fail-closed posture on the
`/webhooks/whatsapp` delivery-status callback — rotate it in Meta's console and Secret Manager
together, or delivery-failure observability stalls until aligned (does not affect OTP send itself).

---

## Post-rotation checklist

- [ ] `/healthz` returns `{status:ok, db:true, redis:true}`.
- [ ] A fresh login (OTP → access + refresh) succeeds.
- [ ] A refresh-token rotation succeeds (proves hash key is consistent).
- [ ] For vendor keys: one real send/verify succeeds before the old key is revoked.
- [ ] The old secret version is **disabled** in Secret Manager (not just superseded) once safe.
