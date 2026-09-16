# Hosting cost comparison — GCP vs Azure vs AWS, and the startup-friendly field

> **Question asked (2026-09-16):** *"Which would be cheaper for hosting — GCP, Azure or AWS? Suggest
> other start-up friendly options."*
>
> **Short answer:** the provider is the *smallest* of the three levers. At Lynia's current size the
> spread between the big three is roughly **$50–80/month**; the spread between the stack **as
> currently configured** and the same stack **configured for a pilot** is about the same; and the
> spread in **startup credits** is $2,000 to $150,000. Ranked by money-per-unit-of-effort, the order
> is: **trim the GCP bill → claim the credits → (much later) consider moving**.
>
> This doc is analysis, not a decision. The cloud decision of record remains
> **Google Cloud / `africa-south1`** (`docs/PILOT-READINESS.md`, 2026-06-27). Nothing here changes
> it. The D7 fallback framing is `docs/CEO-REVIEW.md` §"Cloud strategy".

---

## Table of contents

1. [What we actually run](#1-what-we-actually-run)
2. [What it costs today](#2-what-it-costs-today--and-why-our-own-estimate-is-low)
3. [The hard constraint: the region](#3-the-hard-constraint-the-region)
4. [GCP vs Azure vs AWS, like for like](#4-gcp-vs-azure-vs-aws-like-for-like)
5. [Credits — the lever that actually dominates](#5-credits--the-lever-that-actually-dominates)
6. [Startup-friendly alternatives](#6-startup-friendly-alternatives)
7. [How portable are we really? (D7, honestly)](#7-how-portable-are-we-really-d7-honestly)
8. [Recommendation](#8-recommendation)
9. [When this answer changes](#9-when-this-answer-changes)

---

## 1. What we actually run

From `infra/terraform/` and `.github/workflows/release.yml`, the live shape is
(`docs/ARCHITECTURE.md` §3):

| Component | Today | Why it exists |
|---|---|---|
| Compute | **Cloud Run**, `--max-instances 10`, no min instances, `--timeout 3600` | the only compute; the 3600s timeout is what lets Socket.IO tracking connections live |
| Database | **Cloud SQL** Postgres 16 + PostGIS, `db-custom-1-3840` (1 vCPU / 3.75 GB), ENTERPRISE, **ZONAL**, 20 GB PD_SSD, PITR on | PostGIS `geography` + GiST index is on the critical path (nearby-rider broadcast) |
| Cache/queue | **Memorystore Redis BASIC 1 GB**, private, AUTH on | BullMQ, Socket.IO pub/sub, OTP + rate-limit counters |
| Network | **Serverless VPC Access connector**, `min_instances = 2` | Cloud Run has no VPC route by default → without it, Redis is unreachable |
| Edge | **External HTTPS ALB** + global IP + Google-managed cert, 2 forwarding rules | the org disables `*.run.app`, so the LB is **not optional** — it is the device-facing endpoint |
| WAF | **Cloud Armor**: 1 throttle rule + 5 OWASP preconfigured rules + default allow | `armor_waf_preview = true` → the 5 OWASP rules **log, they do not block** |
| Storage | **GCS** `lynia-media` (KYC + item photos), V4 signed URLs via runtime-SA `signBlob` | no private key in env |
| Supporting | Secret Manager (5 secrets), Artifact Registry, Cloud Scheduler (3 jobs, `europe-west1`), KMS, 11 monitoring alert policies | |
| Optional | OTEL collector **sidecar** (`--cpu 1 --memory 256Mi`), gated on `OTEL_SIDECAR_ENABLED` | a sidecar bills for the whole instance lifetime, not per-request |
| Gated off | Staging stack (`staging_enabled = false`) — its own Cloud SQL + Redis + bucket | a second full data tier the moment it is switched on |

Two facts from that list carry most of the cost story:

- **The fixed floor is large and the variable part is nearly zero.** Cloud SQL + Memorystore + the
  connector + the ALB + Armor are billed whether or not a single order is placed. At pilot traffic
  (`docs/LOAD-MODEL.md`: ~300 orders/peak hour at 1×, order-create ≈ 0.08 rps) Cloud Run and GCS
  round to nothing. **We are paying for an always-on shape to serve a nearly-idle workload.**
- **WebSockets defeat scale-to-zero.** `--timeout 3600` plus ~350 concurrent tracking connections at
  1× means at least one Cloud Run instance is held warm essentially all the time once riders are
  online. Cloud Run's scale-to-zero economics do not apply to us during operating hours — a point
  that also applies to every serverless alternative below.

---

## 2. What it costs today — and why our own estimate is low

`docs/ENG-REVIEW.md` records **~$95–110/mo** (Cloud SQL ~$50 + Memorystore ~$35 + connector ~$10).
That estimate predates the external HTTPS load balancer and Cloud Armor landing, and it assumes
Cloud Run rounds to zero. Adding the missing lines:

| Line item | ~$/mo (list, `africa-south1`) | Notes |
|---|---:|---|
| Cloud SQL `db-custom-1-3840`, ZONAL, 20 GB PD_SSD, PITR | 60–75 | Joburg carries a premium over US regions; PITR/WAL + backup storage on top |
| Memorystore Redis BASIC 1 GB | 35–45 | no replica at BASIC — we pay for managed, not for HA |
| Serverless VPC connector (2 × always-on instances) | 12–18 | billed as VMs, idle or not |
| External HTTPS ALB (2 forwarding rules + data processing) | 18–25 | ~$0.025/hr covers ≤5 forwarding rules, plus per-GB processing |
| Cloud Armor (1 policy @ $5 + ~7 rules @ $1) | ~12 | plus $0.75/M requests (negligible at pilot volume) |
| Cloud Run (no min instances, but WS holds instances warm) | 5–40 | the wide band **is** the WebSocket effect; add the OTEL sidecar if enabled |
| GCS + Artifact Registry + Secret Manager + Scheduler + KMS + logging | 5–15 | Cloud Logging is free to 50 GiB, then $0.50/GiB |
| **Total** | **≈ $150–230/mo** | before credits |

**So the real number is roughly 1.5–2× what `ENG-REVIEW` records, and about $85/mo of it is edge and
plumbing** (connector + ALB + Armor) rather than database or compute. That is the single most
useful finding in this document, and it is true regardless of which provider we pick.

> Figures are approximate list prices for `africa-south1` as of 2026-09. They are for *relative*
> comparison. Use the live billing export for anything that matters — nobody in this repo has read
> the actual invoice into a doc yet, which is itself worth fixing.

---

## 3. The hard constraint: the region

Before any price comparison, one filter removes most of the cheap options.

Harare → Johannesburg is ~1,100 km and typically **20–40 ms RTT**. Harare → Frankfurt/Amsterdam is
~8,000 km and typically **150–200 ms RTT**. Zimbabwean international transit largely egresses via
Johannesburg regardless, so a Joburg region is close to the floor achievable from Harare.

That matters here more than it would for a CRUD app:

- `docs/LOAD-MODEL.md` asserts **offer-received p95 < 2000 ms** and **offer-select p95 < 300 ms**.
  A 150 ms penalty on every round trip eats a meaningful fraction of the 300 ms budget before the
  server does any work.
- Riders emit a GPS fix **every 3 seconds** over Socket.IO while a delivery is live. Higher RTT means
  more time in flight, more retransmits, and more mobile data — and data is expensive in Zimbabwe.
- The API is chatty with Postgres and Redis. Those must sit next to the API, and the API must sit
  next to the users. Splitting the tiers across continents is the one configuration that is
  definitively wrong.

**Providers with an African region:** GCP (`africa-south1`, Johannesburg), AWS (`af-south-1`, Cape
Town), Azure (South Africa North, Johannesburg), Fly.io (`jnb`), Oracle Cloud (Johannesburg), AWS
Lightsail (Cape Town).

**Providers without one — as of 2026-09:** Hetzner, DigitalOcean, Render, Railway, Neon, Supabase
(the South Africa request is still open), Upstash. These are not disqualified as vendors — several
are excellent for *ancillary* jobs — but they cannot host the API or the primary database.

---

## 4. GCP vs Azure vs AWS, like for like

Same shape — a container with WebSockets, managed Postgres + PostGIS, managed Redis, object storage,
TLS edge, WAF — in each provider's ZA region, at pilot scale:

| | **GCP** `africa-south1` | **Azure** South Africa North | **AWS** `af-south-1` |
|---|---|---|---|
| Compute | Cloud Run, scale-to-zero (defeated by WS) | Container Apps consumption — **180k vCPU-s + 360k GiB-s + 2M requests free/mo** | App Runner, or ECS Fargate |
| Postgres | Cloud SQL — smallest custom tier is 1 vCPU / 3.75 GB | **Flexible Server Burstable B1ms** — a genuinely small, genuinely cheap tier | RDS `db.t4g.micro/small` |
| Redis | Memorystore BASIC 1 GB | Cache for Redis Basic C0 (250 MB) | ElastiCache `t4g.micro` |
| TLS edge | **ALB is mandatory** (org disables `run.app`) → ~$18–25/mo | **ingress is included** with Container Apps; Front Door only if wanted | ALB ~$18–22/mo |
| Private networking | connector ~$12–18, **or Direct VPC egress at $0 compute** | VNet integration, no per-hour connector VM | **NAT Gateway ~$35–45/mo + $0.045/GB** if the tasks sit in private subnets |
| WAF | Cloud Armor $5 + $1/rule | Front Door WAF / App Gateway WAF (pricier entry) | AWS WAF $5 + $1/rule + $0.60/M |
| PostGIS | ✅ | ✅ | ✅ |
| **Pilot-scale total (approx.)** | **$150–230** as built; **$70–100** trimmed | **$45–90** | **$110–180** |

**Ranking on list price at our size: Azure < GCP (trimmed) < GCP (as built) < AWS.**

The three things driving that ranking — none of which is "Azure is a cheaper company":

1. **Azure has a burstable Postgres tier and the other two effectively don't at the bottom end.**
   B1ms is the single biggest line-item difference. Cloud SQL's smallest sensible custom tier is
   already 1 vCPU / 3.75 GB.
2. **Container Apps bundles ingress; Cloud Run in our org configuration cannot.** Because the org
   policy disables `*.run.app`, the ~$20/mo load balancer is a structural cost for us specifically,
   not an optional extra. Azure would hand that back.
3. **AWS's NAT Gateway is the silent killer.** ~$35–45/mo *plus* per-GB processing, purely so private
   tasks can reach the internet. Combined with `af-south-1` carrying roughly a 10–25% premium over
   `us-east-1`, AWS is the most expensive of the three for this shape. (AWS Lightsail in Cape Town
   sidesteps both the ALB and the NAT Gateway with fixed-price bundles — see §6.)

**But note the magnitude.** Azure-vs-GCP is worth perhaps $60–100/mo. A migration is a Terraform
rewrite plus a live data migration (§7). At $80/mo saved, the payback period on even two weeks of
work is measured in years.

---

## 5. Credits — the lever that actually dominates

At this stage the credit programme is worth 10–100× the list-price difference.

| Programme | Self-serve, no institutional funding | With investor / accelerator referral |
|---|---|---|
| **Microsoft for Startups Founders Hub** | **$1,000**, then **+$4,000** once the business is verified | $25,000 → $150,000 |
| **Google for Startups Cloud** | **up to $2,000** (Start tier: <5 yrs old, no prior credits beyond free trial) | $200,000 (Growth/Scale, pre-seed–Series A) · $350,000 (AI track) |
| **AWS Activate** | **$1,000** (Founders tier) | $100,000 (Portfolio, via qualifying VC/accelerator) · $300,000 (GenAI) |

Read against Lynia's position (bootstrapped, Zimbabwe, no institutional round recorded in this repo):

- The self-serve tiers are all in the same $1k–$5k band. **Credits alone do not justify a move.**
  Azure's ladder is nominally the largest self-serve pool ($5k vs $2k vs $1k) — worth about six
  weeks of current runway. Not a reason to migrate; a good reason to *hold* the credits.
- The large tiers all require institutional funding or accelerator membership. `docs/PILOT-READINESS.md`
  notes **Google for Startups Accelerator: Africa** as the route to the larger GCP tier. That is the
  highest-value single action available here and it is a *founder* action, not an engineering one.
- **Claiming a credit pool does not oblige us to host there.** Azure Founders Hub credits can sit
  unused as a hedge. Given that D7's switch trigger is explicitly *"billing/eligibility from Zimbabwe
  fails or credits don't land"* — and that `docs/GCP-BILLING-DOMAIN-SETUP.md` documents us **already**
  fighting a Google-identity/billing-admin problem on `lyniafinance.com` — having the fallback's
  credits live *before* the trigger fires is cheap insurance.

---

## 6. Startup-friendly alternatives

Filtered by §3 (can it host the API/DB near Harare?):

### Viable for the API and/or database

| Option | ~$/mo | The case for | The case against |
|---|---:|---|---|
| **Fly.io** (`jnb`) | 30–60 | A Johannesburg region, first-class WebSockets (our whole tracking layer), Machines scale to zero, no LB surcharge, no NAT tax. The best latency-per-dollar in the field. | **Managed Postgres is not offered in `jnb`** — you self-run Postgres on a volume. For a wallet + commission ledger with a prepaid float, that is the wrong risk to take for ~$80/mo. |
| **Fly.io `jnb` + Cloud SQL `africa-south1`** (hybrid) | 80–120 | Keeps the managed database and its PITR; moves only the compute + edge, which is where the ALB/connector/Armor overhead lives. Both endpoints are in Joburg, so the cross-provider hop is ~1–3 ms. | Two vendors, two bills, cross-provider egress, and the Cloud SQL public-IP surface (`ENG-REVIEW` P2) becomes load-bearing rather than migration-only. |
| **AWS Lightsail** (Cape Town) | 20–60 | Fixed-price bundles; escapes both the ALB and the NAT Gateway that make regular AWS expensive. Predictable — no surprise invoice. | Much less managed; no PostGIS-ready managed DB at the low end without care; you own patching and backups. |
| **Oracle Cloud** (Johannesburg) | 0–20 | A Joburg region **and** an Always Free tier. Nominally the cheapest thing with an African region. | The Always Free Ampere allocation was **halved in June 2026** (4 OCPU/24 GB → 2 OCPU/12 GB), with existing over-limit instances terminated from 2026-08-18. Free-tier capacity outside US regions is chronically unobtainable. Not a place to put a money ledger. |

### Useful alongside, not instead of

| Option | Where it fits | Value |
|---|---|---|
| **Cloudflare R2** | swap in behind the existing `StorageAdapter` (`CLOUD_PROVIDER`) for KYC/item photos | **Zero egress fees**, S3-compatible, and Cloudflare has a Harare PoP so photos serve locally. We already use Cloudflare for DNS (`docs/CLOUDFLARE.md`). This is also the cheapest possible *proof that the D7 seam works* — a second adapter impl is exactly what it was built for. |
| **Self-run Redis on a small VM** in `africa-south1` | replaces Memorystore BASIC | ~$13/mo vs ~$40. BASIC has no replica anyway, so the durability bar is unchanged (see §8 for the caveat). |
| **Upstash Redis** | serverless, pay-per-request | Would kill the Redis floor entirely — **but no ZA region**, and BullMQ + Socket.IO pub/sub are chatty. Wrong trade for our access pattern. |
| **Hetzner** | nothing, today | The genuine price champion (a CPX21 costs roughly what we pay in *Cloud Armor rules*), but Falkenstein/Helsinki/Ashburn/Singapore only. ~170 ms to Harare. Revisit only if a non-latency-sensitive batch workload appears. |
| **Neon / Supabase / Render / Railway / DigitalOcean** | nothing, today | All excellent, all Europe/US/Asia-only. Supabase is doubly awkward here — `docs/CEO-REVIEW.md` deliberately replaced it with the own-NestJS stack. |

---

## 7. How portable are we really? (D7, honestly)

`docs/CEO-REVIEW.md` D7 promises a cloud move is *"a switch, not a rewrite"*. That is **true of the
application and false of the infrastructure**, and the distinction should be stated plainly before
anyone costs a migration off a one-line summary.

**Genuinely portable** (this part of D7 delivered): one Docker image; standard Postgres + PostGIS +
Redis with no proprietary extensions; FCM directly rather than a cloud push hub; OpenTelemetry rather
than a vendor SDK; storage/push/secrets behind adapters; **secrets injected as env vars at deploy**
rather than fetched through a managed-identity SDK — which, as `ARCHITECTURE.md` §12 notes, is the
subtlest lock-in avoided.

**Not portable** — every one of these is GCP-shaped in `infra/terraform/` and has no adapter:

Cloud SQL · Memorystore · the external HTTPS ALB + managed certs · Cloud Armor policies · the
Serverless VPC connector + PSA peering · IAP on the admin console (which already needed a hand-made
OAuth client because the org has no Cloud Identity directory) · **Workload Identity Federation**, which
is how CI authenticates keyless because the org enforces `disableServiceAccountKeyCreation` · Artifact
Registry · Cloud Scheduler · KMS · 11 monitoring alert policies · GCS V4 signing via runtime-SA
`signBlob`.

A move means re-authoring `infra/terraform/` against a new provider, re-solving keyless CI, migrating
a live Postgres with PostGIS data, re-issuing certs, and re-pointing the mobile app — **whose
certificate pinning is baked into a native build** (`docs/MOBILE-CERT-PINNING.md`), so an endpoint
change cannot be delivered by OTA and needs a store release (`REL-01`). Realistically **2–4 weeks**,
during a pilot, to save ~$80/mo. That is the trade, stated honestly.

---

## 8. Recommendation

**Stay on GCP. Trim the bill. Claim the credits.** Ordered by saving-per-unit-of-risk:

| # | Action | ~Saving/mo | Risk | Effort |
|---|---|---:|---|---|
| 1 | **Replace the Serverless VPC connector with Direct VPC egress.** GA since 2024-04-23; identical network rates, **zero compute charge**, and it scales to zero with the service. Our connector is `min_instances = 2` billed as always-on VMs. ✅ **WIRED** — gated behind `direct_vpc_egress_enabled` + the `DIRECT_VPC_EGRESS` repo variable; cutover is [`INFRA-HARDENING-ROLLOUT.md`](./INFRA-HARDENING-ROLLOUT.md) §7. Not yet applied: that is a founder `terraform apply`. | **$12–18** | Low — a deploy-flag change (`--network`/`--subnet` for `--vpc-connector`), reversible | Small |
| 2 | **Claim Google for Startups Start-tier credits ($2k)** if not already claimed, and **open Microsoft for Startups Founders Hub in parallel ($1k + $4k)** as the D7 hedge. | up to ~$6k one-off | None | Founder, ~1 hour |
| 3 | **Finish Cloud Armor's preview stage.** The 5 OWASP rules are `preview = true` — they log and do not block, and Armor bills $1/rule/mo either way. The sequence already exists as [`INFRA-HARDENING-ROLLOUT.md`](./INFRA-HARDENING-ROLLOUT.md) §5 (watch preview logs → tune exceptions → enforce); what was missing is that indefinite preview means paying full price for no enforcement, now noted there. | $0–5, or *protection we're already buying* | Low if enforced deliberately, with a watch on false positives | Founder apply |
| 4 | **Move media to Cloudflare R2** behind the existing `StorageAdapter`. Zero egress, Harare PoP, and the first real exercise of the D7 seam. | small now, larger as photo volume grows | Low — but see the seam note below | **Larger than it looks** |
| 5 | **Replace Memorystore BASIC with Redis on an `e2-small`** in the same VPC. | **$20–30** | ⚠️ Medium — see caveat below | Medium |
| 6 | **Downsize `db_tier` to `db-g1-small`** (already flagged in `variables.tf`). | $25–30 | ⚠️ Medium — see caveat below | Small |

Items 1–4 are close to free money and I would do them. **Items 5 and 6 I would hold**, and the
reasons are in this repo:

- **(5)** Redis holds BullMQ jobs, Socket.IO pub/sub and OTP/rate-limit counters. BASIC tier has no
  replica, so the *durability* bar genuinely does not drop — but we would be taking on patching,
  monitoring and restart behaviour for a component whose loss drops in-flight offer-expiry jobs.
  Worth doing **after** the k6 load run, not during a pilot.
- **(6)** `LC-INF2` raised the disk to 20 GB specifically to lift the PD_SSD IOPS ceiling for the
  write-heavy GPS workload, and the note already warns that the 1-vCPU tier can cap effective IOPS
  anyway. Shrinking the tier before `docs/LOAD-MODEL.md`'s scenarios have ever been run against a
  staging stack is optimising a number we have not measured.

### The R2 swap is not a one-liner — the seam leaks (found while costing item 4)

`StorageAdapter` abstracts URL *generation* cleanly, but the GCS-specific **upload size bound** escapes
it. `GcsStorage.createUploadUrl` binds `x-goog-content-length-range` into the V4 signature, and
`apps/api/src/uploads/uploads.controller.ts:127` then hands the client that **same GCS header name
verbatim**. So the controller — business logic, on the cloud-agnostic side of the seam — knows a
Google header. Two consequences:

- A second storage impl cannot satisfy the interface alone; the controller has to change too, which is
  precisely what D7 promised would not happen.
- The bound itself does not port. S3/R2 **presigned PUT cannot enforce a content-length *range*** the
  way GCS does (presigned POST policies can; presigned PUT can only pin an exact length). Swapping
  naively would quietly weaken a real security control — an attacker-chosen multi-GB object against a
  URL minted for a photo.

The honest fix is to move the size bound *into* the interface — have `createUploadUrl` return the
required request headers rather than have the controller name them — and then decide per-provider how
to enforce it. That is worth doing on its own merits (it is the seam working as designed), but it is a
tested API change, not an adapter drop-in, and it should not ride a cost PR. **Item 4 is therefore
specified here and not implemented.**

Doing 1 + 3 + 4 lands the bill at roughly **$120–190/mo**; adding 5 + 6 after load evidence lands it
at roughly **$70–110/mo** — which is at or below what a like-for-like Azure build would cost, with no
migration, no data move, and no store release.

**On the literal question — "which is cheaper?"** At our size, **Azure**, by roughly $60–100/mo,
mostly because of burstable Postgres and bundled ingress. **AWS is the most expensive** of the three
for this shape, chiefly the NAT Gateway plus the `af-south-1` premium. **That difference is not
worth a migration today**, and it is smaller than the money currently sitting in our own
configuration.

---

## 9. When this answer changes

Revisit if any of these fire:

- **GCP billing/eligibility from Zimbabwe fails.** This is D7's explicit switch trigger, and
  `docs/GCP-BILLING-DOMAIN-SETUP.md` shows us already blocked on a Google-identity problem for
  `lyniafinance.com`. If it escalates, Azure South Africa North + Founders Hub is the
  pre-designated fallback and the CEO review already chose it. Hold the credits **before** this
  fires, not after.
- **An institutional round or accelerator place lands.** $100k–$350k of credits makes the
  list-price comparison irrelevant for two years, and the right provider becomes whichever one
  granted the credits.
- **Traffic reaches ~10× the `LOAD-MODEL` 1× envelope.** At that point the fixed edge overhead stops
  dominating, per-request and egress pricing starts to matter, and the comparison should be redone
  against measured usage rather than a shape.
- **The staging stack is switched on** (`staging_enabled = true`). That is a second Cloud SQL + a
  second Redis — realistically **+$80–120/mo**, roughly doubling the bill. `docs/LOAD-MODEL.md`
  requires it for the load run. Budget for it deliberately, and consider tearing it down between
  runs rather than leaving it standing.
- **Fly.io ships Managed Postgres in `jnb`.** That single change would make the Fly hybrid in §6 the
  clear price/latency winner and would be worth a real re-evaluation.
