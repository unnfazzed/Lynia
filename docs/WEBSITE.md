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
| `apps/website/smoke.sh` | Post-deploy checks: the page, fetched as a browser would, is byte-identical to the repo, every asset loads with the right type and cache header, `/about` is a 404, and `www` and `http` redirect. |
| `scripts/check-website.mjs` (+ `.test.mjs`) | The CI guard. `--write` regenerates `404.html` and the CSP hashes. |
| `tools/website-parity/` | Pixel harness: renders the reference and the site (local or live) at the QA widths and diffs them. |
| `.github/workflows/deploy-website.yml` | The deploy: check → `wrangler deploy` (both Workers) → smoke. |

## Launch decisions (the handoff README's "Items to finish before launch")

| # | Item | Decision (owner, 2026-09-28) | Status |
|---|---|---|---|
| 1 | Play Store link | Keep `href="#app"` as designed while the listing is closed-testing only (the public listing 404s). | Open: when the app is public, add one `LAUNCH_EDITS` entry per button (the three "Download the app", "Send a parcel" and "Become a rider") pointing at `https://play.google.com/store/apps/details?id=zw.co.lynia` with `target="_blank" rel="noopener"`. "How it works" stays `#riders`. |
| 2 | OG share image | Built to the README spec (green, mark + wordmark, "Stay home. We'll bring it."). | Done: `assets/og-image.png` |
| 3 | About us | Launched without it; then **removed from the footer** (owner, 2026-09-30, `LAUNCH_EDITS` `about-removed`). `/about` still serves the 404 page like any unknown path. | Done. |
| 4 | Terms / Privacy | Privacy → `https://api.lyniago.com/legal/privacy`; Terms → `https://api.lyniago.com/legal/terms` (owner, 2026-09-30, D-49). | Done. |
| 5 | Analytics | None. | No trackers, no cookies. |
| — | Menu buttons stop short on phones (found in review) | Fix it: `width`/`height` on the lazy scooter illustration plus `.biz-ill{height:auto}` (`LAUNCH_EDITS` `biz-ill-*`). | Done. Report upstream so the next export carries it. |

## Search and AI visibility

The plan for ranking lyniago.com in Harare, and for getting it cited by AI assistants, is in
[`seo/`](./seo/README.md). It works within the rule above. Every change it proposes takes one of four
forms:
- a dashboard setting;
- an edit to an allowlisted hosting file (`robots.txt`, `sitemap.xml`, `_headers`);
- an owner-approved, pixel-identical launch edit, such as head tags;
- a new handoff export, for anything visible.

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
- **Deploy tooling** is wrangler, pinned by `apps/website/deploy/package-lock.json`. That lockfile is
  scanned by osv-scanner in CI and kept current by Dependabot. It is installed with
  `npm ci --ignore-scripts` in a step that never sees the token.
- **Known limitations.**
  - `_headers` matches by path, not status, so a 404 for a missing file under `/assets/` also gets the
    one-year immutable header. Deploys are atomic and changed assets get new names, so this only bites
    a URL that never existed. An optional zone Transform Rule (response code 404 → `Cache-Control:
    no-store`) closes it.
  - In CI, wrangler takes over any conflicting DNS record or Custom Domain at `lyniago.com` and
    `www.lyniago.com`, and only there. Keep those two names for this site.
- The app hostnames (`api.`, `admin.`, `merchant.lyniago.com`) are unaffected. They remain DNS-only
  records pointing at Azure (`docs/CLOUDFLARE.md`).

## One-time setup (owner)

Done once; after that every merge that touches `apps/website/` deploys by itself.

1. **Create the deploy token: account-owned, with two permissions only.** Cloudflare → **Manage Account
   → Account API Tokens → Create Token → Create Custom Token**, named `lyniago-website-deploy`:
   - **Workers → Admin**, for all Workers. Admin is needed because the first deploy *creates* the two
     Workers. In the older permission UI this is **Account → Workers Scripts → Edit**.
   - **Zone → Workers Routes → Edit**, on **Specific zone → lyniago.com**. This attaches the Custom
     Domains.
   - Nothing else. **Continue to summary → Create Token → Copy.** The token is shown only once.

   Why not the "Edit Cloudflare Workers" template or a personal token? The template adds
   account-wide KV, R2 and account-settings access the deploy never uses. With a personal token,
   wrangler prints the owner's email and account list on any authentication error, into public
   Actions logs. After the first deploy the token can drop to **Editor** on just the two Workers.
2. **Copy your account ID.** Cloudflare → **lyniago.com → Overview** → the *API* section at the bottom →
   **Account ID → Copy**. (It is also under **Workers & Pages → Account details**.)
3. **Store the token as a `production` ENVIRONMENT secret**, never a repository secret. A repository
   secret can be read by a workflow on *any* branch, and this repo's Actions logs are public. The
   `production` environment only runs from `main`. From a phone browser (the GitHub app has no
   secrets screen):
   - <https://github.com/unnfazzed/Lynia/settings/environments> → **production** → **Environment
     secrets → Add environment secret**. Name `CLOUDFLARE_WORKERS_API_TOKEN`; paste the token; **Add
     secret**.
   - The account ID is not secret: <https://github.com/unnfazzed/Lynia/settings/variables/actions/new>.
     Name `CLOUDFLARE_ACCOUNT_ID`; paste the ID as the value; **Add variable**.

   Or in Cloud Shell, where `gh secret set` prompts for the token so it stays out of shell history:
   ```bash
   bash -c 'gh auth status >/dev/null 2>&1 || gh auth login; gh secret set CLOUDFLARE_WORKERS_API_TOKEN --env production -R unnfazzed/Lynia && gh variable set CLOUDFLARE_ACCOUNT_ID -R unnfazzed/Lynia -b "PASTE_ACCOUNT_ID"'
   ```
4. **Turn on HTTPS redirects.** Cloudflare → **lyniago.com → SSL/TLS → Edge Certificates → Always Use
   HTTPS: On**. If that switch is missing, SSL/TLS → Overview is set to *Off*; choose **Full** first.
   Both settings only affect proxied hostnames, so the DNS-only app hosts are untouched.
5. **Keep script-injecting zone features off** for lyniago.com. Each one rewrites the HTML, so the page
   is no longer the handoff, and the CSP blocks what they inject, so every visitor gets console errors.
   The smoke's byte-identity check catches the rewrite on the next deploy. It requests the page with a
   browser's `Accept` header, because Cloudflare only injects into requests that accept HTML.
   - **Security → Bots → Bot Fight Mode: Off.** Its JavaScript Detections cannot be switched off
     separately.
   - **Web Analytics: Disabled.** Account Home → **Analytics & Logs → Web Analytics** →
     lyniago.com → **Manage site → Disable**. It was found on at launch (2026-09-28), injecting its
     beacon into every page a browser loaded. Speed → Observatory's real-user monitoring switches on
     the same beacon, so leave that off too.
   - Keep Rocket Loader and Zaraz off.
   - Do not "fix" an injection with `Cache-Control: no-transform`: that also turns off brotli/gzip.
6. **First deploy.** The deploy runs by itself when the website PR merges. Otherwise use GitHub → Actions
   → **Deploy website (Cloudflare)** → **Run workflow** (a Claude session can dispatch it). The first run
   waits up to ten minutes for Cloudflare to issue the certificates.

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
