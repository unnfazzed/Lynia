# Keywords, tracking and targets

## 1. Keyword map

Keyword tools have thin data for Zimbabwe, so treat these clusters as hypotheses. Confirm them with §2
research and 4 weeks of Search Console data.

| Priority | Cluster | Example searches | Target page | Lane / phase |
|---|---|---|---|---|
| 1 | **Brand** | LyniaGo, LyniaGo app, lyniago.com, LyniaGo Harare | `/` | A/B, Phase 0 |
| 1 | **Send a parcel** | parcel delivery Harare, courier services Harare, same day delivery Harare, motorbike delivery Harare, send a package in Harare, delivery service Harare | `/` (+ FAQ) | B + C, Phases 0–2 |
| 1 | **Rider jobs** (open gap) | delivery rider jobs Harare, motorbike jobs Harare, courier jobs Harare, make money with motorbike Harare, rider vacancies Harare | `/riders` + JobPosting | C, Phase 2 |
| 2 | **Price** | how much is delivery in Harare, courier prices Harare, cheap delivery Harare | FAQ (price) | C, Phase 2 (decision 6) |
| 2 | **Business** | delivery for my business Harare, delivery riders for restaurant Harare, pharmacy delivery Harare, online shop delivery Zimbabwe | `/business` | C, Phase 2 |
| 2 | **Trust / company** | is LyniaGo safe, LyniaGo reviews, who owns LyniaGo | `/about` + FAQ + Business Profile reviews | C, Phases 1–2 |
| 3 | **Food** | food delivery Harare, restaurants that deliver Harare, [restaurant] delivery | `/food`, then restaurant pages | C, Phases 2–3 |
| 3 | **Areas** | delivery Borrowdale, courier Avondale, parcel delivery Chitungwiza (only if served) | Area pages, only with real data | C, Phase 3 |
| 3 | **Comparison** | inDrive courier alternative, best delivery app Zimbabwe | Listicle outreach, not own pages | A, Phase 3 |

**Skip:**
- **"send parcel to Harare / Zimbabwe":** diaspora shipping into the country, owned by international aggregators. A different product.
- **Generic "Uber Eats Harare"-type searches:** those brands don't operate there. Don't target competitor brand names on your own pages.

## 2. How to research Harare searches

1. **Search Console** (after about 4 weeks): **Performance → Search results → + New → Country = Zimbabwe**. Useful regex filters (**Query → Custom (regex)**):
   - non-brand: *Doesn't match* `(?i)lynia`;
   - Harare intent: `(?i)harare|borrowdale|avondale|cbd|chitungwiza|ruwa|msasa`;
   - rider intent: `(?i)rider|job|vacanc|earn|motorbike|bike`.
2. **Google Keyword Planner** (free with a Google Ads account; no spend needed for ranges): Location `Harare, Zimbabwe`, then `Zimbabwe`; language English. Seed it with the clusters above. Expect "—" for many terms, and use the relative ranges.
3. **Google Trends:** region **Zimbabwe**, comparing e.g. "courier" vs "delivery" vs "parcel", and "inDrive" vs "Bolt" vs "Hwindi".
4. **Autocomplete and "People also ask"** from a phone in Harare. It's local and free; screenshot it monthly.
5. **How customers actually ask:** mine anonymised WhatsApp support chats for recurring phrasing ("can you collect from…", "how much to…"). Strip names and numbers first, and respect the privacy notice. This becomes FAQ wording.
6. **Competitor pages:**
   - dot.'s `/harare` and `/parcel-delivery`, UrgentGo's pricing and prohibited-items pages, and inDrive's Zimbabwe courier pages show which topics already rank.
   - Cover the same *questions* with LyniaGo's own facts. Never copy text.

**Note:** `google.co.zw` now redirects to `google.com`. For spot checks use `https://www.google.com/search?q=parcel+delivery+harare&gl=zw&hl=en` in a private tab **on a phone in Harare**. The map pack depends on the searcher's real location, so a VPN from elsewhere is not a faithful check. Paid SERP APIs that accept the location "Harare, Zimbabwe" are the automated alternative.

## 3. Measurement stack

The site deliberately has **no analytics and no cookies** (D-42, README TODO #5). Everything below works
without adding a tracker.

| Signal | Source | What it tells you |
|---|---|---|
| Searches, clicks, positions, indexing | Google Search Console (Phase 0 §1) | Which Harare searches show the site, and page health |
| Bing searches + IndexNow | Bing Webmaster Tools (Phase 0 §2) | Bing/Copilot visibility |
| Map-pack results | Business Profile → Performance | Searches, calls, website clicks, review count and rating |
| AI crawler visits | Cloudflare → AI Crawl Control → Metrics | Whether OpenAI, Anthropic, Perplexity, Google and Meta are reading the site |
| Requests | Cloudflare zone and Worker analytics (server-side) | Traffic volume without JavaScript |
| App installs from the site | Play Console acquisition, if the buttons carry a `referrer` (Phase 1 §1) | Website → install conversion |
| Leads | WhatsApp inbound chats starting with the site's prefilled texts: *"Hi LyniaGo, I'd like to onboard my business."* (business button) and *"Hi LyniaGo, please call me back on …"* (callback form) | Business and customer leads from the site. The plain "WhatsApp us" link has no prefilled text; a future export could add one for attribution |
| AI answers | The monthly panel ([05](./05-ai-visibility-engine.md)) | Share of voice, citations, accuracy |

**Optional (decision 2): Cloudflare Web Analytics, done properly.** It is cookie-free and lightweight, and
the handoff README itself lists it as acceptable. It adds:
- **referrers**, which is the only way to see visits from `chatgpt.com`, `perplexity.ai`, `gemini.google.com` and `copilot.microsoft.com`;
- **real-user Core Web Vitals** from Harare phones.

It needs:
1. **Automatic injection kept off** (Phase 0 §3a).
2. **A manual snippet** added as a `LAUNCH_EDITS` entry, logged in D-42.
3. **CSP changes** in `apps/website/site/_headers`: add `https://static.cloudflareinsights.com` to `script-src` and `https://cloudflareinsights.com` to `connect-src`.
4. **A narrow allowance in `scripts/check-website.mjs`** for that one remote script, which the checker forbids today.
5. **A size check:** the beacon is a few KB, so confirm the page stays inside the 400 KB budget.

## 4. Targets (goals to steer by, not forecasts)

| KPI | Source | Baseline 2026-09-28 | 2 weeks after Search Console | Launch + 30 days | Launch + 90 days | Launch + 6 months |
|---|---|---|---|---|---|---|
| "LyniaGo" brand search | Manual + GSC | GitHub ranks first | **#1: lyniago.com** | #1 | #1 | #1, with the Business Profile panel |
| Indexed pages | GSC | 0 | 1 | 1 | 5+ (Phase 2 pages) | 10+ |
| Non-brand clicks (Zimbabwe) | GSC | 0 | — | Set a target from the first 4 weeks of data | | |
| Map pack for "courier Harare" near base | Manual, on a phone in Harare | Absent | — | Listed | **Top 3** | Top 3 in most served areas |
| "parcel delivery Harare" | Manual + GSC | Absent | — | Top 20 | **Top 10** | Top 3 |
| "delivery rider jobs Harare" | Manual + GSC | Absent | — | — | **Top 3** (with `/riders`) | #1 |
| Business Profile reviews | Business Profile | 0 | — | 10+ at ≥4.5★ | 30+ | 75+ |
| Directory citations | Tracking sheet | 0 | — | 10 | 15 | 20 |
| Press stories linking to the site | — | 0 | — | 2+ | 4+ | 8+ (Delivery Index) |
| AI share of voice (panel) | [05](./05-ai-visibility-engine.md) | 0% | 0% (baseline) | 5% | **20%** | **40%** |
| Wrong facts about LyniaGo | Panel + audits | Website payment line | 0 | 0 | 0 | 0 |

**Review cadence:** a monthly report ([05 §4](./05-ai-visibility-engine.md#4-monthly-report-template-docsseoreportsyyyy-mmmd)), and a quarterly review with the owner to re-rank priorities.
