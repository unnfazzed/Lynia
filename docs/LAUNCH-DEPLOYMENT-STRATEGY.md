# How releases work

How a change reaches users: the Android app (OTA, Play tracks, the compatibility contract), the API on
Azure (canary and rollback), and the GitHub process around both. Code and workflows cite this doc by
section number, so the numbers are stable.

The commands that arm or operate these lanes are in [`AZURE-OWNER-RUNBOOK.md`](AZURE-OWNER-RUNBOOK.md).
The Play build and submission ledger is [`PLAY-STORE-SUBMISSION.md`](PLAY-STORE-SUBMISSION.md).

| Surface | Lane | Trigger |
|---|---|---|
| API | `release-azure.yml` → Container Apps canary | every merge to `main` (docs-only changes skip it) |
| API rollback | `rollback-azure.yml` | manual |
| Android binary | `mobile-release.yml` → EAS build → Play | manual (`profile` input) |
| Android re-submit | `mobile-submit.yml` | manual, no new build |
| Android JS fix | `mobile-ota.yml` → EAS Update | manual |
| Build status | `eas-build-status.yml` (read-only) | manual |
| Admin console | `deploy-admin-azure.yml` | merge touching `apps/admin` |
| Customer web, merchant web, website | `deploy-customer-web.yml`, `deploy-merchant-web.yml`, `deploy-website.yml` (Cloudflare) | merge |

---

## 1. The Android app

Three channels, so each change ships through the lowest-risk one that can carry it, and an un-updated
phone never breaks against the live API:

```
Channel A: OTA update (expo-updates)      JS/asset-only change; minutes; no store review
Channel B: EAS Build + Play track         native/SDK change or a new versionCode; Play review
Channel C: compatibility contract         old app versions keep working; a min-version gate as the escape hatch
```

**Nothing ships automatically.** Both mobile workflows are `workflow_dispatch`. `mobile-release.yml` also
has a `v*` tag trigger, gated separately behind `EAS_TAG_RELEASES_ENABLED`. Merging to `main` reaches no
device.

### 1a. Channel A — OTA updates

`mobile-ota.yml` exports the JS bundle from the checked-out commit and publishes it to an EAS Update
branch. Installed apps whose runtime version matches download it and apply it on the next cold start.
OTA updates have reached testers since 2026-09-26.

- **Pick the branch that matches the binary.** The branch is the build's channel. The testers' builds
  (profile `closed`) and internal builds (`preview`) are on channel **`preview`**. The workflow's default
  branch is `production`, which no tester binary listens to today.
- **JS only.** The runtime version is the expo-updates `fingerprint` of the native layer
  (`app.config.ts` → `runtimeVersion: { policy: "fingerprint" }`). A new native module, an SDK bump or a
  native `app.config.ts` change moves it, and devices silently ignore an update with a different runtime.
  Those changes need Channel B. `apps/mobile/fingerprint.config.js` skips only the version fields, so
  release-please's version bumps don't move the runtime (`REL-01`).
- **Preflight.** The workflow computes the runtime version and refuses to publish unless a recent build on
  that channel shares it (`allow_runtime_mismatch` overrides). It installs with a strict
  `--frozen-lockfile` so it computes the same fingerprint as the build.
- **Config parity.** `EXPO_PUBLIC_*` values are inlined into the bundle on the runner, so the workflow
  sets them itself: the API URL, the Places key and the Sentry DSN (repo secret
  `EXPO_PUBLIC_SENTRY_DSN`). Without the DSN, an OTA switches crash reporting off.
- **Rollback:** republish the previous update group on the same branch (`eas update:republish`, or the
  Expo console).
- **Governance:** OTA bypasses store review, so it runs only from this workflow, in the
  `production-mobile` environment, from a CI-green commit. Never `eas update` from a laptop.

### 1b. Channel B — EAS Build + Play tracks

`mobile-release.yml` builds a signed `.aab` on EAS and, by default, submits it. The upload key is
EAS-managed and the app is enrolled in Play App Signing. `versionCode` is EAS-managed
(`autoIncrement` + `appVersionSource: remote`), so Play never sees a reused code.

**The `profile` input decides where the build goes** (`apps/mobile/eas.json`):

| Profile | Channel | Submit track | Use |
|---|---|---|---|
| `closed` | `preview` | `Closed testing` | ✅ the testers |
| `preview` | `preview` | `internal` | pipeline check; no testers there |
| `production` (the default) | `production` | `production`, 10% staged | ❌ not usable: Play has not granted production access |

So pass `profile: closed` explicitly. A default dispatch builds, then fails at submission and wastes one
of the month's EAS builds.

**Two closed tracks.** Play's built-in closed track is **Alpha** (`alpha`) and has no testers. The testers
are on a second track named **`Closed testing`**. A track's API id is its name as typed in Play Console,
so `eas.json` carries `"track": "Closed testing"`. Don't change it to `alpha`.

**Following a build.** `eas build --no-wait` means a green GitHub job only proves the build was queued.
Read `eas-build-status.yml`'s Recap for the build status, the submission status and the track. A
FINISHED build with an ERRORED submission is a real failure mode. `mobile-submit.yml` re-submits an
existing build (no build quota). A build Play already accepted is moved between tracks by promoting it in
Play Console, because Play refuses a versionCode it already has.

**Before dispatching**, run `pnpm install --frozen-lockfile` locally if the lockfile moved. The release
job installs strictly so both sides compute the same runtime version.

**Production, later.** Once the 14-day closed test is done and Play grants production access: grant the
Play service account the *Release to production* permission, set `EAS_TAG_RELEASES_ENABLED=true`, and a
`v*` tag (or `profile: production`) submits to production at 10% (`releaseStatus: inProgress`). Advance
or halt in Play Console while crash-free users and ANRs hold (Play vitals and Sentry).

### 1c. Channel C — the compatibility contract

The API serves a fleet of app versions. Two things keep old installs working:

1. **Contracts stay backward-compatible.** Wire shapes are zod schemas in
   `packages/shared/src/contracts.ts`. Add optional fields and new endpoints; never remove, rename or
   tighten something an installed app still sends or reads. CI enforces it: the *Contract back-compat
   gate* (`pnpm run contract:check`) fails a breaking change unless the PR carries the `contract-change`
   label and re-baselines the snapshot. A strict response body (e.g. `MerchantFeatureFlagsResponse`) gets
   a new endpoint rather than a new key, because installed apps parse it strictly.
2. **A server-driven minimum version.** `GET /app/version-gate?platform=` returns
   `minSupportedVersion` from `MIN_SUPPORTED_APP_VERSION` (`_IOS` for iPhones). The app checks it at cold
   start (`apps/mobile/src/net/use-server-version-gate.ts`) and shows a blocking update screen when it is
   below. An unreachable API never blocks. With `soft=1` it also returns the dismissible
   `recommendedVersion` and `whatsNew`. Commands: `AZURE-OWNER-RUNBOOK.md` §9.

---

## 2. The API on Azure

`release-azure.yml` runs on every non-docs merge to `main`, in the `production` environment (OIDC to
Azure, `main` only). Each deploy is progressive and rolls itself back.

1. **Preflight.** Required Azure Variables, then the launch-hygiene guards (`AZURE-OWNER-RUNBOOK.md` §8),
   so a config the API would refuse at boot fails in seconds.
2. **Staging gate.** Passes straight through: staging is retired and `AZ_STAGING_ENABLED` is unset.
3. **Image.** Build `lynia-api:<sha>` into ACR (registry layer cache). The step would promote the
   staging image instead, if one existed.
4. **Migrate.** Run `prisma migrate deploy` in the in-VNet job `caj-lynia-migrate` with the new image,
   while the old revision still serves (§2c).
5. **Pin, then deploy at 0%.** The serving revision is re-expressed as a named revision at 100% (the
   rollback target). The new revision starts at 0%.
6. **Smoke** the candidate on its `canary` revision-label URL (`/healthz` must say `status: ok`) before
   any user reaches it.
7. **Canary** (§2b), then promote to 100%. The previous revision stays active as the instant rollback
   target; older ones are deactivated.

The API runs in **multiple revision mode** (`infra/azure/containerapps.tf`) so traffic can be split. The
admin console runs in single revision mode: Container Apps switches only once the new revision is ready.

### 2b. Canary, health gates and rollback

Traffic moves `CANARY_STEPS` (default `10 50`), then 100%. Each step waits `CANARY_OBSERVE_SECONDS`
(default 120) and then checks:

- `/healthz` on the public hostname **and** on the candidate's label URL returns `status: ok` (HTTP 200
  alone also covers `degraded`, which means dead queues);
- the candidate revision is still provisioned and healthy;
- the candidate's 5xx rate (Azure Monitor `Requests`) stays under `CANARY_MAX_5XX_PCT` (default 5) once
  `CANARY_MIN_SAMPLE` (default 20) requests have hit it. Below that sample the check is inconclusive and
  passes, which is common at today's traffic.

**Automatic rollback.** Any failed gate after the candidate exists routes 100% back to the previous
revision and deactivates the candidate. It is a traffic change, not a rebuild: seconds.

**Manual rollback.** **Actions → Rollback (Azure)**, `environment: production` (the input defaults to
`staging`, which is retired). With `revision` empty it lists the traffic split and recent revisions; with
a name it re-activates that revision if needed, waits for it to be healthy, then routes 100% to it.

`CANARY_DISABLED=true` skips the canary (straight to 100%). The first deploy onto a placeholder image
skips it too.

### 2c. Migrations: expand → migrate code → contract

During a canary the old and new revisions run together on one database, and a rollback runs an older
revision against the **current** schema. So every migration must work with the revision beside it.

- **Mechanics are CI-enforced** (`src/prisma/migration-safety.spec.ts`, `CONTRIBUTING.md` §3): no
  table-rewriting `ADD COLUMN`, indexes `CONCURRENTLY`, re-runnable drops.
- **Ordering is enforced in review:** never rename or drop in place. Add the new column (nullable), ship
  code that writes both and reads new-then-old, backfill, ship code that uses only the new one, and drop
  the old column in a later release.
- Before a manual rollback, check the migrations shipped since the target revision.

### 2d. Staging (retired)

Azure allows this subscription one Container Apps environment in South Africa North, so staging was
retired on 2026-09-25 (`infra/azure/README.md` § Destroy staging). The `APP_ENV=staging` tier in
`apps/api/src/config/env.ts` (prod-shaped, with only the launch-hygiene guards relaxed) and the
`staging` options in the Azure workflows remain for when it returns. Bringing it back needs a quota
increase first. Until then, vendor-free QA and load tests run on a local stack
(`AZURE-OWNER-RUNBOOK.md` §8, `apps/api/load/README.md`).

---

## 3. The GitHub process

### 3a. Branch and merge model

- **`main` is always deployable.** Short-lived branches, squash-merged by PR.
- Claude-authored PRs merge once CI is green with no unresolved review comments (`CLAUDE.md`).
- `.github/CODEOWNERS` routes money, auth, infra, contract and workflow paths to their owner, and
  `.github/pull_request_template.md` asks for risk, rollback and migration notes.
- Branch protection on `main` (required checks, linear history, no force push) is a repo setting. Its
  current state is not visible from the repo.

### 3b. Environments

| Environment | Used by | Gate |
|---|---|---|
| `production` | `release-azure.yml`, `rollback-azure.yml`, `deploy-admin-azure.yml`, `dns-bind-azure.yml`, the Cloudflare deploys | `main` only; Azure's federated credential is bound to it |
| `production-mobile` | `mobile-release.yml`, `mobile-ota.yml`, `mobile-submit.yml` | should carry a required reviewer, the only human gate on OTA (open: `PLAY-STORE-SUBMISSION.md` §9) |
| `infra` | `terraform-apply-azure.yml` | the owner approves the plan, then the apply |

CI holds no Azure secret: every Azure workflow signs in with OIDC.

### 3c. Workflow topology

```
ci.yml                 PR + push   typecheck · build · test · schema · security · design freeze · doc links
release-azure.yml      push→main   build → migrate → 0% revision → smoke → canary → promote   (env: production)
rollback-azure.yml     manual      route 100% to a named revision                             (env: production)
deploy-autoheal.yml    on failure  retries a failed deploy, then opens a deploy-failure issue
mobile-release.yml     manual      EAS build → submit to the profile's track            (env: production-mobile)
mobile-ota.yml         manual      eas update → branch (JS-only)                          (env: production-mobile)
```

Deploys serialise through `concurrency` groups and never cancel each other. Self-healing is described in
[`DEPLOYMENT-AUTOHEAL.md`](DEPLOYMENT-AUTOHEAL.md).

### 3d. Release train and versioning

`release-please.yml` keeps a release PR open from Conventional Commits. Merging it bumps the app
`version`, writes `apps/mobile/CHANGELOG.md` and tags `vX.Y.Z`. The API and app version independently;
the min-supported-app-version (§1c) is the link between them. Tags pushed with the default token trigger
no workflow, and the tag trigger stays gated (§1b) until the production train opens.

### 3e. Operating it

- **Rollback cheatsheet:** API → §2b. App binary → halt the rollout in Play Console. App JS → republish
  the previous OTA (§1a). Incident steps: [`IR-RUNBOOK.md`](IR-RUNBOOK.md).
- **Health:** **Actions → Azure Diagnose** prints `/healthz`, revisions and traffic, certificates, job
  results and Key Vault reference errors.
- **Secrets:** [`SECRET-ROTATION.md`](SECRET-ROTATION.md). Rotate the Play service-account key and
  `EXPO_TOKEN` with the rest; Azure access needs no stored key.
