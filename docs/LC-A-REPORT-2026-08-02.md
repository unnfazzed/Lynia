# LC-A report — 2026-08-02 (size & data diet)

First LC-A increment. Audit territory `A-T2` (dependency/import-graph audit of `apps/mobile`)
swept this run; `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane A ticked. Zero
functional defects found — this territory turned up bundle-weight optimizations, which the
program's audit/optimize split routes to the Lane A optimization checklist (`A-O11`, `A-O12`)
rather than fixing unattended this run. No code changed in this PR; docs only.

## Method

Installed workspace deps (`pnpm install --frozen-lockfile`), built `@lynia/shared`, and ran a real
`pnpm exec expo export --platform android` baseline to ground the audit in the actual measured
bundle rather than source-line guesses:

```
Android export total : 7.13 MiB (7,476,013 bytes)  | budget 7.49 MiB | headroom 4.8%
Hermes JS bundle      : 6.13 MiB (6,431,313 bytes)  | budget 6.16 MiB | headroom 0.4% (23.7 KB)
```

Hermes headroom is razor-thin (0.4%) — any further dependency-drift PR risks tipping the guardrail
red before LC-A's own optimize-mode firings get a chance to diet it down. That context raised the
bar for this sweep: confirm real candidates with evidence, not vibes.

Then, per A-T2's scope (heavy libs, duplicate capabilities, unused deps, remaining barrel
imports):

1. **Verified the two Day-0-seeded candidates** by tracing their actual reachability and usage.
2. **Swept all 30 direct `apps/mobile/package.json` dependencies** for zero-import packages, and
   for each zero-import hit, checked whether it's transitively required (native autolink / config
   plugin) before calling it dead weight.
3. **Checked known barrel-import risk spots** (icon library, font package, `packages/shared`'s
   other exports) for the same per-symbol-vs-whole-module pattern A-T1 already fixed for fonts.

## Confirmed — LC-A03: `@lynia/shared`'s `fixtures.ts` barrel-exported into every consumer, zero production use

`packages/shared/src/index.ts:3` does `export * from "./fixtures"` — a 299-line module of
test-fixture factories (`makeOrder`, `makeWallet`, `makeTopup`, `FIXTURE_IDS`, etc., the roadmap
4.1 shared-fixture module). Because `@lynia/shared` compiles to CommonJS per-file (`tsc`, `module:
node16`) and Metro does not do named-export tree-shaking, importing *anything* from
`@lynia/shared` — which 129 files in `apps/mobile` do — forces Node to evaluate every file `export
*`-reachable from `index.ts`, `fixtures.ts` included, regardless of which specific export the
importing file actually uses.

Checked for any production consumer via `@lynia/shared` across `apps/mobile`, `apps/admin`,
`apps/merchant`, `apps/api`: **none**. The module's only consumer anywhere in the repo is its own
sibling self-test, `fixtures.test.ts` — which already imports it via a relative `./fixtures` path,
not the package barrel. So dropping the barrel re-export costs nothing: no call site anywhere
resolves `makeOrder`/`FIXTURE_IDS`/etc. through `@lynia/shared`.

Appended as `A-O11` (S effort, zero behavior-change risk) rather than fixed here, since this run's
budget is one audit territory, not an optimize-mode increment.

## Confirmed — LC-A04: zod v4's locale-tables barrel rides into the bundle unused

`packages/shared/src/contracts.ts:5` does `import { z } from "zod"`. Zod v4's package `exports`
map resolves `"."` → `zod/index.js`, which re-exports `./v4/classic/external.js` — and that file's
line 14 is:

```js
export * as locales from "../locales/index.js";
```

`zod/v4/locales/` is 872 KB of raw source: full error-message tables for 50 languages (`ar`, `de`,
`fr`, `ja`, `zh-CN`, ... ), each with its own `.js`/`.cjs`/`.d.ts`. This is a static namespace
re-export in zod's own main entry point, not something the importing code opts into — anyone who
does `import { z } from "zod"` gets it pulled into the require/import graph whether or not they use
`z.locales` or ever call `z.config()` with a non-English locale.

Verified zero usage anywhere in the app: `z.locales`, `import ... from "zod/locales"`, and
`"zod/v4/locales"` all grep to nothing outside `node_modules` — the app never sets a non-English
error locale, so this is pure, unconditionally-shipped dead weight riding on top of the legitimate
zod schemas `contracts.ts` genuinely needs.

This one is NOT a simple barrel-export fix on our side (zod is third-party) — appended as `A-O12`
with a suggested approach (Metro `resolveRequest` redirect to a locale-free zod entry, mirroring
the existing `@posthog/core` subpath redirect already in `apps/mobile/metro.config.js`), flagged
S/M effort and highest-likely-impact given the 0.4% Hermes headroom.

## Dependency sweep: no other dead weight found

Checked import counts for all 30 direct dependencies in `apps/mobile/package.json`. Six had zero
direct `import`/`require` hits in `apps/mobile/app` or `apps/mobile/src`:

| Package | Why it's NOT dead weight |
|---|---|
| `@expo-google-fonts/inter` | Imported via per-weight subpaths (`@expo-google-fonts/inter/400Regular`, etc. — `src/ui/fonts.ts`), the exact discipline A-T1 already put in place; bare-specifier grep missed it. |
| `expo-build-properties` | Config plugin (`app.config.ts` plugins list) — runs at `expo prebuild`/EAS build time in Node, never enters the JS bundle regardless of dependency classification. |
| `expo-linking` | Zero direct app import, but is `expo-router`'s own declared dependency (used internally for its deep-link handling) — needed transitively either way; the explicit top-level pin is redundant metadata, not extra bytes. |
| `expo-updates` | No direct `Updates.*` JS call, but wired via `app.config.ts` + `plugins/with-remove-ad-id.js` — this *is* the OTA-update mechanism the whole size program leans on to ship JS-only fixes without a store review. |
| `react-native-screens` | Zero direct import; `expo-router` declares it as its own dependency (native screen optimization used internally by React Navigation) — same transitive-need shape as `expo-linking`. |
| `expo-application` | Zero direct import; both `expo-notifications` and `posthog-react-native` declare it as *their* dependency and use it internally for device/app metadata. |

None of these are actionable removals — each either already avoids the barrel-bloat pattern
(fonts) or is a genuine transitive/native/config-time need that would still ship even without the
redundant top-level `package.json` entry.

Also checked `lucide-react-native` (icon library, the other classic barrel-bloat risk after
fonts): already per-icon (`src/ui/Icon.tsx`, with an explicit comment documenting *why* — importing
`{ X } from "lucide-react-native"` would drag every glyph's bytecode in). No action needed.

## Ledger

- `LC-A03` (LOW, bytes/zero-risk) and `LC-A04` (MEDIUM, bytes) added to `docs/KNOWN_BUGS.md`
  "Day-0 LC sweep" table, both `OPEN → LC-A`.
- `A-O11`/`A-O12` appended to the Lane A optimization checklist in
  `docs/plans/2026-08-01-low-connectivity-program.md` §5, ranked after the existing seeded items
  (queue ordering = priority; both are net-new evidence from this run, not pre-existing KNOWN
  backlog, so they land after the Day-0-seeded `A-O1`–`A-O10`).

## Next firing

`A-T2` is ticked; Lane A's next firing takes the first remaining unchecked item — `A-T3`
(bundled-asset inventory: fonts/images format, compression, necessity, dynamic-load candidates).
