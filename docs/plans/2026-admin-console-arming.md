# Admin Console Arming Runbook — taking `lyniagoadmin.lyniafinance.com` live

The code, container, CI, deploy workflow, and Terraform for the admin console are merged and **dormant**
(PRs #301 → #303; plan: `docs/plans/2026-admin-console-deployment.md`). This runbook is the ordered
founder/platform steps to actually turn it on. Nothing here is code — it's GCP console, Secret Manager,
repo settings, `terraform apply`, and DNS. Each step lists its verify.

> Everything is gated behind `admin_enabled` (Terraform) + `GCP_ADMIN_ENABLED` (CI). Until step 6 the
> console does not exist and no traffic reaches it.

Prereqs: the API tier is already provisioned (shared ALB, VPC connector, Artifact Registry, WIF deployer
SA all exist — this rides on them).

---

## 1. Create the IAP OAuth client (GCP console — by hand, one time)

IAP is the human-auth boundary. Two hard constraints shape this step:

- The **IAP OAuth Admin API was permanently shut down 2026-03-19**, so the old
  `gcloud iap oauth-brands/oauth-clients` path (and Terraform's `google_iap_brand`/`google_iap_client`)
  no longer work. The client is created through the normal **Google Auth Platform** console flow.
- This project's org has **no Cloud Identity directory** (verified: empty `directoryCustomerId`, only a
  consumer `@gmail.com`). IAP's default **Google-managed** OAuth client only admits in-directory users,
  so it would lock out **everyone, including you**. You therefore need a **custom OAuth client on an
  EXTERNAL, published consent screen** — which is exactly what `admin.tf` is wired for.

Steps (Cloud console):
1. **Google Auth Platform → Audience → User type = External → Publish app (Production).** IAP requests
   only basic scopes (`openid`/`email`/`profile`), so publishing needs **no Google verification**. Do
   not leave it in *Testing* (that caps you at ~100 test users and expires access every ~7 days).
2. **Google Auth Platform → Clients → Create client → Web application**, name it `Lynia Admin`. Add the
   **Authorized redirect URI** IAP requires:
   `https://iap.googleapis.com/v1/oauth/clientIds/<THIS_CLIENT_ID>:handleRedirect` (the console shows the
   exact string once the id is generated — paste it back into the client's redirect URIs).
3. Copy the **client id** (`…apps.googleusercontent.com`) and **client secret** (`GOCSPX-…`) — they feed
   `IAP_CLIENT_ID` / `IAP_CLIENT_SECRET` in step 2.

*Verify:* the consent screen Audience reads **External / In production**, and the client shows under
Clients as a Web application with the `iap.googleapis.com/...:handleRedirect` redirect URI.

> Security note: because the consent screen is External, *any* Google account can complete sign-in — so
> the IAP **IAM allowlist** (`admin_iap_members`, step 2) is your only authorization boundary. Keep it a
> tight explicit list; never `allUsers`. There's no Workspace here, so enable **2-Step Verification on
> each operator's own Google account** — that's your MFA.

## 2. `terraform apply` the admin tier

Put the IAP client + operators in a VCS-ignored tfvars (never commit the secret):

```hcl
# infra/terraform/admin.auto.tfvars  (gitignored)
admin_enabled                 = true
admin_iap_oauth_client_id     = "XXXX.apps.googleusercontent.com"   # from step 1
admin_iap_oauth_client_secret = "GOCSPX-..."                        # from step 1
admin_iap_members             = ["user:you@gmail.com"]   # your operator Google account(s); never allUsers
# admin_domain defaults to lyniagoadmin.lyniafinance.com
# CARRY FORWARD any tier already live: the founder terraform.tfvars is gitignored, so a fresh clone
# defaults every *_enabled flag OFF and would plan to DESTROY what they provisioned. If staging is
# live, set staging_enabled = true here (the arm-admin.sh script auto-detects this and refuses to
# apply any plan with destroys).
staging_enabled               = true   # ONLY if your staging tier is currently provisioned
```

```bash
cd infra/terraform
terraform plan    # expect: admin NEG + backend(+IAP) + cert + runtime SA + ADMIN_API_TOKEN secret,
                  # and the admin host rule + cert appended to the shared ALB.
                  # MUST read "0 to destroy". Any destroy = a live tier whose *_enabled flag this clone
                  # is missing (see the staging_enabled note above) — fix that before applying.
terraform apply
```

*Verify:* apply succeeds; `terraform output ADMIN_CLOUD_RUN_SERVICE_ACCOUNT` and
`terraform output ADMIN_CONSOLE_IAP_AUDIENCE` return values.

## 3. Populate the `ADMIN_API_TOKEN` secret

Terraform created the **empty** secret container. The value is an admin JWT the API accepts —
`AdminGuard` requires `role: "admin"` and `JwtAuthGuard` verifies an HS256 signature over
`JWT_SIGNING_SECRET`.

> **Do NOT use a normal login token.** `TokenService.signAccess` stamps `expiresIn: ACCESS_TTL_SECONDS`
> (default **900s / 15 min**), so a login token would 401 the console 15 minutes after you arm it. The
> console needs a **long-lived** directly-signed token.

Mint one (this must run where `JWT_SIGNING_SECRET` is available — read it from Secret Manager; the token
never has to leave your shell):

```bash
SECRET="$(gcloud secrets versions access latest --secret=JWT_SIGNING_SECRET)"
TOKEN="$(node -e '
  const jwt=require("jsonwebtoken");
  // role:"admin" is what AdminGuard checks; sub is the audit fallback when no X-Operator (IAP sets one).
  process.stdout.write(jwt.sign({role:"admin"}, process.env.SECRET,
    {subject:"admin-console", algorithm:"HS256", expiresIn:"365d"}));
' )"
printf '%s' "$TOKEN" | gcloud secrets versions add ADMIN_API_TOKEN --data-file=-
```

*Verify:* `gcloud secrets versions list ADMIN_API_TOKEN` shows one enabled version. **Rotation:** re-mint
and add a new version, then re-run the deploy (also the compromise response in `docs/IR-RUNBOOK.md`).
Because it's long-lived, IAP in front + the 365-day expiry are the containment — rotate on any operator
offboarding or suspected leak.

## 4. Set the repo Variables (Settings → Secrets and variables → Actions → Variables)

Most are shared with the API and already set. Add the admin-specific ones from the Terraform outputs:

| Repo Variable | Value / source |
|---|---|
| `GCP_ADMIN_ENABLED` | `true` (this is the CI arming switch — set it LAST, step 6) |
| `ADMIN_CLOUD_RUN_SERVICE` | `lynia-admin` (default) |
| `ADMIN_CLOUD_RUN_SERVICE_ACCOUNT` | `terraform output -raw ADMIN_CLOUD_RUN_SERVICE_ACCOUNT` |
| `ADMIN_CONSOLE_IAP_AUDIENCE` | `terraform output -raw ADMIN_CONSOLE_IAP_AUDIENCE` |
| `ADMIN_API_BASE_URL` | `https://<api_domain>` (the public API endpoint — see note) |
| `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_ARTIFACT_REPO`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` | already set for the API deploy |

> **`ADMIN_API_BASE_URL` (public, launch-ready).** The console calls the API at its public
> `https://<api_domain>` and bears `ADMIN_API_TOKEN` (+ forwards `X-Operator`). An internal
> Cloud-Run→Cloud-Run path was considered but reversed: it would need `--vpc-egress all-traffic` to
> arrive as "internal", which then routes the middleware's IAP-JWKS fetch (`gstatic.com`) through the
> connector and breaks JWT verification unless a Cloud NAT is added — real day-1 infra for a marginal
> gain. The public hop is TLS + admin-token + Cloud-Armor protected. Tightening to internal + Cloud NAT
> is a clean post-launch hardening. The admin service therefore takes **no VPC connector**.

## 5. Operators, MFA, and the IAP invoker binding

- **Operators:** `admin_iap_members` (step 2) already granted `roles/iap.httpsResourceAccessor`. This
  is the *only* authorization boundary (External consent lets any Google account authenticate), so keep
  it a tight explicit list. Add/remove operators by editing `admin_iap_members` and re-applying.
- **MFA:** there's no Workspace to enforce it centrally, so enable **2-Step Verification on each
  operator's own Google account** (`myaccount.google.com` → Security). Non-negotiable for a console
  that can ban/KYC/record-cash.
- **IAP → Cloud Run invoker:** the console runs with `--no-allow-unauthenticated`, so only the **IAP
  service agent** may invoke it. Terraform creates that agent
  (`google_project_service_identity.iap` → `terraform output -raw ADMIN_IAP_SERVICE_AGENT`), and
  `deploy-admin.yml` grants it `roles/run.invoker` after each deploy — no manual step. (This is why a
  misrouted internal caller still can't reach the console without going through IAP.)

*Verify:* the IAP page for the `lynia-admin-backend` backend service lists your operator principals, and
`gcloud run services get-iam-policy lynia-admin` shows the IAP service agent as `roles/run.invoker`.

## 6. Arm CI + DNS, then cut over

1. Set `GCP_ADMIN_ENABLED=true`. The next push touching `apps/admin/**` (or a manual
   **Actions → Deploy Admin Console → Run workflow**) builds, boot-smokes, and deploys `lynia-admin`.
2. Create the DNS **A record** `lyniagoadmin.lyniafinance.com` → `terraform output -raw load_balancer_ip`
   (the SAME IP as the API — a second A record).
3. Wait for the managed cert to go **ACTIVE** (up to ~30 min). The first request while DNS/cert propagate
   may fail — retry.

## 7. Verify end to end

- **Unauthenticated** hit to `https://lyniagoadmin.lyniafinance.com` is bounced to Google sign-in by IAP;
  after a non-operator signs in, IAP returns 403 (not on the access list).
- **Operator** signs in → the console loads with live data.
- A **mutating action** (e.g. a KYC decision) is attributed to that operator in the API **audit log**
  (`X-Operator`), and the console header shows "signed in as <operator>".
- Plain-HTTP `http://lyniagoadmin.lyniafinance.com` 301-redirects to HTTPS.

## Rollback

- **Bad revision:** `gcloud run services update-traffic lynia-admin --region africa-south1 --to-revisions <PREV>=100`.
- **Take the console dark:** set `GCP_ADMIN_ENABLED=false` (stops deploys) and/or `admin_enabled=false` +
  `terraform apply` (removes the edge). The API is untouched either way.
