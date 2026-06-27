# Lynia — "G Brain" (Google AI / Gemini) usage strategy

> **Vision:** Lynia already runs on **Google Cloud** (Cloud Run + Cloud SQL + Memorystore + Cloud Storage)
> and **Google Maps Platform**. The "**G Brain**" is the AI layer that sits on the *same* Google account —
> **Gemini models on Vertex AI** — used to make the courier marketplace smarter where it actually hurts:
> **addressing, trust/safety, pricing, and support** in a cash, low-trust, data-expensive market.
> **Stance:** AI is a *thin assist on top of the existing spine* (CONCEPT §1b), never a new product. It must
> respect the same disciplines that shaped the MVP — **cheap on mobile data (§3.4), payment-agnostic (§5b),
> human-in-reserve for anything safety-critical**.

> **Assumption to confirm.** This doc reads "G Brain" as **Google's AI (Gemini / Vertex AI)** — the natural
> fit given the GCP + Google Maps commitments already locked (CONCEPT §10, PILOT-READINESS Decision gates).
> If "G Brain" means something else (a specific named service, a gstack memory layer, etc.), the *mapping*
> below still holds — only the vendor name changes.

---

## 1. Why Google AI specifically (and not "an LLM" in the abstract)

The cloud is **already chosen and closed** (Google Cloud, 2026-06-27). That single fact makes Gemini the
low-friction option, not a new vendor decision:

- **No new vendor, no new bill-payer, no new data-egress story.** Vertex AI is the same GCP project, same
  IAM, same `africa-south1` (Johannesburg) region already picked for latency to Harare. It reuses the
  **`CLOUD_PROVIDER=gcp` adapter discipline** (D7/T13) instead of bolting on an unrelated SaaS.
- **Maps + AI on one account.** The addressing problem (CONCEPT §3.3 — *no reliable street addresses*) is a
  Maps **and** a language problem; solving it well wants both, ideally co-located.
- **Startup credits.** Google for Startups / Accelerator: Africa credits (already cited as a cloud-choice
  reason) extend to Vertex AI usage — the experiments below can run on credit, not cash.

> **The discipline that must survive contact with AI:** Lynia chose an **own NestJS stack on plain Postgres
> for data sovereignty** (CONCEPT §5). Sending user data to *any* model — even Google's — is in tension with
> that. Every use below is gated on: *(a)* is the data sent the minimum needed, *(b)* is there a non-AI
> fallback, *(c)* does a human own the final call on anything that gates money, identity, or safety.

---

## 2. Where the brain earns its keep — mapped to real Lynia pain

Ranked by **leverage ÷ risk**, each tied to an existing seam or backlog trigger so it slots in additively.

| # | Use | Lynia pain it attacks | Where it plugs in | Risk |
|---|-----|------------------------|-------------------|------|
| 1 | **Address/landmark normalisation & geocoding assist** | §3.3 no street addresses; pins + landmark text are messy | `orders` create flow; Maps Geocoding + Gemini to turn "near Avondale Spar, blue gate" → a confident pin + tidy landmark | Low |
| 2 | **Item-description structuring + prohibited/value triage** | §3.5 trust & safety: declared-value cap, prohibited-items list, free-text `item_desc` | On create: classify item, flag likely-prohibited (cash, hazardous, live animals) or over-cap, draft a clean `item_desc` | Low–med |
| 3 | **Photo checks (pickup item photo, rider selfie pre-KYC)** | §3.5 item photo at pickup; §5d rider photo required | Gemini multimodal on `item_photo_url` / profile photo — "does this look like the declared item / a real face" as a *soft* pre-screen before the real KYC vendor | Med |
| 4 | **Support / ops copilot in the admin console** | §1 admin only *monitors & supports*; stuck-order triage is manual | Admin dashboard: summarise an order's `order_events` timeline, suggest the next support action, draft the customer message | Low |
| 5 | **Pricing-suggestion explainer & anomaly flag** | §6 soft suggested price; §7 lowball/no-offers risk | Explain *why* a suggested fare is what it is ("longer than usual for the distance — bridge detour"); flag absurd proposed fares before broadcast | Low |
| 6 | **Rider broadcast/notification copy + localisation** | §3.4 data cost; future Shona/Ndebele (§9 brand & language) | Generate terse, data-cheap push/SMS copy; pre-translate the fixed UI string set (offline, build-time — *not* per-request) | Low |
| 7 | **Offer-loop tuning analytics (offline)** | §8 offer-loop health metrics; §9 window/radius tuning | Batch analysis of broadcasts → offers → selection to recommend window length / radius per corridor. **Analytics, not in-path.** | Low |

**Deliberately NOT for AI (at least for the pilot):**

- ❌ **The KYC verdict itself.** §5d/§3.12 already commit to a *dedicated automated KYC vendor (Didit)* with a
  manual backstop. Gemini is at most a *soft pre-screen* (row 3); it must never be the thing that flips
  `kyc_status → verified`. That gate stays with the KYC vendor + human reserve.
- ❌ **Moving or pricing money for real.** Payments are deferred ~6–8 months (§6); there's nothing to automate
  and pre-building AI around revenue violates the payment-agnostic discipline (§5b).
- ❌ **Auto-resolving disputes / cancellations.** §9 cancellation policy is unsettled and cash-market-hard;
  AI can *draft* and *summarise* for an admin, never *decide*.
- ❌ **Per-request translation in the hot path.** Expensive on data and latency; pre-translate the finite
  string set instead (row 6).

---

## 3. The two highest-leverage bets (do these first)

### Bet A — Addressing assist (row 1). *The single most Lynia-shaped use.*
The whole product leans on **GPS pin + landmark text + phone** because street addresses don't exist
(§3.3). That free-text landmark is exactly what a language+maps model is good at: disambiguating "by the
big Total garage in Borrowdale" into a pin with a confidence score, and writing back a clean, consistent
landmark string for the rider. It directly improves **pickup ETA and completion rate** (§8) — the pilot's
headline metrics — and it fails *safe*: if the model is unsure, fall back to the raw pin the user dropped.

### Bet B — Admin support copilot (row 4). *Cheapest to ship, lowest risk, immediate ops value.*
Admin is explicitly **monitor + support, no dispatch** (§1). A copilot that reads an order's append-only
`order_events` feed (§5c) and offers a one-line "here's what's stuck and the likely fix" is pure internal
tooling — **no customer-facing risk, no money, no identity gate**. It pairs naturally with the missing
**admin KYC review queue / order drill-down** already in the backlog (Product surface → "Admin ops
tooling"). Ship it *with* that UI, not separately.

Both touch **internal/low-stakes surfaces first**, which is the right way to earn trust in the model before
it goes anywhere near a customer's order or a rider's identity.

---

## 4. How it plugs into the architecture (reuse the adapter discipline)

Lynia already isolates cloud-specifics behind adapters so the cloud is a `CLOUD_PROVIDER` switch, not a
rewrite (README; `apps/api/src/adapters`). **Do the identical thing for AI:**

```
apps/api/src/adapters/ai/
  ai.port.ts          # interface: classifyItem(), normaliseAddress(), summariseOrder(), ...
  vertex.ai.ts        # Gemini on Vertex AI (primary, CLOUD_PROVIDER=gcp)
  noop.ai.ts          # deterministic stub — CI + offline dev (mirrors otp-sender's console channel)
```

- **Same seam pattern as `otp-sender.ts` and the storage adapter** (BACKLOG: Messaging/OTP, Object storage):
  a port + a real impl + a stub. CI runs the stub; nothing in the test suite calls a paid model.
- **All AI output is advisory and typed.** It returns *suggestions* into existing fields
  (`item_desc`, landmark text, a `flags[]` array), never new authoritative state. A human or a deterministic
  rule makes the final call.
- **Keep it off the mobile hot path.** Calls originate **server-side** (NestJS) or **admin-side**, where data
  cost and latency don't hit the rider's phone (§3.4). The mobile app never calls a model directly.
- **Cost guardrails from day one:** cache normalised addresses (the same landmarks recur in one corridor),
  cap tokens, and prefer the cheapest Gemini tier that clears the bar — most of these tasks are small
  classify/normalise jobs, not long-form generation.

---

## 5. Phasing — tied to existing gates, nothing pulled forward

Sequenced so AI **follows** the cloud provisioning that's already the critical path (PILOT-READINESS
"Recommended sequence"), never blocks it.

| Phase | Trigger (existing) | AI work |
|-------|--------------------|---------|
| **0 — now, free** | None | Add the `ai.port.ts` + `noop` stub seam (a few files, no vendor calls). Decide the data-minimisation rules. Zero cost, keeps the option open. |
| **1 — with GCP provisioning** | T0 GCP project provisioned (already the next step) | Turn on Vertex AI in the same project. Ship **Bet B (admin support copilot)** alongside the admin KYC/ops UI — internal, low-risk first. |
| **2 — with the offer loop on real data** | Pilot running in the corridor | Ship **Bet A (addressing assist)** + item triage (rows 1–2). Calibrate against real landmarks/items. |
| **3 — analytics, ongoing** | §8 metrics flowing | Offline offer-loop tuning (row 7), pricing explainer (row 5), localisation prep (row 6) for the Shona/Ndebele question (§9). |
| **Deferred** | Revenue infra (~6–8 mo, §6) | Revisit AI around demand/supply/surge *only once there's data and money in the loop* — not before. |

---

## 6. Risks specific to putting AI in this product

1. **Data sovereignty tension.** Own-stack-for-sovereignty (§5) vs. sending data to a model. *Mitigation:*
   send the **minimum** (a landmark string, not a whole profile), use `africa-south1`/region-pinned
   endpoints, document what leaves the DB, and keep a non-AI fallback on every path.
2. **Over-trusting the model on safety.** A prohibited-item or fake-photo *miss* is a real-world safety event
   (§3.5). *Mitigation:* AI is a **soft flag that escalates to a human / hard rule**, never the sole gate —
   same posture as the KYC manual backstop (§3.12).
3. **Cost creep on expensive data / thin margins.** *Mitigation:* server-side only, cache aggressively, cheap
   model tiers, hard token caps, and a kill-switch (`AI_ENABLED=false` → falls back to the stub).
4. **Latency in the create flow.** A model call between "drop pin" and "broadcast" can't stall the offer loop.
   *Mitigation:* make AI assists **async / best-effort** — the order broadcasts on the raw pin even if the
   normalisation hasn't returned.
5. **Hallucinated addresses are worse than blank ones.** A confidently-wrong pin sends a rider to the wrong
   gate. *Mitigation:* require a confidence threshold; below it, show the user the raw pin and ask, never
   silently "correct" it.

---

## 7. Bottom line

The cheapest, most Lynia-shaped way to use the G Brain:

1. **Now (free):** add the AI **adapter seam** (mirrors the OTP/storage stubs) so the option is open and CI stays AI-free.
2. **With the GCP provisioning that's already next:** ship the **admin support copilot** — internal, no money, no identity, immediate ops value.
3. **With the live pilot:** ship **addressing/landmark assist** — it attacks the single hardest real-world constraint (§3.3) and lifts the exact metrics the pilot is judged on.
4. **Never:** let AI own a KYC verdict, a payment, or a dispute outcome. It assists humans and feeds hard rules; the existing vendors and human-in-reserve keep the final say.

Everything above is **additive to the built spine** and **gated behind the cloud work already on the critical
path** — no new vendor decision, no scope creep, no pilot blocker.
