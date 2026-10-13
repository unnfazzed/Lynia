# Secret Rotation Runbook

How to rotate each secret Lynia holds. Companion to [SECURITY.md](SECURITY.md) (P3-2) and
[IR-RUNBOOK](IR-RUNBOOK.md). Owner commands for Key Vault and Variables:
[AZURE-OWNER-RUNBOOK.md](AZURE-OWNER-RUNBOOK.md) §3.

> Rotate on a schedule, and rotate at once on any suspicion of exposure (a leaked log, a departed
> contractor, a lost laptop).

---

## How rotation works on Azure

All runtime secrets live in one **Key Vault** (`kv-lynia-<suffix>`, name in the `AZ_KEY_VAULT_NAME`
Variable). The container apps reference them by **versionless** URI (`infra/azure/keyvault.tf`), so a
rotation is:

1. **Add a new version** of the secret: `az keyvault secret set --vault-name "$V" -n <NAME> --file <file> --encoding utf-8`.
   Use a file, never a value on the command line. Do not delete the secret: the vault has purge
   protection, so a deleted name stays reserved until its soft-delete period ends.
2. **Start a new revision** so the app reads the new version. For the API, dispatch **Release (Azure)**
   (`gh workflow run release-azure.yml -R unnfazzed/Lynia --ref main`); for the admin console,
   **Deploy Admin Console (Azure)**. Container Apps also re-reads Key Vault references on its own within
   about 30 minutes (`infra/azure/README.md`), but a release is the deterministic path. Do not create a
   revision by hand with `az containerapp update`: the release pins traffic to named revisions, so a
   hand-made revision gets 0% traffic.
3. **Check** with the post-rotation checklist below.
4. **Disable the old version** once nothing needs it: `az keyvault secret set-attributes --vault-name "$V" -n <NAME> --version <old-id> --enabled false`.

Key Vault names use hyphens: `JWT_SIGNING_SECRET` is `JWT-SIGNING-SECRET`.

---

## Rotation schedule

| Secret (Key Vault name) | Cadence | Emergency trigger |
|---|---|---|
| `JWT-SIGNING-SECRET` | 90 days | Suspected token forgery or leak |
| `TOKEN-HASH-SECRET` | Rarely (logs everyone out) | Suspected dump of `sessions` / OTP hashes |
| `ADMIN-API-TOKEN` | Before it expires (365 days after minting, `bootstrap.sh`) and after every JWT rotation | Token exposure |
| `ADMIN-ENTRA-CLIENT-SECRET` | Before its 2-year expiry | Secret exposure |
| `DATABASE-URL` (Postgres admin password) | 180 days | Credential exposure |
| `REDIS-URL` (Redis access key) | 180 days | Credential exposure |
| Vendor keys (Bird, WhatsApp, local SMS, Didit, Sentry, FCM, APNs) | Vendor policy / 180 days | Vendor breach, key in logs |
| `PII-ENCRYPTION-KEY` | **Never** without a re-encryption plan | See §6 |
| `EXPO_TOKEN` (GitHub secret) | 180 days | Revoke at expo.dev → Robots, paste the new one into the GitHub secret |
| Play service-account key (stored on EAS) | 180 days | Delete the key in Google Cloud IAM, mint a new one, re-upload to EAS |

---

## 1. JWT signing secret

The code supports a zero-downtime rotation: `JWT_SIGNING_SECRET_PREVIOUS` is accepted on **verify**
only, while new tokens are signed with `JWT_SIGNING_SECRET` (`apps/api/src/auth/token.service.ts`,
`apps/api/src/config/env.ts`). In production it must also be at least 32 characters.

**On Azure that variable is not wired.** `release-azure.yml` does not mount `JWT_SIGNING_SECRET_PREVIOUS`,
and nothing in `infra/azure` references it. So today a rotation is a hard cut:

1. `openssl rand -base64 36 > /tmp/k` (48 chars), then add it as a new version of `JWT-SIGNING-SECRET`.
2. Dispatch **Release (Azure)**.
3. Access tokens signed with the old secret now fail. Refresh tokens are unaffected (they are hashed with
   `TOKEN_HASH_SECRET`), so the app refreshes on the next `401` and users stay signed in. Open WebSocket
   sessions may reconnect.
4. **Re-mint `ADMIN-API-TOKEN`**: it is a JWT signed with this secret, so the admin console stops working
   until it is replaced. See §3.

To get the zero-downtime flow, add `JWT_SIGNING_SECRET_PREVIOUS` to `release-azure.yml` (mounted only when
a Variable says so) and to `AZ_VENDOR_SECRETS`. Then: old value into `JWT-SIGNING-SECRET-PREVIOUS`, new
value into `JWT-SIGNING-SECRET`, release, wait more than `ACCESS_TTL_SECONDS` (15 min; 1 h to be safe),
unmount the previous secret, release again.

---

## 2. Token hash secret: logs everyone out

Rotating `TOKEN-HASH-SECRET` invalidates every stored refresh-token hash. Every user signs in again with
an OTP once their access token expires (≤ 15 min). Do it only on real suspicion the hashes leaked, or as
the incident "log everyone out" switch ([IR-RUNBOOK §2](IR-RUNBOOK.md)).

1. Add a fresh `openssl rand -base64 36` value as a new version of `TOKEN-HASH-SECRET`.
2. Dispatch **Release (Azure)**.

---

## 3. Admin API token and the Entra client secret

- **`ADMIN-API-TOKEN`** is a 365-day admin JWT, HS256 over `JWT-SIGNING-SECRET`, minted by
  `infra/azure/bootstrap.sh` only when the secret is absent. `infra/azure/README.md` describes
  re-minting it by deleting the secret and re-running bootstrap. That conflicts with purge protection
  (a deleted name stays reserved), so **check before relying on it** (unverified). After a new value is
  in place, run **Deploy Admin Console (Azure)**.
- **`ADMIN-ENTRA-CLIENT-SECRET`** (Easy Auth): re-run `infra/azure/admin-auth.sh` with `ROTATE=1`
  (`infra/azure/README.md` Step 6). The old secret stays valid, so sign-in never breaks.

---

## 4. Postgres password and Redis key

Both are the accepted state exceptions (`infra/azure/data.tf`, `keyvault.tf`): Terraform knows the value
and writes `DATABASE-URL` / `REDIS-URL` itself. Phase 8 replaces both with Entra auth. Until then there is
**no scripted rotation** (both paths below are untested):

- **Postgres:** a manual Terraform run with `-replace='random_password.postgres_admin[0]'` changes the
  server's admin password and rewrites `DATABASE-URL`. **Terraform apply (Azure)** has no replace option.
  Then dispatch **Release (Azure)**. Connections fail between the password change and the new revision.
- **Redis:** regenerate the access key on the Azure Managed Redis database, then run **Terraform apply
  (Azure)** for production so it rewrites `REDIS-URL`, then **Release (Azure)**. Expect a reconnect blip
  (OTP, rate limits, BullMQ, the Socket.IO adapter).

---

## 5. Vendor keys

1. Mint a new key in the vendor console **without revoking the old one**.
2. Store it: `bash infra/azure/vendor-secrets.sh` asks for each secret of every vendor flag that is on
   (silent input; Enter keeps the current value). Or add a version by hand under the same name
   (`BIRD-ACCESS-KEY`, `BIRD-VERIFY-API-KEY`, `BIRD-WEBHOOK-SECRET`, `WHATSAPP-ACCESS-TOKEN`,
   `LOCAL-SMS-API-KEY`, `DIDIT-API-KEY`, `DIDIT-WEBHOOK-SECRET`, `SENTRY-DSN`,
   `FCM-SERVICE-ACCOUNT-JSON`, `APNS-PRIVATE-KEY`).
3. Dispatch **Release (Azure)**. A new name (not a new version) also needs **Terraform apply (Azure)**
   first, so the API has the container-app secret.
4. Check the flow end to end (send an OTP, start a KYC session, send a push).
5. **Now** revoke the old key in the vendor console.

Webhook secrets fail closed. Rotate `DIDIT-WEBHOOK-SECRET` in Didit and Key Vault together, or KYC
results stall until they match. The same holds for `BIRD-WEBHOOK-SECRET` (delivery-status events only;
OTP sending is unaffected).

---

## 6. PII encryption key

`PII-ENCRYPTION-KEY` encrypts national IDs at rest (`apps/api/src/config/env.ts`). The code has no
previous-key fallback and no re-encryption job, so a new key makes every stored ID unreadable. Do not
rotate it until that exists.

---

## Post-rotation checklist

- [ ] `https://api.lyniago.com/healthz` reports `status: ok`.
- [ ] A fresh sign-in (OTP → access + refresh) succeeds.
- [ ] A token refresh succeeds (proves the hash key is consistent).
- [ ] The admin console loads data (proves `ADMIN-API-TOKEN` still verifies).
- [ ] For vendor keys: one real send or check succeeds before the old key is revoked.
- [ ] The old Key Vault version is **disabled**, not just superseded.
