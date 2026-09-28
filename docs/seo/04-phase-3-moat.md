# Phase 3: Build a moat (months 3–6 after launch, and ongoing)

**Why:** Phases 0–2 get LyniaGo *into* results. This phase is about *staying* ahead of inDrive, DROPPA,
Kose and dot. with things they can't easily copy: your own data, your merchants, and trust built in public.

**Gates:** real order volume (see §1 for thresholds), the food marketplace beyond the CBD pilot (§2), and
Phases 0–2 done.

| # | Item | Who | Lane |
|---|---|---|---|
| 1 | Harare Delivery Index | Claude (data job + drafts), owner (approval), design team (page) | C (+ API work) |
| 2 | Public restaurant pages | Product + design team + Claude | C (or a separate app surface) |
| 3 | Short how-to videos | Owner/ops | A |
| 4 | Shona test | Owner + native speakers | A |
| 5 | Community presence | Owner/ops | A |
| 6 | Listicle and "best of" outreach | Owner (Claude finds targets and drafts) | A |
| 7 | Wikidata and Pindula entity pages | Owner (Claude drafts) | A |

---

## 1. Harare Delivery Index (your data moat)

**What:** a quarterly, public set of numbers about delivery in Harare, drawn from LyniaGo orders. For example:
- median fare per km;
- median time to the first rider offer;
- median pickup ETA by area;
- the busiest hours and days;
- the share of requests that got an offer;
- the most-requested pickup areas.

**Why it works:**
- **Press:** journalists need numbers ("motorbike delivery costs $X/km in Harare").
- **AI assistants:** they cite concrete facts from a clear source.
- **Uniqueness:** no competitor publishes this.

**Data available** (`apps/api/prisma/schema.prisma`):
- distances, suggested and agreed fares;
- pickup, delivery and completion timestamps;
- each rider offer's ETA;
- admin aggregates in `/admin/overview` and `/admin/utilization` (`apps/api/src/admin/admin.service.ts`).

**Gaps to build:**
- **No suburb field.** Map pickup and drop-off coordinates to areas, either with suburb polygons from
  OpenStreetMap administrative boundaries or with a coarse grid (e.g. 2 km cells) labelled by nearest suburb.
- **No average delivery time or average fare is computed anywhere yet.** Add an SQL view or a report job.

**Privacy (non-negotiable):**
- Publish **aggregates only**. Never individual trips, riders or customers.
- Use a minimum cell size, e.g. **at least 20 orders per area per period**; merge smaller areas into "Other".
- Check the published method against the privacy notice and the Zimbabwe Cyber and Data Protection Act.
  Aggregated, anonymised statistics are normally fine; document the method.

**Minimum volume before the first issue:** roughly 1,000 completed deliveries in the quarter. Fewer than
that and the medians are noise.

**Deliverables per quarter:**
- a designed page (a design-team template, Lane C) at `/harare-delivery-index` with the headline numbers and a method note;
- a downloadable CSV of the published aggregates (a hosting file, which needs an `EXTRA_FILES` entry and owner approval);
- a press release ([07 §8](./07-drafts.md#8-press)) plus 3–4 social cards;
- a Business Profile Update post.

**Claude's part:** write the SQL and report job, draft the commentary, and flag outliers. A person checks
every number before publishing.

## 2. Public restaurant pages

**What:** one public, indexable page per restaurant on LyniaGo: name, area, cuisine, hours, menu
highlights, delivery fee rule, "Order in the LyniaGo app". This is how Uber Eats and Mr D rank for
"<restaurant> delivery" and "food delivery <area>".

**Why:**
- It is the largest long-tail opportunity (every restaurant × "delivery", × area).
- Each page earns links from the restaurant itself.

**Constraints:**
- **Gated on the food marketplace going public** beyond the `RESTAURANTS_ENABLED` flag and the CBD pilot allowlist.
- **These pages are data-driven** (menus change), and the marketing site has **no build step**; it ships the handoff as-is. The options, all owner decisions:
  - a dedicated surface such as `food.lyniago.com`, rendered by an app (e.g. the Next.js stack used for admin and merchant), designed by the design team and aligned to its mocks (`CLAUDE.md` pixel-parity rules apply to app surfaces); or
  - a static generator that builds pages from approved templates into the website (needs checker support and decision 3).
- **Restaurant consent:** ask each restaurant before publishing its page, and keep hours and menus in sync from merchant data.

**Markup:** `Restaurant` (or `FoodEstablishment`) with `servesCuisine`, `openingHoursSpecification`, `areaServed`, and a menu link.

**Minimum per page:**
- real menu items and prices;
- real hours;
- delivery fee rule: US$0.80/km rounded to the nearest US$0.50, minimum US$1.50, plus a US$1 fee on orders under US$4 (`packages/shared/src/restaurants-order.ts`; verify at publish time);
- a photo.

Do not publish a page for a restaurant with no menu.

## 3. Short how-to videos

Six videos of 30–60 seconds each, for YouTube (Shorts), TikTok, Facebook and Instagram Reels:
1. How to send a parcel in Harare with LyniaGo (pickup, price, pick a rider, code).
2. How "name your price" works (offers, counter-offers).
3. The delivery code: why your parcel is safe.
4. How to become a LyniaGo rider (what you need, going online).
5. For businesses: your delivery team without the fleet.
6. Ordering food (once public).

**Tips:**
- **YouTube:** put "Harare" in titles and descriptions, and put `https://lyniago.com` in the first line of the description.
- **Captions:** burn them in, since many people watch on mute on mobile data.
- **Keep files small.** Data is expensive.
- **The website can't embed video.** The CSP and `check-website.mjs` forbid iframes, so link to the videos from the site's copy through the next export if wanted.

## 4. Shona test

**Evidence:**
- **AI side:** Google's AI Overviews and AI Mode don't support Shona, so English pages feed AI answers.
- **Audience side:** one study found **65% of Zimbabwean consumers found Shona adverts more convincing** ([Zenodo](https://zenodo.org/records/14566512)), and local brands borrow Shona ("Hwindi", "Tora Mula").

**Plan:**
1. Have native speakers write 2–3 Shona variants of the core message for social and WhatsApp status ads. **Never publish machine-translated Shona.**
2. Run English and Shona side by side for a month. Compare engagement and WhatsApp enquiries.
3. If Shona clearly wins, brief the design team for a Shona FAQ section or page. Google Search offers a ChiShona interface, and the language code `sn` would go in `lang` and hreflang.
4. Add 2–3 Shona prompts to the AI panel ([05](./05-ai-visibility-engine.md)). Meta AI in WhatsApp and ChatGPT will see Shona questions even though Google's AI features don't.

## 5. Community presence

- **Where:** Harare Facebook groups (buy-and-sell, community, small business), r/Zimbabwe, and WhatsApp communities you're invited to.
- **How:**
  - Answer delivery questions helpfully and **say you're from LyniaGo**. Link only when it answers the question.
  - Never post fake "customer" recommendations (astroturfing). It gets found out, and platforms ban it.
- **Why:** Perplexity and ChatGPT quote Reddit and forum threads, and Facebook groups are where Harare asks for recommendations.

## 6. Listicle and "best of" outreach

AI answers to "best delivery apps in Zimbabwe" often summarise existing listicles and roundups.
- **Claude's part:** each quarter, search for current articles such as "best delivery apps Zimbabwe", "courier services in Harare", "how to send a parcel in Harare" and "side hustles with a motorbike Zimbabwe". List the authors and draft a short, factual note for each: what LyniaGo is, what's different, and a link.
- **Owner's part:** send the notes, and offer screenshots and facts. Don't pay for inclusion unless it's clearly labelled sponsored.

## 7. Wikidata and Pindula entity pages

- **Wikidata:** create an item for LyniaGo once there is **independent coverage** (press from Phase 1). Wikidata needs serious, public references. Useful properties:
  - instance of: business;
  - official website;
  - country: Zimbabwe;
  - headquarters location: Harare (Q3921);
  - operator/owner: FortyoneX Studio (Private) Limited;
  - social media IDs.

  Then add the Wikidata URL to the JSON-LD `sameAs` (a launch edit). Search engines and AI models use Wikidata to confirm entities.
- **Pindula** (Zimbabwe's wiki): a neutral, sourced company page. Follow their editorial rules. No marketing tone.
