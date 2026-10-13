# Incident Response Runbook

What to do when something goes wrong: a breach, a leak, an active attack, an abuse spike. Companion to
[SECURITY.md](SECURITY.md) §8. Production runs on Azure (`infra/azure/`); the owner's Cloud Shell steps
are in [AZURE-OWNER-RUNBOOK.md](AZURE-OWNER-RUNBOOK.md).

> Keep this short enough to use at 3am. Detail lives in the linked docs; this is the sequence.

Production names used below: resource group `rg-lynia-prod-san`, apps `ca-lynia-api` and
`ca-lynia-admin`, Log Analytics workspace `log-lynia-prod` (`infra/azure/locals.tf`). Run `az` commands
in Azure Cloud Shell as the owner.

---

## 0. Roles (fill in before you need them)

| Role | Who | Responsibility |
|---|---|---|
| Incident Lead | _founder_ | Owns the response, makes the call, communicates |
| Ops/Eng | _founder/eng_ | Executes containment and fixes |
| Comms | _founder_ | User and regulator notification |

One person may hold several roles at pilot scale, but name them.

---

## 1. Severity triage (first 15 minutes)

| Sev | Definition | Examples |
|---|---|---|
| **SEV1** | Confirmed data breach or full compromise | KYC/PII exfiltrated; admin takeover; JWT secret leaked |
| **SEV2** | Active attack, no confirmed data loss yet | Credential stuffing; request flood; auth bypass attempt |
| **SEV3** | Vulnerability found, not yet exploited | High-CVE dependency; misconfig; researcher report |

Record **what** happened, **which data classes** ([SECURITY §1](SECURITY.md#1-what-we-protect)) are in
scope, **when** it started, and **how** you know.

---

## 2. Contain (stop the bleeding)

Pick what fits.

**Tokens and secrets**

- **Leaked JWT signing secret** → rotate it now ([SECRET-ROTATION §1](SECRET-ROTATION.md)). To kill
  every outstanding access token at once, rotate **without** a previous secret.
- **Log everyone out** → rotate `TOKEN_HASH_SECRET` ([SECRET-ROTATION §2](SECRET-ROTATION.md)). Every
  refresh token stops working; access tokens die within `ACCESS_TTL_SECONDS` (15 min). This needs no
  database access.
- **Any other leaked secret** (database, Redis, vendor key, admin token) → rotate per
  [SECRET-ROTATION](SECRET-ROTATION.md).

**People**

- **Abusive rider** → suspend or ban in the admin console. Both revoke that rider's sessions
  (`admin-riders.service.ts`).
- **Compromised operator** →
  1. Remove them from the Entra app (Enterprise applications → the admin app → Users and groups).
     Easy Auth then refuses their sign-in.
  2. Remove them from the `ADMIN_CONSOLE_ALLOWED_OPERATORS` Variable and re-run **Deploy Admin Console
     (Azure)**.
  3. Rotate `ADMIN-API-TOKEN` ([SECRET-ROTATION](SECRET-ROTATION.md)).
  4. Read the admin audit log for what they did.
- **Take the whole console offline** → `az containerapp ingress disable -g rg-lynia-prod-san -n ca-lynia-admin`.
  Turn it back on with `ingress enable`.

**Traffic**

- **Bad deploy or exploited endpoint** → GitHub → Actions → **Rollback (Azure)**, environment
  `production`. Leave `revision` empty to list revisions, then re-run with the name. It moves 100% of
  traffic to that revision in seconds. It does not roll back the database.
- **Turn a vertical off** → set its kill-switch Variable (`RESTAURANTS_ENABLED`, `SHOPS_ENABLED`,
  `PHARMACY_ENABLED`, `RX_ENABLED`, …) to `false` and dispatch **Release (Azure)**.
- **Request flood from known addresses** → there is **no WAF** ([SECURITY-OPS §D](SECURITY-OPS.md)).
  The app's rate limits still apply. To block addresses at the ingress:
  `az containerapp ingress access-restriction set -g rg-lynia-prod-san -n ca-lynia-api --rule-name block-1 --ip-address <cidr> --action Deny`.
  Remove it later with `access-restriction remove`. All rules on an app must share one action (all
  Deny or all Allow). Cloudflare cannot help here: `api.lyniago.com` is DNS-only, and turning on its
  proxy breaks the managed certificate.

---

## 3. Eradicate & recover

1. Find the root cause. Sources: API logs in Log Analytics (`ContainerAppConsoleLogs_CL`), platform
   events (`ContainerAppSystemLogs_CL`), Sentry (when `SENTRY_ENABLED`), `order_events` and the admin
   audit trail, CodeQL and dependency alerts.
2. Patch it and add a **test that reproduces it**, so it cannot regress.
3. Merge to `main`. **Release (Azure)** builds, migrates and canaries it. Check `/healthz` reports
   `status: ok`, then the affected flow end to end.
4. Confirm the attacker's access is gone: rotated secrets, revoked sessions, closed hole.
5. If data was damaged, restore per [RESTORE-DRILL](RESTORE-DRILL.md).

---

## 4. Notify

- **Users**: when their PII is involved, tell the affected users clearly and promptly (what happened,
  what data, what they should do).
- **Regulator**: meet the **Zimbabwe Cyber and Data Protection Act** breach-notification duties
  (timelines and content). Keep a record of the assessment even if notification isn't required.
- **Vendors**: if a vendor was the vector (Bird, Meta WhatsApp, Didit, Firebase), open a case with them.
- Do not share technical detail publicly before the hole is closed.

---

## 5. Post-mortem (within a week, blameless)

Write down the timeline, root cause, blast radius, what worked and what didn't. Every incident produces
at least one tracked action item that becomes a new control or test (an alert, a rate limit, a boot
guard, a CI check).

---

## What alerts you today

Wired in `infra/azure/monitoring.tf`, sent to the `ag-lynia-prod` action group (email, optional webhook):

- a Container Apps job execution failed (migrate, retention, wallet integrity);
- a scheduled job had no successful run in 26 hours;
- Postgres active connections above 40;
- monthly budget at 80% actual / 100% forecast.

Outside that file: Sentry error alerts when armed, and an external uptime check (kept outside Azure by
design, per the `monitoring.tf` header; not defined in this repo).

**Not wired** (no OTel collector runs on Azure, see [OBSERVABILITY](OBSERVABILITY.md)): spikes in
`401`/`403`/`429`, OTP-request or refresh-failure rates, admin audit anomalies (bulk KYC approvals,
off-hours bans or payouts), failed KYC webhook signatures. Until they are, check these by hand in Log
Analytics during an incident.

**Rehearse this runbook quarterly** with a tabletop exercise.
