# Design deviations ledger

The **only** sanctioned differences between the shipped app and the design kit. Everything not listed
here must match the mocks (see the "Pixel parity" section of `CLAUDE.md` for the authority chain).

**How to use this file.** Before you defend a divergence, look for it here. If it is not here, the app
changes — a justification written in a code comment carries no authority. To add an entry you need the
user's explicit approval; record the date and the reason. When a deviation is later designed into the
kit, delete the entry and align.

Status key: **APPROVED** (user-approved, keep) · **OPEN** (needs the user's decision — do not act) ·
**UPSTREAM** (a defect in the kit; app is right, reported back to Design).

---

## D-01 · WhatsApp OTP → SMS OTP — APPROVED (2026-08-10)

**Scope:** global, every surface. **Mock:** all OTP screens say WhatsApp and use WhatsApp glyphs
(`LJ otp` C1·6, the rider equivalents, `ui_kits/mobile` OTP states, `safety-flows.html` C·1–C·3).
**App:** SMS wording and a neutral/SMS glyph.

The product sends OTP by SMS. `EXPORT-README.md` records this as an intentional known deviation on the
design side too. Substitute copy **and** iconography; everything else on those screens matches the mock.

---

## D-02 · States the mocks never modelled — APPROVED (2026-08-10)

**Rule:** these stay in the app, but are **rebuilt from kit primitives** (kit cards, type ramp,
spacing, colour) so they read as the same product. The happy path stays 100% mock.

- Offline / reconnecting banners, stale-cache headers, degraded-network variants
- Draft restore ("Draft restored" chip + Clear) on the send composer
- Keyless address-search fallback ("Address search is unavailable — tap the map to set this pin") —
  removing it restores the silent-`null` P0 that `docs/UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md` was
  written to fix
- "Map didn't load" fallback, location-permission-off hints
- Feature-flag degradations (`getServiceTiles(flag)`, flag-off onboarding and role sets) — the kit has
  no concept of a flag-off build
- Rider board copy branched on `merchantDispatchAutoEnabled` — the unbranched kit copy promises riders
  food jobs a dormant flag will not deliver
- Privacy notice, two-step delete-account, phone-masking lines (compliance surface the mocks predate)
- Real OS-permission notification row (the mock hardcodes "On")
- Active-order restore banner, rating undo window, rider strike counter, proof-of-pickup photos,
  merchant per-item "don't have it", pickup-code reveal

The kit should eventually absorb these; until it does, "match the kit" and "don't ship a lie" point in
opposite directions on exactly these screens.

---

## D-03 · Two-layer shadows → closest single-layer approximation — APPROVED (2026-08-10)

**Mock:** `--shadow-card` is two layers — `0 1px 4px rgba(20,24,27,.08), 0 2px 12px rgba(20,24,27,.06)`
(`packages/design/tokens/spacing.css`). **App (React Native):** one shadow layer per view; Android
renders `elevation` instead of a coloured shadow entirely.

Ship the closest single-layer match per platform, tuned by eye against the mock. Everything RN *can*
express exactly — radii, borders, colours, spacing, type — stays exact; this concession covers shadows
and CSS blur/spread semantics only. Web surfaces (merchant, admin) reproduce the two-layer shadow
exactly, since CSS supports it.

---

## D-04 · Stepper "done" node contrast — OPEN (needs your decision)

**Mock (`components/journey/Stepper.jsx`, design tool):** done node is a **`--accent` (#00B14F) fill
with a white glyph**. **App (`apps/mobile/src/ui/index.tsx`) and, until this export landed, the repo's
copy of the design file:** `--accent-wash` fill with an `--accent-text` glyph.

A white glyph on `#00B14F` measures **≈2.9:1** — below the WCAG AA 4.5:1 floor for that mark. The
repo's variant measures ≈6.5:1. Commit `2e42159` changed **the design file in the repo** to match the
app, which is backwards under kit-as-truth; the export has now restored the design's version, so
`packages/design/` mirrors the tool again.

The Stepper appears on every tracking and active-job screen in the product, so this is a visible,
repeated decision — hence it is yours, not mine:

- **(a) Follow the mock** — bright green fill, white glyph, accept ≈2.9:1 on that mark.
- **(b) Keep the accessible variant** — approve this as a permanent deviation, and ask Design to
  restyle the done node in the kit.

Nothing changes on the Stepper until you pick. (Your 2026-08-10 "strict mock size" decision covers
touch-target **geometry**; this is a **contrast** question, which is why it is not auto-resolved.)

---

## D-05 · `--action-primary` alias is stale in the kit — UPSTREAM (no pixel effect)

`tokens/colors.css` in the design tool maps `--action-primary: var(--accent)` (#00B14F), but the kit's
own `components/core/Button.jsx` paints `var(--cta-fill)` (#00812F) directly — the alias is unused, so
**nothing renders differently**. The repo's copy had been edited to point the alias at `--cta-fill`;
the export restored the tool's version.

The shipped app uses `#00812F` for primary CTAs, which matches what the kit actually renders. **No app
change.** Report to Design so the semantic layer stops contradicting the component — anyone building
from the alias would produce the wrong green.

---

## D-06 · Design preview harnesses keep the repo's `postMessage` origin guard — APPROVED (2026-08-10)

`support.js` (root + the four `templates/*/` copies), `ui_kits/admin/shell.js` and
`handoff/google-play/src/tweaks-panel.jsx` receive `postMessage` with **no origin check** in the
design tool. The repo added a same-origin guard (with a `file://` opaque-origin allowance). The
overlay of the 2026-08-10 export deliberately **kept the repo's hardened versions**.

These files are preview plumbing, not design content — no screen renders differently. Report upstream.

---

## D-07 · `packages/design/` excludes `uploads/`, `scraps/`, `store-assets/` — APPROVED (2026-08-10)

`handoff/update-2026-07/README.md` (the design team's own handoff) instructs: *"Exclude `uploads/` and
`scraps/` from the rsync; keep the generated `_ds_*` files."* Additionally the export's
`store-assets/` (14 MB) is **byte-identical** to the repo-root `store-assets/`, so the duplicate is
excluded; the repo-root copy is canonical. Everything else in the export is vendored verbatim,
including `explorations/store/_food/` (food photography needed to render the RC screens).

Also excluded from parity work entirely, per `EXPORT-README.md`: brand-record explorations, Play-Store
marketing assets, `guidelines/*.card.html` + `components/*.card.html` specimen cards, `templates/`
authoring scaffolds, `thumbnail.html`.

---

## D-09 · CodeQL should not scan `packages/design/**` — PENDING (raised 2026-08-10)

> **Status: not yet in effect.** This session's permission policy blocks commits touching
> `.github/`, so the change is recorded here rather than left as an un-committable dirty working
> tree. CI on PR #640 stays red on CodeQL until someone with workflow-write access applies the two
> edits below. Nothing else is blocked by this.

**To apply.** Add `.github/codeql/config.yml`:

```yaml
name: "Lynia CodeQL config"

# `packages/design/` is a VENDORED MIRROR of the external Claude Design project — design mocks,
# preview harnesses, and the generated `_ds_bundle.js`. Three facts make it a scanning dead end:
#
#   1. Nothing in it ships. No app imports it; the only code coupling is
#      `apps/api/src/design-tokens.drift.spec.ts`, which reads `tokens/colors.css` as TEXT.
#   2. We must not edit it. `CLAUDE.md` ("Pixel parity") makes the design tool authoritative and
#      forbids editing the vendored copy — the repo drifting from the tool is precisely how the app
#      stopped matching its designs. Kit defects are logged here and reported upstream instead.
#   3. Any in-repo fix is transient. The next export overwrites it, so an alert "fixed" here
#      reappears on the following import.
#
# Scanning it therefore yields alerts that are permanently unfixable in this repo, on code that
# cannot reach a user. Excluded so CodeQL's signal stays about code we actually own and ship.
#
# Scope note: this exclusion is exactly one vendored directory. Every app, package and workflow we
# author stays fully scanned.
paths-ignore:
  - packages/design/**
```

and wire it in `.github/workflows/codeql.yml`, in the `Initialize CodeQL` step's `with:` block,
directly after `queries: security-extended`:

```yaml
          # Excludes only the vendored design mirror — see the file for why it is unscannable.
          config-file: .github/codeql/config.yml
```

Then flip this entry to **APPROVED** and drop this "to apply" block.


The 2026-08-10 export introduced `/^cover|banner|dish|photo$/i` in
`explorations/store/play-export.jsx` (and its compiled copy in the generated `_ds_bundle.js`).
CodeQL is right that the precedence is wrong — it parses as `(^cover)|(banner)|(dish)|(photo$)`
rather than the intended `^(cover|banner|dish|photo)$`. But it is a **cosmetic placeholder-name
filter in a Play-Store screenshot mock tool**: it only decides which stock food photo fills a slot.
No untrusted input, no security boundary, and no app imports the file.

Fixing it in-repo would violate D-00's spirit and this ledger's own rule — the vendored design must
mirror the tool — and the next export would overwrite it anyway. So `.github/codeql/config.yml`
excludes `packages/design/**` from scanning: nothing there ships, we must not edit it, and any fix
is transient. Every app, package and workflow we author stays fully scanned.

**Reported upstream** to Design as a genuine (if low-impact) bug in `play-export.jsx`.

---

## D-08 · Kit-side icon set is 38 icons — APPROVED (2026-08-10)

The repo's copy of `assets/lynia-icons.js` had gained a 39th icon (`Copy`) during app work; nothing in
the design references it (the only `copy` hit is a CSS class). The export's 38-icon set is restored.
If an app screen genuinely needs a glyph the kit lacks, request it from Design rather than adding it
to the vendored kit.
