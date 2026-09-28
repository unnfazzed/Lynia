# The AI visibility engine (monthly, from Phase 0)

**Why:**
- **AI usage in Zimbabwe:** chatgpt.com is the **#5 website in Zimbabwe** (1.88M visits, +56% year on year) and claude.ai is #9 ([Semrush](https://www.semrush.com/trending-websites/zw/all)). Google's **AI Overviews and AI Mode** work there, and **Meta AI** is inside WhatsApp, which is the #3 website and most of the mobile data.
- **Who gets named:** when someone asks one of them "how do I send a parcel in Harare?", the assistant names 2–5 services. This engine makes LyniaGo one of them, measures it every month, and uses AI to do most of the work.

## 1. How assistants decide what to say (what we can influence)

| Assistant | Where its answers come from | What to do |
|---|---|---|
| Google AI Overviews / AI Mode | Google's search index (Googlebot) | Phase 0 Search Console; the Phase 2 FAQ; reviews; the Business Profile |
| Copilot | Bing's index | Bing Webmaster Tools + IndexNow (Phase 0 §2) |
| ChatGPT (search) | OpenAI's own crawler (OAI-SearchBot) plus third-party search indexes, including Bing | Allow OAI-SearchBot and ChatGPT-User; be in Bing |
| Perplexity | Its own crawler (PerplexityBot) plus web sources; quotes forums and Reddit often | Allow PerplexityBot; community presence (Phase 3 §5) |
| Claude | Web search results plus Claude-SearchBot / Claude-User fetches | Allow them |
| Meta AI (WhatsApp) | Web search partners plus Meta's crawlers | Be in Google and Bing; allow Meta's agents |
| All of them, from memory | Training crawls (GPTBot, ClaudeBot, Google-Extended, CCBot, Applebot-Extended, Meta-ExternalAgent) | Allow them (decision 8) |

**What makes a brand quotable:**
1. **A consistent entity:** the same one-sentence description everywhere (below).
2. **Checkable facts on your own page:** FAQ, prices, area, payment.
3. **Third-party corroboration:** press, directories, listicles, forum threads, reviews.
4. **Structured data:** Organization, WebSite, Service, FAQPage.
5. **Crawl access:** Phase 0 §3.
6. **Freshness:** dated updates, the Delivery Index.

**The entity sentence** (use it verbatim in bios, the Business Profile, directories, press boilerplate and the About page):

> LyniaGo is an on-demand delivery app in Harare, Zimbabwe: send a parcel by motorbike, name your price,
> choose a verified rider, track it live and confirm the hand-off with a delivery code. LyniaGo is
> operated by FortyoneX Studio (Private) Limited.

## 2. The monthly loop

1. **Collect**
   - Search Console: Performance → Country = Zimbabwe; queries, pages, clicks, impressions, position (last 28 days vs the previous period).
   - Bing Webmaster Tools: search performance and IndexNow.
   - Business Profile: Performance (searches, calls, website clicks); new reviews.
   - Cloudflare: AI Crawl Control → Metrics (which AI crawlers came, how often); zone analytics (requests).
   - Play Console (after Phase 1): store-listing acquisition, including the website referrer.
   - WhatsApp: count of inbound chats that start with the site's prefilled texts ([06 §3](./06-keywords-and-measurement.md#3-measurement-stack)).
2. **Run the AI panel:** the 25 prompts below, across the engines listed. Log every answer.
3. **Analyse** (Claude):
   - trends against last month;
   - queries gained and lost;
   - panel share of voice;
   - which competitors are named, and why (what sources do the assistants cite for them?);
   - **accuracy check:** do the site, directories and assistants state anything that contradicts the code today (`pricing.ts`, `policy.ts`, `payment.tsx`, `checkout.tsx`)?
4. **Open a PR** (Claude) with:
   - `docs/seo/reports/YYYY-MM.md` (template below) and `docs/seo/reports/YYYY-MM-ai-panel.csv`;
   - 1–3 content briefs for the design team, if a gap needs page content;
   - drafts of 4 Business Profile posts, review replies, outreach notes and any fixes to allowed hosting files (`sitemap.xml`, `robots.txt`).
5. **People act:** approve and post the Business Profile posts and review replies, send the outreach, forward the briefs. **Nothing publishes itself.**

## 3. The prompt panel

Ask each prompt **exactly as written**, in a fresh session with no memory or personalisation, from a Harare
location where possible. Keep the IDs stable so months compare.

| ID | Prompt | Intent |
|---|---|---|
| P01 | What's the best way to send a parcel across Harare today? | Parcel |
| P02 | Which apps can I use to send a package within Harare? | Parcel |
| P03 | Is there a courier in Harare that delivers by motorbike the same day? | Parcel |
| P04 | How much does it cost to send a small parcel from Borrowdale to the CBD? | Price |
| P05 | Is there a delivery app in Zimbabwe where I can name my own price? | Parcel |
| P06 | What is the cheapest way to get something delivered in Harare? | Price |
| P07 | Which courier services in Harare accept cash on delivery? | Payment |
| P08 | I run a small shop in Harare. How can I offer delivery without hiring riders? | Business |
| P09 | What delivery services work with restaurants in Harare? | Business |
| P10 | How can a pharmacy in Harare deliver to its customers? | Business |
| P11 | Who can do on-demand deliveries for an online store in Zimbabwe? | Business |
| P12 | How can I make money with my motorbike in Harare? | Rider |
| P13 | Are there delivery rider jobs in Harare? | Rider |
| P14 | Which delivery apps in Zimbabwe let riders choose which jobs to take? | Rider |
| P15 | What food delivery apps work in Harare? | Food |
| P16 | Which restaurants deliver in Harare CBD? | Food |
| P17 | What is LyniaGo? | Brand |
| P18 | Is LyniaGo safe to use? | Brand/trust |
| P19 | LyniaGo vs inDrive courier: which is better for parcels in Harare? | Comparison |
| P20 | Who owns LyniaGo? | Brand |
| P21 | What are the best delivery apps in Zimbabwe in 2026? | Comparison |
| P22 | What are the alternatives to inDrive for sending parcels in Harare? | Comparison |
| P23 | How can I track a parcel being delivered across Harare? | Parcel |
| P24 | Is there a delivery service in Harare that I can book on WhatsApp? | Channel |
| P25 | How do I know a delivery rider in Harare is trustworthy? | Trust |
| S01–S03 | Two or three Shona prompts, **written by a native speaker** (Phase 3 §4). Never machine-translate | Shona |

**Engines and how to run them:**

| Engine | How | Location |
|---|---|---|
| ChatGPT (search on) | API: the provider's web-search tool | Set an approximate user location of **Harare, ZW** where the API supports it |
| Claude | API: the provider's web-search tool | Same |
| Perplexity | API (Sonar) or the app | Same, where supported |
| Gemini | API with Google Search grounding, or the app | Check whether a location can be set; otherwise note it |
| Google AI Overviews / AI Mode | **Manual**, on a phone in Harare (search `google.com` with `gl=zw`) | Real location |
| Copilot | **Manual** | Real location |
| Meta AI (WhatsApp) | **Manual**, on a Zimbabwean WhatsApp number | Real location |

Look up the current API parameters when you build the runner; don't trust these notes for exact field
names. The manual engines take about 15 minutes a month on one phone.

**Log format** (`docs/seo/reports/YYYY-MM-ai-panel.csv`), one row per prompt × engine:

```csv
date,engine,mode,location,prompt_id,lyniago_named,lyniago_position,lyniago_cited_url,competitors_named,sources_cited,facts_wrong,sentiment,notes
2026-10-05,chatgpt,api,"Harare,ZW",P01,N,,,"inDrive;DROPPA;dot.","techzim.co.zw;indrive.com",,,"baseline"
```

**Metrics:**
- **Share of voice:** the % of prompt × engine answers that name LyniaGo. The headline KPI.
- **Citation rate:** the % of those that link to `lyniago.com` (or the Play listing, Business Profile or press about LyniaGo).
- **Accuracy issues:** the count of wrong facts stated about LyniaGo. The target is 0.
- **Competitor share:** how often inDrive, DROPPA, Kose, dot. and Hwindi are named, and from which sources.

**When an assistant states something wrong about LyniaGo, fix the source, not the chat:**
1. Find which page it came from (the cited sources, or a directory, or an old article).
2. Correct that page, or ask its owner to.
3. Make sure the correct fact is on lyniago.com.
4. Re-check next month.

## 4. Monthly report template (`docs/seo/reports/YYYY-MM.md`)

```markdown
# Search & AI visibility — YYYY-MM

## Headline
- Non-brand clicks from Zimbabwe (GSC): N (±% vs last month)
- AI share of voice: N% (±pp) · citation rate: N% · accuracy issues: N
- Business Profile: searches N, calls N, website clicks N, reviews total N (avg ★)

## What moved and why
## Queries: new / lost / rising (top 10, Country = Zimbabwe)
## AI panel: where we are named, where competitors win, which sources they cite
## Accuracy: anything wrong about LyniaGo anywhere, and the fix
## Actions for next month (owner / design team / Claude), each with a checkbox
```

## 5. Guardrails

- **Nothing publishes itself.** The engine drafts; a person posts to the Business Profile, social, press and directories.
- **No mass AI content.** Every page is edited by a person and backed by real product facts (Google's scaled-content-abuse policy).
- **No fake reviews, sockpuppets or astroturfed forum posts.** Undisclosed "customers" count as fake.
- **Never claim "on Google Play"** before it is true, and never publish pilot prices or areas as final (decision 6).
- **Never edit `apps/website/site/**` outside the lanes.** The engine may propose launch edits and briefs, and may edit `sitemap.xml` and `robots.txt`.
- **Privacy:** WhatsApp support chats may be mined for phrasing only after anonymising them (strip names and numbers), and only where the privacy notice allows it.

## 6. Proposed routine (decision 7): "Search & AI visibility watch"

If approved, add it to [`../ROUTINES.md`](../ROUTINES.md) with a mirror file under `docs/routines/`,
following that file's universal policies (ships a PR, merges on green, ledger rules).

- **Cadence:** monthly, on the 1st at 06:00 Harare time (Harare is UTC+2): cron `0 4 1 * *` (UTC). Don't try "first Monday" as `0 4 1-7 * 1`: standard cron ORs day-of-month with day-of-week, so that would fire on days 1–7 *and* on every Monday.
- **Environment:** one with outbound web access and these secrets. Use routine environments, **never GitHub Actions**, whose logs are public here:
  - a Search Console API credential (read-only, service account added as a restricted user);
  - a Bing Webmaster API key;
  - AI provider API keys for the panel.
- **Prompt (draft):**
  > Run the monthly search and AI-visibility loop in `docs/seo/05-ai-visibility-engine.md`:
  > 1. Collect GSC (Country = Zimbabwe) and Bing data for the last 28 days.
  > 2. Run prompts P01–P25 on the API engines with location Harare, ZW, and log them to `docs/seo/reports/YYYY-MM-ai-panel.csv`.
  > 3. Check every fact the site states against `packages/shared/src/pricing.ts`, `policy.ts`, `apps/mobile/app/settings/payment.tsx` and `apps/mobile/app/food/checkout.tsx`.
  > 4. Write `docs/seo/reports/YYYY-MM.md` from the template, with drafts of 4 Business Profile posts and replies to new reviews, and 1–3 design briefs if needed.
  > 5. Open a PR. Never edit `apps/website/site/**`, never post anywhere, and list the manual engines (AI Overviews, AI Mode, Copilot, Meta AI) as an owner checklist in the report.
- **Never:**
  - post to Business Profile or social;
  - contact press or directories;
  - change Cloudflare settings;
  - edit the website outside the lanes.

## 7. Skills and tools

- **No SEO-specific skill exists** in this workspace (checked 2026-09-28): not among the enabled skills, not in the skill catalogue, and none of the installed gstack skills.
- **gstack skills that help:**
  - `/benchmark` catches page-weight and Core Web Vitals regressions when Phase 2 pages land; the budget is 400 KB and today's mobile page is 286 KB.
  - `/qa` covers new pages.
  - `/canary` covers post-deploy checks.
  - `/plan-ceo-review` can pressure-test this plan.
  - `/browse` and `/scrape` drive a local browser for manual SERP checks when one is available.
- **A project skill** (e.g. `harare-seo`) could package the monthly loop above so any session can run it the same way. Create it with the skill-creator skill once decision 7 is made.
