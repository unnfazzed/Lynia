# Lynia — Launch Deployment Strategy (continuous delivery for a live, critical app)

> **What this document is.** The release-automation plan for going from *pilot* to *fully live*: how to
> ship the **Android app** to Google Play and the **API** to Google Cloud **continuously and without
> disrupting the service**, and how to organise GitHub so a two-sided, money-adjacent app can be updated
> safely many times a week.
>
> **How it relates to the other launch docs.** `PILOT-READINESS.md` is the build status board;
> `LAUNCH-READINESS.md` is the *review campaign* (hardening / perf / UX gates LR1–LR21). Both largely
> assume the deploy mechanics. **This doc owns the deploy mechanics** — the pipelines, the rollout
> strategy, and the GitHub process — and picks up the release-shaped threads those docs defer:
> `LAUNCH-READINESS.md` **LR20** ("versioning/build-number discipline … staged-rollout plan"), **LR4**
> (branch protection), **LR7** (VPC-internal migrator), and the go/no-go rollback line in **LR21**.
> Date: 2026-07-08. Branch: `claude/launch-deployment-strategy-vm6rh1`.

## 0.5 Implementation status (2026-07-08 — this branch)

The plan below is now **largely implemented**; what remains is founder arming (accounts/settings,
not code — see `LAUNCH-EXECUTION-RUNBOOK.md` §8) and two deliberate deferrals.

| Piece | Status |
|---|---|
| Cloud Run canary: `--no-traffic` deploy → **graduated** 10→50→100 promotion, each step gated on LB health + revision readiness + the candidate's **5xx metric rate** → **auto-rollback** | ✅ `release.yml` (on by default once armed; `CANARY_STEPS`/`CANARY_*` vars tune it; metric gate uses Cloud Run's built-in `request_count` — no OTEL needed; deployer SA gets `monitoring.viewer` via `iam.tf`) |
| Manual one-command rollback | ✅ `rollback.yml` (list revisions / route 100% back) |
| GitHub Environments gate on prod deploys | ✅ jobs reference `staging` / `production` / `production-mobile`; founder adds required reviewers |
| Play release pipeline: EAS build + staged submit (10% `inProgress`) | ✅ `mobile-release.yml` + `apps/mobile/eas.json` (dormant until `EAS_RELEASE_ENABLED=true`) |
| `versionCode` discipline | ✅ `autoIncrement` + `appVersionSource: remote` in `eas.json` |
| OTA hotfix lane | ✅ `mobile-ota.yml` + `expo-updates@~0.27.5` + `runtimeVersion: fingerprint`; EAS project linked (`app.config.ts` fallback `easProjectId`), so the `updates` config is live — the CI publish path is still separately gated behind `EAS_RELEASE_ENABLED` |
| CODEOWNERS + PR template (risk/rollback/migration checklist) | ✅ `.github/` |
| **§2e correction:** the candidate's tagged `run.app` URL is unreachable from CI (default URLs disabled, LB-only ingress) | smoke = revision-readiness gate + %-shift + health **through the LB** (`/healthz` — the actual route; README's `/health` is loose prose), which is what `release.yml` implements |
| Staging stack (§2d) | ✅ `infra/terraform/staging.tf` (own SQL/Redis/secrets/SA/bucket, `staging_enabled` default `false` in-repo) — **applied and armed**: `deploy-staging.yml` has run green on every `main` push since 2026-07-08 (`docs/GCP-PENDING-REVIEW-2026-07-13.md` §Appendix), auto on main, `APP_ENV=staging` QA tier, smoke |
| Min-supported-version gate (§1c) | ✅ server-driven: `GET /app/version-gate` (env `MIN_SUPPORTED_APP_VERSION`, off by default) + shared contract + mobile fail-open fetch feeding the existing force-update screen; `APP_ENV` tier added so staging may run QA bypasses while prod hardcodes them off |
| Release train | ✅ `release-please.yml` (release PR → `vX.Y.Z` tag → triggers the Play release; annotated version in `app.config.ts`) |

## 0. Where we are today (the baseline this plan extends)

| Surface | Today | Gap for "live & critical" |
|---|---|---|
| **API → Cloud Run** | `release.yml`: push to `main` → build image → `prisma migrate deploy` → `gcloud run deploy` (keyless WIF). Online-safe migrations **CI-enforced** (`src/prisma/migration-safety.spec.ts`). | **100% cutover** — no canary, no health-gated promotion, no automated rollback. Single environment (prod). |
| **Android app** | `android-test-apk.yml`: manual QA APK, **throwaway keystore**, sideloaded. `eas.json` empty. `version: 0.1.0`, **no `versionCode`**. | **No production Play pipeline** at all: no stable signing identity, no Play submit, no staged rollout, no OTA hotfix lane, no min-version gate. |
| **GitHub process** | CI on every PR (`ci.yml`). Deploy fires on merge to `main`. Branch protection is LR4 (founder-pending). | No **environments/approvals**, no **staging tier**, deploy straight to prod on green merge, no release/tag train. |

The three sections below map 1:1 to the three questions. Each ends with a **concrete, copy-pasteable**
config so this is executable, not just narrative.

---

## 1. Google Play — update the live app without disrupting service

The core idea: **decouple three update channels** so a change ships through the lowest-risk one that can
carry it, and so a phone that hasn't updated yet never breaks against the live API.

```
┌── Channel A: OTA update (expo-updates) ──────────  JS/asset-only change, minutes, no store review
│     hotfix a copy string, a screen bug, a client tweak → pushed to installed apps on next launch
├── Channel B: Play staged rollout (EAS Build+Submit)  native/SDK change or new versionCode, hours+review
│     new .aab → internal → closed → production 10%→50%→100%, halt/rollback per crash metrics
└── Channel C: API contract compatibility + min-version gate  the safety net under A and B
      old app versions keep working; a hard-incompatible change forces an upgrade instead of breaking
```

### 1a. Channel A — OTA updates (`expo-updates`) for JS-only changes

The app is Expo (SDK 52 / RN 0.76). The JS bundle is **over-the-air updatable** without a Play review:
`expo-updates` lets a new JS+asset bundle download in the background and apply on next cold start. This is
the "no disruption" workhorse — most client fixes (copy, layout, a client-side bug, a tweak to the offer
UI) are JS-only and never need a store release.

- **Rule:** OTA can ship anything that does **not** change native code — no new native module, no SDK
  bump, no `app.config.ts` native config (permissions, `googleServicesFile`, Maps block), no
  `expo-build-properties` change. Those need Channel B (a new binary). Ship an OTA update whose
  **runtime version** doesn't match the installed binary and it's silently ignored — so runtime version
  must be managed deliberately (below).
- **Runtime versioning:** set `runtimeVersion` to `{ "policy": "fingerprint" }` (or `appVersion`) in
  `app.config.ts`. Fingerprint policy ties an OTA bundle to the exact native layer it was built against,
  so an OTA update can never land on an incompatible binary.
- **Rollout + rollback:** publish to an EAS Update **branch** per release channel (`production`,
  `preview`). Roll back instantly by re-pointing the channel at the previous update (`eas update
  --branch production --message "rollback"` republishing the prior commit, or `eas update:rollback`).
- **Guardrail:** OTA is powerful and unreviewed — it must go through the **same PR + CI gate** as
  everything else (never `eas update` from a laptop). Wire it into GitHub so an OTA publish is a
  reviewed, tagged action (§3).

### 1b. Channel B — EAS Build + Submit with staged rollout

For native/SDK/versionCode changes, build a signed **Android App Bundle (.aab)** and submit to Play.

**Stable signing identity (must fix before first prod release).** The QA workflow uses a *throwaway*
keystore per run — fine for sideload, **fatal for Play** (Play ties an app to one upload key forever).
Choose one, once:
- **Recommended: EAS-managed credentials.** `eas build` generates and stores the upload keystore; enrol
  the app in **Play App Signing** so Google holds the *app signing key* and you hold only the *upload
  key* (rotatable if leaked). Least key material to guard.
- Alternative: self-managed keystore stored as an EAS secret. More control, more custody risk.

**`versionCode` discipline (the current hard gap).** Play rejects a re-used `versionCode`. Set
`autoIncrement: true` in `eas.json` so EAS bumps `android.versionCode` every production build —
monotonic, collision-free, no human bookkeeping. Keep `version` (the human `versionName`, e.g. `1.2.0`)
bumped per release via the shared version step in §3.

**Staged rollout across Play tracks** — this is the "without disrupting service" story for the binary:

```
internal testing  →  closed (beta) track  →  production 10% → 25% → 50% → 100%
   founder/QA           corridor pilots          staged, halted on crash-rate/ANR regression
```

- Submit to **production with `rolloutPercentage`** starting low (e.g. `0.1` = 10%). Watch **Play
  Console vitals** (crash-free users, ANR rate) + **Sentry** (LR20). Advance the percentage only when
  the new version's crash-free rate holds; **halt or roll back the rollout** in Play Console if it
  regresses — users on the old version are untouched.
- Play serves the update **in the background**; users get it on their own schedule. There is no
  "downtime" for a mobile update — the disruption risk is a *bad build reaching everyone at once*, which
  staged rollout + halt eliminates.

### 1c. Channel C — the compatibility contract (why old apps don't break)

A mobile app is a **fleet of client versions** hitting one API; users update on their own timeline. Two
mechanisms keep the live service non-disruptive across that fleet:

1. **The API stays backward-compatible.** Wire shapes are zod contracts in
   `packages/shared/src/contracts.ts` (CONTRIBUTING §6). Treat them as a **public API**: additive changes
   only (new optional fields, new endpoints); never remove/rename a field an installed app still sends or
   reads. When a breaking change is unavoidable, **version the endpoint** (`/v2/...`) and keep `/v1`
   until the old-app population drains. This is the real reason Channel A/B can roll independently of the
   API deploy — see the migration ordering in §2c for the DB-side mirror of the same rule.
2. **A minimum-supported-version gate (force-update).** Add a tiny, cheap check: the app sends its
   `versionCode`/`runtimeVersion`; the API (or a public config value) declares `minSupportedVersion`. If
   the app is below it, show a **blocking "please update" screen** deep-linking to Play. This converts an
   otherwise-breaking change into a *controlled forced upgrade* instead of a crash — and it's the escape
   hatch if an OTA/contract mistake ever ships. (Small build; propose as an LR-adjacent task.)

### 1d. Deliverable config (Channel A + B)

`apps/mobile/eas.json` (currently empty):

```jsonc
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },
  "build": {
    "preview": {                       // internal + closed-track .aab (OTA channel: preview)
      "android": { "buildType": "app-bundle" },
      "channel": "preview",
      "env": { "EXPO_PUBLIC_ENV": "staging" }
    },
    "production": {                     // production .aab
      "autoIncrement": true,           // ← bumps android.versionCode every build (the current gap)
      "android": { "buildType": "app-bundle" },
      "channel": "production",
      "env": { "EXPO_PUBLIC_ENV": "production" }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./play-service-account.json",  // CI: materialised from a secret
        "track": "production",
        "releaseStatus": "inProgress",  // staged (not "completed") so rollout % is controllable
        "rollout": 0.1                  // start at 10%; advance in Play Console / a follow-up submit
      }
    }
  }
}
```

`app.config.ts` additions (runtime version + updates URL):

```ts
runtimeVersion: { policy: "fingerprint" },
updates: { url: "https://u.expo.dev/<project-id>", fallbackToCacheTimeout: 0 },
// keep `version` (versionName) bumped per release; versionCode is EAS-managed via autoIncrement
```

Secrets/accounts to provision (founder — accounts, not code):
- **Google Play Console** app + a **Play Developer API service account** JSON (Play Console → API access)
  → store as EAS secret / GitHub secret `PLAY_SERVICE_ACCOUNT_JSON`.
- **Expo/EAS account** + `EXPO_TOKEN` (GitHub secret) for CI builds/submits/updates.
- Enrol in **Play App Signing**; keep the EAS upload key.

---

## 2. Google Cloud — update the backend continuously, with zero downtime

`release.yml` already delivers continuously. The upgrade for "live & critical" is to make each deploy
**progressive and self-defending**: canary a new revision, gate promotion on health, and roll back
automatically — instead of the current blind 100% cutover.

### 2a. Cloud Run already gives rolling, zero-downtime *replacement*

`gcloud run deploy` creates a **new immutable revision** and shifts traffic to it while the old revision
**drains in-flight requests** — there is no window where nothing serves. The WS/tracking concern is
handled: `--timeout 3600` lets a delivery's socket survive, and the client already self-heals a dropped
socket via the REST snapshot path (ET4). So the *mechanism* is zero-downtime; what's missing is **not
sending 100% of users to an unverified revision instantly**.

### 2b. Add canary (traffic splitting) + health-gated promotion + auto-rollback

Deploy the new revision **with no traffic**, prove it healthy, then shift traffic in steps — Cloud Run's
native traffic splitting makes this a few flags:

```
deploy revision (--no-traffic, --tag=candidate)
        │
        ▼
smoke the candidate URL (candidate---<svc>...run.app/health → {status:ok,db:true,redis:true})
        │  pass                                   │  fail
        ▼                                         ▼
shift 10% → wait/observe → 50% → 100%       leave 0% traffic; deploy exits red; prod untouched
        │  error-rate/latency SLO breach mid-shift
        ▼
gcloud run services update-traffic --to-revisions <previous>=100   ← automatic rollback
```

- **Canary:** `gcloud run deploy … --no-traffic --tag candidate` publishes the revision at a stable
  `candidate---…` URL serving **0% of prod**. Smoke-test **that** URL (extend the existing `/health`).
- **Promote in steps:** `gcloud run services update-traffic <svc> --to-tags candidate=10`, observe the
  LR9 dashboards / alert policies (`infra/terraform/monitoring.tf`), then `=50`, then `--to-latest`.
- **Auto-rollback:** on a smoke failure or an SLO-breach alert during the window, run
  `--to-revisions <lastGood>=100`. Cloud Run keeps every prior revision, so rollback is a traffic
  re-point (seconds), not a rebuild. This is exactly the LR21 "rollback runbook, exercised once" line —
  make it a workflow step, not a manual memory.
- **Pin `--max-instances` + `DATABASE_CONNECTION_LIMIT`** (LR12 connection math) so a scale-up can't
  exhaust Cloud SQL `max_connections` during a rollout when old+new revisions briefly overlap.

### 2c. Migrations are the real zero-downtime risk — enforce expand/contract

During a rollout the **old and new revisions run simultaneously**, both hitting the **same database**. A
migration must therefore be compatible with *both* code versions. The repo already enforces the mechanics
(no table-rewrite / build indexes `CONCURRENTLY` — `migration-safety.spec.ts`, CONTRIBUTING §3). Add the
**ordering discipline** on top:

- **Expand → migrate code → contract**, never rename-in-place. To rename a column: add the new one
  (nullable), deploy code that writes both / reads new-then-old, backfill, deploy code that uses only the
  new, then drop the old in a *later* release. Each step is compatible with the revision beside it.
- **Migrations run before traffic shifts** (they already do, pre-deploy). Because they're
  expand-only/additive, the still-live old revision keeps working against the migrated schema.
- **Prefer the in-VPC migrator** (`DB_PRIVATE_ONLY=true`, the Cloud Run Job path already in `release.yml`)
  so LR7 can drop the Cloud SQL public IP without breaking migrations.

### 2d. A staging Cloud Run service (prerequisite for both this and LR11)

Stand up `lynia-api-staging` (same image, QA env vars) as the **canary of last resort** — every change
deploys to staging first and runs smoke + the k6 harness (`apps/api/load/`, LR11) before prod. This also
gives §3's "deploy to staging automatically, prod behind approval" its target. Terraform can template it
as a second service (or a `staging` workspace) — see `LAUNCH-EXECUTION-RUNBOOK.md` §4.

### 2e. Deliverable — the promotion steps to add to `release.yml`

Replace the single `gcloud run deploy … --allow-unauthenticated` (traffic-to-latest) with:

```bash
# 1. Deploy the new revision with NO traffic, tagged for a stable canary URL.
gcloud run deploy "$SERVICE" --image "$IMAGE:$GITHUB_SHA" --no-traffic --tag "sha-${GITHUB_SHA::7}" \
  --region "$REGION" [ …all existing flags: SA, cloudsql, vpc, ingress, secrets, env… ]

# 2. Smoke the candidate revision URL (not prod).
CAND_URL=$(gcloud run services describe "$SERVICE" --region "$REGION" \
  --format="value(status.traffic.filter(tag='sha-${GITHUB_SHA::7}').url)")
curl -fsS "$CAND_URL/health" | grep -q '"status":"ok"'   # fail ⇒ job fails, prod stays on old revision

# 3. Progressive shift with an observation pause between steps.
gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-tags "sha-${GITHUB_SHA::7}=10"
#   … gate on monitoring (LR9) — a manual approval env (§3) or a metric check — then:
gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-latest

# Rollback (kept as a workflow_dispatch input / documented one-liner):
# gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-revisions <LAST_GOOD>=100
```

> Keep it incremental: land staging + `--no-traffic` canary + smoke first (pure upside, no behaviour
> change to prod promotion), then add the graduated % shift once the LR9 dashboards can gate it.

---

## 3. Organising GitHub to maintain a live, critical application

The current flow (PR → green CI → merge → **straight to prod**) is right for a pilot and wrong for a live
money-adjacent app: one bad merge reaches every user with no human gate. Reshape it into a **promotion
pipeline with environments, approvals, and a release train**, keeping trunk-based development.

### 3a. Branch & merge model — trunk-based, protected

- **`main` is always deployable.** Short-lived `feature/…` / `claude/…` branches; **squash-merge** via
  PR; no direct pushes. (Already the CONTRIBUTING §4 flow — now *enforced*.)
- **Enable branch protection on `main` (LR4 — do this first, it's the cheapest high-leverage move):**
  required status checks (`typecheck · build · test`, `prisma migrate · constraint proof (PostGIS)`,
  the `security` job, CodeQL), **≥1 required review**, `enforce_admins=true`, linear history, no force
  push, require branches up to date. Command is in `LAUNCH-EXECUTION-RUNBOOK.md` §6.
- **`CODEOWNERS`** so money-path / auth / infra / contract files (`apps/api/src/**cash**`,
  `**/auth/**`, `infra/**`, `packages/shared/src/contracts.ts`, `.github/workflows/**`) require the
  right reviewer. Add a **PR template** (risk/rollback/migration checklist).

### 3b. GitHub Environments — the approval gates (the key missing piece)

Split "build & test" from "deploy," and put deploys behind **GitHub Environments** with protection rules:

| Environment | Trigger | Protection | Holds |
|---|---|---|---|
| `staging` | auto on merge to `main` | none (fast feedback) | staging WIF SA, staging Cloud Run, EAS `preview` |
| `production` | promotion from a green staging deploy | **required reviewer(s)** + optional **wait timer**; restrict to `main` | prod WIF SA, prod Cloud Run, `PLAY_SERVICE_ACCOUNT_JSON`, `EXPO_TOKEN` |
| `production-mobile` | tag `v*` / manual dispatch | required reviewer | Play submit + EAS Update prod channel |

Environment protection means **a human clicks "approve" before anything touches prod** — the gate the
current pipeline lacks — and prod secrets are scoped to the `production` environment (not repo-wide).
The existing keyless **WIF** posture (no SA JSON keys) stays; just bind the prod provider to the
`production` environment.

### 3c. Workflow topology (split the monolith `release.yml`)

```
ci.yml            PR + push        typecheck · build · test · schema · security · codeql   (gate, unchanged)
deploy-staging    push→main        build image → migrate(staging) → deploy staging → smoke + k6   (auto)
deploy-prod       manual/approval  reuse staging image → migrate(prod) → canary → gated promote    (env: production)
mobile-release    tag v* / dispatch  EAS build .aab → submit staged rollout           (env: production-mobile)
mobile-ota        label `ota` / dispatch  eas update --branch production (JS-only)     (env: production-mobile)
```

- **Promote the *same image* staging → prod** (don't rebuild) — what you tested is what ships.
- `concurrency: { group: deploy-prod, cancel-in-progress: false }` (already present) so deploys serialise.
- Mobile releases are **tag-driven** (`v1.2.0`) — the tag is the version source of truth and the release
  record; a single version-bump step updates `version`, tags, and generates the changelog.

### 3d. Release train & versioning

- **Semantic version tags** (`vMAJOR.MINOR.PATCH`) cut from `main` drive both surfaces: the API image is
  tagged with the release tag (in addition to `$GITHUB_SHA`), and the mobile build reads `version` from
  the same bump. Adopt **release-please** or **changesets** to automate the bump + `CHANGELOG.md` +
  GitHub Release from Conventional Commits — so "what shipped" is always answerable.
- **Keep API and app versions independent** (they release on different cadences) but record the
  **min-supported-app-version** (§1c) alongside each API release so compatibility is tracked, not
  assumed.

### 3e. Operating a live app on GitHub

- **On-call / rollback runbook** (extends `docs/IR-RUNBOOK.md`): the API rollback is
  `update-traffic --to-revisions <lastGood>=100` (§2b); the app rollback is halt-rollout in Play +
  re-point the OTA channel (§1a). Exercise it once before launch (LR21).
- **Deploy notifications** → a channel on every prod deploy/rollback (who, what SHA, which version).
- **Post-deploy monitoring** wired to alerts (LR9): a prod deploy that breaches an SLO within N minutes
  pages on-call and is the auto-rollback trigger.
- **Dependabot** (already configured) + the CI `security` job (pnpm-audit + gitleaks + CodeQL) keep the
  supply chain patched; group/rebase discipline is in `LAUNCH-EXECUTION-RUNBOOK.md` §7.
- **Secret rotation** (`docs/SECRET-ROTATION.md`): add the **Play service-account key** and **EXPO_TOKEN**
  to the rotation inventory; the WIF providers need none (keyless).

---

## 4. Sequenced rollout of this plan (what to do, in order)

| Phase | Actions | Unblocks |
|---|---|---|
| **0 — Guardrails (do first, cheap)** | Branch protection on `main` (LR4) · `CODEOWNERS` + PR template · GitHub `staging`/`production` environments with a required reviewer on prod. | A human gate before every prod deploy. |
| **1 — Backend progressive delivery** | Stand up `lynia-api-staging` · split `release.yml` into `deploy-staging` (auto) + `deploy-prod` (approval) · add `--no-traffic` canary + `/health` smoke + documented rollback one-liner. | Zero-downtime, self-defending API deploys. |
| **2 — Play pipeline foundation** | Fix signing (EAS-managed + Play App Signing) · fill `eas.json` (`autoIncrement`, submit config) · create Play + Play API service account + EAS account/token · first **internal-track** build. | A real, repeatable prod app build with monotonic `versionCode`. |
| **3 — Non-disruptive app updates** | Wire `expo-updates` (runtime version + `mobile-ota` workflow) · `mobile-release` workflow with **staged rollout** (10%→100%) · treat `contracts.ts` as backward-compatible · build the **min-version gate** (§1c). | Ship client fixes in minutes (OTA) and binaries safely (staged); old apps never break. |
| **4 — Graduated promotion + release train** | Metric-gated % traffic shift in `deploy-prod` (needs LR9 live) · release-please/changesets + version tags · deploy notifications + auto-rollback on SLO breach · rollback drill (LR21). | Fully automated, observable, reversible release train. |

Phase 0 and the *staging + canary* slice of Phase 1 are pure upside with no change to how prod promotes
today — land them first. Phases 2–3 are the genuinely new capability (there is **no** production Play
path yet). Phase 4 depends on the LR9 observability pipeline being live.

---

## 5. Open decisions for the founder (accounts & policy, not code)

- **Play App Signing enrolment** + who custodies the upload key (recommend EAS-managed).
- **Rollout policy numbers:** the staged-rollout step sizes (10/25/50/100) and the crash-free /
  ANR thresholds that **halt** a rollout; the canary traffic steps + the SLO that triggers auto-rollback.
- **Approval policy:** who can approve a `production` deploy, and the wait-timer (if any).
- **min-supported-version policy:** how long `/v1` contracts and old app versions are supported before a
  forced upgrade.
- **OTA governance:** OTA bypasses store review — confirm it stays behind the same PR+CI gate and is
  never published from a developer laptop.

*This document owns deploy mechanics; findings that touch app code (min-version gate, `/health`
extensions, OTA wiring) land as normal PRs through the gstack flow and CI, and status ticks belong in
`LAUNCH-READINESS.md` (LR20 / LR4 / LR7) with build status in `PILOT-READINESS.md`.*
