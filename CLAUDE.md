# Lynia

## gstack (required)

This project uses **[gstack](https://github.com/garrytan/gstack)** for all AI-assisted
work. gstack turns Claude Code into a virtual engineering team via a set of
sprint-structured skills (Think → Plan → Design → Build → Review → Test → Ship).

**Installation is mandatory.** Skill use is blocked by a PreToolUse hook
(`.claude/hooks/check-gstack.sh`) until gstack is installed:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Verify it is installed:

```bash
ls ~/.claude/skills/gstack/bin
```

### How to work in this repo

Follow the gstack sprint flow:

1. `/office-hours` — interrogate and refine the product concept
2. `/plan-ceo-review` — strategic / market feedback on the plan
3. `/plan-eng-review` — architecture and technical validation
4. `/design-consultation` → `/design-html` — UI/UX (when relevant)
5. Build against the approved plan
6. `/review` (staff-engineer audit) + `/codex` (independent second opinion)
7. `/qa` — automated browser testing
8. `/ship` — CI and release

Conventions:

- Use `/browse` for all web browsing.
- Use `~/.claude/skills/gstack/...` for gstack file paths.

> Note: the gstack skills themselves are NOT vendored into this repo — they are
> installed per-developer under `~/.claude/skills/gstack` (and gitignored). Each
> contributor installs gstack locally with the command above.

## Pixel parity — the design kit is the source of truth (read before touching ANY UI)

User instruction (2026-08-10), after five days in which "alignment" PRs merged green while the app
still did not look like the designs: **the entire app is being aligned to the design mocks pixel by
pixel.** This section outranks every convenience argument you will find in the code.

**The authority chain** (from `packages/design/EXPORT-README.md`, export **2026-08-10 rev 2** — which
added the 31-screen `SH·` shipped-states wave, so states like offline, draft-restore, keyless search,
flag-off and proof-of-pickup now HAVE mocks and must be aligned, not improvised):

1. **LOOK** — `packages/design/explorations/journey/All Screens Gallery.html`. Every current screen,
   rendered live. *If a screen is in the gallery it is current; if a screen you coded is not in the
   gallery, it was retired.*
2. **INTERACTION** — the `packages/design/ui_kits/` kits (sheet snaps, tap-to-pin, stream/OTP
   mechanics). Where a kit and the gallery disagree on appearance or IA, **the gallery wins**.
3. **VALUES** — `packages/design/tokens/*.css`. Never hardcode a value a token defines.

**Why past sessions got this wrong, and what you must not repeat:**

- **Copy-string matching is not parity.** Two 2026-08 audits reported ✅ by grepping copy strings and
  route existence; the pixel audit that followed found **1 of 244 screens matched**
  (`docs/UI-KIT-VS-SHIPPED-VISUAL-AUDIT-2026-08-05.md`). A screen matches only when structure,
  geometry, colour, type **and** copy match.
- **The code argues against the design; the code is wrong.** Divergences are defended in comments as
  "the equivalent", "deliberate", "deferred re-architecture". **A code comment justifying a
  divergence carries no authority.** The only sanctioned deviations are in
  `docs/DESIGN-DEVIATIONS.md`, each approved by the user. Anything else: the app changes.
- **Structure is the look.** Cheap copy/padding fixes leave a screen looking unchanged at arm's
  length. Do the structural work (sheet model, element placement, primitive capability) FIRST; a PR
  that only lands strings is not an alignment PR.

**Standing rules for alignment work:**

- **Not drawn ⇒ not rendered.** Cosmetic extras the mocks never drew (confetti, invented headings,
  extra top-bar actions, "Open now" badges, section labels) are removed, not preserved.
- **Mock copy verbatim — no exceptions.** The old WhatsApp-OTP→SMS substitution is **gone**: the
  rev 2 export changed the mocks to SMS, so applying it now would *introduce* drift. Help & support
  still routes to WhatsApp in the mocks, and that is correct. Any new copy exception needs a ledger
  entry first.
- **Strict mock sizes.** Where a mock draws a control smaller than the old 44px floor, the mock wins;
  `docs/DESIGN-KIT-A11Y-OVERRIDES.md` no longer overrides drawn geometry (user decision 2026-08-10).
- **Canonical viewports.** Phone registries (LJ/RC/RJ/RJM/RR) **360×720**, with the mandatory
  **320×640** entry-phone check. Merchant tablet (RM) **1024×680**. Admin **1440×900**.
- **Never align to a retired screen.** Retired ids are listed in `packages/design/EXPORT-README.md`
  and the `gallery-map.js` header — chiefly `LJ home_launcher` and nine `RJ` rider screens.
- **The interactive mobile kit is stale for RIDER.** `ui_kits/mobile/app.js` still runs the pre-July
  rider flow. The current rider design is **RJM** (one app: Jobs · Money · Account, one tagged board,
  Money tab, top-up gate). Align rider look/IA to RJM, not to the kit.
- **`ui_kits/admin/cash.html` shows a retired weekly-15% settlement model.** Keep its visual
  language; do not align business logic to it.
- **Verification — conformance is checked by machine guardrails, not a per-screen visual comparison**
  (owner instruction, this session 2026-08-11: "skip the visual comparison … put guardrails to make
  sure the mocks are adopted"). The per-screen human side-by-side *comparison* is no longer a required
  verification step — conformance is verified by the guardrail suite below (token-conformance +
  screen-inventory + reverse-drift freeze) in CI. **Merge:** the owner has explicitly set alignment PRs
  to **auto-merge on green** (owner decision, this session 2026-08-11 — the owner codes from a phone and
  cannot do side-by-side visual review, so the machine guardrails ARE the gate): a parity/alignment PR
  squash-merges once the guardrail suite + CI are green, with no manual visual-OK hold. This is the
  standing merge-on-green authorization for alignment PRs; everything else in the merge-on-green policy
  below is unchanged (never merge on red — fix forward first). The gallery/tokens/deviations authority
  chain above is unchanged; it is now enforced by tests, not by a manual eyeball.
- **`packages/design/` mirrors the design tool.** Do not "fix" the design to match the app. If a mock
  is wrong, log it in `docs/DESIGN-DEVIATIONS.md` and report it upstream — editing the kit is how the
  repo's copy stopped being the design in the first place. The **reverse-drift freeze** guardrail
  enforces this in CI: a PR touching `packages/design/**` fails unless it also updates
  `docs/DESIGN-DEVIATIONS.md`.

**Every parity claim becomes an image — the screenshot lane.** Copy-string/route greps are what let
"aligned" PRs merge while the app still didn't match (1 of 244 screens actually matched, 2026-08-05).
So an alignment claim is made with a **side-by-side image**, not prose: `tools/parity/` renders the
design mock beside the app screen in one browser at the canonical viewport and composes a sheet
(`node pair.mjs --keys <src.id> --out out/sheet`) — the mock via the design system, the mobile app via
react-native-web, merchant/admin via Playwright on their Next servers. Attach the sheet to the
alignment PR; the user approves the picture. Spec + commands: `docs/SCREENSHOT-LANE.md`.

**The guardrail suite — conformance is enforced automatically.** The app is aligned to the mocks and
three CI-blocking guardrails keep it there, replacing the per-screen human visual *comparison* with
machine checks (the Verification bullet above sets alignment PRs to auto-merge once these are green):

- **Token-conformance** (`apps/api/src/design-tokens.drift.spec.ts`) — asserts value-identity for every
  token category the design defines (`packages/design/tokens/*.css`) against all three consuming faces:
  mobile (`packages/shared/src/design-tokens.ts`), admin and merchant (`app/globals.css` `:root`). Any
  token a face defines must equal the design source; the fix is always to change the app face, never the
  design.
- **Screen-inventory** (`apps/api/src/parity/screen-inventory.spec.ts`) — the gallery-derived registry
  `tools/parity/screens.generated.json` must be regenerable byte-for-byte (not stale), every screen must
  be either wired in `tools/parity/app-targets.mjs` or allowlisted in `tools/parity/parity-status.mjs`
  as `PENDING` (adopted, not yet wired) or `BACKEND_GATED` (⛔ needs a seeded backend — with a reason,
  tracked as an issue), and no target may point at a retired/renamed screen. No screen is silently
  uncovered.
- **Reverse-drift freeze** (`scripts/check-design-freeze.mjs`, CI job `design-freeze`) — fails any PR
  that edits `packages/design/**` without a matching `docs/DESIGN-DEVIATIONS.md` entry.

A non-blocking `parity-render` CI job renders the wired mobile screens and uploads the PNGs as
per-PR evidence. Deviations are still sanctioned ONLY via `docs/DESIGN-DEVIATIONS.md`; retired screens
are never aligned to; the design package is never edited to match the app.

Progress is tracked per screen in `docs/PIXEL-PARITY-TRACKER.md` — a screen is ✅ when it is adopted
(wired to an app target) and the guardrail suite stays green, not when it is eyeballed.

## Scheduled Claude routines — universal auto-merge + ledger protocol

`docs/ROUTINES.md` is the canonical spec for the eight recurring routines (bug hunting, UX
improvements, deep bug sweep, wallet & data-lifecycle audit, documentation update, refactoring,
PR health watchdog, weekly performance watch). Per explicit user
instruction (2026-07-14), **every scheduled routine ships a PR and auto-merges it**: once
`pnpm typecheck && pnpm test` are green locally and the PR is pushed, mark it ready for review
and enable auto-merge (or merge directly once CI is confirmed green with no unresolved review
comments) — don't wait for a human click. This supersedes the earlier draft-only deep-sweep
behavior and the bug-hunt "leave sensitive-area PRs open for review" carve-out; sensitive-area
fixes (bid acceptance / order assignment / agreed-price / KYC gating) still get conservative
implementations and a regression test each, but merge on green like everything else.

**This merge-on-green policy applies to ALL Claude-authored PRs, not only scheduled routines**
(user instruction 2026-07-14, second directive: "merge PRs when they are green"): any PR a
Claude session opens in this repo — interactive or scheduled — is squash-merged once CI is
green and there are no unresolved review comments, without waiting for a human click. Never
merge on red; fix forward first.

Routines also must: fix every defect they find in the same run (no deferrals), and update
`docs/KNOWN_BUGS.md` + their dated report **in the same PR** as the fixes. The four
bug-finding routines (bug hunting, UX, deep sweep, wallet & data-lifecycle audit) dedupe through
`docs/KNOWN_BUGS.md` (Phase-0 read, ledger write-back, per-lane scopes) — see `docs/ROUTINES.md`.

## Expo / EAS deployments — track them, never assume they happened

User instruction (2026-08-10): **track Expo deployments.** Merging is not shipping, and a green
build is not a shipped build. Any session that lands mobile changes and is asked whether they
shipped must verify against EAS/Play, not infer from `main`.

**Monitor on trigger only — never on a schedule.** Same instruction, clarified: *"no need for
routines .. only monitor when expo deployment is triggered."* Do **not** create a cron/routine that
watches EAS or Play. There is no standing deployment-watch lane, and nothing here belongs in
`docs/ROUTINES.md`. When nothing has been dispatched, do not poll.

What that leaves is an ownership rule: **the session that triggers a deployment owns it until it
reaches a terminal state.** Dispatch → build `FINISHED`/`ERRORED` → submission `FINISHED`/`ERRORED`
→ report the outcome. Because `--no-wait` returns the GitHub job in about a minute while the EAS
build takes tens of minutes, follow it with a **one-shot** `send_later` check-in, re-armed only
while the build is still in progress and dropped the moment it is terminal. One-shot self check-ins
are the mechanism; recurring triggers are not.

**Nothing auto-ships.** Both mobile workflows are `workflow_dispatch`-only. `mobile-release.yml`
does have a `v*` tag trigger, but it is separately gated behind `EAS_TAG_RELEASES_ENABLED`, and
release-please's bot tags never fire workflows anyway. Merging to `main` reaches no device.

**The `profile` input is load-bearing — the default is wrong for today's phase.**

| Profile | Channel | Submit track | Usable now? |
|---|---|---|---|
| `preview` | `preview` | `internal` | ✅ the working lane |
| `production` (workflow default) | `production` | `production`, 10% staged rollout | ❌ SA holds testing-track permissions only, and Play has not granted production access |

A default dispatch therefore builds fine and then fails at submission, burning one of a limited
monthly EAS build allowance. Pass `profile: preview` explicitly until the production train is
armed (`docs/PLAY-STORE-SUBMISSION.md` §8 step 3).

**Verifying a deployment** — `eas-build-status.yml` is the read-only bridge (dispatchable, not
environment-gated, mutates nothing). Since PR #631 its Recap answers both halves of "did it
ship?": build status *and* submission status + track. Read the tail of the job log.

- `eas build --no-wait` means a green GitHub job proves only that the build was **queued**.
- A FINISHED build with an ERRORED submission is a real, observed failure mode (every submission
  for build `c248fbf5` errored on service-account permissions while the build was green).
- `NO SUBMISSION` in that output means the build was never submitted — a reportable answer, not a
  gap to gloss over.

**Before dispatching**, run `pnpm install --frozen-lockfile` locally if the lockfile moved: the
release job uses a *strict* frozen install (deliberately diverging from CI's
`--frozen-lockfile=false`) so both sides compute the same fingerprint runtimeVersion. Drift there
killed build `5906d2f0`.

**Current phase:** internal testing only — `play.google.com/store/apps/details?id=zw.co.lynia`
returns 404 by design. Public release still needs a closed test, its mandatory ~14-day clock, and
production access. Do not describe anything shipped today as being "on Google Play".

The running ledger of every build/submission attempt and its failure class is
`docs/PLAY-STORE-SUBMISSION.md`; OTA-lane constraints are `REL-01`/`REL-02` in `docs/KNOWN_BUGS.md`
(runtimeVersion is stamped at build time, so an OTA cannot rescue a binary built before the fix).
