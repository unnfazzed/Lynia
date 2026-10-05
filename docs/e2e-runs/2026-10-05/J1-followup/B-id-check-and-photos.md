# Lane B: the real ID-check (Didit) code path, KYC photo upload and camera server paths

**Run:** 2026-10-05, origin/main @ `2f260df`. **Mode:** report only. No repo files were edited and nothing was committed.

**Setup**
- **Real Didit adapter, fake server.** The API ran with `KYC_PROVIDER=didit` and `KYC_MODE=auto` on :3021, then `KYC_MODE=manual` on :3022. `DIDIT_BASE_URL` pointed at a local fake V3 server on :4021. The fake logged every request and answered with session and decision shapes taken from `didit-kyc-vendor.ts`: `session_id`, `session_token` and an https `url`.
- **Fake storage, real SDK.** The GCS adapter used the real `@google-cloud/storage` 8.1.0 SDK, redirected with `STORAGE_EMULATOR_HOST=http://localhost:4022` (a node fake JSON API). It used a throwaway service-account JSON whose `token_uri` was localhost, so V4 URLs were signed locally with the real SDK. Nothing reached Didit, GCP, Azure or production.
- **Accounts.** Riders used `+26377400000[1-9]`, the admin used `+263774000000` (promoted with SQL), and the photo tests used `+2637740090[01-04]`.
- **Throttle workaround.** The `otp-verify` throttle (10 per 5 minutes per IP) is shared with the other lanes on localhost. I gave each login a distinct `x-forwarded-for` (the API has trustProxy=1).
- **Clean-up.** All my processes on :3021, :3022, :4021 and :4022 were killed afterwards. The base API on :3000 was left untouched and still answers 200.

File paths below are under `apps/api/src/` unless they say otherwise.

## Results

| # | Step | Expected (code, file:line) | Actual | Result |
|---|---|---|---|---|
| 1.1 | Rider taps Start ID check (`POST /riders/become {}`) | `vendor.submit` sends POST `${DIDIT_BASE_URL}/v3/session/` with `x-api-key`, `{workflow_id, vendor_data: riderId, callback}` and a 10s timeout (`kyc/didit-kyc-vendor.ts:36-45`, `:15`) | The fake received exactly `POST /v3/session/`, `x-api-key: fake`, `{"workflow_id":"fake-wf","vendor_data":"<profileId>","callback":"http://localhost:3021/kyc/return"}` | PASS |
| 1.2 | What the app gets back | `{kycStatus:"pending", mode, verificationUrl, sessionToken}`. The rider row stores `kycRef`, token and url (`riders/rider.service.ts:333-383`) | 201 `{"kycStatus":"pending","mode":"auto","verificationUrl":"https://verify.didit.me/session/tok_1","sessionToken":"tok_1_secret"}`. The DB row had kyc_ref, token and url set | PASS |
| 1.3 | Second tap after success | Pre-check gives 409 `{reason:"already_rider"}` (`rider.service.ts:280`). The app routes on this (`apps/mobile/app/rider/become.tsx:118`) | 409 `{"reason":"already_rider",...}`. No second Didit call | PASS |
| 1.4 | Three taps at the same moment (no client guard) | The P2002 race also gives a 409 (`rider.service.ts:377-380`) | One 201 and two 409s, but **Didit received 3 paid session-creates (2 orphaned)**. The race-loser 409 has **no `reason`** (`"You're already a rider"`) | FAIL (Polish, see F2) |
| 1.5 | `POST /riders/kyc/retry` while pending with a live session | Free resume: same url and token, no vendor call (`rider.service.ts:519-526`) | Same url and token came back. No new Didit request | PASS |
| 1.6 | Didit 500, 400 and 403 on session-create | 503 "Couldn't start ID verification. Please try again." and no rider row (`rider.service.ts:333-345`, `didit-kyc-vendor.ts:52-55`) | 503 with that exact copy for all three, about 10ms each. 0 rider rows. The log has the status and the first 200 characters of the body | PASS |
| 1.7 | Didit hangs | Abort at 10s, then 503 (`didit-kyc-vendor.ts:15,44,46-50`) | 503 after 10.009s with the same copy. The mobile client aborts at 15s, so the server answers first | PASS |
| 1.8 | Retry with `force:true` three times | One forced mint per window. Later tries fall back to the free resume (`rider.service.ts:507-526`, claim at `:398-417`) | First try minted `tok_203`. Tries 2 and 3 resumed `tok_203`. 1 paid session in total | PASS |
| 1.9 | `GET /auth/me` while pending with Didit down | `pendingState` fails soft to `unfinished` (3s timeout, `didit-kyc-vendor.ts:86-108`, `kyc/kyc-pending-state.service.ts`) | `{"kycStatus":"pending","kycPendingState":"unfinished"}`, no error | PASS |
| 2.1 | Webhook with valid X-Signature-V2 and a fresh X-Timestamp | Accepted (`kyc/kyc.controller.ts:124-139`, `kyc/didit.ts:261-271`) | 201 | PASS |
| 2.2 | Legacy raw-body X-Signature only | Fallback accepted (`kyc.controller.ts:128-130`) | 201 | PASS |
| 2.3 | V2 body re-serialised (pretty-printed, keys reordered) | Canonical HMAC still verifies (`didit.ts:245-247`) | 201 | PASS |
| 2.4 | Bad signature, wrong secret, or no signature | 401 "Invalid webhook signature" (`kyc.controller.ts:131-133`) | 401 for all three | PASS |
| 2.5 | X-Timestamp 600s old, 600s in the future, or missing | 401 "Stale webhook timestamp", fail-closed (`didit.ts:291-297`) | 401 for all three. -290s was accepted. An epoch-millis timestamp was accepted | PASS |
| 2.6 | Signed but not JSON / missing `status` | 400 (`kyc.controller.ts:142-149`) | 400 (the body-parser message, not "Invalid JSON body") / 400 "Missing session_id or status" | PASS |
| 2.7 | Exact replay of an applied Approved webhook | Monotonic guard on the signed body timestamp gives `updated:0` (`rider.service.ts:914`) | `{"updated":0}` | PASS |
| 2.8 | Older Declined arriving after an Approved | Stale event gives `updated:0` | `{"updated":0}`. The rider stayed verified | PASS |
| 2.9 | Unknown session_id: Approved / In Review with a number | `updated:0` plus a warn log / `verifiedIdStored:false` (`kyc.controller.ts:178-184,200-203`) | Approved gave `{"updated":0}` and the log line "matched no rider or was stale". In Review gave `{"ignored":true,...,"verifiedIdStored":false}` | PASS |
| 2.10 | V3 Approved, `face_matches[].score=92` (≥ autoApprove 0.85), number `63-123456A78`, no ID on file | Score is the minimum of `face_matches[].score` divided by 100 (`didit.ts:92-101`). Result `verified` (`:145`). ID adopted onto the profile (D-75, `rider.service.ts` applyKycResult). Audit `rider.kyc_approve` | verified, id_verified=t, verified_id_hash and profile id_number_hash set, token and url cleared. Audit `system:kyc-webhook rider.kyc_approve`. `/auth/me idNumber=63123456A78` | PASS |
| 2.11 | Approved, score 72 (review band 0.60–0.85), number given | `pending`, held (`didit.ts:146,166-169`). `recordHeldVerifiedId` stores hash and encrypted number (`rider.service.ts:1074-1088`) | `{"ignored":true,"status":"pending","verifiedIdStored":true}`. Row pending, verified_id_hash and verified_id_number set, profile ID not set yet | PASS |
| 2.12 | Approved, score 40 (< needsReview) | `failed` with `face_mismatch`, kycAttempts+1 (`didit.ts:139-143`) | failed, attempts=1, reason `face_mismatch`. Audit `rider.kyc_decline face_mismatch` | PASS |
| 2.13 | Declined, score 95 | Always `failed`. A high score never loosens the verdict, and no reason is recorded (`didit.ts:144`) | failed, attempts=1, **decline reason null**. Audit has no reason | PASS (see F4) |
| 2.14 | In Review, score 90, number given | `pending`, review hold, number stored (`didit.ts:127-129,166-169`) | `verifiedIdStored:true`. Pending. Token kept, so `/auth/me kycPendingState=in_flight` once Didit's decision endpoint says "In Review" | PASS |
| 2.15 | Approved, no score, no number | Status alone decides, so `verified`. Audit `verified_id_missing` (`didit.ts:138`, `kyc.controller.ts:159-161`) | verified. Audit `rider.kyc_approve verified_id_missing`. Logs "bands skipped" and "verified_id_missing (D-75)" | PASS |
| 2.16 | Approved, score 95, number already verified for another rider | Held, not verified. Audit `rider.kyc_review_required verified_id_collision` (IR26-04) | Pending, verified_id_hash stored. Audit `rider.kyc_review_required verified_id_collision`. The admin review shows `duplicateIdAccounts=[R1]` and `verifiedIdInUse:true` | PASS |
| 2.17 | Kyc Expired | `expired`, online gate gives `kyc_expired` (`didit.ts:24-25`, `riders/online-gate.ts`) | expired. `PATCH /riders/online` gives 403 `{"reason":"kyc_expired","message":"Your ID has expired — re-verify to keep riding"}`. No audit row (see O1) | PASS |
| 2.18 | Approved with `score:0.9` (a unit-scale value) | Read as 0.9% similarity, so face_mismatch decline. This is deliberate (`didit.ts:80-83`) | failed, `face_mismatch` | PASS (see O4) |
| 2.19 | Abandoned webhook | Pending, not a judged result, so no number stored (`didit.ts:160-169`) | `{"ignored":true,"status":"pending"}` | PASS |
| 2.20 | Admin hand-approves the band-held rider (2.11) and the In Review rider (2.14) | Approval adopts the stored number onto the profile. Audit is attributed to `X-Operator` (`rider.service.ts:1200-1310`, `settleNationalIdOnApproval`) | Both 201 verified. Profile id_number_hash equals verified_id_hash (adopted). Audit `qa-laneB@local rider.kyc_approve` with note | PASS |
| 2.21 | Admin approves the collision-held rider (2.16) | 409 `verified_id_in_use` | 409 `{"reason":"verified_id_in_use","message":"Can't approve: the national ID from this rider's ID check is already on another live account. Resolve that account first."}` | PASS |
| 2.22 | Admin route called by a non-admin / decline with no reasonCode | 403 / 400 (`kyc.controller.ts:44-55,235-243`) | 403 "Admin only" / 400 "A decline must record a reason." | PASS |
| 2.23 | Second decline after a retry, then a third retry | Attempts reach 2, then 403 locked (`rider.service.ts:470-475`) | attempts=2. Retry gave 403 "ID verification is locked after two attempts. Please contact support." | PASS |
| 3.1 | Online gate at Harare (-17.8292, 31.0522) for each outcome | Only `verified` may go online (`online-gate.ts`, `rider.service.ts:582+`) | Verified (R1, R6): 200 `{"online":true}`. Pending, failed and held: 403 `reason:"kyc"`. Expired: 403 `kyc_expired` | PASS |
| 3.2 | `/auth/me` for a rider held for review after a Didit approval (collision or mismatch) | Held means "under review". The rider should see the review wall and should not be able to restart a paid check | `kycStatus:"pending", kycPendingState:null`. The app resolves this to "unfinished" (Finish verifying). One tap on retry **minted a new paid Didit session and rotated kycRef** | **FAIL (Fix soon, F1)** |
| 3.3 | Manual mode: become / retry | No Didit call, `{kycStatus:"pending", mode:"manual"}` (`rider.service.ts:333,478`) | Matches. 0 Didit calls | PASS |
| 3.4 | Manual mode: retry by a FAILED rider (attempts 1) | One resubmit is allowed (A-02) | Responds `{"kycStatus":"pending","mode":"manual"}`, but **the DB row stays `failed`**. Nothing is queued for review | **FAIL (Fix soon, F3)** |
| 4.1 | `POST /uploads/kyc-photo` with no auth | 401 (`uploads/uploads.controller.ts:36`) | 401 "Missing bearer token" | PASS |
| 4.2 | Content-type allowlist | Only `image/jpeg` and `image/png` (`uploads.controller.ts:16`) | gif, webp, heic, pdf, `image/jpeg; charset=x` and `IMAGE/JPEG` all 400. jpeg 201 | PASS |
| 4.3 | Signed URL: TTL, bound headers and key namespace | V4, 600s TTL, content-type and `x-goog-content-length-range: 0,8388608` signed. Key is `kyc/<callerId>/<uuid>.jpg` (`uploads.controller.ts:53,137`, `adapters/storage/gcs.storage.ts`) | `X-Goog-Expires=600`, `SignedHeaders=content-type;host;x-goog-content-length-range`, headers `{"Content-Type":"image/jpeg","X-Goog-Content-Length-Range":"0,8388608"}`, key under the caller's own id | PASS |
| 4.4 | Bucket-side enforcement of the signed PUT (wrong Content-Type, over-size, expired URL) | Real GCS rejects a PUT that breaks the signature | Not testable: the fake bucket does not verify V4 signatures | BLOCKED |
| 4.5 | `become` with another user's photo key | 400 "Invalid photo key" (`rider.service.ts:287-289`) | 400 | PASS |
| 4.6 | Key in own namespace but object missing (including a `../` path) | 422 `upload_missing` (`adapters/storage/upload-verifier.ts`) | 422 for both. The `../` key was looked up literally as an object name, so there was no traversal | PASS |
| 4.7 | Text bytes uploaded as image/jpeg | 422 `upload_bad_content`, object deleted, no Didit session | 422 "That file isn't a valid photo — please retake it." Object returned 404 afterwards. 0 Didit calls | PASS |
| 4.8 | 9 MB JPEG | 422 `upload_too_large` (cap is 8 MiB, `adapters/storage/upload-kinds.ts`) | 422 "That photo is too large (max 8192 KB)" | PASS |
| 4.9 | GIF PUT with `image/gif` on a jpeg-signed URL | 422 `upload_bad_type` | 422 "Photos must be JPEG or PNG" | PASS |
| 4.10 | Empty object / PNG bytes stored as image/jpeg | 422 `upload_empty` / `upload_bad_content` | Both as expected | PASS |
| 4.11 | Storage down during attach | 503 `uploads_unavailable` after the 5s guard (`upload-verifier.ts`) | 503 "Couldn't check your photo — please try again." after 5.01s. No rider row and no Didit call | PASS |
| 4.12 | Valid JPEG plus bikeReg | Rider created with photo_url = key | 201. photo_url = `kyc/<id>/<uuid>.jpg`, bike_reg `AB 1234`, `/auth/me hasPhoto:true` | PASS |
| 4.13 | Admin KYC review reads the photo | 15-minute signed read URL (`admin/admin-kyc-review.service.ts:9,56`) | `photoUrl` V4 read URL with `X-Goog-Expires=900` | PASS |
| 4.14 | Upload mint throttle | 20 per 60s per caller (`uploads.controller.ts:34`) | 15×201 then 6×429 (5 mints from earlier steps counted in the window) | PASS |
| 4.15 | "Someone else's rider id" | There is no rider-id parameter: the key comes from the JWT subject | Customer 9002 can mint `pickup/<self>/…`. The attach endpoint enforces the namespace. Not a hole | PASS |
| 4.16 | Didit decision endpoint (`/v3/session/{id}/decision/`) feeding `kycPendingState` | "In Review" and "Approved" mean `in_flight`; anything else means `unfinished` (`didit.ts:58-68`) | After the fake reported In Review / Approved: `in_flight` (15s TTL cache seen) | PASS |
| 5 | Camera | Read from code only (see below) | No device or camera in this environment | NOT RUN |

## Failures

**F1 · Fix soon: a rider held for review after Didit approved them is told to "Finish verifying", and each tap buys a new Didit session.**
- **Who it hits:** a rider whose Didit check came back Approved but was held for a human because the ID collided or mismatched.
- **What happens:**
  - The app shows "Finish verifying" although they did finish.
  - Tapping it starts a fresh paid Didit session, which replaces the rider's session id (`kyc_ref`) and clears the resolved time.
  - They are then asked to scan their ID again, up to 5 times an hour, every time billed.
  - The pending admin review stays visible, but it now sits against a rider who is mid-way through a new check.
- **Cause:**
  - The webhook's hold path clears the session token and url (`riders/rider.service.ts:920,930`).
  - `/auth/me` then reports `kycPendingState:null`, because it has no live session to check (`auth/auth.service.ts:175-179`).
  - The mobile gate falls back to `unfinished` (`apps/mobile/src/logic/gates.ts:312-314`).
  - `retryKyc` sees a pending rider with no credentials and mints a new session (`rider.service.ts:519-568`).
- **Suggested fix:** the server should report held-for-review riders as `in_flight` or "under review" (for example, pending with `kycResolvedAt` set), and `retryKyc` should refuse a held row.

**F2 · Polish: simultaneous Start ID check requests bill extra Didit sessions, and the race-loser 409 has no `reason`.**
- **What happens:**
  - Three simultaneous `POST /riders/become` calls created 3 paid Didit sessions (2 orphaned).
  - The losing requests got `409 "You're already a rider"` without `reason:"already_rider"`.
  - So the BH-04 lost-response handling in `become.tsx:118` shows an error instead of moving on to the rider board.
- **Mitigation:** the app guards against double taps with a ref (`become.tsx:92`), so in practice this only happens after a lost response followed by a retry.
- **Where:** `rider.service.ts:333-345` (submit happens before the row exists) and `:377-380` (the 409 without a reason).

**F3 · Fix soon (if manual mode is ever the launch config): in manual mode, a declined rider cannot resubmit.**
- **What happens:** `POST /riders/kyc/retry` answers `{kycStatus:"pending"}`, but the row stays `failed`. The app then shows the declined wall again, and nothing is queued for an admin.
- **Where:** the early return at `rider.service.ts:478` happens before any state change.

**F4 · Polish: a Didit "Declined" stores no decline reason.**
- **What happens:** a Didit decline that wasn't driven by the face score (for example a document or liveness failure) stores `kyc_decline_reason = null`, so the rider sees generic decline copy rather than what to fix.
- **Where:** `kyc/didit.ts:144`. Only a sub-threshold face score sets a reason.

## Observations

- **O1 · Some KYC transitions write no audit row.**
  - A `Kyc Expired` webhook changes the row (status `expired`, attempts reset, rider taken offline) but writes no audit row. Only verified, failed and held cases are audited (`rider.service.ts:997`).
  - The `recordHeldVerifiedId` hold (In Review, or an approval in the review band) also writes no audit row.
- **O2 · A later Didit webhook overrides an admin's hand-approval.** After the admin approved the In Review rider, a newer Didit `Declined` flipped them back to failed (face_mismatch, attempts 1) and took them offline. The guard only compares against `kycResolvedAt`, which the admin decision also sets (`rider.service.ts:914`). This may be intended (Didit's own reviewer has the final word), but it is silent apart from a system decline audit row. It needs a product decision.
- **O3 · X-Timestamp is not covered by the HMAC.** The signature covers the body only. A captured delivery could be resent with a fresh header, but the signed body `timestamp` plus the monotonic guard turns an exact replay into `updated:0` (verified in step 2.7). Didit re-sending an Approved with a *newer* body timestamp re-applies it, which writes a second `kyc_approve` audit row and sends a second "You're verified" push.
- **O4 · Score scale is load-bearing.** If Didit ever sends `face_matches[].score` on a 0–1 scale, every approval auto-declines as face_mismatch (step 2.18). This is by design (`didit.ts:80-83`) but has to be confirmed against one real V3 payload.
- **O5 · Manual mode gives the reviewer nothing to look at.** Both the photo (2026-10-02) and the typed ID (D-75) are optional, so a manual-mode pending rider has neither. The review page showed `photoUrl:null, idNumber:null`.
- **O6 · The ID-check return page sets `Permissions-Policy: camera=()`.** This is harmless: the page only redirects to `lynia://`, and the camera is used on Didit's own pages, not this one.
- **O7 · The gate-screen poll reaches Didit at most once per 15s per session.** The decision read is cached (`kyc-pending-state.service.ts:257`). Confirmed: one decision GET per TTL window during polling.

## Camera: from code only (no device here)

**Opening the ID check (`apps/mobile/src/kyc/verify.ts`)**
- **No usable link:** if the server returns no `verificationUrl`, or one that isn't https, the outcome is `failed` and the rider sees the "can't start" wall (`:94-96`).
- **Camera permission check:** before the in-app sheet opens, the app checks camera permission (`:71-83`).
  - Already granted: the sheet opens.
  - Denied but Android can still ask: the app requests it.
  - Permanently denied (`canAskAgain=false`), or denied again: the sheet is skipped and the check opens in an in-app browser tab instead (`openAuthSessionAsync`). That tab can ask for the camera per site.
  - The permission probe itself throws: the sheet opens anyway.
- **Browser tab result:** the tab returns `completed` only on a redirect back to the app (`success`); any other close is `cancelled` (`:116-119`). If the tab can't open at all, the outcome is `failed`.

**The in-app sheet (`apps/mobile/src/kyc/KycCheckHost.tsx`)**
- The embedded WebView grants Didit's camera requests automatically (`mediaCapturePermissionGrantType="grant"`, `:300`).
- **Page fails to load:** a network error, or an HTTP error on the main page, shows "We couldn't open the ID check — This is usually the camera or the connection" with Try again and Close (`:280-317`). Close counts as `failed`.
- **Rider leaves:** ✕ or back asks "Leave the ID check?", and leaving counts as `cancelled` (`:200-213`).
- **Completion:** the sheet treats a navigation to `lynia://`, to `/kyc/return`, or to the API host as finished. Any other non-Didit host opens outside the app (`apps/mobile/src/kyc/navigation.ts`).

**Upload failure on the KYC photo**
- The rider sign-up no longer sends a KYC photo (`apps/mobile/src/api/riders.ts:26-29`). `apps/mobile/src/api/uploads.ts` does not call `/uploads/kyc-photo` at all, so the server-side KYC photo path is now reachable only from older builds.

**Pickup photo (`apps/mobile/src/query/use-pickup-photo.ts:106-145`)**
- **Camera denied:** sets a `denied` flag and returns.
- **Upload:** the photo is saved as a draft and queued, and the upload retries when the app comes back to the foreground.
- **Wrong type label:** the app labels anything that isn't PNG as `image/jpeg`. If the downscale step fails on a HEIC original, the server rejects it as `upload_bad_content` and the rider is asked to retake it.

## Evidence

<details><summary>Didit session-create request seen by the fake</summary>

```
{"method":"POST","url":"/v3/session/","headers":{"x-api-key":"fake","content-type":"application/json"},
 "body":"{\"workflow_id\":\"fake-wf\",\"vendor_data\":\"6db87353-de97-4acf-9b86-511edc327330\",\"callback\":\"http://localhost:3021/kyc/return\"}"}
{"method":"GET","url":"/v3/session/11111111-2222-3333-4444-000000000001/decision/","headers":{"x-api-key":"fake"}}
```
</details>

<details><summary>Didit failure modes on become</summary>

```
== didit 500  -> 503 {"message":"Couldn't start ID verification. Please try again."} 0.014s
== didit 400  -> 503 (same) 0.010s
== didit 403  -> 503 (same) 0.011s
== didit hang -> 503 (same) 10.009s
ERROR [RiderService] KYC submit failed for b543…: Didit session create failed: 403 {"detail":"Insufficient credits"}
ERROR [RiderService] KYC submit failed for b543…: Couldn't reach the ID-check provider
riders rows for that profile: 0
```
</details>

<details><summary>Webhook signature and timestamp matrix</summary>

```
[v2 0] 201 {"ignored":true,"status":"pending"}      [v1 0] 201
[bad] 401 Invalid webhook signature   [wrongsecret] 401   [none] 401
[v2 -600] 401 Stale webhook timestamp [v2 none] 401      [v2 +600] 401
[v2 -290] 201   [millis ts] 201   [reformatted body v2] 201
[signed non-json v1] 400   [missing status] 400 Missing session_id or status
```
</details>

<details><summary>Outcome matrix: DB state after the webhooks</summary>

```
 r | kyc_status | id_verified | a | kyc_decline_reason | vhash | vnum | prof_id | tok
 1 | verified   | t | 0 |               | t | t | t | f   Approved 92 + number (adopted)
 2 | pending    | f | 0 |               | t | t | f | t   Approved 72 (review band, held)
 3 | failed     | f | 1 | face_mismatch | f | f | f | f   Approved 40
 4 | failed     | f | 1 |               | f | f | f | f   Declined 95
 5 | pending    | f | 0 |               | t | t | f | t   In Review 90 (held)
 6 | verified   | t | 0 |               | f | f | f | f   Approved, no score, no number
 7 | pending    | f | 0 |               | t | t | f | f   Approved 95, number = R1's (collision hold)
 8 | expired    | f | 0 |               | f | f | f | f   Kyc Expired
 9 | failed     | f | 1 | face_mismatch | f | f | f | f   Approved score 0.9
audit_logs:
 1 system:kyc-webhook rider.kyc_approve
 3 system:kyc-webhook rider.kyc_decline         face_mismatch
 4 system:kyc-webhook rider.kyc_decline
 6 system:kyc-webhook rider.kyc_approve         verified_id_missing
 7 system:kyc-webhook rider.kyc_review_required verified_id_collision
 9 system:kyc-webhook rider.kyc_decline         face_mismatch
 2,5 qa-laneB@local  rider.kyc_approve (note "laneB hand approve")   after admin approve
```
</details>

<details><summary>F1 reproduction (R7, collision-held)</summary>

```
GET /auth/me  -> {"kycStatus":"pending","kycPendingState":null,"tok":false}   (app resolves "unfinished")
POST /riders/kyc/retry -> 201 {"kycStatus":"pending","verificationUrl":"https://verify.didit.me/session/tok_12",...}
new paid sessions: 1
riders: kyc_status=pending, kyc_ref=…000000000012 (was …009), kyc_resolved_at=NULL, verified_id_hash still set
```
</details>

<details><summary>Admin hand-approve (D-75 adoption)</summary>

```
approve R2 -> 201 {"kycStatus":"verified","kycAttempts":0,"locked":false}
approve R5 -> 201 {"kycStatus":"verified",...}
approve R7 -> 409 {"reason":"verified_id_in_use","message":"Can't approve: the national ID from this rider's ID check is already on another live account. Resolve that account first."}
 r | kyc_status | prof_id | adopted_matches
 2 | verified   | t       | t
 5 | verified   | t       | t
 7 | pending    | f       |
```
</details>

<details><summary>Upload mint and attach</summary>

```
uploadUrl: http://localhost:4022/lynia-media/kyc/<uid>/<uuid>.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&…&X-Goog-Expires=600
           &X-Goog-SignedHeaders=content-type%3Bhost%3Bx-goog-content-length-range&X-Goog-Signature=<redacted>
headers: {"Content-Type":"image/jpeg","X-Goog-Content-Length-Range":"0,8388608"}
other-user key      -> 400 Invalid photo key
text-as-jpeg        -> 422 upload_bad_content (object then 404 = deleted)
9MB                 -> 422 upload_too_large "max 8192 KB"
gif as image/gif    -> 422 upload_bad_type
empty               -> 422 upload_empty
storage down        -> 503 uploads_unavailable (5.010s)
valid jpeg          -> 201; riders.photo_url=kyc/1967…/a5dc….jpg, bike_reg=AB 1234
admin review photoUrl -> V4 read URL X-Goog-Expires=900
mint throttle: 201×15 then 429×6
```
</details>

<details><summary>Manual mode (:3022)</summary>

```
become -> 201 {"kycStatus":"pending","mode":"manual"}; retry -> same; me kycPendingState=null
R4 (failed, attempts 1) retry -> 201 {"kycStatus":"pending","mode":"manual"}; me -> {"kycStatus":"failed","kycAttempts":1}
didit calls during manual: 0
```
</details>

## What still needs a real person

1. **One real Didit V3 check with a real Zimbabwe national ID and face, on a real Android phone**, in the in-app sheet. It confirms:
   - the real webhook shape: `face_matches[].score` is on a 0–100 scale (O4), and the national ID number comes through in `id_verifications[].personal_number` or `document_number` in the Zimbabwe ID format;
   - that `X-Signature-V2` and `X-Timestamp` match our check;
   - that Didit's decision endpoint reports statuses with the same spelling;
   - that leaving Didit's pages at the end (`callback` → `/kyc/return`) closes the sheet as completed.
2. **Real camera behaviour:**
   - permission denied, then the browser-tab fallback asking for the camera itself;
   - permanently denied (`canAskAgain=false`);
   - the camera inside the WebView on low-end Android;
   - the pickup-photo capture and its upload retry on a bad network.
3. **Real GCS or Azure bucket enforcement of the signed PUT** (wrong Content-Type, over the size range, an expired URL). This was blocked here because the fake bucket does not verify signatures.
4. **A product decision on O2** (whether a vendor webhook may override an admin hand-approval) **and on F1's intended rider wall** for a held-for-review rider.
