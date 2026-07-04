# Lynia design-system → GitHub / Claude Code handoff

Your repo **unnfazzed/Lynia** already vendors this design system at `packages/design/`, and
your apps (`apps/mobile`, `apps/admin`) consume its tokens through
`packages/shared/src/design-tokens.ts`. So this is an **update-in-place**, not a new
integration.

Important: Claude Code (web) works from a **connected Git repo**, not an uploaded zip.
You can't hand it a zip — you get the refreshed files into the repo first, then let Claude
Code do the app-side code changes. Here's the flow.

## Step 1 — Get the refreshed design files into the repo

The design system IS this project. Download it (the "Lynia design system (drop-in)" card)
and copy its contents over `packages/design/` in a local clone of `unnfazzed/Lynia`:

```bash
git clone git@github.com:unnfazzed/Lynia.git
cd Lynia
git checkout -b design/refresh

# unzip the download, then copy its contents into packages/design/
# (it is shaped exactly like packages/design/ — tokens/, components/, assets/,
#  guidelines/, templates/, ui_kits/, styles.css, and the generated _ds_* files)
rsync -a --delete /path/to/unzipped/ packages/design/

git add packages/design
git commit -m "design: refresh LyniaGo design system"
git push -u origin design/refresh
```

> Exclude `uploads/` and any `scraps/` if present — those are scratch, not part of the package.
> Keep the generated `_ds_bundle.js` / `_ds_manifest.json` / `_adherence.oxlintrc.json` — the
> UI-kit previews load them.

## Step 2 — Run Claude Code on that branch

Open Claude Code (web) with `unnfazzed/Lynia` connected, on the `design/refresh` branch,
and paste the contents of **`CLAUDE-CODE-PROMPT.md`**. It will:

- reconcile `packages/design/tokens/*.css` ↔ `packages/shared/src/design-tokens.ts`,
- bring the `apps/mobile` and `apps/admin` primitives back to parity with
  `packages/design/components/`,
- keep `docs/DESIGN.md` in sync,
- and list the app-logic tickets the design implies as separate PR follow-ups.

## Step 3 — Verify & open the PR

```bash
pnpm install
pnpm build       # turbo — must be clean
pnpm typecheck
pnpm lint
```

Then open the PR from `design/refresh`. Use the ticket checklist Claude Code produced as
the PR body's follow-up section.

---

## Files in this handoff folder

- **CLAUDE-CODE-PROMPT.md** — paste this into Claude Code (the actual work order).
- **design-tokens.ts** — the token mirror, verified in-sync with this project's
  `tokens/*.css`. Reference / drop-in for `packages/shared/src/design-tokens.ts` if you
  want to be certain it matches.
- **CHANGES.md** — what to reconcile and how to confirm parity.

## The one thing to remember

`tokens/*.css` (CSS vars) and `design-tokens.ts` (TS) are two faces of one system. Change
a token in one, change it in the other — or the apps drift from the design. As of this
handoff they're already identical.
