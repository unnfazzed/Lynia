# lyniago.com: the marketing website

The public website at **https://lyniago.com** is a single static page for customers (send a parcel),
businesses (onboard on WhatsApp) and riders (sign up). It is hosted on **Cloudflare Workers**
(static assets) and deploys from `main`.

## The rule: ship the handoff as-is

> Owner instruction, 2026-09-28: *"use the handoff assets dont change the design to match some rules
> in github. for the website apply as is"*

The design team's handoff is the complete spec for this site. The app's design machinery (the
gallery, token conformance, tap-target floors, `DESIGN-KIT-A11Y-OVERRIDES.md`) **does not apply
here**. Never edit the website's HTML, CSS, copy, fonts or images to satisfy a repo rule, a review
or a linter. When something should change, it comes back as a new handoff export.

`scripts/check-website.mjs` enforces this in CI (job `website`). The deployed files must be
byte-identical to the handoff, except for:

- the owner-approved **launch edits** (`LAUNCH_EDITS` in that script, ledger entry **D-42** in
  `docs/DESIGN-DEVIATIONS.md`);
- the allowlisted **extra files**: `404.html`, `_headers`, `robots.txt`, `sitemap.xml` and
  `assets/og-image.png`.

## Where things are

| Path | What |
|---|---|
| `packages/design/handoff/lyniago-website/` | The handoff, **verbatim**: `README.md` (the spec), `CLAUDE-CODE-PROMPT.md`, `reference/LandingPage-reference-offline.html` (the approved design with every asset inlined) and `site/`. Current export: 2026-09-28, the "mobile optimisation" revision. |
| `apps/website/site/` | The deploy root: the handoff's `site/` plus the launch edits and extra files. |
| `apps/website/wrangler.jsonc` | The site Worker (`lyniago-website`): assets only, Custom Domain `lyniago.com`, unknown paths get `404.html`. |
| `apps/website/www-redirect/` | The `lyniago-www-redirect` Worker: `www.lyniago.com/*` → 301 → `https://lyniago.com/*`. |
| `apps/website/site/_headers` | Cache and security headers (below). |
| `apps/website/og-image/` | Source and renderer for `assets/og-image.png`, built to the handoff README's TODO #2 spec. |
| `apps/website/smoke.sh` | Post-deploy checks: the page is byte-identical to the repo, every asset loads with the right type and cache header, `/about` is a 404, and `www` and `http` redirect. |
| `scripts/check-website.mjs` (+ `.test.mjs`) | The CI guard. `--write` regenerates `404.html` and the CSP hashes. |
| `tools/website-parity/` | Pixel harness: renders the reference and the site (local or live) at the QA widths and diffs them. |
| `.github/workflows/deploy-website.yml` | The deploy: check → `wrangler deploy` (both Workers) → smoke. |

## Launch decisions (the handoff README's "Items to finish before launch")

| # | Item | Decision (owner, 2026-09-28) | Status |
|---|---|---|---|
| 1 | Play Store link | Keep `href="#app"` as designed while the listing is closed-testing only (the public listing 404s). | Open: when the app is public, add one `LAUNCH_EDITS` entry per button (the three "Download the app", "Send a parcel" and "Become a rider") pointing at `https://play.google.com/store/apps/details?id=zw.co.lynia` with `target="_blank" rel="noopener"`. "How it works" stays `#riders`. |
| 2 | OG share image | Built to the README spec (green, mark + wordmark, "Stay home. We'll bring it."). | Done: `assets/og-image.png` |
| 3 | About us | Launch without it: `/about` serves the 404 page (header, footer, "Back home"). | Open: needs the owner's copy. Then add `site/about/index.html` with the same header and footer, remove `/about` from `INTENTIONAL_404`, and add the file to `EXTRA_FILES`. |
| 4 | Terms / Privacy | Privacy → `https://api.lyniago.com/legal/privacy` (the live notice); Terms stays `#`. | Terms open until a terms page exists. |
| 5 | Analytics | None. | No trackers, no cookies. |

## Hosting

- **Assets-only Worker.** There is no Worker script for the site, so every request is a free,
  unmetered static-asset request served from Cloudflare's edge (including Harare). Only `www` traffic
  runs a script (the redirect).
- **Caching** (`_headers`, from the handoff README): `/` and `/index.html` get `no-cache`, and
  `/assets/*` gets `public, max-age=31536000, immutable`. Because assets are immutable, **a changed
  asset must get a new file name**. On a PR, CI fails any in-place edit under `site/assets/`.
- **Content types** come from the file extension: `.woff2` `font/woff2`, `.webp` `image/webp`,
  `.svg` `image/svg+xml`. Cloudflare compresses HTML and SVG with brotli or gzip. The files are never
  re-encoded.
- **Security headers** on every response: `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options: DENY`, `Permissions-Policy`, HSTS (one year, apex only), and a CSP whose
  `script-src` lists the hashes of the page's inline scripts (kept current by `check-website.mjs`).
- **One canonical host:** `https://lyniago.com`. `www` redirects there with a 301. Plain `http`
  redirects too, through the zone's *Always Use HTTPS* setting.
- The app hostnames (`api.`, `admin.`, `merchant.lyniago.com`) are unaffected. They remain DNS-only
  records pointing at Azure (`docs/CLOUDFLARE.md`).

## One-time setup (owner)

Done once; after that every merge that touches `apps/website/` deploys by itself.

1. **Create the deploy token.** Cloudflare dashboard → **Manage Account → Account API Tokens →
   Create Token** → the **Edit Cloudflare Workers** template.
   - Account Resources: your account.
   - Zone Resources: **Specific zone → lyniago.com**.
   - **Continue → Create Token**, then copy it. It is shown only once.
2. **Copy your account ID.** Cloudflare dashboard → **lyniago.com → Overview** → *API* panel on the
   right → **Account ID**.
3. **Store both in GitHub.** In Cloud Shell:
   ```bash
   bash -c 'gh auth status >/dev/null 2>&1 || gh auth login; gh secret set CLOUDFLARE_WORKERS_API_TOKEN --env production -R unnfazzed/Lynia && gh variable set CLOUDFLARE_ACCOUNT_ID -R unnfazzed/Lynia -b "PASTE_ACCOUNT_ID"'
   ```
   `gh secret set` prompts for the token; paste it there, not on the command line. Or use the web:
   repo **Settings → Environments → production → Add environment secret**
   (`CLOUDFLARE_WORKERS_API_TOKEN`), then **Settings → Secrets and variables → Actions → Variables →
   New repository variable** (`CLOUDFLARE_ACCOUNT_ID`).
4. **Turn on HTTPS redirects.** Cloudflare → **lyniago.com → SSL/TLS → Edge Certificates → Always Use
   HTTPS: On**. This only affects proxied hostnames, so the DNS-only app hosts are untouched.
5. **First deploy.** GitHub → Actions → **Deploy website (Cloudflare)** → **Run workflow** (a Claude
   session can dispatch it). The first run waits up to ten minutes for Cloudflare to issue the
   certificates.

Do not reuse or widen `CLOUDFLARE_API_TOKEN`. That is the DNS-only token for `dns-bind-azure.yml`.

## Deploying, verifying, rolling back

- **Deploy:** merging to `main` with changes under `apps/website/`, `scripts/check-website.mjs` or the
  workflow runs `deploy-website.yml`. You can also run it by hand from Actions.
- **Verify:** the job's last step is `apps/website/smoke.sh`. Run it yourself any time with
  `bash apps/website/smoke.sh`. For a pixel comparison against the approved reference, run
  `node tools/website-parity/compare.mjs --site https://lyniago.com`.
- **Roll back:** revert the commit on `main` (the deploy re-runs), or use Cloudflare → **Workers & Pages
  → lyniago-website → Deployments → Rollback** for an instant switch to the previous version.

## Updating from a new handoff export

1. Replace `packages/design/handoff/lyniago-website/` with the new export, wholesale.
2. Copy its `site/` over `apps/website/site/`. Keep `404.html`, `_headers`, `robots.txt`,
   `sitemap.xml` and `assets/og-image.png`.
3. Re-apply the launch edits. If an edit's `from` text changed in the new export, update `LAUNCH_EDITS`
   (and D-42).
4. **Assets:** if the export changed a file under `site/assets/` but kept its name, the
   immutable-asset check fails the PR. Returning visitors' browsers would otherwise keep the old file
   for a year. Ask Design to re-export that asset under a new name. The handoff copy stays verbatim, so
   the fix never happens on this side.
5. Run `node scripts/check-website.mjs --write`, then `node --test scripts/check-website.test.mjs`.
