# Infrastructure hardening — rollout runbook

The terraform in `infra/terraform/` already contains every hardening control from `docs/SECURITY.md`
(§P2/§P3) and `docs/LAUNCH-READINESS.md` (LR7). Each is behind a variable that **defaults to the
current deployed behaviour**, so a plain `terraform apply` is a no-op and the wiring is verified. This
runbook is the missing piece: the **ordered, verify-and-rollback sequence** for turning them on, because
several are *coordinated* changes where a careless apply can drop a live connection or fail the apply.

Do these one stage at a time, in a low-traffic window, verifying each before the next. Set the flag in
`terraform.tfvars` (see the hardened block in `terraform.tfvars.example`), then
`terraform plan` → review → `terraform apply`.

Legend: 🟢 additive/safe · 🟡 coordinated (brief disruption possible) · 🔴 recreates a resource /
ephemeral-state loss · ⚖️ product/compliance decision, not purely technical.

> Cost note: STANDARD_HA Redis and REGIONAL Cloud SQL roughly double those line items. WAF/Armor adds a
> per-policy + per-request charge. Size these against the pilot budget.

---

## §0 — Preconditions

- `terraform plan` with no tfvars is clean (no drift) — confirm before changing anything.
- You can reach the project and have `roles/owner` (or the specific admin roles) on `lynia-500911`.
- Cloud Run can be redeployed on demand (the release workflow, or `gcloud run services update`).
- Note the current Cloud Run revision so you can roll traffic back (`gcloud run revisions list`).

---

## §1 — Cloud SQL private-only  🟡  (`db_public_ip_enabled = false`, SECURITY §P2-1)

Removes the instance's public IP. The IP exists only so the GitHub-hosted runner's Cloud SQL Auth Proxy
can run `prisma migrate deploy`; runtime traffic already uses the in-VPC unix socket. **The migration
path must move in-VPC before you flip this**, or the next release can't migrate.

1. Set repo variable `DB_PRIVATE_ONLY=true` so `release.yml` runs migrations as an in-VPC Cloud Run job
   (over the same socket the runtime service uses) instead of the proxy.
2. Trigger a release (or the migrate job manually) and confirm it migrates green over the private path
   **while public IP is still on** — proves the in-VPC path works before you remove the fallback.
3. `db_public_ip_enabled = false` → apply.
4. **Verify:** app healthz stays green (runtime never used the public IP); a fresh release migrates via
   the job; `gcloud sql instances describe lynia-pg` shows no `PRIMARY` public address.
5. **Rollback:** `db_public_ip_enabled = true` → apply (re-adds the IP; no data impact). `ssl_mode` stays
   `ENCRYPTED_ONLY` and no `authorized_networks` are ever opened, so even public-on is proxy-only.

## §2 — Redis in-transit TLS  🔴  (`redis_tls_enabled = true`, SECURITY §P2-1)

Flips Memorystore to `SERVER_AUTHENTICATION` and switches `REDIS_URL` to `rediss://` (+ injects the
managed CA as `REDIS_CA_CERT`; `common/redis.ts` reads it). Two cautions: (a) once TLS is required,
plaintext `redis://` connections are rejected, and (b) changing the encryption mode **may recreate the
instance**, losing ephemeral Redis state — BullMQ jobs, OTP counters, the notify-me list, socket pub/sub.
That state is non-durable by design: order-expiry / auto-close have DB reconciler backstops, OTPs are
re-requestable, notify-me is best-effort. Do it in a low-traffic window.

1. Low-traffic window. `redis_tls_enabled = true` → apply. This flips the instance **and** writes new
   `REDIS_URL` (rediss://) + `REDIS_CA_CERT` secret versions.
2. **Immediately** redeploy Cloud Run so the new revision reads the `rediss://` URL and the CA secret
   (`gcloud run services update … --set-secrets …` already references both; a redeploy picks up the
   latest secret versions). Until the redeploy lands, the old revision's plaintext client can't reach
   Redis — hence the window.
3. **Verify:** new revision healthz green; `redis: true` in `/healthz`; a test OTP + an order auction
   (offer-expiry job fires) work end to end. Check logs for `Redis ping failed` — should be absent.
4. **Rollback:** `redis_tls_enabled = false` → apply, then redeploy. Same brief window in reverse.

## §3 — Media bucket CMEK  🟢  (`kyc_cmek_enabled = true`, SECURITY §P3-4)

Encrypts new media-bucket objects (KYC selfies, item photos) with a customer-managed KMS key we own and
rotate (90-day auto-rotation) instead of Google-managed keys. Count-gated resources (keyring, key, and
the GCS-service-agent IAM grant) are created on apply. The bucket now `depends_on` that IAM grant, so the
first apply is deterministic (previously it could fail on a KMS-permission race and only pass on re-run).

1. `kyc_cmek_enabled = true` → apply.
2. **Verify:** `gcloud storage buckets describe gs://lynia-media --format='value(default_kms_key)'`
   returns the `lynia-media-key`; upload a KYC photo through the app and confirm the object's KMS key.
3. **Note:** applies to **newly-written** objects only — existing objects keep Google-managed encryption
   (rewrite them if you need full coverage). Before storing real KYC data, set the key's
   `prevent_destroy = true` in `kms.tf`.
4. **Rollback:** `kyc_cmek_enabled = false` → apply — new objects revert to Google-managed keys; objects
   already written under CMEK stay readable **only while the key exists**, so do not destroy the key
   while CMEK objects remain.

## §4 — KYC/media retention  ⚖️  (`kyc_retention_days = N`, SECURITY §P3-4 / LR8)

Auto-deletes media past N days (data minimization). This is a **compliance decision**, not just a knob:
KYC evidence may be needed for disputes/chargebacks/regulatory windows — pick N with that in mind. On the
versioned bucket the live object is deleted at age N and its archived version purged ~7 days later.

1. Decide N with legal/compliance (e.g. 365). `kyc_retention_days = 365` → apply.
2. **Verify:** `gcloud storage buckets describe gs://lynia-media` shows the two lifecycle rules.
3. **Rollback:** `kyc_retention_days = 0` → apply (removes the rules). Already-deleted objects are gone —
   this is why N is a deliberate, up-front decision.

## §5 — Cloud Armor WAF enforcement  🟡  (`armor_waf_preview = false`, SECURITY §P0-3 / LR7)

The Armor policy (per-IP edge rate limit + OWASP SQLi/XSS/LFI/RCE/scanner rules + L7 adaptive DDoS) is
**already attached** to the API backend (`lb.tf`). The rate limit is always enforced; the OWASP rules
ship in **PREVIEW** (log-only) so you can catch false positives before they 403 real users.

1. Leave `armor_waf_preview = true` (default) through initial launch. Watch Cloud Armor logs
   (Logging: `resource.type="http_load_balancer"` + `jsonPayload.enforcedSecurityPolicy` /
   `previewSecurityPolicy`) for legitimate traffic that *would* have been blocked.
2. Tune: if a real request matches a rule, add a higher-priority `allow` exception in `armor.tf` for that
   path/signature before enforcing.
3. When preview logs are clean for your traffic: `armor_waf_preview = false` → apply (rules now `deny(403)`).
4. **Verify:** a benign request succeeds; a `?q=' OR 1=1--` style probe gets 403; real users unaffected.
5. **Rollback:** `armor_waf_preview = true` → apply (back to log-only) — instant, no data impact.
6. Tune `armor_rate_limit_count` / `armor_rate_limit_interval_sec` to your measured peak if 429s appear.

## §6 — Availability HA (pre-launch, not pilot)

- **Redis STANDARD_HA**  🔴 — `redis_tier = "STANDARD_HA"` adds a replica with automatic failover.
  Changing tier **recreates** the instance (same ephemeral-state caveat as §2) — do it in the same window
  as §2 if possible so you pay the recreate once. Verify a replica exists via
  `gcloud redis instances describe lynia-redis`.
- **Cloud SQL REGIONAL**  🟡 — set `availability_type = "REGIONAL"` in `sql.tf` (line ~21). This is an
  in-place update with a brief failover blip, giving a synchronous standby in another zone. Verify with
  `gcloud sql instances describe lynia-pg --format='value(settings.availabilityType)'`.

---

## Out of scope of this runbook

- **Mobile certificate pinning** (SECURITY §P3-1) — an `apps/mobile` code change, not terraform.
- **Maps/Places key restriction** (SECURITY §P3-3) — GCP console API-key config, not in this module.
- **SLO paging alerts** (`slo_alerts_enabled`) — gated on the OTEL collector being live; see
  `docs/OBSERVABILITY.md`, not a security item.

## Suggested order

§5 preview-watch (from launch) → §3 CMEK → §4 retention (once decided) → §1 SQL private-only →
§2 Redis TLS + §6 Redis HA (same window) → §6 SQL REGIONAL → §5 WAF enforce (once preview is clean).
