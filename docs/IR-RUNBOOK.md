# Incident Response Runbook

What to do when something goes wrong — a breach, a leak, an active attack, an abuse spike. Companion
to [SECURITY.md](SECURITY.md) (§8). The goal of the whole security program is that breaks are **small
and caught fast**; this is how we keep them that way when one happens.

> Keep this runbook short enough to actually use at 3am. Detail lives in the linked docs; this is the
> sequence.

---

## 0. Roles (fill in before you need them)

| Role | Who | Responsibility |
|---|---|---|
| Incident Lead | _founder_ | Owns the response, makes the call, communicates |
| Ops/Eng | _founder/eng_ | Executes containment + fixes |
| Comms | _founder_ | User + regulator notification |

One person may hold several roles at pilot scale — but name them.

---

## 1. Severity triage (first 15 minutes)

| Sev | Definition | Examples |
|---|---|---|
| **SEV1** | Confirmed data breach or full compromise | KYC/PII exfiltrated; admin takeover; JWT secret leaked |
| **SEV2** | Active attack, no confirmed data loss yet | Credential-stuffing spike; WAF flood; auth bypass attempt |
| **SEV3** | Vulnerability found, not yet exploited | High-CVE dependency; misconfig; researcher report |

Record: **what** happened, **which data classes** ([SECURITY §1](SECURITY.md#1-what-we-protect)) are in
scope, **when** it started, **how** you know.

---

## 2. Contain (stop the bleeding)

Pick what fits the incident — most are one command:

- **Compromised sessions / suspected token theft** → revoke sessions (the model supports real revoke):
  `UPDATE sessions SET "revokedAt" = now() WHERE "revokedAt" IS NULL;` (targeted by `profileId` if scoped).
- **Leaked JWT signing secret** → rotate it *now* ([SECRET-ROTATION §1](SECRET-ROTATION.md)); to force
  every token invalid immediately, rotate WITHOUT setting `_PREVIOUS`.
- **Any other leaked secret** (DB, Redis, vendor key) → rotate per [SECRET-ROTATION](SECRET-ROTATION.md).
- **Active flood / injection** → tighten Cloud Armor (`infra/terraform/armor.tf`): flip
  `armor_waf_preview=false` to enforce, drop `armor_rate_limit_count`, or add a deny rule for the
  offending IPs/ranges; apply.
- **Abusive authenticated user** → ban via the admin console (suspend/ban), which revokes their access.
- **Bad deploy / exploited endpoint** → roll back (redeploy the previous image tag) or disable the
  feature flag / route.
- **Compromised admin** → revoke the operator's IAP access, rotate `ADMIN_API_TOKEN`, audit the admin
  action log for what they did.

---

## 3. Eradicate & recover

1. Find root cause (logs, `order_events`/admin audit trail, Cloud Armor logs, CodeQL/audit findings).
2. Patch the vulnerability; add a **test that reproduces it** so it can't regress (this is how a fix
   becomes a permanent control).
3. Redeploy via the normal CD pipeline; verify `/healthz` and the affected flow end-to-end.
4. Confirm the attacker's access is gone (rotated secrets, revoked sessions, closed hole).

---

## 4. Notify

- **Users**: when their PII is involved, notify the affected users clearly and promptly (what happened,
  what data, what they should do).
- **Regulator**: meet **Zimbabwe Data Protection Act** breach-notification duties (timelines + content).
  Keep a record of the assessment even if notification isn't required.
- **Vendors**: if a vendor was the vector (WhatsApp/Didit/FCM), open a case with them.
- Do not over-share technical detail publicly before the hole is closed.

---

## 5. Post-mortem (within a week, blameless)

Write it down: timeline, root cause, blast radius, what worked, what didn't. Every incident produces
at least one tracked **action item that becomes a new control or test** (a detection alert, a WAF rule,
a boot-guard, a CI check). File them; close them.

---

## Detections that should page you (wire these — [OBSERVABILITY](OBSERVABILITY.md))

- Spike in `401`/`403`/`429` or OTP-request / refresh-failure rates → ATO / stuffing.
- Cloud Armor blocks / rate-limit trips → attack in progress.
- Admin audit anomalies (bulk KYC approvals, off-hours bans/payouts).
- Failed KYC webhook signatures → spoof attempts.
- CI security-scan failures / new critical CVE → supply chain.

**Rehearse this runbook quarterly** with a tabletop exercise. An unpracticed runbook is a wish.
