# Phase 2: Content brief for the design team's next handoff export (Lane C)

**Why:** the home page has 252 words, never says "courier", and has no prices, service area or FAQ.
Search engines and AI assistants can only rank and quote what is written on the page. Every visible change
here must come from the **design team as a new handoff export**; the website ships the handoff as-is (see the
[README](./README.md#the-rule-that-shapes-everything-the-website-ships-the-design-handoff-as-is)). This
file is the brief to send them.

**Gates:**
- Phase 1 gates met: pricing and service area are final, and the prohibited-items notice exists.
- Decision 6 (publish prices and area) is answered.
- Decision 3 (pages per export, or templates) is answered.

**How an export lands** (from [`../WEBSITE.md`](../WEBSITE.md) "Updating from a new handoff export"):
1. Replace `packages/design/handoff/lyniago-website/` with the new export.
2. Copy its `site/` into `apps/website/site/`.
3. Re-apply the launch edits.
4. Run `node scripts/check-website.mjs --write` and the tests.

Pages that arrive inside the export are checked byte-for-byte automatically. Add every new indexable page
to `sitemap.xml`. When `/about` arrives, remove it from `INTENTIONAL_404` and update D-42.

---

## B1. Put the search words in the main heading and keep the slogan

- **Problem:** the H1 "Stay home. We'll bring it." tells Google nothing about the business.
- **Ask:** keep the slogan as the big display line, and make the H1 *also* carry what and where. For example:
  - an eyebrow inside the H1: `<h1><span class="eyebrow">Parcel delivery in Harare</span> Stay home. We'll bring it.</h1>`; or
  - make the subline the H1 ("Parcels and deliveries across Harare, tracked to your door") and style the slogan as display text.
- **Acceptance:** the H1 text contains "deliver…" and "Harare". There is exactly one H1.

## B2. Correct the payment line

- **Problem:** the trust tile says **"Cash or any mobile money"**. In the app, parcels are paid **in cash to the rider**. Mobile money (**EcoCash, InnBucks, O'mari**) exists **only for food**, and there is no OneMoney (`apps/mobile/app/settings/payment.tsx`, `apps/mobile/app/food/checkout.tsx`).
- **Ask:** accurate wording, for example "Cash on delivery" (parcels), or "Cash · EcoCash · InnBucks · O'mari (food)".
- **Acceptance:** matches the app on the day it ships. AI assistants repeat what the page says.

## B3. "Where we deliver" as text

- **Problem:** the "Live in Harare" section is a JavaScript dot map with no words, which crawlers ignore.
- **Ask:** keep the map as decoration and add a short text list of the suburbs actually served (the final boundary), plus "and anywhere within N km of the CBD" if that is how coverage works. Add two or three landmarks people use (e.g. Sam Levy's Village, Joina City, Avondale Shops).
- **Acceptance:** suburb names appear as HTML text and match the Business Profile's service areas.

## B4. A visible FAQ section (8–10 questions)

- **Why:** FAQ answers are what AI assistants lift most often, and they catch "how much / how / can I" searches.
- **Content:** drafted with code references in [07-drafts.md §6](./07-drafts.md#6-faq-drafts-verify-each-fact-at-publish-time). Pricing needs decision 6; "what can I send?" needs the prohibited-items notice.
- **Structure:** each question as a heading (H3) and each answer as a paragraph. Accordions are fine if the answer text is in the HTML (not fetched later).
- **Markup:** FAQPage JSON-LD mirroring the visible Q&As exactly (Lane B edit, or included in the export).
- **Acceptance:** 8–10 Q&As, each answer 40–80 words, facts matching the code on the ship date.

## B5. New pages

Each page gets:
- a unique `<title>` (at most about 60 characters) and meta description (at most about 155);
- one H1 and a self-canonical;
- the site's header and footer;
- page weight under the 400 KB budget, `width`/`height` on images, and descriptive alt text on content images;
- links from the home page and footer.

### `/riders`: "Delivery rider jobs in Harare" (highest priority; an open search gap)

- **Title:** `Delivery rider jobs in Harare — ride with LyniaGo`. **H1:** e.g. "Ride with LyniaGo in Harare".
- **Sections:**
  - what you need (a motorbike and its registration, a national ID, a smartphone, a selfie check);
  - how jobs work (go online when it suits you; requests from nearby customers; accept or counter the fare);
  - how you're paid (cash from the customer at the agreed price; mention **0% commission at launch** only if the owner approves; it can change via an environment setting);
  - safety and verification;
  - a rider FAQ;
  - a call to action (download the app / WhatsApp).
- **Structured data:** `JobPosting` (Google's job search works in Zimbabwe). Draft and caveats in [07 §9](./07-drafts.md#9-rider-page-outline-and-jobposting-draft):
  - list only real, current openings, with `validThrough`;
  - review Google's job-posting content policies first. Postings that ask applicants to pay can be disallowed, so if the commission top-up gate is ever on (rate above 0%), check before keeping the markup.
- **Also:** link it from the job-board and classifieds listings (Phase 1 §7).

### `/business`: "Delivery for businesses in Harare"

- **Title:** `Delivery for businesses in Harare — LyniaGo`.
- **Sections:**
  - who it's for: restaurants, pharmacies, grocers, boutiques, auto shops, online sellers;
  - how it works: send from the app, pay per delivery, no fleet, no contract;
  - for restaurants: menu in the app, orders in the restaurant console, when food is public;
  - proof: live tracking and a delivery code on every drop;
  - onboarding on WhatsApp;
  - a business FAQ.
- **Facts:** there are **no business or bulk parcel accounts** today; businesses send from the customer app. Don't imply otherwise.

### `/about`: who runs LyniaGo (a trust signal for people and AI assistants)

- **Content:** company (FortyoneX Studio (Private) Limited), the team and founder story, why Harare, the registered details and Harare base address the owner chooses to publish, and contact.
- This is D-42 TODO #3 and needs the owner's copy.

### `/faq`

- The full FAQ (B4 can show the top 5 on the home page and link here).

### `/terms`

- A legal page drafted by counsel. It is not a ranking page, but the footer link currently goes to `#`, and a real one is a trust signal.

## B6. Area pages (later, and only with real data)

- **Rule:** create an area page **only** when real order data makes it unique:
  - typical fare from the CBD;
  - median time to the first rider offer;
  - common pickup landmarks;
  - merchants in the area.
- **Scope:** start with the top 5–8 areas by completed orders.
- **Never** generate templated pages for all 50 suburbs. That is "doorway" and "scaled content" in Google's spam policies, and it hurts the whole site.
- **Template sketch:** H1 "Parcel delivery in {Area}, Harare"; three facts; a local landmark photo; FAQ ×3; a call to action.

## B7. `/food`: when the food marketplace is public beyond the CBD pilot

- A landing page for "food delivery Harare": how ordering works, the delivery fee rule (see [07 §6](./07-drafts.md#6-faq-drafts-verify-each-fact-at-publish-time)), payment options, and restaurants on LyniaGo.
- Individual restaurant pages are Phase 3 ([04 §2](./04-phase-3-moat.md#2-public-restaurant-pages)).

## B8. Technical asks for every page in the export

- [ ] No inline `on*=` handlers, `javascript:` URLs, iframes or remote scripts, images or fonts. `check-website.mjs` fails these, and video can only be linked, not embedded.
- [ ] Assets that change get **new file names** (one-year immutable cache).
- [ ] JSON-LD blocks (FAQPage, JobPosting): see the 404-derivation note in [01 §6](./01-phase-0-foundations.md#6-head-tags-title-description-structured-data-claude-after-decision-1-lane-b). Coordinate with whoever runs the checker.
- [ ] Same `<head>` pattern as the home page: canonical, OG tags, and the same fonts, preloaded.

---

## Questions to settle with the design team

1. **Pages per export, or templates** (decision 3)? With 2–3 approved templates (article, FAQ, landing), text pages could be added without a full export each time. That would need a small build step and checker support, which is an engineering task.
2. **Who writes the copy?** The recommendation: Claude drafts from the code-verified facts in [07](./07-drafts.md), a person edits, and the design team lays it out.
3. **Photography:** real Harare riders and landmarks (with consent) for `/riders`, the Business Profile and press.
4. **A "Delivery by LyniaGo" badge** for merchants ([02 §8](./02-phase-1-launch.md#8-merchant-and-partner-links-ops)).
