# R4 — Customer onboarding + Send (report only)

- **Lane:** R4 · **Model:** Sonnet · **Helpers:** none
- **Harness:** **live** (R0's `up.sh` + `drive.mjs`: native PG16/PostGIS, redis, API on :3000, `SKIP_INT=1`). The mobile UI was **not** driven: there is no emulator in the container, so every client claim below is static (code reading + jest) and every server claim is a live API run.
- **main SHA:** `28e4437` (branch tip `4809ebe`) · run 2026-10-14 ~14:30 UTC
- **Tests run:** `jest app/__tests__ src/logic/__tests__/{send*,otp,boot-route} src/boot` → **28 suites, 317 tests, all pass.**

## Verdict

No P0 and no P1. The customer path (cold start → OTP → name → Send → order placed) has no blocker, no double-order and no dead end that I could construct from the code or the API. This is a clean lane. Six minor findings follow: two tooling defects in R0's harness that matter to later lanes, and four low-severity gaps.

## Findings

| id | sev | journey step | what the user sees | repro | evidence | proof | in KNOWN_BUGS? | fixed-on-main-not-shipped? |
|---|---|---|---|---|---|---|---|---|
| JQ-R4-01 | P2 (tooling) | Harness bring-up | Not a user issue. `ADMIN_JWT` is signed with an **empty subject**, so every admin route (credit, KYC decision, integrity check) will 401 in R2/R3; the "already seeded?" guard always re-runs `db:seed`. | `psql 'postgresql://lynia:lynia@localhost:5432/lynia?schema=public' -tAc 'select 1'` | `harness/up.sh:35,42` (and `:29`) use `psql "$DATABASE_URL"`; libpq here rejects Prisma's `?schema=` | Command output: `psql: error: invalid URI query parameter: "schema"` (seen twice in the `up.sh` log). Fix: strip the query (`${DATABASE_URL%%\?*}`) for psql calls. | no | n/a |
| JQ-R4-02 | P2 (tooling) | Harness bring-up | Same cause as 01, worse effect: line 29's guard `[ -z "$(psql … 'select 1 from profiles limit 1')" ]` is true when psql **errors**, so on a seeded DB without `SKIP_INT=1` the six int specs run and `deleteMany` the seeded profiles/orders (the hazard §3 warns about). | Re-run `up.sh` on a seeded DB without `SKIP_INT=1`. | `harness/up.sh:29` | Same `psql` error; I avoided it by setting `SKIP_INT=1`. Not run destructively here. | no | n/a |
| JQ-R4-03 | P3 | Send → place | Nothing visible in the app (the form blocks it). The API accepts a junk recipient/sender phone, so a non-app client or a future form bug would give the biker an uncallable number. | `POST /orders` with `dropoff.contactPhone:"abcdefg"` → **201** | `packages/shared/src/contracts.ts:55` (`z.string().min(6).max(20)`, no phone check) | Live run: `junk phone → [201]`. App side is guarded by `whatOk`/`phoneOk` (`send-steps.ts`). | no | no |
| JQ-R4-04 | P3 | Send → price/where | The app stops these; the server does not. A $0.01 fare, a 0 m trip and a Harare→Bulawayo (366 km) order at $3 (suggested $221) are all accepted. The only in-app guard for price is a **warning** (`SEND_COPY.low`), so a typed `0.10` for `1.00` places an order bikers will pass over. | `POST /orders` with `proposedFare:0.01`; identical pickup/dropoff; `proposedFare:3` on a 366 km trip → all **201** | `send-steps.ts:76-78` (`priceOk` is just `> 0`), `send.tsx:386`, `SendPriceStep.tsx:131`; no server floor in `contracts.ts:89` | Live run: `fare 0.01 → 201`, `0m trip → 201 (suggestedFare 1.5)`, `Harare->Bulawayo $3 → 201 (distanceKm 366.04, suggestedFare 221.12, ridersNearby 0)`. | no | no |
| JQ-R4-05 | P3 | Phone entry | Typing the country code digit by digit ("263 77…") fills the 9-digit field with `263772451` and shows "not a Zimbabwe mobile number", while **pasting** the same number works. | Type `2`,`6`,`3`,`7`,`7`,`2`,`4`,`5`,`1` into the phone field. | `src/logic/zw-mobile.ts:15-20`: the `263` strip needs `d.length > 9`, so it only fires on a paste | Static; jest covers the paste path only. | no | no |
| JQ-R4-06 | P3 | Send → place (retry) | If a send's answer is lost (5xx/timeout) and the order was created, then cancelled within 10 min, a "Place again" replays the frozen key and the server answers with the **cancelled** original, so the user lands on a cancelled order instead of a new one. By design inside `SEND_DRAFT_SENT_KEY_TTL_MS` (10 min); noted for R5, not a bug to fix. | `POST /orders` (key K) → `POST /orders/:id/cancel` → `POST /orders` (key K) | `send-draft.ts:33`, `send.tsx:515` | Live run: `replay after cancel → [201, same id, status "cancelled"]`. | no | no |

## What I tried and found sound (so later lanes don't repeat it)

| Area | Result | Proof |
|---|---|---|
| OTP wrong code ×5 | `401 otp_invalid` ×5, then `401 otp_locked` on the 6th; a **correct** code after lock returns `401 "Code expired or never requested"` (no `code` field) and the app falls back to words → "expired" → "Send a new code" | live; `otp.ts:otpFailure` |
| OTP resend after lock | new code issued, attempts reset, verify succeeds | live |
| OTP resend cap | 5 sends OK, 6th and 7th → `429` with `retryAfter: 3600` → app reads "Try again in 1 h" | live; `otp.ts:otpErrorMessage` |
| Non-`+263` / malformed number | `400 "Enter a valid phone number"` before any rate-limit spend | live; `auth.service.ts:423-426` |
| Per-device cap | 4th new account on one `x-device-id` → `429 "Too many requests — try again later"` | live |
| Lost verify response | same code verified twice → 201 both, same `profileId` (server grace) | live; `verify.tsx` retry comment |
| Name validation | empty → 400; 80 chars OK; app caps at 60 | live; `contracts.ts:366`, `kit.tsx:130` |
| `POST /orders` idempotency | same key ×2 → same order; **6 parallel** same key → one order id, one active order | live |
| No key ×2 | two orders (by design; the app always sends a key) | live |
| Rate limit | 429 after 20 creates/min | live; `429` body has no `retryAfter` but `isDefinitiveSendFailure` treats 4xx as "nothing created" (`send-steps.ts:117`) |
| Out-of-area pickup/drop | `400` with the "outside our service area" copy → `isOutOfServiceArea` returns the user to step 1 | live; `send.tsx` catch |
| Boot hang | Every boot read is bounded (`BOOT_READ_TIMEOUT_MS` 5 s, `prewarm.ts:50`); `auth.loading` is a local read, not a network call; `index.tsx` has a `gaveUp` path so the splash never leaves a blank route | static |
| Double order on a slow link | `submit` guards on `busy` + frozen `sentKey`, written to disk before the request (`send.tsx:515-541`); `usePlacingGuard` blocks back/gesture while in flight | static + jest |
| Draft lost on kill | 500 ms debounced write + flush on background/unmount, profile-tagged, 10-min key TTL (`send-draft.ts`) | static + jest |
| Places failing | `autocompletePlaces`/`placeDetails` never throw, degrade to `[]`/`null`, and the UI says "tap the map to drop the pin" (`AddressSearch.tsx:200-204`) | static |
| Map never draws (Sentry LYNIA-MOBILE-3) | The Send flow still completes: search + "Use my location" set both stops, and taps outside Zimbabwe are ignored until the map loads (`ComposeMap.tsx:setActive`). Cause is MOB-MAP-04 (Maps-key certificates), fixed in GCP on 2026-10-06; last Sentry event is 2026-10-06. | static; R7 |

## Speed (localhost, server floor only — R6 covers the network)

| Call | ms |
|---|---|
| `POST /auth/otp/request` (cold) | 95 |
| `POST /auth/otp/verify` | 22 |
| `PATCH /auth/me` | 11 |
| `GET /app/bootstrap` | 10 |
| `POST /orders` | 27 |
| `GET /orders/:id` | 10 |
| `GET /orders/mine/active-orders` | 9 |

Client timeout tiers for these are `FAST` 8 s / `STANDARD` 15 s (`network-policy.ts:29,59`).

## Not covered

- No UI was driven (no emulator): splash animation timing, keyboard behaviour, SecureStore draft size on a real device, and the PC1–PC11 permission screens are static-only.
- PC1–PC11 (customer permission asks) were not read in depth; the rider permission board belongs to R1.
- Retry on a real flaky link is R6's.

## For R8

Nothing in this lane needs a code fix. JQ-R4-01/02 are harness defects (the harness lives under `docs/reports/`, so they are not app code). JQ-R4-03/04/05 are ledger rows at most.
