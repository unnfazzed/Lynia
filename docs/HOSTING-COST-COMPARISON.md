# Hosting cost comparison — GCP vs Azure vs AWS, and the startup-friendly field

> **Question asked (2026-09-16):** *"Which would be cheaper for hosting — GCP, Azure or AWS? Suggest
> other start-up friendly options."*
>
> **Short answer:** the provider is the *smallest* of the three levers, and after the invoice was
> read (§2) it is smaller still. The measured GCP bill is **~$47.53/mo average to date, trending to
> ~$105/mo** — about half what this document first estimated. Against that, the spread between the
> big three is perhaps $20–50/month, while the spread in **startup credits** is $2,000 to $150,000 —
> and $2,000 alone is ~19 months of hosting. Ranked by money-per-unit-of-effort the order is:
> **claim the credits → trim the GCP bill → (much later, at a different scale) consider moving.**
>
> **Correction, 2026-09-16:** the original estimate here was **~$150–230/mo** and it was roughly
> **2× too high**. Every figure in §2 is now measured from the billing console. §2 also records
> which specific line items the estimate got wrong and why, including one it had **backwards**
> (Memorystore, not Cloud SQL, is the largest service).
>
> This doc is analysis, not a decision. The cloud decision of record remains
> **Google Cloud / `africa-south1`** (`docs/PILOT-READINESS.md`, 2026-06-27). Nothing here changes
> it. The D7 fallback framing is `docs/CEO-REVIEW.md` §"Cloud strategy".

---

## Table of contents

1. [What we actually run](#1-what-we-actually-run)
2. [What it costs today — measured](#2-what-it-costs-today--measured)
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

## 2. What it costs today — measured

**Superseding the estimate.** This section originally carried a bottom-up list-price estimate of
**~$150–230/mo**. The founder produced the actual GCP billing console on **2026-09-16** and it is
roughly **half that**. The measured numbers below replace the estimate; the estimate is kept at the
end of the section only because *how* it was wrong is instructive.

### The console, as read (project `lynia-500911`, window Sep 1 2025 – Sep 30 2026)

GCP headline: **average monthly total cost $47.53**.

| Service | Actual to date | Forecast additional | Share of forecast |
|---|---:|---:|---:|
| **Cloud Memorystore for Redis** | **$71.82** | **$42.84** | **41.0%** |
| Cloud SQL | $59.74 | $30.95 | 29.6% |
| Networking | $29.39 | $16.90 | 16.2% |
| Artifact Registry | $15.00 | $7.07 | 6.8% |
| Compute Engine | $12.99 | $6.75 | 6.5% |
| **Total** | **$188.94** | **$104.51** | |

Two readings of the run rate, because the console does not state one directly:

- **$47.53/mo** is GCP's own figure. `$188.94 ÷ $47.53 = 3.98`, so it is an average over **four**
  periods — and the trend chart shows spend only in the most recent ones, because the project was
  provisioned progressively through mid-2026. It is therefore a **blend that includes near-empty
  months** and understates today.
- **~$105/mo** is the forward-looking read: GCP's own "forecasted additional" totals $104.51, and
  the latest bar in the trend chart is the tallest. Treat this as the current run rate.

**So: roughly $50/mo billed to date on average, trending to ~$105/mo as the stack fills out.** Either
way, well under the $150–230 this document previously asserted.

### What the measurement changes

1. **Memorystore is the single largest line item — bigger than the database.** 41% of the forward
   bill, ahead of Cloud SQL's 30%. The estimate had these **the wrong way round** (Cloud SQL $60–75
   vs Memorystore $35–45). Redis is a 1 GB BASIC instance with no replica, serving BullMQ, Socket.IO
   pub/sub and OTP counters for a pilot — and it is the most expensive thing we run. That reorders
   §8 (see the revised priority there).
2. **Compute Engine $12.99 / $6.75 forward is almost certainly the VPC connector**, since Terraform
   defines no other VMs. That gives the Direct VPC egress change a *measured* value instead of an
   estimated one, and confirms the direction, though at ~$7/mo forward rather than the $12–18 guessed.
3. **Artifact Registry is 6.8% of the bill — a line the estimate buried in "other".** This is
   container-image storage. Every release pushes `$IMAGE:$GITHUB_SHA` **and** `:latest`, and nothing
   prunes. That is pure accumulation with no cleanup policy, and it is the cheapest fix available
   (see §8 item 2a).
4. **Cloud Run and Cloud Armor are not in the top five at all** — both below Compute Engine's $12.99.
   The estimate's claim that WebSockets holding instances warm was worth $5–40/mo was **wrong, or at
   least immaterial**: whatever the mechanism costs, it is smaller than the connector. The
   "WebSockets defeat scale-to-zero" reasoning in §1 stands as an architectural observation and
   should not be read as a cost claim.
5. **"Networking" at 16% covers the ALB, egress and connector throughput together.** The estimate had
   the ALB alone at $18–25/mo; the whole networking category is $29.39 cumulative. The load balancer
   is materially cheaper than asserted.

The one part of the estimate that survives: **the fixed floor dominates and the variable part is
nearly zero.** Memorystore + Cloud SQL + Networking + Compute Engine = **93% of the forward bill**,
and none of it scales down with an idle pilot. That is still the shape of the problem.

### Why the estimate ran ~2× high (kept as a caution)

Every line was biased the same direction: full-month always-on billing at `africa-south1` list price
with an assumed regional premium, no free tiers, no proration, and no sustained-use discount. Applied
across seven line items, the individually-defensible roundings compounded into a doubling. **The
lesson is the one this section originally flagged and then ignored — read the invoice.** The prior
estimate table:

| Line item | estimated $/mo | |
|---|---:|---|
| Cloud SQL | 60–75 | vs ~$31/mo forward measured |
| Memorystore | 35–45 | vs ~$43/mo forward measured — **the only line estimated too low** |
| VPC connector | 12–18 | vs ~$7/mo forward measured |
| ALB | 18–25 | folded into Networking, ~$17/mo forward for the whole category |
| Cloud Armor | ~12 | not in the top five |
| Cloud Run | 5–40 | not in the top five |
| Everything else | 5–15 | Artifact Registry alone is ~$7/mo forward |

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
| **Pilot-scale total (approx.)** | **~$105 measured** (§2), ~$60–70 trimmed | **$45–90** | **$110–180** |

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

**But note the magnitude — and it got smaller.** The Azure/AWS columns are still list-price
estimates; only the GCP column is measured. Against a **measured ~$105/mo**, the plausible saving
from moving to Azure is perhaps **$20–50/mo**, not the $60–100 this document estimated before the
invoice was read. A migration is a Terraform rewrite plus a live data migration (§7), against a
**total annual bill of roughly $1,300**. The payback period is not measured in years; there isn't
one. Treat the provider comparison below as background for a future decision at a different scale,
not as a live option.

---

## 5. Credits — the lever that actually dominates

At this stage the credit programme is worth 10–100× the list-price difference.

| Programme | Self-serve, no institutional funding | With investor / accelerator referral |
|---|---|---|
| **Microsoft for Startups Founders Hub** | **$1,000**, then **+$4,000** once the business is verified | $25,000 → $150,000 |
| **Google for Startups Cloud** | **up to $2,000** (Start tier: <5 yrs old, no prior credits beyond free trial) | $200,000 (Growth/Scale, pre-seed–Series A) · $350,000 (AI track) |
| **AWS Activate** | **$1,000** (Founders tier) | $100,000 (Portfolio, via qualifying VC/accelerator) · $300,000 (GenAI) |

**At a measured ~$105/mo, a $2,000 credit is ~19 months of runway and the entire annual bill is
~$1,300.** That makes the credit programme worth more than every other lever in this document
combined, and it makes the provider comparison academic. Read against Lynia's position (bootstrapped,
Zimbabwe, no institutional round recorded in this repo):

- The self-serve tiers are all in the same $1k–$5k band. **Credits alone do not justify a move.**
  Azure's ladder is nominally the largest self-serve pool ($5k vs $2k vs $1k) — at the measured run
  rate that is **~4 years** of hosting, not the six weeks this document guessed from the inflated
  estimate. Still not a reason to migrate; an even better reason to *hold* the credits.
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
during a pilot, to save perhaps ~$30/mo against a measured ~$105/mo bill (§2). That is the trade,
stated honestly.

---

## 8. Recommendation

**Stay on GCP. Claim the credits. Trim the bill.** That order changed when the invoice was read
(§2): at a measured **~$105/mo**, the $2k credit is ~19 months of hosting and outweighs every
engineering action below put together.

The measurement also **reordered the engineering items**. Memorystore, not Cloud SQL, is the largest
line (41% of the forward bill), so the item this document previously held back is now the biggest
lever available. Ordered by saving-per-unit-of-risk, with measured shares:

| # | Action | ~Saving/mo | Risk | Effort |
|---|---|---:|---|---|
| 1 | **Claim Google for Startups Start-tier credits ($2k)** if not already claimed, and **open Microsoft for Startups Founders Hub in parallel ($1k + $4k)** as the D7 hedge. At the measured run rate this is ~19 months of hosting — more than everything else here combined. | **~$105/mo, for ~19 months** | None | Founder, ~1 hour |
| 1a | **Add an Artifact Registry cleanup policy.** 6.8% of the forward bill is container-image storage. Every release pushes `$IMAGE:$GITHUB_SHA` *and* `:latest` and nothing prunes, so this grows monotonically forever. Keep the last N releases + `latest`. **New — the estimate missed this entirely.** | **~$5–7** | Low — retention only, images are rebuildable from the SHA | Small |
| 2 | **Replace the Serverless VPC connector with Direct VPC egress.** GA since 2024-04-23; identical network rates, **zero compute charge**, and it scales to zero with the service. Our connector is `min_instances = 2` billed as always-on VMs. ✅ **WIRED** — gated behind `direct_vpc_egress_enabled` + the `DIRECT_VPC_EGRESS` repo variable; cutover is [`INFRA-HARDENING-ROLLOUT.md`](./INFRA-HARDENING-ROLLOUT.md) §7. Not yet applied: that is a founder `terraform apply`. | **~$7 measured** (the Compute Engine line, §2) — less than the $12–18 estimated | Low — a deploy-flag change (`--network`/`--subnet` for `--vpc-connector`), reversible | Small |
| 3 | **Finish Cloud Armor's preview stage.** The 5 OWASP rules are `preview = true` — they log and do not block, and Armor bills $1/rule/mo either way. The sequence already exists as [`INFRA-HARDENING-ROLLOUT.md`](./INFRA-HARDENING-ROLLOUT.md) §5 (watch preview logs → tune exceptions → enforce); what was missing is that indefinite preview means paying full price for no enforcement, now noted there. | $0–5, or *protection we're already buying* | Low if enforced deliberately, with a watch on false positives | Founder apply |
| 4 | **Move media to Cloudflare R2** behind the existing `StorageAdapter`. Zero egress, Harare PoP, and the first real exercise of the D7 seam. | small now, larger as photo volume grows | Low — but see the seam note below | **Larger than it looks** |
| 5 | **Replace Memorystore BASIC with Redis on an `e2-small`** in the same VPC. **Now the single biggest lever — 41% of the forward bill, ahead of the database.** | **~$30–35** (most of the $42.84 forward Memorystore line) | ⚠️ Medium — see caveat below | Medium |
| 6 | **Downsize `db_tier` to `db-g1-small`** (already flagged in `variables.tf`). | ~$15–20 (of the $30.95 forward Cloud SQL line) | ⚠️ Medium — see caveat below | Small |

Items 1–4 are close to free money and I would do them. **Items 5 and 6 I would still hold — but item
5's hold is now expensive**, and the reasons are in this repo:

- **(5)** Redis holds BullMQ jobs, Socket.IO pub/sub and OTP/rate-limit counters. BASIC tier has no
  replica, so the *durability* bar genuinely does not drop — but we would be taking on patching,
  monitoring and restart behaviour for a component whose loss drops in-flight offer-expiry jobs.
  Worth doing **after** the k6 load run, not during a pilot. **What the invoice changes is the
  urgency, not the verdict:** at 41% of the bill this is the most expensive thing we run, so the
  right response is to *bring the k6 run forward* (`docs/LOAD-MODEL.md` needs a staging stack, which
  is itself a cost decision — see §9) rather than to swap Redis blind. A cheaper interim: Memorystore
  bills per GB, so confirming 1 GB is actually needed — or that the instance is not oversized for
  the pilot's key count — is a console check, not a migration.
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

Doing 1a + 2 + 3 + 4 takes ~$105/mo to roughly **$90/mo**; adding 5 + 6 after load evidence lands it
near **$45–55/mo** — below a like-for-like Azure build, with no migration, no data move and no store
release. Item 1 (the credits) makes all of it free for about a year and a half regardless.

**On the literal question — "which is cheaper?"** At our size, **Azure**, mostly because of burstable
Postgres and bundled ingress; **AWS is the most expensive** of the three, chiefly the NAT Gateway
plus the `af-south-1` premium. But the honest answer after reading the invoice is that **the question
does not matter yet**. The whole GCP bill is ~$1,300/year. The provider spread is a rounding error
against a single credit grant, and it is smaller than the Memorystore line alone. Revisit at scale
(§9), not now.

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
- **The bill stops looking like §2.** The measurement there is a single console reading on
  2026-09-16, during a pilot whose resources were still being provisioned — so the trend is upward
  by construction. Re-read the console (or better, wire the billing export) before acting on any
  number in this document; a figure this load-bearing should not stay a screenshot.
- **Traffic reaches ~10× the `LOAD-MODEL` 1× envelope.** At that point the fixed edge overhead stops
  dominating, per-request and egress pricing starts to matter, and the comparison should be redone
  against measured usage rather than a shape.
- **The staging stack is switched on** (`staging_enabled = true`). That is a second Cloud SQL + a
  second Redis. On the measured numbers that is **+$70–75/mo** — it does not just dent the bill, it
  roughly **doubles** it, and it lands on the two most expensive services we run. `docs/LOAD-MODEL.md`
  requires it for the load run. Budget for it deliberately, and consider tearing it down between
  runs rather than leaving it standing.
- **Fly.io ships Managed Postgres in `jnb`.** That single change would make the Fly hybrid in §6 the
  clear price/latency winner and would be worth a real re-evaluation.
