# infra/azure — Lynia on Azure

Terraform for the Azure stack (plan: `docs/plans/2026-09-24-gcp-to-azure-migration.md`).
Region `southafricanorth`. One module, two states: `staging.tfstate` and `production.tfstate`.
`infra/terraform/` (GCP) stays as it is, because API specs read it.

**Who runs what.** You run `bootstrap.sh` once in Azure Cloud Shell (under 5 minutes). Every
`terraform apply` runs in GitHub Actions, never in Cloud Shell: Postgres and Redis take longer to
create than Cloud Shell's 20-minute idle timeout (X2).

---

## Step 1 — Bootstrap (about 5 min, phone OK)

**Where:** portal.azure.com → the `>_` icon (Cloud Shell) → **Bash**.

**Paste:**

```bash
curl -fsSL https://raw.githubusercontent.com/unnfazzed/Lynia/main/infra/azure/bootstrap.sh | bash
```

**Expected output:** seven `==>` steps with `ok:` lines, then a block of Variables:

```
AZURE_TENANT_ID            = …
AZURE_SUBSCRIPTION_ID      = …
AZURE_CLIENT_ID_INFRA      = …
AZURE_CLIENT_ID_STAGING    = …
AZURE_CLIENT_ID_PRODUCTION = …
AZ_TFSTATE_RESOURCE_GROUP  = rg-lynia-tfstate
AZ_TFSTATE_STORAGE_ACCOUNT = stlyniatf<6 hex>
AZ_TFSTATE_CONTAINER       = tfstate
AZ_KEY_VAULT_NAME          = kv-lynia-<6 hex>
```

None of these is a secret. No secret value is ever printed.

**If you see…**

| You see | Do this |
|---|---|
| `Not signed in` | Run `az login`, then paste again |
| `waiting for Key Vault permission to propagate....` | Nothing. It retries for up to 2 minutes |
| `Cannot list secrets` / `Could not write` | Wait 5 minutes and paste again. It is safe to re-run |
| `trusts '…', expected '…'` | A federated credential has the wrong subject. Delete that credential in the portal (Managed Identities → the identity → Federated credentials) and paste again |
| `gh is not installed or not signed in` | Add the Variables by hand: GitHub → repo → Settings → Secrets and variables → Actions → **Variables**. Then Settings → **Environments**: give `staging`, `production` and `infra` the deployment branch rule "Selected branches: `main`". `infra` also needs **Required reviewers = you** |
| `Built-in role '…' not found` | Stop and report it. The role list in the script needs updating |

Re-running is always safe. Existing secrets are never replaced.

## Step 2 — Staging apply (GitHub mobile, about 2 min of your time, about 30 min wall clock)

**Where:** GitHub → Actions → **Terraform apply (Azure)** → Run workflow → `environment: staging`.
Approve the `infra` gate when it asks.

**Expected output:** the job ends green and prints an `arming_guide` with a Variables list (the
`…_STAGING` names). The workflow cannot write repo Variables (GitHub's token lacks that permission); its run summary prints ready-to-paste `gh variable set` lines. Paste them in Azure Cloud Shell, or add them in Settings → Secrets and variables → Actions → Variables.

**If it fails with…**

| Message | Do this |
|---|---|
| `Key Vault … is not in RBAC mode` / `purge protection off` | Re-run bootstrap (Step 1) |
| `SkuNotAvailable` or `Balanced_B0` for Redis | The region doesn't offer it. Report it; the fallback is plan §13 R2 |
| `AuthorizationFailed … roleAssignments/write` | Re-run bootstrap. If it still fails, report the role name in the error |
| `…secret … not found` while creating a container app | Re-run bootstrap: a seeded secret is missing |

## Step 3 — Re-run bootstrap once (1 min)

Paste the Step 1 command again. Step `6/7` now prints
`staging: Scheduler.Invoke → id-lynia-jobs-staging`. That one app-role assignment needs tenant-admin
rights, which the CI identity deliberately does not have.

## Step 4 — Production

Repeat Step 2 with `environment: production`, then Step 3.

## Step 5 — DNS at cutover (Cloudflare, DNS-only, TTL 300)

In the apply log (or with `terraform output dns_records`), each host has:

- **TXT** `asuid.<host>` = the environment's verification id;
- **CNAME** `<host>` → the app's `*.southafricanorth.azurecontainerapps.io` name, **grey cloud**;
- a `bind` command. Run it in Cloud Shell after the two records exist. It issues the free managed
  certificate.

**Expected:** `az containerapp hostname list … -o table` shows the binding as `SniEnabled` within
about 15 minutes. **Do not message testers until it does** (E11).

## Step 6 — Admin console sign-in (Microsoft Entra, about 10 min, phone OK)

The admin console (`admin.lyniago.com`) refuses every request until Microsoft sign-in (Easy Auth) is in
front of it. Its 401 says *"Admin console sign-in is not set up"*. Easy Auth needs an Entra app
registration and a client secret, and Terraform must not create either (S1, S5). So this part is yours.

**1. Where:** Azure Cloud Shell (Bash), as in Step 1. **Paste:**

```bash
curl -fsSL https://raw.githubusercontent.com/unnfazzed/Lynia/main/infra/azure/admin-auth.sh | bash
```

What it does:
- Creates the app registration `lynia-admin-console-production` with **Assignment required = Yes**, and
  assigns it to **you only**. To add more people: `… | ADMIN_OPERATORS="a@x.com,b@y.com" bash`.
- Writes its client secret straight into Key Vault as `ADMIN-ENTRA-CLIENT-SECRET`. The value is never
  shown.
- Sets the repo Variables `AZ_ADMIN_AUTH_CLIENT_ID` and `ADMIN_CONSOLE_ALLOWED_OPERATORS` (with `gh`; if
  `gh` is not signed in, it prints both for you to add by hand).

It ends with the two remaining steps. Staging: `… | LYNIA_ENV=staging bash`.

**2. Where:** GitHub → Actions → **Terraform apply (Azure)** → `environment: production`,
`action: apply`. Approve twice. The plan adds `azapi_resource.admin_auth[0]` (Easy Auth), the
`microsoft-provider-authentication-secret` Key Vault reference on `ca-lynia-admin`, and one Key Vault
reader role.

**3. Where:** GitHub → Actions → **Deploy Admin Console (Azure)** → `environment: production`. The deploy
applies the operator allowlist only once Easy Auth is confirmed on the app (ADM-11). It then checks that
the live app refuses a forged identity header. The run summary says which of the two happened.

**Expected:** `https://admin.lyniago.com` sends you to a Microsoft sign-in page. After it, you land on the
console with your account shown in the sidebar.

**If you see…**

| You see | Do this |
|---|---|
| *Admin console sign-in is not set up* (401) | Easy Auth is not on yet. Finish step 2 (both approvals), then reload |
| *Admin console operator allowlist is not configured, so X cannot be admitted* (403) | The deploy ran before Easy Auth was on, or the Variable is missing. Re-run step 3; its summary must say *allowlist applied* |
| *This account (X) is not authorized* (403) | Add X to the `ADMIN_CONSOLE_ALLOWED_OPERATORS` Variable (comma-separated), then re-run step 3 |
| `AADSTS50105` (user not assigned) | That account is not assigned. Re-run the script with `ADMIN_OPERATORS=<that account>` |
| `AADSTS50011` (redirect URI mismatch) | The app has a hostname the registration lacks. Re-run the script: it adds every current hostname |
| Terraform: `… ADMIN-ENTRA-CLIENT-SECRET … not found`, or a Key Vault reference error | Run the script (step 1) first. If the secret exists, re-run the apply: a new reader role can take a few minutes to apply |
| Deploy fails at *Forged-principal gate (G-ADM)* | The live app took a forged identity header. The job has already removed the allowlist (safe, locked). Stop and report it |

**Secret expiry:** the client secret lasts 2 years. Rotate it before then with
`… | ROTATE=1 bash`. The old secret stays valid, so sign-in never breaks, and the app picks up the new
one within about 30 minutes.

---

## What is where

| File | Contents |
|---|---|
| `network.tf` | Resource group, VNet `10.20.0.0/16`: `snet-aca` /23, `snet-pg` /28, `snet-pe` /28; private DNS zones |
| `keyvault.tf` | Reads the bootstrap vault and asserts RBAC + purge protection. Writes `DATABASE-URL` and `REDIS-URL`. Per-secret read access. Private endpoint |
| `data.tf` | PostgreSQL 16 B1ms (PostGIS, PITR 7 days, private access), Managed Redis B0 non-clustered with TLS and a private endpoint, Blob `lynia-media` (shared key off), ACR Basic |
| `identity.tf` | Runtime identities `id-lynia-{api,jobs,web}-<env>` and the deploy identity's scoped roles |
| `entra.tf` | Scheduler audience app registration with the `Scheduler.Invoke` app role |
| `containerapps.tf` | Environment `cae-lynia-<env>`, `ca-lynia-api` / `-admin` / `-merchant`, Easy Auth (gated on `admin_auth_client_id`) |
| `admin-auth.sh` | Owner-run (Step 6): the admin console's Entra app, its operators, its Key Vault client secret, and the Variables that switch Easy Auth on |
| `jobs.tf` | `caj-lynia-migrate` (manual), `caj-lynia-retention` (01:00Z), `caj-lynia-wallet-integrity` (02:00Z) |
| `monitoring.tf` | Log Analytics (daily cap), action group, job-failed and missed-run alerts, PG connections > 40, budget |
| `outputs.tf` | `github_variables`, `api_env_contract`, `scheduler`, `dns_records`, `arming_guide` |

**Secrets (S1).** Terraform never generates the JWT, PII, token-hash or admin-token secrets.
`bootstrap.sh` creates them in Key Vault, and Terraform only references their names. The two
accepted exceptions are in state: the Postgres admin password and the Redis access key. Both are
inside `DATABASE-URL` and `REDIS-URL`. The state account is Entra-only, versioned, has shared key
off and no public blobs. Phase 8 (Entra auth for PG and Redis) removes them.

**Restoring GCP data (§9)?** The salvage writes the old `PII-ENCRYPTION-KEY` (and optionally
`JWT-SIGNING-SECRET`) over the generated ones with `az keyvault secret set`. Do it **before**
the API has stored any national ID, then re-mint `ADMIN-API-TOKEN` if you replaced the JWT secret.
To re-mint, delete that secret and re-run bootstrap.

**CI owns revisions.** Terraform creates each app once with a placeholder image. After that,
`template` and traffic are in `ignore_changes`: an apply never rolls back a deploy, and env
changes go through the workflows (`api_env_contract` lists the contract).

## Open decision for the owner

**Sticky sessions vs. canary (E4 vs. H18).** Azure documents session affinity as working
**only in single revision mode**. The API needs multiple revision mode for the 10 → 50 → 100
canary. So `api_session_affinity` defaults to **false**. The options:

- (a) Keep the canary with no affinity. Socket.IO's polling fallback can break across replicas.
  WebSocket, the normal path, is unaffected. With max 5 replicas and a 150-connection scale rule,
  the API usually runs one replica.
- (b) Single revision mode + affinity. This loses the weighted canary: a deploy becomes
  all-at-once, with rollback only.
- (c) Force WebSocket-only transport on the client. This needs a new binary.

Gate G-WS on staging measures (a).

## Hibernate staging (savings, 2026-09-24)

Staging's cost is almost all Postgres + Redis. When you aren't testing:

1. **Hibernate:** GitHub → Actions → **Terraform apply (Azure)** → Run workflow → environment
   `staging`, action **`hibernate-staging`**. Approve the plan, read it (it removes only Postgres,
   Redis, the Redis private endpoint and the two Terraform-written secrets), then approve the apply.
2. Set repo Variable **`AZ_STAGING_ENABLED=false`**, or production releases wait on a staging deploy
   that cannot pass.

Apps, the `staging-api.lyniago.com` domain + certificate, identities and Key Vault app secrets stay,
so waking needs no DNS change and costs ~$6/month while asleep (registry + logs).

**Wake:** run the same workflow with action **`apply`** (about 20–30 min for Postgres + Redis), set
`AZ_STAGING_ENABLED=true`, then dispatch **Deploy Staging (Azure)**. Staging's database starts empty
each time — it is a test tier.

## Destroy staging (one environment per region, 2026-09-25)

A new subscription may hold only **one Container Apps environment per region**. Production's first
apply failed on it (`MaxNumberOfRegionalEnvironmentsInSubExceeded`, run 36074627308) because staging
held South Africa North's slot. Owner decision: retire staging and run the pre-cutover checks against
production, which nobody can reach until DNS points at it.

1. GitHub → Actions → **Terraform apply (Azure)** → environment `staging`, action
   **`destroy-staging`**. Approve the plan, check that every line is a staging (`-staging`/`stg`)
   resource, then approve the apply.
2. Re-run the production apply (environment `production`, action `apply`); it resumes where it stopped.

`AZ_STAGING_ENABLED` stays unset, so releases do not wait on staging. To bring staging back, first get
a quota increase (Azure portal → Quotas → Container Apps → managed environments, South Africa North),
then run action `apply` for `staging`.
