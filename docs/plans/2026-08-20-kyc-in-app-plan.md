# In-app KYC — current process, gaps, and the UI work to get there

**Owner instruction (2026-08-20):** *"The current KYC process you will end up on didit's website. I don't
want riders to go on the didit interface. Everything must be done inside the app and didit will do the
analysis."*

This document maps what ships today, names every gap between that and the instruction, and specifies the
UI/backend work. It is a plan — nothing here is implemented yet.

> **Owner decision (2026-08-20): Route A — Didit's native SDK, embedded.** The fork in §3 is closed.
> Route B is kept below as the recorded alternative and as the shape of any later move to our own
> capture UI; it is not the path being built. §5 phase 0 is done.

---

## 1. The process today

### 1.1 Happy path, end to end

| # | Where | What happens | Code |
|---|---|---|---|
| 1 | App | Rider taps **Become a rider** on the board gate | `apps/mobile/app/rider/(tabs)/index.tsx:1047` |
| 2 | App | KYC form: first/last name, national ID, bike reg | `apps/mobile/app/rider/become.tsx` |
| 3 | App | **ID photo capture** — OS camera picker (`expo-image-picker`), then a review beat ("Can you read everything?") | `become.tsx` `pickFrom()`, `src/ui/rider/PhotoReviewCard.tsx` |
| 4 | App→our storage | Photo downscaled and PUT to **our GCS** via a presigned URL; key `kyc/<profileId>/<uuid>` | `POST /uploads/kyc-photo`, `src/api/uploads.ts` |
| 5 | App→API | `PATCH /riders/profile` then `POST /riders/become { bikeReg, photoUrl }` | `src/api/riders.ts` |
| 6 | API | Dedupe guards (one-ID-one-account, IR26-01), then in `KYC_MODE=auto` calls Didit | `apps/api/src/riders/rider.service.ts:171` |
| 7 | API→Didit | `POST {DIDIT_BASE_URL}/v3/session/` with `workflow_id`, `vendor_data=<profileId>`, `callback` | `apps/api/src/kyc/didit-kyc-vendor.ts` |
| 8 | Didit→API | Response read for `session_id`/`id` and `url`/`verification_url`. **`session_token` is ignored.** | `didit-kyc-vendor.ts:50-58` |
| 9 | API | Rider row created `kycStatus=pending`, `kycRef=session_id`; returns `{ kycStatus, mode, verificationUrl }` | `rider.service.ts:246-266` |
| 10 | App | **`WebBrowser.openAuthSessionAsync(verificationUrl)` → Didit's hosted web flow** in a Chrome Custom Tab / `SFSafariViewController` | `become.tsx:231` |
| 11 | Didit's site | Rider **re-photographs the same ID** and does a selfie liveness check, on Didit's page, in Didit's design | — |
| 12 | App | Tab dismissed → "Verification started. Finish it in the browser, then come back and go online." | `become.tsx:234-242` |
| 13 | Didit→API | `POST /kyc/callback`, HMAC `X-Signature-V2` over the canonical body + 300 s timestamp freshness | `apps/api/src/kyc/kyc.controller.ts:59` |
| 14 | API | `decideDiditKyc(status, extractDiditScore(payload))` → `KYC_THRESHOLDS` bands; `extractDiditDocumentNumber` → IR26-04 `verifiedIdHash` | `apps/api/src/kyc/didit.ts` |
| 15 | API | `applyKycResult` — monotonic on `eventAt` vs `kycResolvedAt`, keyed by `kycRef` | `rider.service.ts` |
| 16 | App | Board polls `["me"]` every 5 s while pending (60 s in manual mode) → verified gate clears, auto-online fires | `index.tsx:348-353` |

### 1.2 The three places the rider leaves the app

| Exit | Trigger | Result |
|---|---|---|
| **E1** | Submitting the become form (`become.tsx:232`) | Custom Tab → Didit's hosted flow |
| **E2** | "Continue verification" on the **pending** gate (`index.tsx:1118` → `retryKyc`) | Mints a **brand-new** Didit session, opens the Custom Tab again |
| **E3** | "Try again" on the **failed** gate, "Re-verify my ID" on **expired** (`index.tsx:1066`, `:1097`) | Same as E2 |

All three funnel through `resolveKycRetryFeedback` → `WebBrowser.openAuthSessionAsync`
(`src/logic/gates.ts:206`, `index.tsx:464-469`).

### 1.3 What the rider actually experiences

They photograph their national ID **inside Lynia**, review it, watch it upload — and then get dropped onto a
web page that asks them to photograph the same ID again. The in-app photo never reaches Didit: it goes to our
GCS bucket and exists solely so the admin reviewer can see it (`admin-kyc-review.service.ts:54` mints a signed
read URL for the console). `DiditKycVendor.submit()` sends `workflow_id`, `vendor_data` and `callback` — no
images. On this market's links, that is two full ID uploads for one verification.

### 1.4 Modes that do *not* leave the app

`KYC_MODE=manual` never mints a session and never opens a browser — the rider sits on "Your ID is under
review" and ops resolves it via `POST /admin/riders/:id/kyc` (BH-03). `KYC_PROVIDER=stub` in auto mode
instant-passes for CI/QA. Neither is a production launch config for the vendor path, but **any redesign must
keep both intact.**

---

## 2. Gaps

### Product / UX

- **G1 — Three hand-offs to a third-party website.** E1, E2, E3 above. The instruction closes all three.
- **G2 — The rider is on Didit's interface, not Lynia's.** Didit's chrome, typography, language and consent
  copy, none of it from `packages/design/tokens`. Nothing in the pixel-parity guardrail suite covers it.
- **G3 — Double ID capture.** §1.3. Two uploads, two chances to fumble, on the slowest link in the flow.
- **G4 — The app is blind while the rider is out.** No progress, no step count, no failure detail. The only
  signal is the Custom Tab being dismissed, which is identical whether the rider finished or gave up.
- **G5 — Every "Continue verification" tap burns a paid session.** `retryKyc` unconditionally calls
  `vendor.submit()` (`rider.service.ts:294`) and rotates `kycRef`. There is no resume: `verificationUrl` is
  never persisted and is absent from `getMe` (already noted in `docs/DESIGN-REVIEW.md:184`). The
  `@Throttle({ limit: 5, windowSec: 3600 })` on `kyc/retry` caps the bleed at 5 sessions/hour/rider, it does
  not stop it.
- **G6 — Copy debt.** Four places promise a browser step that must stop existing: `become.tsx`'s consent card
  ("You'll finish in your browser"), the pending gate ("Continue in the browser, then come back"),
  `resolveKycRetryFeedback`'s strings, and `documents.tsx`'s footer.

### Backend

- **G7 — `session_token` is discarded.** `POST /v3/session/` returns `session_id`, `session_token` and `url`;
  `didit-kyc-vendor.ts:50-58` reads only the first and third. The native-SDK route needs the token.
- **G8 — The decision path assumes a webhook.** `extractDiditScore` and `extractDiditDocumentNumber` probe
  webhook-shaped payloads (`decision.face_match.score`, `decision.id_verification.document_number`), and both
  **fail open to `null`**. A synchronous standalone-API response has a different shape — feeding it in
  unchanged would silently degrade the `KYC_THRESHOLDS` bands to status-string mapping and the IR26-04
  `verifiedIdHash` dedupe to typed-ID-only, with no error anywhere.

### Mobile platform

- **G9 — New Architecture is off.** `@didit-protocol/sdk-react-native` requires RN ≥ 0.76 **with the New
  Architecture (TurboModules); the old architecture is not supported.** This app is RN 0.76.9 with
  `newArchEnabled` unset in `app.config.ts` — Expo SDK 52 defaults it off. Turning it on is a real native
  migration across `react-native-maps`, `react-native-screens`, `expo-notifications`, `@sentry/react-native`
  and the three local config plugins, not a flag flip. (Verify the requirement against the installed package
  before committing to it — the README is the source, and it may have softened.)
- **G10 — There is no in-app camera.** `expo-camera` is not a dependency, and the live capture frame
  (`RJ photo_capture` E·1) was deliberately not built — see the "WHAT ISN'T HERE, AND WHY" note in
  `PhotoReviewCard.tsx`. Today's capture is the OS picker. Owning capture requires building it.
- **G11 — No OTA path.** A native SDK, `expo-camera`, or New Architecture all move the fingerprint
  `runtimeVersion`. This ships as a store build, never as an OTA (REL-01/REL-02).

### Design authority

- **G12 — The mocks themselves draw the browser hand-off.** `RJ.kyc_pending` is literally *"Your ID check is
  with Didit … **Continue in browser**"* (`rider-screens.jsx:211`), `kyc_form`'s consent card names Didit as
  the partner, and `rider-map.jsx:28` describes "selfie liveness in-browser". Under the CLAUDE.md authority
  chain the gallery wins — so **going in-app is a design change, not an alignment fix.** It needs an owner
  decision (this one), updated mocks, and a `docs/DESIGN-DEVIATIONS.md` entry, or the `design-freeze` CI job
  fails the PR (`scripts/check-design-freeze.mjs`).
- **G13 — The KYC screens are unwired for parity.** Only `RJ.kyc_intro` has an app target
  (`tools/parity/app-targets.mjs:95`). `kyc_form`, `kyc_pending`, `kyc_verified`, `kyc_failed`, `kyc_expired`
  and `gate_kyc_locked` are all `PENDING` in `parity-status.mjs`. New screens must land in the gallery, be
  regenerated into `screens.generated.json`, and be wired or allowlisted, or the screen-inventory guardrail
  flags them.

### Compliance / ops

- **G14 — Liveness posture is a product decision, not a detail.** The hosted flow's liveness is what makes
  the selfie meaningful. Whatever replaces it has to be at least as hard to spoof, or the rider gate gets
  weaker while the UI gets prettier.
- **G15 — PII surface moves.** Today ID images taken for Didit never touch our infrastructure. Under §4
  Route B they would, which changes what our bucket holds, what the privacy copy must say, and what
  `apps/api/src/privacy` has to erase.

---

## 3. What "everything in the app" can mean

Two genuinely different integrations, both supported by Didit:

### Route A — Didit's **native SDK**, embedded

`@didit-protocol/sdk-react-native`. Backend creates the session as it does now, passes `session_token` to the
device, the app calls `startVerification(token)`. Didit's verification UI runs **natively inside our app** —
no browser, no website. Result comes back as `completed | cancelled | failed`; the webhook stays the source
of truth.

- ✅ Kills all three exits. No web view, no Didit URL.
- ✅ Backend change is small: read `session_token`, return it, keep everything else.
- ✅ Liveness, document autodetection, NFC and capture quality stay Didit's problem — the whole verified
  decision path (score bands, `verifiedIdHash`, monotonic apply, admin backstop) works untouched.
- ✅ One session = one credit, as today.
- ❌ **Requires New Architecture** (G9) — the largest single cost in this plan.
- ❌ The UI is still Didit's, themeable only via `languageCode` / `fontFamily` / camera options. It will not
  be pixel-identical to the mocks, and it cannot be brought under the parity guardrails.
- ❌ Strictly read, it is still "the Didit interface" — just no longer a website.

### Route B — Didit's **standalone APIs**, our UI

We build the capture in our own design system and post the images server-side:
`POST /v3/id-verification/` (multipart `front_image`, optional `back_image`, ≤10 MB, returns OCR + authenticity
+ `document_number` synchronously), `POST /v3/passive-liveness/` for the selfie, `POST /v3/face-match/` for the
1:1 score. Didit does only the analysis.

- ✅ Exactly the instruction: 100% Lynia-drawn, tokens, mock copy, pixel parity achievable, guardrails apply.
- ✅ No New Architecture requirement — works on the current old-arch build.
- ✅ Finally builds `photo_capture` (E·1), which the kit has drawn since July and the app has never had.
- ❌ **We own capture quality, so we own the false-reject rate.** Glare, blur, framing, four-corners — the
  decline reasons in `KYC_DECLINE_REASON_LABELS` become our UI's fault, on entry-level phones.
- ❌ **Passive liveness only.** No active/challenge liveness — a materially weaker anti-spoof posture than the
  hosted flow, on the exact gate that decides who may carry strangers' parcels (G14). No NFC chip read.
- ❌ Three API calls per attempt instead of one session; each 200 consumes a credit.
- ❌ New decision plumbing: `decideDiditKyc` and both extractors need a second, synchronous input path (G8),
  and `applyKycResult` needs a non-webhook caller.
- ❌ ID images now transit our backend and bucket (G15).

### Decision — Route A (owner, 2026-08-20)

**Route A**, and revisit B once there is a measured false-reject baseline on real Zimbabwean IDs.

It removes the actual complaint — the rider never leaves the app, never sees a website — while keeping
liveness, NFC, capture quality and the entire verified-decision path exactly as built and tested. Route B is
the only path to a fully Lynia-drawn KYC screen, but it buys those pixels by trading away active liveness and
moving false-reject risk onto our own camera code, at the launch gate for rider trust. That is the wrong trade
to make first.

The alternative reading — "no Didit-drawn pixels at all", which would mean Route B — was put to the owner
and **not** chosen. Ending the website hand-off comes first; the SDK's own native UI is accepted.

A viable middle, still open for later: build B's in-app ID capture behind the shipped SDK and switch the
document step over once its reject rate is known, keeping the SDK for the selfie/liveness beat.

**What Route A commits us to, stated plainly:** the New Architecture migration (G9) is now on the critical
path, and the KYC verification screens will **not** be pixel-parity-able — they are Didit's, themeable by
font and language only. That exemption needs a `docs/DESIGN-DEVIATIONS.md` entry of its own alongside the
G12 mock changes.

---

## 4. The UI work

### 4.1 Common to both routes

| Screen | Change |
|---|---|
| `RJ.kyc_form` — `become.tsx` | Consent card drops "You'll finish in your browser." Replace with the in-app promise; keep the Didit partner naming (it is a real disclosure, and the mock draws it) and the privacy-policy link the mock has and the app is missing. |
| `RJ.kyc_pending` | The **"Continue in browser"** CTA is deleted. Under both routes the check resolves in-session, so this becomes an honest wait state ("Checking your ID — this usually takes under a minute") with at most a **Check status** refresh. The manual-mode variant (`index.tsx:1100`) is already correct — do not touch it. |
| `RJ.kyc_failed` | "Try again" must re-enter the **capture step**, not mint a session and open something. Where the decline reason is glare/blur, land directly on the ID stage rather than the top of the form. |
| `RJ.kyc_expired` | Same: "Re-verify my ID" re-enters capture. |
| `RJ.bike_docs` — `documents.tsx` | Footer copy: drop any browser implication. |
| Board gate — `index.tsx:1110-1122` | Delete the `WebBrowser` call sites (`index.tsx:468`, `become.tsx:232`) and the `openUrl` branch of `resolveKycRetryFeedback`. The function stays — it still distinguishes manual-mode info from real failure (BH-03). |
| `RJ.gate_kyc_locked` | Unchanged. Two failed attempts still hands off to support. |

### 4.2 Route A only

- Replace step 10 with `startVerification(sessionToken)`. Map the three outcomes:
  `completed` → invalidate `["me"]`, show the analysing state; `cancelled` → return to the pending gate with a
  **Resume** CTA (not an error — cancelling is a choice); `failed` → the existing action-error toast.
- The in-app ID photo step (`become.tsx` steps 3-4) becomes **redundant** — the SDK captures the document
  itself. Either remove it (fixes G3, but the admin console loses its reviewer photo) or explicitly re-scope
  it as the *rider portrait* the console shows, which is what `documents.tsx` already calls it. **Decide this
  explicitly**; leaving both in place is how the double capture survives the rewrite.
- Theme the SDK as far as it goes: `fontFamily` = Inter, `languageCode`, `showCloseButton`,
  `showExitConfirmation`.

### 4.3 Route B only — three screens that do not exist yet

1. **ID capture** (`RJ photo_capture` E·1, already drawn, never built): full-bleed `expo-camera`, dashed
   ID-card frame guide, the three readability rules, 68 px shutter, close affordance. Front, then back for a
   two-sided document. Do **not** pre-crop — Didit detects and aligns, and wants all four corners.
2. **Selfie / liveness** — no mock exists. Needs design: front camera, face oval, hold-still beat, a retake
   that costs nothing.
3. **Analysing** — replaces the browser-wait. Determinate ("Checking your ID · step 2 of 2"), never a bare
   spinner; the slow-link honesty pattern already used for uploads ("Still checking — hang on").

Plus: extend the `kyc-draft.ts` resume marker to cover captured-but-unsent images, so an OOM kill mid-capture
resumes instead of restarting (the pattern is already there for the single photo).

### 4.4 Backend

**Both routes**

- Fix G5: persist the live session reference, expose it on `getMe`, and make resume *resume*. `retryKyc`
  should only mint a new session when the current one is genuinely dead, so a "Continue" tap costs nothing.

**Route A**

- `KycSubmission` gains `token`; `DiditKycVendor` reads `session_token`; `becomeRider`/`retryKyc` return it.
- Keep `verificationUrl` in the response as a flagged emergency fallback — an SDK-crashing device with no
  path forward is worse than a browser.

**Route B**

- New vendor implementing document / liveness / face-match, with the API key **server-side only** — never
  ship `x-api-key` to a device. The app uploads to our GCS as it already does; the API pulls the object and
  forwards multipart.
- New `decideDiditStandalone` mapping the synchronous response onto the same `applyKycResult`, and extending
  `extractDiditDocumentNumber` for the top-level `id_verification.document_number` shape (it currently probes
  `decision.id_verification.*`). Both extractors fail open, so **add tests that fail loudly on shape drift** —
  otherwise G8 degrades silently.
- Keep `/kyc/callback` alive: `save_api_request=true` still emits `status.updated`.

### 4.5 Design + guardrails

1. Record the owner decision (this document) and get the new screens **into the design tool**, then re-export
   — `packages/design/` mirrors the tool; editing it in-repo is how the copy stopped being the design.
2. If mocks are edited in-repo in the interim, a matching `docs/DESIGN-DEVIATIONS.md` entry is **mandatory**
   or `design-freeze` fails the PR.
3. Regenerate `tools/parity/screens.generated.json`; wire the new ids in `app-targets.mjs` or allowlist them
   in `parity-status.mjs` with a reason.
4. Attach a `tools/parity/pair.mjs` side-by-side sheet at 360×720 (plus the 320×640 entry-phone check) —
   a parity claim is an image, not prose.
5. Update `docs/PIXEL-PARITY-TRACKER.md`.

---

## 5. Sequencing and risk

| Phase | Work | Gate |
|---|---|---|
| 0 | ~~Owner picks Route A or B (§3)~~ | ✅ **Done — Route A, 2026-08-20** |
| 1 | Design: new/changed mocks, exported from the tool | ◐ **Drawn (PRs #841, #847) — EXPORT STILL OWED** |
| 2 | **Prove New Architecture on a preview build, in isolation, before any KYC code** | ⚠️ **Not done in isolation — see below** |
| 3 | Backend: `session_token` passthrough + resume fix (G5) | ✅ **Done — PRs #840, #842** |
| 4 | Mobile: capture + verify + analysing states, browser call sites deleted | ✅ **Done — states in #843, SDK swap here** |
| 5 | Store build (no OTA — G11), preview profile, internal track | ✅ **Done — build `6294977b` FINISHED, submission FINISHED, track `internal` (2026-08-20)** |

**The New-Architecture risk did not land.** Build `6294977b` (2026-08-20) compiled and linked the
New Architecture and the Didit SDK together on their first build, and its submission reached the
internal track clean. The accepted risk recorded above is therefore closed on the *build* side. It is
NOT closed on the runtime side: a FINISHED build proves the two link, not that the SDK's camera and
liveness UI runs on a handset — which is the entire point of Route A. The device smoke in
`docs/QA-DEVICE-CHECKLIST.md` is the remaining gate.

**Phase 1 is drawn but not exported, and the gate is the export.** The mocks for the three pending
states and the reinstated customer bridge were authored IN THIS REPO, not in the Claude Design tool —
D-33, D-35 and D-36 each carry an `UPSTREAM SYNC OWED` warning for exactly that reason. Until an
export carries them, the next one silently reverts them, so this phase stays open however finished the
screens look.

**Phase 2 did not happen the way this table asked, and that is a known, owner-accepted risk.** The
plan's own biggest-risk note said to prove the New Architecture on a real device *before* a line of
KYC code, precisely so a failed migration could not strand finished KYC work behind it. The owner
instructed otherwise ("Just proceed.. Execute all", 2026-08-20) after the EAS build had been excluded
from the previous round, so the SDK swap and the New-Architecture proof now ride the SAME build.

What that costs if the migration fails: the failure arrives mixed with a KYC change rather than in
isolation, so the first debugging step is separating the two. What makes it survivable: `newArchEnabled`
is one line in `app.config.ts` (#835) and the KYC SDK is behind one seam (`src/kyc/verify.ts`), so
either can be reverted without the other. The dependency audit that preceded #835 found no blocker,
and the one interop question (react-native-maps) resolves through RN's automatic interop layer.

**Biggest risk, now that Route A is chosen:** the New Architecture migration (G9). It is the one item that
can sink the schedule and it is orthogonal to KYC. This originally read *"it must be proven on a real
device build before a line of KYC code is written"* — a gate that can no longer be met, because the
owner directed the KYC code to be written first (see the Phase 2 note above). Stating an unmeetable
condition is worse than stating none: it reads as satisfiable and quietly never is. **The surviving
gate is Phase 5's:** the preview build must come back green on a real device, running the New
Architecture *and* the SDK together, before **production release** — NOT before the internal track.
Gating internal submission on device smoke would be circular: submitting to internal is *how* the
binary reaches a handset to be smoked. Build `6294977b` is therefore deliberately pre-smoke on
internal, and that is the lane working as intended, not an exception to it. If it fails, the
separation is done by revert — the flag and the seam are independent — not by having sequenced them.
Second:
silent degradation of the IR26-04 dedupe and threshold bands if the payload shape changes without tests
(G8) — less likely under Route A, since the webhook contract is unchanged, but the extractors still fail
open. (Route B's false-reject risk is deferred with Route B.)

**Out of scope:** the manual-review backstop, the admin console, `KYC_THRESHOLDS`, the A-02 two-attempt lock,
and the one-ID-one-account guards. All of them keep working unchanged under both routes.

---

## Sources

- [Didit — Native SDKs overview](https://docs.didit.me/integration/native-sdks/overview)
- [Didit — React Native SDK (GitHub)](https://github.com/didit-protocol/sdk-react-native)
- [Didit — Create Session](https://docs.didit.me/sessions-api/create-session)
- [Didit — ID Verification standalone API](https://docs.didit.me/standalone-apis/id-verification)
- [Didit — API index (`llms.txt`)](https://docs.didit.me/llms.txt)
