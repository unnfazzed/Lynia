# Phase 0: Foundations (this week; the app does not need to be live)

**Why first:** nothing ranks until search engines know the site exists, trust who runs it, and can
crawl it. Every step here is free and invisible to visitors. Most are dashboard clicks.

| # | Step | Who | Lane | Time |
|---|---|---|---|---|
| 1 | Google Search Console | Owner | A | 10 min |
| 2 | Bing Webmaster Tools + IndexNow | Owner | A | 10 min |
| 3 | Cloudflare hygiene (Web Analytics off, AI crawlers allowed) | Owner | A | 10 min |
| 4 | Claim "LyniaGo" on every network | Owner | A | 1 h |
| 5 | One name, one entity (Play Console, email) | Owner | A | 30 min |
| 6 | Head tags: title, description, structured data | Claude, after decision 1 | B | 1 PR |
| 7 | Sitemap `lastmod` | Claude | A | Same PR |
| 8 | Brand search clean-up (GitHub) | Owner (decision 4) | A | 10 min |

---

## 1. Google Search Console (Owner, 10 minutes)

**Why:** it is the only way to tell Google the site exists, see which Harare searches show it, and get
alerted to problems. Google has 95% of searches in Zimbabwe.

**Steps:**
1. Open <https://search.google.com/search-console> → **Add property** → choose **Domain** (not URL prefix) → enter `lyniago.com`.
2. Google shows a TXT record (`google-site-verification=…`).
   - If Search Console offers to **verify automatically with Cloudflare**, accept.
   - Otherwise, go to Cloudflare → **lyniago.com → DNS → Records → Add record**: Type `TXT`, Name `@`, Content = the pasted value, TTL Auto → **Save**.
3. Back in Search Console → **Verify**. DNS can take a few minutes; retry if needed.
4. **Sitemaps** → submit `https://lyniago.com/sitemap.xml`.
5. **URL Inspection** → `https://lyniago.com/` → **Request indexing**.
6. **Settings → Users and permissions:** add a second owner (a backup Google account you control).

**Done when:** the property is verified, the sitemap shows *Success*, and URL Inspection says *URL is on
Google* (allow a few days).

**Tips:**
- **Use a Domain property.** It covers `http`, `https` and `www` in one.
- **Never delete that TXT record**; Google re-checks it. Nothing here will delete it either:
  - The DNS workflow (`.github/workflows/dns-bind-azure.yml`) only upserts its own records and refuses to delete others.
  - The website deploy only takes over A/AAAA/CNAME records at `lyniago.com` and `www`, and a TXT record coexists with those.

  Still, check **Settings → Ownership verification** after the next deploy.
- **Turn on email notifications** (Settings → Email preferences) so indexing or security issues reach you.
- **Don't request indexing repeatedly.** Once per important URL is enough.
- **After about 4 weeks:** open **Performance → Search results → + New → Country: Zimbabwe**. That is where the
  real Harare search terms appear (see [06](./06-keywords-and-measurement.md)).

## 2. Bing Webmaster Tools + IndexNow (Owner, 10 minutes)

**Why:** Bing has only about 4% of searches in Zimbabwe, but **Copilot, and in part ChatGPT search, draw on
Bing's index**, as do DuckDuckGo and Ecosia. Being in Bing is part of being in AI answers.

**Steps:**
1. Open <https://www.bing.com/webmasters> → sign in → **Import from Google Search Console** (fastest; do step 1 first). Pick `lyniago.com`.
2. Confirm the sitemap came across (**Sitemaps**). If it didn't, submit `https://lyniago.com/sitemap.xml`.
3. In Cloudflare, go to **lyniago.com → Caching → Configuration → Crawler Hints: On**. Cloudflare then pings
   IndexNow (Bing, Yandex and others) when content changes, which it detects from cache misses.

**Done when:** Bing shows the site as verified and the sitemap as *Success*. After the next deploy,
**IndexNow** in Bing Webmaster Tools shows received URLs.

**Tips:**
- **If IndexNow stays empty after deploys,** the fallback is an IndexNow ping step in `deploy-website.yml`.
  That needs a key file hosted on the site, which means adding it to `EXTRA_FILES` in
  `scripts/check-website.mjs`, with owner approval and a D-42 note.
- **Bing Places** (Maps) comes in Phase 1, once Google Business Profile exists: it imports from Google.

## 3. Cloudflare hygiene (Owner, 10 minutes)

### 3a. Turn Web Analytics' injection off (unblocks PR #968)

**Why:** for every browser, Cloudflare currently inserts its analytics beacon into the page. The site's CSP
blocks it, so every visitor gets a console error, nothing is recorded, and the served page is no longer
the handoff.

1. Cloudflare → **Account Home → Analytics & Logs → Web Analytics** → `lyniago.com` → **Manage site → Disable**.
2. Also check **Speed → Observatory**. Its real-user monitoring switches on the same beacon.
3. Verify from any terminal: `curl -sS -H 'Accept: text/html' https://lyniago.com/ | grep -c cloudflareinsights` must print **0**.
4. Then PR #968 (the smoke-test fix) can merge. Its post-deploy smoke fails for as long as the beacon is present.

**Optional hard stop:** add a zone **Configuration Rule** on hostname `lyniago.com` with **Disable Real
User Monitoring (RUM)**. It overrides the Web Analytics setting if someone re-enables it.

**Analytics:** if you want analytics later (decision 2), it comes back as a *manual* snippet inside the page
through a launch edit. See [06 §3](./06-keywords-and-measurement.md#3-measurement-stack).

### 3b. Make sure AI assistants can read the site

**Why:** ChatGPT, Perplexity, Claude, Gemini and Meta AI can only cite what their crawlers can fetch.
Cloudflare offers one-click AI-bot blocking, and since mid-2025 it asks new domains at setup whether to
block AI crawlers. It is easy to have it on without noticing.

1. Cloudflare → **lyniago.com → AI Crawl Control → Crawlers** tab. For each crawler, the **Action** should be **Allow**.
   - At minimum, allow the search and assistant fetchers: **OAI-SearchBot, ChatGPT-User, PerplexityBot,
     Perplexity-User, Claude-SearchBot, Claude-User**. Also Meta's fetchers and Applebot.
   - For the model-training crawlers (**GPTBot, ClaudeBot, Google-Extended, Applebot-Extended,
     Meta-ExternalAgent, CCBot**) the recommendation is **Allow** (see [decisions.md](./decisions.md), decision 8).
     A new brand wants to be in the models' memory, and the page contains nothing proprietary.
2. **Security → Bots:** **Block AI Bots: Off**, **Bot Fight Mode: Off** (already required by [`../WEBSITE.md`](../WEBSITE.md) step 5).
3. Keep **managed robots.txt** (content signals) **off**. `robots.txt` is repo-owned (`apps/website/site/robots.txt`).
4. After a week or two, **AI Crawl Control → Metrics** shows which AI crawlers visit. Use it as a signal in the monthly report ([05](./05-ai-visibility-engine.md)).

**Done when:** no AI crawler is blocked, and Metrics starts showing visits.

## 4. Claim "LyniaGo" everywhere (Owner, 1 hour)

**Why:** search engines and AI models build an "entity" from matching profiles. Unclaimed handles can
also be squatted. The profiles become the `sameAs` links in the structured data (step 6).

| Network | Handle / URL | Notes |
|---|---|---|
| Facebook Page | facebook.com/lyniago | Category: Courier service. Facebook reaches 29% of Zimbabwean adults |
| Instagram (business) | instagram.com/lyniago | Link in bio: `https://lyniago.com` |
| TikTok (business) | tiktok.com/@lyniago | Short how-to videos (Phase 3) |
| X | x.com/lyniago | Handle is free (checked 2026-09-28) |
| LinkedIn Company Page | linkedin.com/company/lyniago | Company: FortyoneX Studio (Private) Limited, brand LyniaGo; useful for rider and press credibility |
| YouTube | youtube.com/@lyniago | Video results appear in Google and in AI answers |
| WhatsApp Business profile | +263 77 883 1938 | Set the website, description, hours and category; add a catalogue later |

**Use the profile kit** in [07-drafts.md §3](./07-drafts.md#3-profile-kit-every-network-identical): same name, logo (`assets/brand/lyniago-mark.svg`), cover (the OG image), one-line description, phone and website on every network.

**Tips:**
- **Use a shared account.** Register the accounts with an ops mailbox on `lyniago.com` (not a personal Gmail) and turn on 2FA. `lyniago.com` has no email records yet: Cloudflare **Email Routing** (free) can forward `support@` and `hello@` to an existing inbox in a few clicks.
- **Empty is fine for now.** Post when there is something real to say, but put the website link in every bio today.
- **Send the URLs to the Claude session doing step 6** so it can add them to `sameAs`.

## 5. One name, one entity (Owner, 30 minutes)

**Why:** "Lynia" alone is a Polish cosmetics brand in search results. Anything that says "Lynia" or points
to `lyniafinance.com` splits the entity.

- **Play Console:**
  - **LyniaGo → Store settings** (under *Store presence*) **→ Store listing contact details**: Website `https://lyniago.com`; email `support@lyniago.com` once step 4's routing exists.
  - **Main store listing:** remove "Lynia" from the closing paragraph (copy in [`../PLAY-STORE-SUBMISSION.md`](../PLAY-STORE-SUBMISSION.md), around lines 1292–1336).
  - Listing text changes go through Play review, so bundle them with the next release.
- **Privacy notice** (`api.lyniago.com/legal/privacy`) and any app copy: check they say "LyniaGo".
- **Allowing "Harare" in the Play listing text** is decision 5 (the store-assets rule currently bans place names).

## 6. Head tags: title, description, structured data (Claude, after decision 1, Lane B)

**What:** a better `<title>` and meta description, `og:site_name`, and a JSON-LD block (Organization + WebSite +
Service). None of these change a pixel. The exact code is in [07-drafts.md §1](./07-drafts.md#1-head-tags-lane-b-launch-edits).

**Process (one PR):**
1. The owner approves (decision 1). **Add D-42 rows** in [`../DESIGN-DEVIATIONS.md`](../DESIGN-DEVIATIONS.md) using the drafted text.
2. Add the `LAUNCH_EDITS` entries to `scripts/check-website.mjs` and apply them to `apps/website/site/index.html`.
3. Run `node scripts/check-website.mjs --write` (regenerates the CSP hashes and `404.html`), then `node --test scripts/check-website.test.mjs`.
4. After the deploy, validate with the [Rich Results Test](https://search.google.com/test/rich-results) and [validator.schema.org](https://validator.schema.org/). Then use **URL Inspection → Request indexing**.
5. **Report upstream** to the design team so the next export carries the tags and the launch edits retire.

> **Known issue (found in a dry run, 2026-09-28).**
> - **What passes:** in a scratch worktree, the title, description and `og:site_name` edits applied cleanly.
> - **What fails:** the **JSON-LD edit, placed in `<head>`, breaks the 404 derivation**. `check-website.mjs --write` fails with *"could not derive the 404 icon script from index.html"*, and 7 of 12 guard tests fail, because the JSON-LD is a `<script>` element.
> - **Fix before shipping, then re-run `--write` and the tests.** Either:
>   - (a) put the JSON-LD block at the end of `<body>`, after the existing script (`from: "</script>\n</body></html>"`), and confirm the derivation still finds the icon script; or
>   - (b) make the 404 derivation ignore `type="application/ld+json"` scripts.

**Tips:**
- **Add each profile to `sameAs` only once it is live.** Every change to it is a launch-edit update plus a D-42 line, so batch them.
- **Keep the canonical `https://lyniago.com/` as is.**
- **Skip these; search engines ignore them:** `meta keywords`, `geo.*` meta tags, and hreflang (there is only one language).
- **FAQ markup is still worth having** once a visible FAQ exists (Phase 2), even though Google shows FAQ *rich results* only for government and health sites (since August 2023). AI engines and other crawlers still read it.

## 7. Sitemap `lastmod` (Claude, Lane A, same PR as step 6)

`apps/website/site/sitemap.xml` is an allowed hosting file:
- Add `<lastmod>YYYY-MM-DD</lastmod>` for `/`, using the date of the last real content change. Never fake freshness.
- When Phase 2 pages arrive, list every indexable page.
- Leave `robots.txt` as it is (`Allow: /` plus the sitemap). It already allows every crawler, so bot-by-bot groups add nothing.

## 8. Brand search clean-up (Owner, decision 4)

The public repo `github.com/unnfazzed/Lynia` is what "LyniaGo" returns today. Its pull-request snippets
(hosting moves, the GCP suspension) are what AI assistants currently "know" about the brand.

- **Option A (recommended if nothing depends on it being public):** make the repo private.
  - First check Actions minutes/billing and anything that relies on public access. Public Actions logs are one reason the docs keep secrets out of logs.
- **Option B (keep it public):** set the repo **description** to "LyniaGo — on-demand delivery in Harare" and the **website** field to `https://lyniago.com`. At least the snippet then points to the site.
- **Either way:** once Search Console is verified, the site normally overtakes GitHub for the exact brand within weeks.

---

## Phase 0 is done when

- [ ] Search Console is verified, the sitemap is accepted, and `/` is indexed
- [ ] Bing is verified; Crawler Hints is on; IndexNow is receiving URLs
- [ ] Web Analytics' injection is off (curl prints 0); PR #968 is merged and the deploy smoke is green
- [ ] AI Crawl Control shows every search/assistant crawler allowed
- [ ] Handles are claimed on 7 networks with the identical profile kit
- [ ] The Play listing has the website field set and no "Lynia"
- [ ] Head tags and JSON-LD are live and valid in the Rich Results Test (after decision 1)
- [ ] The first AI-visibility baseline has been recorded ([05](./05-ai-visibility-engine.md)), even though it will show zero mentions today
