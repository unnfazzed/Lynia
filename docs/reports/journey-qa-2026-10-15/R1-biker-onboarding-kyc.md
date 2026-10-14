# R1 — Biker onboarding + KYC

Lane: R1 · Model: Sonnet · Harness: **live** (R0 harness: native PG16 + PostGIS, redis, API :3000; `KYC_PROVIDER=stub`, run in `KYC_MODE=auto` and `KYC_MODE=manual`) · main SHA: `28e4437` · run 2026-10-14 ~13:30 UTC
Skeptic helper: **not started**. There is no P0/P1 to confirm.

**Result: a clean lane. 0 P0, 0 P1, 1 P2 (`fixed-on-main-not-shipped`), 3 P3.** The server-side KYC state machine and the mobile resume/outcome logic held up on every path I drove. Known-red list from R0: none, and nothing here touches it.

## Findings

| id | sev | journey step | what the user sees | repro | evidence file:line | proof | in KNOWN_BUGS? | fixed-on-main-not-shipped? |
|---|---|---|---|---|---|---|---|---|
| JQ-R1-01 | P2 | Bike & documents → add photo (also pickup/delivery proof photos) on a slow link | "Photo upload failed (409)" on a retry after a first PUT that actually landed. Blob is stored, but the app reports failure and the biker re-takes the shot. | Azure `c`-only SAS: PUT a blob, then PUT the same URL again (a transport retry) → 409 BlobAlreadyExists. A build older than #1185 throws on any non-2xx. | Server: `apps/api/src/adapters/storage/azure-blob.storage.ts:88-97` (create-only SAS, comment names the 409). Old client: `git show f25bdf0^:apps/mobile/src/api/uploads.ts` line 76 `if (!res.ok) throw …`. New client: `apps/mobile/src/api/uploads.ts:78` `if (!res.ok && res.status !== 409)`. Callers: `rider-documents.ts:115`, `use-pickup-photo.ts:57`, `delivery-proof.ts:21,38`. | Static: code diff above (no storage credentials locally, so the 409 itself was not reproduced). Prod storage is Azure per `docs/AZURE-OWNER-RUNBOOK.md:313`. | no (E13 comment only) | **yes**: the API half and the client half both landed in #1185 (2026-10-13). Testers on older binaries hit it once the new API is live. Ship an OTA or build; no code fix. |
| JQ-R1-02 | P3 | Sign-in on a shared phone | A 4th new account from one device in 24 h gets 429 `device_signup_cap` (`retryAfter` 86400). The app has no mapping for the `device_signup_cap` reason, so it shows `otpErrorMessage`'s "Too many tries. Try again in 24 h." That is accurate but names no cause. Only matters for a shared handset (several bikers signing up on one phone). | `/auth/otp/verify` ×4 with the same `x-device-id` | `apps/mobile/src/logic/otp.ts:85-90` (429 text); no `device_signup_cap` reference in `app/` or `src/` (grep) | live: 3×201, then 429 `reason:"device_signup_cap"` | no | no |
| JQ-R1-03 | P3 | `/riders/kyc/retry` while pending, manual mode | Returns 201 `pending` with no change. Harmless (no extra paid session; manual mode has none). | `POST /riders/kyc/retry` after `become` with `KYC_MODE=manual` | `apps/api/src/riders/rider.service.ts:810-828` | live | no | no |
| JQ-R1-04 | P3 | Plan note, not a code bug | In `KYC_MODE=auto` + stub, `/riders/become` verifies instantly **even with no national ID or a duplicate ID**, so the one-ID-one-account rule cannot be exercised through become on the stub. It is enforced on `PATCH /riders/profile` and at approval. Real Didit adopts the vendor-read ID. | live: dup `idNumber` → 409 `id_in_use` on profile PATCH; `become` → 201 verified | `rider.service.ts:458-464`, `:315-321`, `:440-447` | live | n/a | no |

## What I drove live (all passed)

| Scenario | Result |
|---|---|
| auto mode: sign in → name → `PATCH /riders/profile` (ID) → `become` → online | `verified`, online 200 |
| `become` twice | 2nd → 409 `already_rider` (the app treats this as "first submit won", `become.tsx` catch) |
| `become` with no name | 400 `name_required` |
| duplicate national ID (same string, and re-spaced `631234 56A42`) from a 2nd account | 409 `id_in_use`, normalisation holds |
| manual mode: `become` → pending; go online / heartbeat / board while pending | 403 `kyc` "not verified yet" / "Bikers only" (no leak) |
| admin `failed` (`document_unreadable`) → `online` → `retry` → `retry {force}` → admin `verified` → `online` | failed blocks online; retry back to pending; verified then goes online with **no stale block** |
| webhook race: `/kyc/callback` Declined → Approved → Declined; In Progress; unknown session; empty body | applied per event order; In Progress ignored; unknown session `updated:0`; empty body 400. Events carry no timestamp here, so event time falls back to arrival (`kyc.controller.ts:203`); the real monotonic guards need signed timestamps (covered by `kyc.controller.spec.ts`). |
| auth (#1185): `+27…` number, short number, `07…` local number | 400 / 400 / accepted (normalised) |
| OTP: 5 wrong codes then lock; right code after lock | `otp_invalid`×5 → `otp_locked` → right code `otp_expired` (app swaps to "Send a new code", `otp.ts:61-65`) |

## Code read (no defect found)

- **Resume after an app kill:** `become.tsx:80-102` restores the name draft (debounced 500 ms, flushed on background/unmount); the role is saved before the check opens (`:223`); a completed launch is stored per profile and held ≤10 min (`launch-hint.ts`, `gates.ts:373-397`). `recordKycLaunch(…, me?.profileId ?? undefined)` falls back to `currentProfileId()` through the default parameter, so a not-yet-loaded `me` does not lose the mark.
- **Pending never resolves:** the server side has the webhook, the lost-webhook reconciler (`kyc-reconcile.service.ts`) and `retryKyc`'s free-resume/forced-mint split (`rider.service.ts:766-876`). The client polls 5 s for 3 min, then 30 s (`gates.ts:401-427`). The 10-minute ceiling returns a stuck "completed" to the resume page.
- **Denied camera:** `verify.ts:111-148` falls to the in-app browser tab (per-site camera ask); a bad or missing URL → `cant_start` F7 with support.
- **Role fork:** the board replaces a non-rider with `/rider/become`; Android Back with no history leaves for customer Home and saves `customer` (`become.tsx:155-171`). The iOS/web gate is `rider-route-gate.tsx` and is inert on Android.
- **Double submit:** a synchronous `submitInFlightRef` guard (`become.tsx:213-216`) plus the server's claim-before-spend (KYC-R26-10).

## Tests run

`pnpm --filter @lynia/mobile exec jest src/kyc src/logic/__tests__/become-state src/logic/__tests__/kyc src/logic/__tests__/rider-gate src/logic/__tests__/gates app/rider` → **27 suites / 437 tests pass** (~105 s; one existing `act()` warning from `app/rider/(tabs)/index.tsx:185`, non-failing).

## Speed (localhost, server-side floor; R6 covers real networks)

| call | ms |
|---|---|
| OTP request (cold) / verify | 88 / 39 |
| `PATCH /riders/profile` | 23 |
| `POST /riders/become` (auto) | 34 (13–18 warm) |
| `PATCH /riders/online` | 14 |
| `POST /riders/kyc/retry`, admin KYC decision, `/kyc/callback` | all under 30 |

## Not covered (static-only, per the plan)

- Photo upload and the Azure 409 (no storage credentials locally); the Didit hosted flow, the in-app WebView sheet and the permission screens P1–P16 (need a device); a real signed-webhook race.

## Notes for later lanes

- JQ-R1-01 also affects the pickup and delivery-proof photos (R2).
- Harness caveat: `up.sh` runs `psql "$DATABASE_URL"` and the `?schema=public` suffix makes psql fail ("invalid URI query parameter: schema"). So its admin-seed check and `ADMIN_ID` come back empty and the minted `ADMIN_JWT` has no subject. Strip the suffix for psql (`PGURL=${DATABASE_URL%%\?*}`) and re-mint the JWT, as I did. R0 may have hit it too.
- An `pkill -f "node dist/main.js"` run inside a bash tool call can kill the tool's own shell. Start the API with `setsid nohup …` and kill it by PID.
