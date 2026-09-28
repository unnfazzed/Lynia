# lyniago.com: search and AI-visibility plan

**Goal:** someone in Harare might search Google or Maps, or ask an AI assistant (ChatGPT, Gemini, Google's AI
Mode, Meta AI in WhatsApp, Perplexity, Claude) how to send a parcel, get something delivered, or earn
with a motorbike. When they do, the answer they get is **LyniaGo**, and **lyniago.com** is the source
those answers quote.

Written **2026-09-28**, the day the site went live, as a reference to execute later. Each file stands
on its own. Tick the checkboxes in a PR as you go. Leave the baseline audit as the historical
snapshot, and put later measurements in `reports/`.

## Start here: the next five actions

1. [ ] **Google Search Console:** verify `lyniago.com` and submit the sitemap. See [01 §1](./01-phase-0-foundations.md#1-google-search-console-owner-10-minutes).
2. [ ] **Bing Webmaster Tools and Cloudflare Crawler Hints.** See [01 §2](./01-phase-0-foundations.md#2-bing-webmaster-tools--indexnow-owner-10-minutes).
3. [ ] **Cloudflare:** turn Web Analytics off (unblocks PR #968), then check AI Crawl Control. See [01 §3](./01-phase-0-foundations.md#3-cloudflare-hygiene-owner-10-minutes).
4. [ ] **Claim "LyniaGo"** on every social network, with one identical profile kit. See [01 §4](./01-phase-0-foundations.md#4-claim-lyniago-everywhere-owner-1-hour).
5. [ ] **Answer the open decisions**, which unblock most of the rest: [decisions.md](./decisions.md).

## The files

| File | What it holds | When |
|---|---|---|
| [00-baseline-audit-2026-09-28.md](./00-baseline-audit-2026-09-28.md) | Where everything stood at launch: technical audit, content, off-site presence, competitors, what ranks, market and AI-usage data, product facts, sources | Reference |
| [01-phase-0-foundations.md](./01-phase-0-foundations.md) | Search Console, Bing, Cloudflare, social handles, one brand name, head tags, sitemap | **This week.** The app does not need to be live |
| [02-phase-1-launch.md](./02-phase-1-launch.md) | Play links and listing, Google Business Profile, Apple/Bing maps, reviews, launch press, directories, merchant links | **Launch week** (gates below) |
| [03-phase-2-content-brief.md](./03-phase-2-content-brief.md) | The brief for the design team's next handoff export: heading, FAQ, service area, new pages | Months 1–3 after launch |
| [04-phase-3-moat.md](./04-phase-3-moat.md) | Harare Delivery Index, public restaurant pages, video, Shona, community, Wikidata | Months 3–6 and later |
| [05-ai-visibility-engine.md](./05-ai-visibility-engine.md) | The monthly AI-driven loop, the 25-prompt AI panel, logging, and the proposed routine | Monthly, from Phase 0 |
| [06-keywords-and-measurement.md](./06-keywords-and-measurement.md) | Keyword map, how to research and track Harare rankings, measurement stack, targets | Reference |
| [07-drafts.md](./07-drafts.md) | Ready-to-use copy and code: head-tag edits, JSON-LD, profile kit, Business Profile text, FAQ drafts, review messages, press pitch, rider page | Used by every phase |
| [decisions.md](./decisions.md) | The owner decisions this plan needs, each with a recommendation | **Now** |

## The rule that shapes everything: the website ships the design handoff as-is

The owner's instruction of 2026-09-28 was *"use the handoff assets dont change the design to match some
rules in github. for the website apply as is"*. The rule is recorded in `CLAUDE.md` ("Marketing website"),
[`../WEBSITE.md`](../WEBSITE.md) and ledger **D-42** in [`../DESIGN-DEVIATIONS.md`](../DESIGN-DEVIATIONS.md).
`scripts/check-website.mjs` enforces it in CI. So every item in this plan falls into one of three lanes:

| Lane | What | How it ships |
|---|---|---|
| **A: no page change** | Dashboards (Google, Bing, Cloudflare, Play Console), off-site work, and the hosting files the checker already allows (`robots.txt`, `sitemap.xml`, `_headers`) | Any time. No design approval needed |
| **B: invisible head tags** | Page title, meta description, `og:site_name`, JSON-LD structured data. They change no pixels | Owner approval, then a `LAUNCH_EDITS` entry in `scripts/check-website.mjs` and a D-42 row. This is the path the `privacy-link` and `biz-ill-*` fixes took. Report the edits upstream so the next export carries them |
| **C: anything visible** | Headings, copy, FAQ, new pages | A brief to the design team, which comes back as a **new handoff export** ([`../WEBSITE.md`](../WEBSITE.md) "Updating from a new handoff export"). Never hand-edit the page |

Every item below names its lane. Anything that would change what a visitor sees, if it isn't in a
handoff export, is out of bounds.

## Status board

| Phase | Status (2026-09-28) | Gate |
|---|---|---|
| 0: Foundations | Not started | None |
| 1: Launch | Blocked | Four gates:<br>• The Play listing is public ([`../PLAY-STORE-SUBMISSION.md`](../PLAY-STORE-SUBMISSION.md); closed test plus production access).<br>• The backend is back up (Azure migration, [`../plans/2026-09-24-gcp-to-azure-migration.md`](../plans/2026-09-24-gcp-to-azure-migration.md)).<br>• The service area and pricing are final: both are pilot values in `packages/shared/src/policy.ts` and `pricing.ts`.<br>• A prohibited-items notice exists (design backlog A1-2) |
| 2: Content | Blocked | Design-team time; decisions 3 and 6 |
| 3: Moat | Blocked | Real order volume; the food marketplace beyond its CBD pilot |
| AI engine | Can start manually now | Decision 7 for the automated routine |

## Honesty rules (they apply to everything here)

- **Never say "on Google Play"** (site, press, directories, Business Profile) until the public listing is live (`CLAUDE.md` § Expo/EAS).
- **Publish only what is true in the product today.**
  - Parcels are **cash only**. Mobile money (EcoCash, InnBucks, O'mari) works **for food only**.
  - Prices and the service area are **pilot values**. Publish them only after decision 6.
- **No fake or incentivised reviews, no keyword-stuffed business names, no mass-generated pages.**
  Google suspends Business Profiles and demotes sites for all three.
- **Consistency beats cleverness.** Use the same name ("LyniaGo", never "Lynia"), phone number, one-line
  description and logo everywhere. Search engines and AI models merge an entity from these signals.

## How a Claude session should pick this up

1. Read this README, [decisions.md](./decisions.md) and the phase file you're executing.
2. Owner-only steps (dashboards, accounts, verification videos) are marked **Owner**. Walk the owner
   through them and don't attempt them.
3. Claude-doable steps (PRs, drafts, analysis) are marked **Claude**. Website edits follow the lanes above.
4. Record the outcome by ticking the box in the file, or with a dated note in `reports/`. Keep the
   baseline audit unchanged.
