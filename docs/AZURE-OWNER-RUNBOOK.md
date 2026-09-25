# Azure migration: owner runbook

These are the owner's steps only, in order. Claude sessions do the code, CI and checks. Each
step says **where** to do it, **what to paste**, **what you should see**, and **if you see X, do Y**.
Plan and decisions: `docs/plans/2026-09-24-gcp-to-azure-migration.md`. Infra detail: `infra/azure/README.md`.

Two rules apply to every Cloud Shell step:
- Cloud Shell forgets everything between sessions, so each command below re-signs in to GitHub
  (`gh auth login`) and re-downloads the code by itself.
- If the prompt starts with `PS`, you're in PowerShell. Every command here is wrapped in `bash -c '…'`,
  so it works either way.

## Done already (2026-09-24)

- [x] Azure pay-as-you-go subscription, MFA (passwordless Authenticator), $150 budget, phone lock.
- [x] `bootstrap.sh`: state store, Key Vault, CI identities, app secrets, 9 base Variables,
      `main`-only environments, `infra` reviewer = you.
- [x] Staging infrastructure (Terraform run 36071128440).
- [x] GCP deploy workflows switched off (#926). Cost savings merged (#929).

## 1. Retire staging (GitHub app, 2 taps + ~10 min)

Azure allows this subscription only one Container Apps environment in South Africa North, and staging
had it (production's first apply failed on that). Decision 2026-09-25: staging goes; the checks run
on production before the DNS switch. GitHub → Actions → **Terraform apply (Azure)** → the
`destroy-staging` run → approve the plan, then approve the apply once Claude has read it. You no longer
need the staging Variables command.

## 2. Production infrastructure (GitHub app, 2 taps + ~15 min; re-run after step 1)

GitHub → Actions → **Terraform apply (Azure)** → the waiting run.

1. **Review deployments → infra → Approve.** This only works out the plan.
2. Claude reads the plan. Then **approve again** to create production.

- **If it fails:** tell Claude. Nothing half-built is left unrecoverable; re-running is safe.

## 3. Production Variables (Cloud Shell, ~2 min)

Claude sends a command like step 1, with the production values from the apply log. Do **not** set
`AZ_DEPLOY_ENABLED=true` yet; that happens at cutover (step 6).

## 4. (Staging DNS: no longer needed; staging is retired)

## 5. Production checks pass on Azure's own address, then send tester message 1 if you haven't

Claude deploys production with `AZ_API_HOSTNAME` pointing at the `*.azurecontainerapps.io` address and
reports each check (G-API, G-OTP, G-UPL, G-WS, G-Q, G-JOB, G-ADM, G-IP, G-MIG, G-RB). Nobody else can
reach it until the DNS step on cutover day.

## 6. Cutover day (~20 min, pick a quiet hour)

0. Confirm the `KYC_MODE=manual` Variable is set (see **Rider re-approval** below).
   Confirm the app update that points at `api.lyniago.com` has reached testers: the installed builds
   have `lyniago.lyniafinance.com` built in, so they cannot find the new servers until they update.
1. Claude deploys production (you approve nothing extra; production deploys are `main`-only).
2. **DNS + certificate: one click per host.** GitHub → Actions → **DNS + bind (Cloudflare → Azure)** →
   host `api` (later `admin`, `merchant`). It reads the target from Azure, writes the CNAME (grey cloud,
   DNS only) and `asuid.` TXT in the lyniago.com zone with the `CLOUDFLARE_API_TOKEN` secret and registers
   the hostname on the app. It refuses to delete or overwrite an A/AAAA record. Claude can dispatch it.
3. Paste the one-line certificate bind from the run summary into Cloud Shell (the CI identity may not
   create certificates); the host list then shows `SniEnabled`. (`api.lyniago.com`: done 2026-09-25.)
4. Open the **installed** app on your phone. Sign in with your number, place a test order, open
   tracking. Tell Claude what you see.
5. Send **tester message 2** (below).
6. Point the outside services at the new address (each is a settings field, not code):
   - **Didit console** → webhook URL `https://api.lyniago.com/kyc/callback`; and the `DIDIT_CALLBACK_URL`
     Variable if it is set.
   - **Bird** → webhook URL on the new host, if the Bird webhook is on.
   - **Play Console** → App content → privacy policy `https://api.lyniago.com/legal/privacy` and
     account deletion `https://api.lyniago.com/legal/account-deletion`.

## 7. After cutover

- Staging is already gone. To bring it back later, request a Container Apps environment quota increase first (`infra/azure/README.md` § Destroy staging).
- When Google billing is fixed: settle the GCP balance, then delete project `lynia-500911`
  (plan §9 "GCP exit checklist"). That removes the old personal data held there.
- Legal (Q8): the POTRAZ 24-hour notice question stays with you and counsel.

---

## Tester messages (copy and paste; send on the channel testers already use)

**Message 1: now**
> Hi! LyniaGo is down for a few days while we move to new servers. Nothing you need to do — we'll
> message you the moment it's back. Thanks for your patience 🙏

**Message 2: at cutover**
> LyniaGo is back! Update the app from the Play Store first, then open it and sign in again with your phone number. Your old account
> couldn't be moved, so you'll set up your profile once more. Riders: we'll re-approve you from your
> earlier ID check, so there's no need to redo it — just sign in and wait for approval. Job
> notifications return with the next app update; until then keep the app open to see new jobs. We've
> also updated our privacy notice: your data now lives on Microsoft Azure in South Africa.

**Message 3: when the new app version is on the Closed testing track**
> A LyniaGo update is ready in the Play Store. Please update to get notifications and the map back.

Recipients: `lyniago-users-recovered-from-bird.csv` (17 numbers; kept off the repo, in the file
Claude sent you), plus your Play Console tester list.

## Rider re-approval (after cutover, per returning rider)

**Why manual mode first.** With `KYC_MODE=auto` (the default), a rider finishing sign-up immediately
opens a **new paid Didit check** (`apps/api/src/riders/rider.service.ts`, the `KYC_MODE === "auto"`
branch of onboarding). Returning riders were already approved by Didit, so for the re-approval window
the API runs `KYC_MODE=manual`: sign-up and "retry" create **no** Didit session, and the rider waits as
*pending* until you decide.

1. **Before cutover** (Cloud Shell): `gh variable set KYC_MODE -b manual -R unnfazzed/Lynia`. The
   production release injects it (`release-azure.yml`, deploy step; it rejects anything but
   `auto`/`manual`).
2. The rider signs up again in the app and submits their details. No Didit check is started.
3. In the **Didit console**, find their earlier **Approved** session (search by name or document
   number) and confirm it matches the new sign-up.
4. In the **admin console → Riders → the rider → KYC**, press **Approve** and paste the old Didit
   session id into the note. That calls `POST /admin/riders/:profileId/kyc` (`kyc.controller.ts`),
   which writes the decision and its audit row in one transaction and notifies the rider. If there is
   no earlier approved session, **Decline** with a reason instead.
5. **When the returning riders are done**: `gh variable delete KYC_MODE -R unnfazzed/Lynia` (back to
   `auto`) and ask Claude to redeploy, so brand-new riders go through Didit again.
