# Baseline audit: lyniago.com on launch day (2026-09-28)

This is a snapshot, so don't edit it; put later measurements in `reports/`. It was made by three
research passes on 2026-09-28:
- a live technical audit (Lighthouse 12.8.2, run from US-East);
- the Harare market and search landscape, searched from a US index, so rankings are **approximate**;
- product facts from the codebase.

## 1. Snapshot

| Area | State | Verdict |
|---|---|---|
| Speed | Lighthouse mobile: Performance **99**, SEO **100**, Accessibility 96, Best Practices 93. LCP 1.8–2.0 s, CLS 0.002, TBT 0 ms. **286 KB** in 24 requests | ✅ Not a bottleneck. Protect it |
| Indexing | No lyniago.com page in the index we could query. No Google Search Console or Bing Webmaster Tools: `lyniago.com` has **no TXT records** | ❌ Blocking |
| Brand search | "LyniaGo" returns pull requests from the **public GitHub repo**, and their snippets repeat hosting and ops details. "Lynia" alone returns a Polish cosmetics brand | ❌ |
| Content | 252 visible words. The H1 "Stay home. We'll bring it." has no search terms in it. "Harare" appears twice and **"courier" never**. No prices, service area or FAQ | ❌ |
| Structured data | None: no JSON-LD, microdata or RDFa. Title 38 characters, description 50 | ❌ |
| Off-site | No Google Business Profile. Play listing returns **404** (closed testing). The X, LinkedIn, YouTube and TikTok handles are unused. No directory listings, no press | ❌ Highest-impact gap |
| Accuracy | The site says **"Cash or any mobile money"**. In the app, parcels are **cash only**; EcoCash, InnBucks and O'mari are **food only**; there is no OneMoney | ⚠️ AI answers will repeat it |
| Measurement | No analytics, by decision (D-42). But **Cloudflare Web Analytics was injecting its beacon** into browser responses, the CSP blocked it, and the smoke test missed it. The smoke test is fixed in PR #968; the owner still has to switch the injection off | ⚠️ |
| Links | `/about` returns 404 but the footer links to it (intentional until its copy exists). Terms is `#` | Minor |

## 2. Technical

**Lighthouse, mobile (three runs) and desktop:**

| | Perf | A11y | BP | SEO | FCP | LCP | CLS | TBT | SI |
|---|---|---|---|---|---|---|---|---|---|
| Mobile | 99 | 96 | 93 | 100 | 1.6 s | 2.0 s (1.8 s on runs 2–3) | 0.002 | 0 ms | 1.6 s |
| Desktop | 100 | 96 | 93 | 100 | 0.5 s | 0.6 s | 0.002 | 0 ms | 0.5 s |

- **Weight (mobile):** 286,280 bytes over 24 requests: 17 images (180,029 B), 4 fonts (93,990 B) and the HTML (12,261 B brotli). TTFB is about 120 ms from US-East, and Cloudflare also serves from Harare.
- **LCP element:** `img.hero-ill`, which is `hero-rider.svg` (5.2 KB, `fetchpriority=high`).
- **Hosting:** an assets-only Cloudflare Worker serving HTTP/2 and HTTP/3; `www` and `http` redirect with a 301 to `https://lyniago.com/` ([`../WEBSITE.md`](../WEBSITE.md)).
- **Design-owned findings** (never fix these in the repo; report them upstream to the design team):
  - Six `step-*.webp` screenshots are 2× their display size (the handoff does this on purpose for retina; est. 104 KiB).
  - Fredoka and Inter-400 are not preloaded.
  - Two perk illustrations have no width/height.
  - Colour-contrast failures: white on `#00B14F` is 2.83:1, yellow on green 1.96:1.
  - There is no `<main>` landmark.
  - The JS-built dot map adds about 1,000 DOM nodes.
- **Crawler access:** every tested user agent got HTTP 200. That covered Googlebot, Bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Applebot, Applebot-Extended, meta-externalagent, Bytespider, CCBot and Amazonbot. There were no challenges and no `cf-mitigated` header.
  - This is **not conclusive**: Cloudflare verifies real bots by IP. Settle it in Cloudflare → AI Crawl Control ([01 §3](./01-phase-0-foundations.md#3-cloudflare-hygiene-owner-10-minutes)).
  - `robots.txt` is `User-agent: * / Allow: /` plus the sitemap, with no Cloudflare-managed content signals.
- **Paths:**
  - `/about`, `/terms`, `/privacy`, `/faq`, `/.well-known/assetlinks.json`, `/favicon.ico`, `/apple-touch-icon.png`, `/manifest.webmanifest` and `/llms.txt` all return 404 (a branded, `noindex` 404 page).
  - `/index.html` redirects to `/` with a 307.
  - `https://api.lyniago.com/legal/privacy` returns 200 and is indexable. `api.lyniago.com/robots.txt` returns 404. `/legal/terms` returns 404.
- **Cloudflare HTML injection (found and verified 2026-09-28):**
  - **What happens:** for any request that accepts `text/html`, Cloudflare Web Analytics' automatic setup inserts `<script … static.cloudflareinsights.com/beacon.min.js …>` before `</body>`.
  - **Consequences:** the page's CSP blocks it, so every visitor gets a console error and nothing is recorded.
  - **Proof it's the only change:** the browser-fetched page minus that one line is byte-identical to `apps/website/site/index.html`.
  - **Fix:** PR #968 teaches `apps/website/smoke.sh` to fetch like a browser. The owner turns the injection off ([01 §3](./01-phase-0-foundations.md#3-cloudflare-hygiene-owner-10-minutes)).

## 3. On-page content (`apps/website/site/index.html`)

- **Title:** `LyniaGo — On-demand delivery in Harare` (38 characters). **Description:** `On-demand delivery for local businesses in Harare.` (50 characters). Canonical `https://lyniago.com/`. The Open Graph tags and a 1200×630 OG image are present, along with `twitter:card`. `lang="en"`.
- **Headings:**
  - H1: "Stay home. We'll bring it."
  - H2s: "We deliver for", "Send in three steps", "Your delivery team — without the fleet.", "Ride with LyniaGo. Earn on your terms.", "Safe from pickup to door", "Live in Harare", "Everything you send, in your pocket".
  - H3s: the three steps.
- **Visible words:** 252. "Harare" appears 2×, "deliver…" 8×, "parcel" 3×, "courier" 0×.
- **Calls to action:**
  - "Download the app" / "Send a parcel" / "Become a rider" all go to `#app`, on purpose until the Play listing is public (D-42 TODO #1).
  - "Onboard on WhatsApp" links to `wa.me/263778831938` with prefilled text.
  - The callback form opens WhatsApp with the number the visitor typed.
- **Images:** content images have descriptive alt text (e.g. "LyniaGo rider on a motorbike in Harare"); decorative images use `alt=""`.
- **Missing:** prices, service-area text, hours, FAQ, company or address details, structured data, and any link to a store listing.

## 4. Off-site presence

| Surface | State |
|---|---|
| Google Business Profile | None |
| Google Play | `play.google.com/store/apps/details?id=zw.co.lynia` returns **404** (closed testing only). The listing name is "LyniaGo", category Maps & Navigation, **no website field**, and support email `support@lyniafinance.com` ([`../PLAY-STORE-SUBMISSION.md`](../PLAY-STORE-SUBMISSION.md) around lines 1271–1336) |
| Social | X `@lyniago` unused; LinkedIn `company/lyniago` returns 404; YouTube `@lyniago` returns 404; TikTok `@lyniago` has no account; Facebook and Instagram inconclusive (login walls) |
| Directories and press | None found |
| GitHub | `github.com/unnfazzed/Lynia` is **public** and is what brand searches return |

## 5. Competitors (verified 2026-09-28; searched from the US)

| Competitor | Offer | Search/content investment |
|---|---|---|
| **inDrive Courier** ([indrive.com/en-zw](https://indrive.com/en-zw)) | In Harare since October 2024. Car, bike or foot; the **customer offers the fare** and picks the courier; parcel value up to $100 | Zimbabwe pages for delivery, courier earnings and help. **Most press** |
| **DROPPA** ([idroppa.com](https://www.idroppa.com/)) | Rides, parcels, food, car hire. "Nearby drivers bid live — you pick by price, ETA and rating." EcoCash, OMARI or cash. Play: 50K+ installs, 2.2★ | LocalBusiness, FAQPage and MobileApplication schema; no sitemap |
| **Kose** ([kose.africa](https://www.kose.africa/)) | 2026 super-app: rides, packages, food, shops, and a merchant app. Drivers pay a weekly subscription. Its founder cites 20+ Harare billboards. Play: 1K+ installs | FAQPage, Organization and MobileApplication schema, a sitemap and a blog. Covered by Techzim on 5 Aug 2026 |
| **dot. / Delivery on Time** ([deliveryontime.co.zw](https://deliveryontime.co.zw/)) | Food, groceries and same-day parcels in Harare and Bulawayo. EcoCash or cash | **Best SEO in the category:** schema, per-service pages, a `/harare` page listing suburbs, a blog. **Ranks for "parcel delivery Harare"** |
| **Hwindi** ([hwindi.com](https://hwindi.com/)) | Super-app: taxi, parcels, food, groceries, medicines | Blocks crawlers |
| Bike couriers (Thabang Express, Tiendesei, Prompt, Tumi, Byka, Anganga, Go Deliver…) | Mostly run from Facebook; bike deliveries from about US$2, against at least US$6 at traditional couriers (Sunday Mail) | Weak sites. Tiendesei has DeliveryService schema |
| Food: Dial a Delivery, Munch, Bereka Bites. Pharmacy: Dial a Med, Vivat. Couriers: Swift/Unifreight, Zimpost EMS, DHL, UrgentGo | — | UrgentGo has the strongest courier content (city pages, FAQ, pricing, prohibited items, blog) |
| Ride-hailing: Bolt (rides only in Harare), Yango and Vaya (status unverified) | — | — |

No competitor whose sitemap we could read has one page per suburb.

## 6. What ranks (a US-based approximation; confirm from Harare)

| Query | What ranks |
|---|---|
| courier services Harare | Facebook pages (Bright Curve, Kayz, OverNight Express), Instagram, Techzim's inDrive story, Veer-Freight, UrgentGo, **ZimbabweYP's courier category** |
| parcel delivery Harare | Facebook, **dot. /parcel-delivery**, the inDrive story, UrgentGo, foreign shipping aggregators |
| same day delivery Harare | Retailer and florist posts, Thabang, Zim MegaStore |
| delivery service Harare | Prompt (Instagram/Facebook), Thabang, Go Deliver, TripAdvisor, WhoDoYou |
| motorbike delivery Harare | Thabang, a Herald feature, Tiendesei, Anganga, Byka, Zikimall/Tisitano listings |
| food delivery Harare | TripAdvisor, App Store pages, Dial Eats |
| pharmacy delivery Harare | Pharmacy Facebook pages, Dial a Med, Vivat, Corporate 24 |
| **delivery rider jobs Harare** | UK/US job boards plus one iHarare Jobs ad. **An open gap** |
| delivery app Zimbabwe | A white-label vendor (Deonde), Play/App Store pages, dot., Prompt, Bereka |
| send parcel Harare | International shipping aggregators (the diaspora sending parcels home): **a different intent, so skip it** |

Few local pages are optimised, so Facebook, directories and app listings fill the gap. `google.co.zw`
now redirects to `google.com`, so track rankings with `gl=zw`.

## 7. Market and AI usage in Zimbabwe

| Fact | Value | Source |
|---|---|---|
| Search-engine share (Aug 2026) | Google **95.2%** (mobile 98.9%), Bing 4.3% (desktop 8.9%) | [StatCounter](https://gs.statcounter.com/search-engine-market-share/all/zimbabwe) |
| Mobile OS | Android 88%, iOS 12% | [StatCounter](https://gs.statcounter.com/os-market-share/mobile/zimbabwe) |
| Internet users | 6.54M (38.4%); 2.6M social-media users; Facebook reaches 29% of adults | [DataReportal 2026](https://datareportal.com/reports/digital-2026-zimbabwe) |
| Top websites | whatsapp.com #3, facebook.com #4, **chatgpt.com #5** (1.88M visits, +56% YoY), claude.ai #9 | [Semrush](https://www.semrush.com/trending-websites/zw/all) |
| Google AI Overviews / AI Mode | **Available in Zimbabwe** (English; Shona is not a supported language) | [AI Overviews](https://support.google.com/websearch/answer/14901683), [AI Mode](https://support.google.com/websearch/answer/16011537) |
| Meta AI in WhatsApp | Available in Zimbabwe since April 2024 | [WhatsApp blog](https://blog.whatsapp.com/more-ways-to-use-meta-ai-now-available-for-more-people) |
| Google for Jobs | Available in Zimbabwe since 2018 | [Techzim](https://www.techzim.co.zw/2018/08/google-jobs-now-available-in-zimbabwe-a-more-convenient-way-to-look-for-jobs/), [AIM Group](https://aimgroup.com/2018/08/09/google-for-jobs-goes-live-in-zimbabwe-2/) |
| Data cost | Among the world's most expensive per GB; real bundles are e.g. US$4 for 1 GB/7 days. **Keep pages light** | [Econet bundles](https://www.econet.co.zw/usd-data-bundles/) |
| Google Business Profile | Available in Zimbabwe; a service-area business can hide its address and list up to 20 areas | [availability](https://support.google.com/business/answer/6270107), [service areas](https://support.google.com/business/answer/9157481), [video verification](https://support.google.com/business/answer/14271705) |
| Apple Business (Maps) | Brand and Location Management is available in Zimbabwe | [Apple](https://support.apple.com/guide/business/feature-availability-axmef1c47twq/web) |

## 8. Language

- Google Search offers a **ChiShona** interface; isiNdebele is not offered.
- AI Overviews and AI Mode **do not support Shona or Ndebele**, so **English pages feed AI answers**.
- A 2024 study found 72.5% of consumers prefer English words in adverts, but **65% found Shona adverts more convincing** ([Zenodo](https://zenodo.org/records/14566512)).
- Local brands borrow Shona slang: "Hwindi" means a kombi conductor, and Hwindi uses the tagline "Tora Mula".

## 9. Harare geography (spellings per Wikipedia)

- **Suburbs:** CBD, Avenues, Milton Park, Belgravia, Avondale, Mount Pleasant, Borrowdale, Borrowdale Brooke,
Chisipite, Greendale, Highlands, Newlands, Eastlea, Hatfield, Waterfalls, Arcadia, Mabelreign, Marlborough,
Westgate, Bluff Hill, Emerald Hill, Belvedere, Glen Lorne, Gunhill, Vainona, Pomona, Groombridge, Hatcliffe,
Msasa Park, Southerton, Workington, Graniteside, Willowvale, Mbare, Highfield, Glen Norah, Glen View,
Budiriro, Kuwadzana, Kambuzuma, Mufakose, Dzivarasekwa, Warren Park, Mabvuku, Tafara, Rugare and Hopley.
- **Towns in the wider metro:** Chitungwiza, Ruwa, Epworth and Norton.
- **Landmarks:**
  - CBD: Joina City, Eastgate Centre.
  - Borrowdale: Sam Levy's Village, Borrowdale Village Walk, Borrowdale Brooke Shopping Centre.
  - Others: Avondale Shopping Centre, Arundel Village (Mount Pleasant), Longcheng Plaza (Belvedere), Westgate Shopping Centre, Highland Park (Highlands), Chisipite Shopping Centre, Mbare Musika.

## 10. Product facts that search content depends on (verify at publish time)

| Fact | Where in code | Status |
|---|---|---|
| Suggested parcel fare = **US$1.50 + US$0.60/km** (straight line), floor US$1.50; the customer can edit it; the hint band is 0.85×–1.2× | `packages/shared/src/pricing.ts`, `apps/mobile/src/logic/fare-band.ts`, [`../PRICING.md`](../PRICING.md) | **Pilot**: "tune at the pricing T0 spike" |
| Request stays open 90 s; reaches riders within 5, then 8, then 12 km; each rider accepts or counters once; offers are ranked 45% price, 35% rating, 20% ETA | `packages/shared/src/contracts.ts`, `packages/shared/src/policy.ts`, [`../PRICING.md`](../PRICING.md) | Live logic |
| Service area: pickup **and** drop-off within **25 km** of Harare CBD (-17.8292, 31.0522) | `packages/shared/src/policy.ts` `SERVICE_CORRIDOR` | **Pilot**: "replace with the real coverage boundary (likely a polygon) before launch" |
| Parcels: **cash to the rider** at the agreed price. Food: cash at the door, or mobile money (EcoCash · InnBucks · O'mari), paid by USSD with a reference | `apps/mobile/app/settings/payment.tsx`, `apps/mobile/app/food/checkout.tsx`, [`../PAYMENT-RAIL-OUTSTANDING.md`](../PAYMENT-RAIL-OUTSTANDING.md) | Live |
| Riders: **motorbike only**; national ID number, bike registration, ID photo and a selfie check | `apps/mobile/app/rider/become.tsx` | Live |
| Declared value capped at **US$150** | `packages/shared/src/contracts.ts` | Pilot cap |
| Rider commission is **0%** at launch; an env setting can change it | `packages/shared/src/policy.ts` | Can change without a deploy |
| Delivery code at hand-off, live tracking, ratings | `apps/api/src/matching/matching.service.ts` | Live |
| Restaurant marketplace exists in the app, behind login, the `RESTAURANTS_ENABLED` flag and a CBD pilot allowlist. The pharmacy tile says "Soon" | `apps/api/src/merchant/restaurants.controller.ts`, `apps/mobile/src/ui/shell/ServiceTiles.tsx` | Gated |
| **No prohibited-items notice** and no size ceiling | Design backlog A1-2 (`packages/design/BACKLOG-PLAN.md`) | Needed before an FAQ can answer "what can I send?" |
| No public tracking or share links; no Android App Links (`assetlinks.json`); custom scheme `lynia` only | `apps/mobile/app.config.ts` | — |
| Aggregate stats exist only in admin (`/admin/overview`, `/admin/utilization`). There is no suburb field on orders; distances, fares and timestamps are stored | `apps/api/src/admin/admin.service.ts`, `apps/api/prisma/schema.prisma` | Needed for the Delivery Index |
| Support and safety line: **+263 77 883 1938** | `packages/shared/src/policy.ts` | Live |
| Operator: **FortyoneX Studio (Private) Limited** | Site footer | — |
| Backend: down since the GCP suspension on 2026-09-17; Azure migration in progress. Android app in **closed testing** since 2026-09-01 | [`../plans/2026-09-24-gcp-to-azure-migration.md`](../plans/2026-09-24-gcp-to-azure-migration.md), [`../PLAY-STORE-SUBMISSION.md`](../PLAY-STORE-SUBMISSION.md) | Gates Phase 1 |

## 11. Sources

- **Competitors and press:**
  - [inDrive courier launch (Techzim)](https://www.techzim.co.zw/2024/10/indrive-launches-courier-services-in-harare-get-packages-delivered-by-bike-car-or-foot/)
  - [Kose launch (Techzim)](https://www.techzim.co.zw/2026/08/local-startup-kose-launches-super-app-to-compete-against-indrive/)
  - [dot. Harare](https://deliveryontime.co.zw/harare)
  - [UrgentGo](https://urgentgocourierszim.com/)
  - [Sunday Mail: motorbike deliveries](https://www.sundaymail.co.zw/motorbike-deliveries-reshape-city-life)
  - [Bolt Harare](https://bolt.eu/en/cities/harare/)
- **What ranks:**
  - [ZimbabweYP Harare couriers](https://www.zimbabweyp.com/category/Courier_Services/city:Harare)
  - [iHarare Jobs rider ad](https://ihararejobs.com/jobs/delivery-driv-1)
  - [google.co.zw redirect](https://blog.google/products-and-platforms/products/search/country-code-top-level-domains/)
- **Market data:** see the table in §7.
- **Geography:** [Suburbs of Harare](https://en.wikipedia.org/wiki/Template:Suburbs_of_Harare), [Shopping malls in Zimbabwe](https://en.wikipedia.org/wiki/List_of_shopping_malls_in_Zimbabwe).
