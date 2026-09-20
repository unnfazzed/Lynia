# Cloud comparison — Azure vs DigitalOcean vs the GCP we run today (2026-09-20)

> Founder question: *"comparison of Azure vs DigitalOcean in terms of cost and performance for my cloud
> hosting and usage."* This is the answer, measured against **Lynia's actual footprint** — the Terraform
> in `infra/terraform/`, the Cloud Run deploy in `.github/workflows/release.yml`, and the traffic
> envelope in [`LOAD-MODEL.md`](LOAD-MODEL.md) — not against generic pricing tables.
>
> **Verdict: stay on GCP.** DigitalOcean is disqualified on latency and data residency, not on price.
> Azure is technically viable but is not cheaper. The ~$45/mo of real waste in the current bill is
> removable **without changing cloud** (§6), and that is worth more than either migration.

---

## 1. What we actually run

From `infra/terraform/` + `release.yml`, in `africa-south1` (Johannesburg):

| Piece | Current resource | Notes |
|---|---|---|
| API compute | **Cloud Run** `lynia-api`, `--max-instances 10`, `--timeout 3600`, no min-instances | NestJS + Socket.IO; **scales to zero** |
| Database | **Cloud SQL** Postgres 16 + PostGIS, `db-custom-1-3840` (1 vCPU / 3.75 GB), 20 GB PD_SSD, ZONAL, PITR on | 20 GB is an **IOPS** floor, not a space one (LC-INF2) |
| Cache/queue | **Memorystore** Redis 7.2 BASIC 1 GB, AUTH on, private IP | OTP + rate-limit, BullMQ, WS pub/sub |
| Private networking | **Serverless VPC Access connector**, `min_instances = 2`, `max 3` | exists **only** to reach private-IP Redis |
| Edge | **Global external HTTPS ALB** + Google-managed cert + **Cloud Armor** | `timeout_sec = 3600` for WebSockets |
| Storage / registry / secrets | GCS `lynia-media`, Artifact Registry, Secret Manager, KMS | signed URLs via runtime SA `signBlob` |
| Optional tiers | staging (own SQL + Redis), admin (IAP-gated), merchant | all `count = 0` by default |
| DNS | Cloudflare, **DNS-only / grey-cloud** | proxying breaks managed TLS + cert pinning |

**Documented baseline: ~$95–110/mo** ([`ENG-REVIEW.md`](ENG-REVIEW.md) §3b), dominated by Cloud SQL
(~$50) + Memorystore (~$35) + the VPC connector (~$10). Cloud Run, GCS and AR are ~$0 at pilot traffic.
The ALB forwarding rules and Cloud Armor policy sit **on top** of that figure.

**The traffic this serves** ([`LOAD-MODEL.md`](LOAD-MODEL.md), 1× steady): 100 riders / 200 customers
concurrent, 300 orders/peak-hour (≈0.08 rps sustained, bursting to ~1 rps), ~350 WebSocket connections,
~13 position emits/s coalesced to ≤1/s per room. At ×5 stress: ~1,700 WS connections.

**This is a tiny workload.** No provider's compute tier is the binding constraint. What differs between
providers here is **where the packets land** and **what the managed-service floor costs**.

---

## 2. The decisive finding: DigitalOcean has no African region

DigitalOcean runs 16 datacenters across 13 regions — NYC, SFO, TOR, ATL, RIC, MKC, MEM, AMS3, LON1,
FRA1, SGP1, BLR1, SYD1. **There is no facility anywhere on the African continent**, and DO's own
community answer to "do you have data centres in Africa?" says so.

That is not a tuning problem, it is a physics problem:

| Path | RTT from Harare | Source |
|---|---|---|
| Harare → **Johannesburg** (GCP `africa-south1`, Azure `South Africa North`) | **~17–20 ms** | AFRINIC latency study — Zimbabwe sits in the sub-20 ms inner cluster around Johannesburg |
| Harare → **Frankfurt / London / Amsterdam** (nearest DO) | **~150–250 ms** | Africa→Europe intercontinental RTT averages ~200 ms |

**A ~10× latency multiplier on every packet**, applied to a product whose core loop is a real-time
auction plus a live GPS stream:

- **The offer loop** is chatty by design — create order → nearby broadcast → N riders bid → customer
  selects (guarded CAS) → lifecycle drive. Every leg pays the crossing twice.
- **`match_select_duration_ms` p95 < 300 ms** is a *server-handling* SLO, so it would still pass on a
  Frankfurt box — while the customer waits ~500 ms+ for the tap to confirm. The SLO would stay green
  and the product would feel broken. That is precisely the failure mode this repo already learned to
  distrust in a different domain (green checks, wrong reality).
- **Live tracking** is a long-lived Socket.IO connection over Zimbabwean mobile networks that already
  carry high RTT and loss. Adding a 10,000 km leg makes reconnect storms worse, and the
  REST-snapshot self-heal fires more often.
- `africa-south1` was chosen *for this reason* — `CONCEPT.md` §10 and the closed T0 cloud decision in
  [`PILOT-READINESS.md`](PILOT-READINESS.md) both name "nearest region to Harare" as the criterion.

**Second problem: data residency.** `CONCEPT.md` cites **data sovereignty** as a founding reason for
the own-backend choice, and we store KYC ID images and selfies. Moving those to Frankfurt puts
Zimbabwean citizens' identity documents outside the continent. Zimbabwe's Cyber and Data Protection
Act (Chapter 12:07, 2021) constrains cross-border transfers of personal data; whether Germany clears
its adequacy bar is a question for counsel, but it is a question we do not currently have to ask.
*(Flagged, not adjudicated — legal input needed before anyone treats this as settled either way.)*

**Conclusion: DO is out for the API + DB + Redis tier**, whatever it costs. The one place DO is
genuinely attractive is as a **cheap static/object-storage or CI-adjacent sidecar**, where latency is
irrelevant — see §5.

---

## 3. Cost, side by side

Equivalent footprints. Azure figures are **South Africa North**; African regions carry an uplift over
US/EU list, so treat these as ±20% and confirm in the Azure pricing calculator with the region selector
set. DO figures are list price and are firm.

### GCP today (baseline, `africa-south1`)

| Piece | $/mo |
|---|---|
| Cloud SQL `db-custom-1-3840` + 20 GB SSD + PITR | ~50 |
| Memorystore Redis BASIC 1 GB | ~35 |
| Serverless VPC connector (2 × always-on instance) | ~10 |
| Cloud Run / GCS / Artifact Registry / Secret Manager | ~0–5 |
| Global ALB forwarding rules + Cloud Armor policy | ~20–30 |
| **Total** | **~$115–130** |

### Azure — South Africa North (Johannesburg)

| Piece | Azure service | $/mo (est.) |
|---|---|---|
| API container | **Container Apps** (consumption, scales to zero) — ⚠️ **verify region availability**, see below | 0–20 |
| ” fallback | App Service B1 (1 core / 1.75 GB, always-on, no scale-to-zero) | ~15–20 |
| Postgres + PostGIS | Flexible Server **B2s** (2 vCore / 4 GB) + 32 GB — closest to today's 1 vCPU/3.75 GB | ~70–85 |
| ” cheaper | Flexible Server **B1ms** (1 vCore / 2 GB) — a **downgrade** from today | ~15–20 + storage |
| Redis | Azure Cache for Redis **Basic C1** (1 GB, no SLA, no replica) | ~40 |
| Ingress + TLS | Container Apps built-in ingress + managed cert | 0 |
| WAF (Cloud Armor equivalent) | Front Door Standard | ~35+ |
| Blob storage, ACR, Key Vault | | ~3–8 |
| VNet integration | included — **no connector charge** | 0 |
| **Total** | | **~$110–190** |

**Azure gotchas that matter to us:**

- **Container Apps availability in South Africa North is unconfirmed.** It is *not* on the recent
  expansion lists, and Microsoft's own docs warn that Container Apps regions "might not completely
  align" with other services. If it is absent, the Cloud Run analogue is gone and we fall back to App
  Service or AKS — **App Service B1 does not scale to zero**, so we start paying for idle compute we
  pay nothing for today. **Verify this first; it changes the whole compute line.**
- **Egress is the worst line.** Azure bills **Zone 3 (Africa, Middle East, South America) at
  $0.181/GB** after 100 GB free — roughly **2× Azure's own Zone 1** ($0.087/GB) and materially worse
  than GCP's africa-south1 internet egress. For an app serving KYC/item photos to phones, that
  compounds as we grow.
- **PostGIS works**, but is not on by default: it is pre-installed and must be allowlisted via the
  `azure.extensions` server parameter (PostGIS 3.5.2 on PG13+). One more Terraform knob, not a blocker.
- **Azure Cache for Redis Basic/Standard/Premium retire 2028-09-30**, superseded by Azure Managed
  Redis. Migrating onto a product with an announced sunset is a self-inflicted future migration.

### DigitalOcean — nearest region FRA1 / AMS3 / LON1 (**no Africa**)

| Piece | DO service | $/mo |
|---|---|---|
| API container | App Platform (Professional) | 12–29 |
| Postgres + PostGIS | Managed Postgres 2 GB / 1 vCPU | 30.45 |
| Redis | Managed **Valkey** 1 GB, single node | 15 |
| Object storage | Spaces, 250 GB + 1 TB transfer | 5 |
| LB + TLS | included in App Platform | 0 |
| Egress | generous included allowance; **$0.01/GiB** overage | ~0 |
| **Total** | | **~$62–80** |

**DO is genuinely the cheapest — roughly 35–45% below our current bill — and its bandwidth is ~18×
cheaper than Azure's Africa zone.** That is a real advantage and it is why the question is worth
asking. It is simply outweighed by §2.

DO caveats if it were ever considered: PostGIS is available on PG15–17 but **not yet on PG18** (we are
on PG16, so fine today, a constraint at next major upgrade); managed Redis is now **Valkey**, which is
Redis-7-compatible and would work with BullMQ and our Socket.IO adapter, but is not literally Redis.

---

## 4. The migration cost nobody quotes

The D7 adapter seam ([`ARCHITECTURE.md`](ARCHITECTURE.md) §12) is real and it works — storage, push and
secrets are behind interfaces, secrets arrive as **env vars injected at deploy** rather than through a
managed-identity SDK, push is **FCM direct**, observability is **OpenTelemetry**. That was the
deliberate D7 bet and it genuinely makes the *application* portable.

**But the application was never the expensive part.** What a move actually costs:

| Item | Portable today? |
|---|---|
| App code (storage/push/secrets behind adapters) | ✅ yes — write one new `StorageAdapter` impl |
| Postgres + PostGIS, Redis, one Docker image | ✅ yes — no proprietary extensions on the critical path |
| **~28 Terraform files of GCP-specific IaC** | ❌ **full rewrite** |
| **Keyless CI via Workload Identity Federation** | ❌ rebuild on the new provider's OIDC |
| **Migrations via Cloud SQL Auth Proxy** | ❌ new path |
| **IAP-gated admin console** | ❌ no direct Azure/DO equivalent; rebuild the authz boundary |
| **Cloud Armor rules + ALB `timeout_sec 3600` WebSocket tuning** | ❌ re-derive on the new edge |
| **GCS V4 signed URLs via runtime-SA `signBlob`** (no key in env) | ❌ re-derive keyless signing |
| **OTEL collector sidecar wiring** | ◐ config, but redone |
| Every hardening/launch runbook that names GCP resources | ❌ rewrite + re-run |

Realistically **2–4 weeks of focused infra work**, plus re-running
[`INFRA-HARDENING-ROLLOUT.md`](INFRA-HARDENING-ROLLOUT.md) and the launch runbooks, to save — at best,
on DO — about **$50/mo**. That is a payback period measured in years, against a pilot whose revenue is
$0 by design today.

**Two timing facts make the window matter:**

1. **Mobile TLS cert pinning is currently INERT.** `apps/mobile/plugins/with-certificate-pinning.js` is
   a no-op until `LYNIA_TLS_PINS` is set, and [`SECURITY.md`](SECURITY.md) §P3-1 confirms it is not
   armed. So a cloud move *today* carries **no pin-brick risk**. Once pinning is armed against Google
   Trust Services, a cloud move changes the CA chain, and because pinning is **native and not
   OTA-able**, it would require a new EAS build + store release *before* the cutover or the app bricks.
   **If a move is ever going to happen, it is cheaper before pinning is armed than after.**
2. **We are mid closed-testing on Play.** A move changes the API host, so `EXPO_PUBLIC_API_URL` changes,
   so a new EAS build and a new Closed-testing submission are required regardless — on a limited monthly
   EAS build allowance, and into the `Closed testing` track (not `alpha`), per `CLAUDE.md`.

---

## 5. Credits — the only argument that moves the needle for Azure

The original plan was Azure. [`CEO-REVIEW.md`](CEO-REVIEW.md) §1 locked *"Host on Azure via Microsoft
for Startups Founders Hub (up to $150k credits, Zimbabwe-eligible, Johannesburg region)"*, and the D7
switch gate later fired toward GCP (`PILOT-READINESS.md`, 2026-06-27) on reachability from Zimbabwe,
the Maps dependency already being Google, and Google for Startups credits.

**That $150k headline does not survive contact with the current program.** The 2026 Founders Hub ladder
is **$1,000 (Ideate) → $5,000 → $25,000 → $50,000 → up to $150,000**, and the upper tiers require
demonstrated traction — institutional funding, paying customers, or accelerator participation. A
pre-revenue pilot realistically lands the **$5,000 tier ($1,000 instant + $4,000 after verification)**.
Credits **expire 12 months after issuance, no extensions.**

At our ~$115–130/mo run rate, $5,000 is ~3 years of hosting — attractive in isolation. But:

- It is a **one-off, expiring** subsidy against a **permanent** migration cost (§4) and a permanently
  worse egress rate (§3).
- We already have **Google for Startups credits** in play per the closed T0 decision.
- Taking Azure credits means holding the **larger** Founders Hub tiers as the prize, and those need the
  traction we do not yet have.

**If** the Google credits are close to exhausted and **if** Founders Hub verification clears at $25k+,
the arithmetic changes and this is worth revisiting. Both are checkable facts, not judgement calls —
check them before re-opening the question.

---

## 6. The actual recommendation: stay on GCP, cut ~$45/mo without moving

The bill has removable waste that has nothing to do with the provider. In rough order of value:

1. **Replace the Serverless VPC connector with Direct VPC egress — ~$10/mo, and it is faster.**
   Direct VPC egress has been **GA since April 2024**. With a connector you pay Compute Engine charges
   for the instances (ours is pinned `min_instances = 2`, always on) *plus* egress; with Direct VPC
   egress you pay **egress only**, it **scales to zero with the service**, and it delivers roughly
   **2× the throughput at lower latency**. Swap `--vpc-connector` for `--network`/`--subnet` in
   `release.yml`, drop `google_vpc_access_connector.connector` from `network.tf`.
   *This is a strict improvement on cost **and** performance — the rare free lunch. Do it regardless of
   anything else in this document.*
2. **Re-examine Memorystore BASIC 1 GB (~$35/mo)** — the worst value line in the bill. It backs OTP
   counters, rate limits, BullMQ and WS pub/sub at a load of ~350 sockets and sub-1-rps writes. BASIC
   already has **no replica and no HA**, so the managed tier is buying us backups and patching, not
   availability. A small Compute Engine instance or a co-located container would be ~$7–10/mo.
   *Trade-off is real:* we would own patching, and Redis holds live OTP state, so treat this as a
   deliberate decision with a rollback, not a quick win. **Note it also pairs with (1)** — if Redis
   stops being private-IP Memorystore, the connector's entire reason to exist disappears.
3. **Right-size Cloud SQL carefully.** `variables.tf` already suggests `db-g1-small` to stretch credits,
   **but** LC-INF2 raised the disk to 20 GB specifically to lift the PD_SSD IOPS ceiling (~30 IOPS/GB)
   for the GPS write path, and the comment warns the 1-vCPU tier can *already* cap effective IOPS.
   Downsizing the tier risks the write path. **Measure before touching this one** — and the load runs
   that would tell us (LR13–LR15) have not happened yet.
4. **Confirm the ALB + Cloud Armor line.** Global forwarding rules and the Armor policy are real monthly
   charges outside the documented $95–110. PR #921 already gated the preview-only Armor rules and #913
   cut LB log sampling; worth reading the actual bill to see what landed.
5. **Keep staging/admin/merchant tiers at `count = 0`** unless actively in use — each armed tier adds
   its own Cloud SQL + Redis, which would roughly double the bill.

Items 1 and 2 together are **~$45/mo, ~40% of the bill** — comparable to the entire saving a DO
migration would produce, at a fraction of the risk, with no latency regression, no data-residency
question, and no new store release.

---

## 7. Summary

| | **GCP (today)** | **Azure (South Africa North)** | **DigitalOcean (Frankfurt)** |
|---|---|---|---|
| RTT from Harare | **~17–20 ms** | **~17–20 ms** | **~150–250 ms** ❌ |
| Data stays in Africa | ✅ | ✅ | ❌ |
| Est. monthly | ~$115–130 | ~$110–190 | **~$62–80** ✅ |
| Egress rate | moderate | **$0.181/GB (Zone 3)** ❌ | **$0.01/GiB** ✅ |
| Scale-to-zero compute | ✅ Cloud Run | ◐ only if Container Apps is in-region | ◐ App Platform |
| PostGIS | ✅ live | ✅ via `azure.extensions` allowlist | ✅ PG≤17 only |
| Managed-service sunset risk | — | ⚠️ Cache for Redis retires 2028-09-30 | — |
| Migration cost | **$0** | 2–4 weeks | 2–4 weeks |
| Credits | Google for Startups (active) | Founders Hub — realistically $5k, expires in 12 mo | — |

**Stay on GCP.** DigitalOcean is cheaper and is still the wrong answer: a ~10× latency penalty on a
real-time auction and a live GPS stream, plus KYC images leaving the continent, for ~$50/mo. Azure is
the credible alternative on latency and would be a reasonable home — but it is not cheaper, its Africa
egress is worse, its Redis product has an announced sunset, and the Container Apps region question
could remove scale-to-zero. The only thing that would justify the move is a **verified** Founders Hub
tier at $25k+ arriving as Google credits run out.

Meanwhile the $45/mo of genuine waste is on GCP, removable this week, and item (1) — Direct VPC
egress — is faster *and* cheaper with no trade-off at all.

---

## Open items before anyone acts on this

- [ ] Read the **actual GCP bill** — this analysis uses the `ENG-REVIEW.md` §3b estimate plus list
      prices, not billing-export truth. The ALB/Armor line in particular is inferred.
- [ ] Confirm **Container Apps availability in South Africa North** (Azure Products-by-Region, region
      selector) — it changes Azure's compute line from "$0 idle" to "~$18/mo idle".
- [ ] Price Azure in the **calculator with region = South Africa North**; African-region uplift is not
      reflected in the widely-quoted US/EU list figures used above.
- [ ] Check **remaining Google for Startups credit balance** and expiry — the single fact most likely to
      reopen the Azure question.
- [ ] Legal read on **Zimbabwe Cyber and Data Protection Act (Ch. 12:07)** cross-border transfer rules
      for KYC imagery, if off-continent hosting is ever seriously considered.
- [ ] Land Direct VPC egress (§6.1) — independent of any provider decision.

## Sources

- [DigitalOcean — Regional Availability](https://docs.digitalocean.com/platform/regional-availability/)
- [DigitalOcean — Does DigitalOcean have data centres in Africa?](https://www.digitalocean.com/community/questions/does-digitalocean-have-data-centres-in-africa-or-south-africa)
- [DigitalOcean — Managed Databases pricing](https://www.digitalocean.com/pricing/managed-databases) · [App Platform pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/) · [Bandwidth billing](https://docs.digitalocean.com/platform/billing/bandwidth/) · [Supported PostgreSQL extensions](https://docs.digitalocean.com/products/databases/postgresql/details/supported-extensions/)
- [AFRINIC — Insight Into Africa's Country-level Latencies](https://afrinic.net/ast/pdf/research/insight-latency-africa.pdf)
- [Azure — PostgreSQL Flexible Server pricing](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/) · [Allow extensions (PostGIS)](https://learn.microsoft.com/en-us/azure/postgresql/extensions/how-to-allow-extensions)
- [Azure — Bandwidth pricing](https://azure.microsoft.com/en-us/pricing/details/bandwidth/) · [Egress pricing by zone](https://egresscost.com/azure/zones-explained/)
- [Azure — Cache for Redis pricing](https://azure.microsoft.com/en-us/pricing/details/cache/) · [Migrate from Basic/Standard/Premium to Azure Managed Redis](https://learn.microsoft.com/en-us/azure/redis/migrate/migrate-basic-standard-premium-understand)
- [Azure — Products available by region](https://azure.microsoft.com/en-us/explore/global-infrastructure/products-by-region/table) · [Container Apps region availability](https://microsoft.github.io/azure-container-apps/aca-getting-started/region-availability.html)
- [Microsoft for Startups Founders Hub — 2026 credit tiers](https://cloudkompas.com/blog/microsoft-for-startups-2026)
- [Google Cloud — Direct VPC egress for Cloud Run is now GA](https://cloud.google.com/blog/products/serverless/direct-vpc-egress-for-cloud-run-is-now-ga/) · [Compare Direct VPC egress and VPC connectors](https://docs.cloud.google.com/run/docs/configuring/connecting-vpc)
