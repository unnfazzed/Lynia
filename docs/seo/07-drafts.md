# Drafts: ready-to-use copy and code

Everything here is a **draft**. Facts carry their source in code. **Re-verify each fact on the day you
publish:** prices and the service area are pilot values, and payment options change. Don't edit copy that
is already on the website; that goes through the design team (Lane C).

---

## 1. Head tags (Lane B launch edits)

**For:** Phase 0 §6, after **decision 1**. The code goes in `scripts/check-website.mjs`, beside the
existing `LAUNCH_EDITS`.

```js
/** Structured data for the home page (docs/seo/07-drafts.md §1). sameAs = the brand's own live profiles. */
const SEO_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://lyniago.com/#org",
      name: "LyniaGo",
      legalName: "FortyoneX Studio (Private) Limited",
      url: "https://lyniago.com/",
      logo: "https://lyniago.com/assets/brand/lyniago-mark.svg",
      image: "https://lyniago.com/assets/og-image.png",
      description:
        "On-demand delivery app in Harare, Zimbabwe: send a parcel by motorbike, name your price, choose a verified rider, track it live and confirm the hand-off with a delivery code.",
      slogan: "Stay home. We'll bring it.",
      telephone: "+263778831938",
      contactPoint: { "@type": "ContactPoint", telephone: "+263778831938", contactType: "customer support", areaServed: "ZW" },
      areaServed: { "@type": "City", name: "Harare", sameAs: "https://www.wikidata.org/wiki/Q3921" },
      sameAs: [
        // Add each profile only once it is live (Phase 0 §4), e.g. "https://www.facebook.com/lyniago"
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://lyniago.com/#website",
      url: "https://lyniago.com/",
      name: "LyniaGo",
      publisher: { "@id": "https://lyniago.com/#org" },
    },
    {
      "@type": "Service",
      "@id": "https://lyniago.com/#delivery",
      name: "On-demand parcel delivery in Harare",
      serviceType: "Courier service",
      provider: { "@id": "https://lyniago.com/#org" },
      areaServed: { "@type": "City", name: "Harare" },
    },
  ],
};

// Append to LAUNCH_EDITS:
  {
    id: "seo-title",
    todo: "not a README TODO: search plan (docs/seo/01-phase-0-foundations.md §6)",
    decision: "owner YYYY-MM-DD: approved (D-42); report upstream so the next export carries it",
    from: "<title>LyniaGo — On-demand delivery in Harare</title>",
    to: "<title>LyniaGo — Parcel delivery &amp; courier in Harare</title>",
  },
  {
    id: "seo-description",
    todo: "not a README TODO: search plan (docs/seo/01-phase-0-foundations.md §6)",
    decision: "owner YYYY-MM-DD: approved (D-42); report upstream so the next export carries it",
    from: '<meta name="description" content="On-demand delivery for local businesses in Harare.">',
    to: '<meta name="description" content="Parcels and deliveries across Harare, tracked to your door. Name your price, pick a verified rider, confirm hand-off with a delivery code.">',
  },
  {
    id: "seo-site-name",
    todo: "not a README TODO: search plan (docs/seo/01-phase-0-foundations.md §6)",
    decision: "owner YYYY-MM-DD: approved (D-42); report upstream so the next export carries it",
    from: '<meta property="og:type" content="website">',
    to: '<meta property="og:type" content="website">\n<meta property="og:site_name" content="LyniaGo">',
  },
  {
    id: "seo-jsonld",
    todo: "not a README TODO: search plan (docs/seo/01-phase-0-foundations.md §6)",
    decision: "owner YYYY-MM-DD: approved (D-42); report upstream so the next export carries it",
    // End of <body>, NOT <head>: see "Known issue" below.
    from: "</script>\n</body></html>",
    to: `</script>\n<script type="application/ld+json">${JSON.stringify(SEO_JSONLD)}</script>\n</body></html>`,
  },
```

**Why these words:**
- **Title** (45 characters): adds "parcel" and "courier", the terms Harare searches use; "courier" appears nowhere on the page today.
- **Description** (137 characters): reuses the page's own approved phrases (hero line, step 2, "Verified riders", "Delivery code").
- **Payment:** deliberately says **nothing** about payment until the "any mobile money" line is corrected (Phase 2 B2).

**Known issue: verify before merging.**
- **What was verified** (dry run in a scratch worktree, 2026-09-28): the title, description and `og:site_name` edits apply exactly once and pass.
- **What failed:** with the JSON-LD placed in **`<head>`** (`from: '<meta name="theme-color" content="#00B14F">'`), `node scripts/check-website.mjs --write` failed with *"could not derive the 404 icon script from index.html"*, and 7 of 12 guard tests failed.
- **Untested fix:** the end-of-`<body>` placement above has **not** been run.
  1. Run `node scripts/check-website.mjs --write`, then `node --test scripts/check-website.test.mjs`.
  2. If the derivation still trips, make it skip `<script type="application/ld+json">`.
  3. `--write` also adds the JSON-LD block's hash to the CSP `script-src`. That is harmless: JSON-LD never executes.

**D-42 row to add** (in [`../DESIGN-DEVIATIONS.md`](../DESIGN-DEVIATIONS.md), launch-decisions table):

```markdown
| (not a README TODO) Search metadata | **Add** (owner, YYYY-MM-DD): a clearer `<title>` and meta description, `og:site_name`, and a JSON-LD block (Organization, WebSite, Service) so search engines and AI assistants identify the business (`docs/seo/01-phase-0-foundations.md` §6). | Nothing visible changes. `LAUNCH_EDITS` → `seo-title`, `seo-description`, `seo-site-name`, `seo-jsonld`. **Report upstream** so the next export carries them; the rows then retire. |
```

**After the deploy:**
- Check the page with the [Rich Results Test](https://search.google.com/test/rich-results) and [validator.schema.org](https://validator.schema.org/).
- Request indexing in Search Console.

## 2. `sitemap.xml` with `lastmod` (Lane A)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://lyniago.com/</loc><lastmod>YYYY-MM-DD</lastmod></url>
</urlset>
```

Use the date of the last *real* content change. Add each Phase 2 page as it ships.

## 3. Profile kit (every network, identical)

| Field | Value |
|---|---|
| Name | **LyniaGo** (never "Lynia") |
| Handle | `lyniago` |
| Category | Courier service (secondary: Delivery service) |
| One-liner (80 characters) | On-demand parcel delivery across Harare. Name your price, pick a verified rider. |
| Short bio (Instagram/TikTok/X, 150 characters or fewer) | Parcels & deliveries across Harare 🛵 Name your price · verified riders · delivery code at every drop. WhatsApp 077 883 1938 |
| Long description (Facebook, LinkedIn, YouTube) | The entity sentence below, then: "Businesses use LyniaGo as their delivery team without running a fleet, paying per delivery. Motorbike owners sign up as riders and earn on their own hours." |
| Website | `https://lyniago.com` |
| Phone / WhatsApp | +263 77 883 1938 |
| Location | Harare, Zimbabwe |
| Logo | `apps/website/site/assets/brand/lyniago-mark.svg`. Ask the design team for an 800×800 PNG for networks that reject SVG |
| Cover | `apps/website/site/assets/og-image.png` (1200×630) |

**Entity sentence** (verbatim everywhere):

> LyniaGo is an on-demand delivery app in Harare, Zimbabwe: send a parcel by motorbike, name your price,
> choose a verified rider, track it live and confirm the hand-off with a delivery code. LyniaGo is
> operated by FortyoneX Studio (Private) Limited.

## 4. Google Business Profile text

**Description** (limit 750 characters; no links, prices or "best/cheapest" claims):

> LyniaGo is an on-demand delivery app for Harare. Send a parcel across town by motorbike: set the pickup
> and drop-off, name your price, and choose from nearby verified riders who accept your price or counter
> it. Follow the delivery live, and hand-off is confirmed with a delivery code, so your parcel only goes to
> the right person. Parcels are paid in cash to the rider at the price you agreed. Businesses such as
> restaurants, pharmacies, grocers, boutiques, auto shops and online sellers use LyniaGo as their delivery
> team without running a fleet, paying per delivery. Motorbike owners can sign up as riders, go online when
> it suits them and accept or counter fares. Help is on WhatsApp and by phone.

**Services** (add food only once it is public):

| Service | Description |
|---|---|
| Parcel delivery | Send a parcel across Harare by motorbike. Name your price, choose a verified rider, track it live. |
| Business deliveries | Pay per delivery for your shop, restaurant or online store: no fleet, no contract. |
| Rider sign-up | Own a motorbike? Sign up in the app, get verified, and earn on your own hours. |
| Food delivery *(when public)* | Order from Harare restaurants in the LyniaGo app. |

**First four Updates** (one a week; button "Learn more" → `https://lyniago.com`):
1. **Launch** (only once the app is public): "LyniaGo is live in Harare 🛵 Send a parcel across town: set pickup and drop-off, name your price, pick a verified rider and track it live. Every hand-off is confirmed with a delivery code."
2. **How it works:** "Send in three steps: ① set pickup and drop-off, ② name your price and pick a rider, ③ track live and share the code at hand-off."
3. **Riders:** "Got a motorbike? Ride with LyniaGo and earn on your terms. Go online when it suits you and accept the fare or counter it. Sign up in the app."
4. **Businesses:** "Your delivery team, without the fleet. Restaurants, pharmacies, grocers and online sellers in Harare pay per delivery, and customers track every order live."

## 5. NAP block for directories

```text
Name:        LyniaGo
Legal name:  FortyoneX Studio (Private) Limited
Phone:       +263 77 883 1938 (WhatsApp)
Website:     https://lyniago.com
Email:       support@lyniago.com   (once routing exists: Phase 0 §4)
Address:     [real base or registered office in Harare, identical everywhere; hidden on the Business Profile]
Category:    Courier service (also: Delivery service)
Short:       On-demand parcel delivery across Harare. Name your price, pick a verified rider.
Long:        [the entity sentence, §3]
Hours:       [real hours]
Logo/cover:  as in §3
```

## 6. FAQ drafts (verify each fact at publish time)

| # | Question | Draft answer | Source / status |
|---|---|---|---|
| 1 | How much does it cost to send a parcel in Harare? | You decide. When you set the pickup and drop-off, LyniaGo suggests a fair starting price: US$1.50 plus US$0.60 per kilometre, about US$4.50 for a 5 km trip. It also shows the range riders usually accept. You can offer more or less. Nearby riders accept your price or make one counter-offer, and you choose. | `packages/shared/src/pricing.ts` (base 1.50, 0.60/km straight line, floor 1.50); `apps/mobile/src/logic/fare-band.ts` (0.85–1.2×); [`../PRICING.md`](../PRICING.md). **Pilot values: decision 6** |
| 2 | How quickly will a rider come? | Your request goes first to riders close to your pickup point, then further out if needed. Before you choose, you see each interested rider's price, rating and arrival time. The request stays open for 90 seconds. | `packages/shared/src/policy.ts` (5 → 8 → 12 km); `packages/shared/src/contracts.ts` (90 s). **Never promise delivery minutes** |
| 3 | Where does LyniaGo deliver? | *[Final area: e.g. "Across {areas}" or "anywhere within N km of the CBD"]*. Both the pickup and the drop-off need to be inside the area. | `packages/shared/src/policy.ts` `SERVICE_CORRIDOR` (pilot: 25 km around the CBD, "replace … before launch"). **Decision 6** |
| 4 | How do I pay? | For parcels, you pay the rider in cash when the delivery is done, at the price you agreed. For food orders, pay cash at the door, or use mobile money (EcoCash, InnBucks or O'mari) at checkout. | `apps/mobile/app/settings/payment.tsx`; `apps/mobile/app/food/checkout.tsx`; [`../PAYMENT-RAIL-OUTSTANDING.md`](../PAYMENT-RAIL-OUTSTANDING.md) |
| 5 | Is my parcel safe? | Every LyniaGo rider verifies their national ID with an ID photo and a selfie check, and registers their motorbike. You can follow the delivery live, and the rider can only complete it with the delivery code you share with the person receiving it. After each delivery you rate the rider. | `apps/mobile/app/rider/become.tsx`; `apps/api/src/matching/matching.service.ts` |
| 6 | What can I send? | Parcels with a declared value of up to US$150 that a motorbike can carry safely. *[Prohibited and oversized items: list to be defined.]* | `packages/shared/src/contracts.ts` (cap 150, pilot). **Needs the prohibited-items notice** (design backlog A1-2) and decision 9 |
| 7 | How do I become a LyniaGo rider? | You need a motorbike with its registration, your national ID and a smartphone. Sign up in the LyniaGo app and complete the ID photo and selfie check. Once you're verified, go online whenever it suits you, see requests nearby, and accept the customer's price or counter it. | `apps/mobile/app/rider/become.tsx`; `apps/api/src/riders/online-gate.ts`. *"0% commission at launch" only with owner approval (`policy.ts`, env-changeable)* |
| 8 | Can my business use LyniaGo? | Yes. Any business can book deliveries in the app and pay per delivery, with no fleet to run and no contract. *[When food is public: "Restaurants can also list their menu in the LyniaGo app and manage orders from the restaurant console."]* Message us on WhatsApp to get started. | No business or bulk accounts exist; restaurants are gated (`RESTAURANTS_ENABLED`, CBD pilot) |
| 9 | Where do I get the app? | *Before public:* "LyniaGo is in testing on Android. Message us on WhatsApp and we'll tell you when it's available." *After:* "Download LyniaGo on Google Play." | `CLAUDE.md` § Expo/EAS. **Never say "on Google Play" early.** iOS is planned (customer app only), with no date |
| 10 | Who runs LyniaGo? | LyniaGo is operated by FortyoneX Studio (Private) Limited, *[based in Harare: owner to confirm]*. | Site footer |
| 11 | How do I contact LyniaGo? | WhatsApp or call +263 77 883 1938. | `packages/shared/src/policy.ts` (safety line) |

**FAQPage JSON-LD** must mirror the *visible* Q&As word for word. Generate it from the final copy; never
mark up questions that aren't on the page.

## 7. WhatsApp and review messages

**Review request, customer** (send to **every** completed delivery; clear it against the privacy notice first, see Phase 1 §5):

> Hi {first name}, thanks for sending with LyniaGo today. If you have a minute, a Google review helps
> other people in Harare find us: {review link}. Anything we could do better? Just reply here.

**Review request, merchant** (weekly):

> Hi {name}, thanks for delivering with LyniaGo this week. If LyniaGo is working for {business}, a short
> Google review would help other Harare businesses find us: {review link}. Any problems, reply here and
> we'll sort it.

Use no incentives, no "5 stars please", and no sending only to happy customers. A Shona version must be
written by a native speaker.

**Reply templates** (a person posts them within 24–48 hours; never reveal order details or rider names publicly):

| Review | Reply |
|---|---|
| ★★★★★ | Thank you, {name}! Glad it went smoothly. See you on the next delivery. |
| ★★★★ with a suggestion | Thanks, {name}. Noted on {their point}: we're on it. Appreciate you telling us. |
| ★–★★★ complaint | Sorry about this, {name}. That's not the experience we want. Please WhatsApp us on 077 883 1938 with the details so we can put it right. |
| Looks fake or wrong business | Calm and short: "We can't find a LyniaGo delivery matching this. Please WhatsApp us on 077 883 1938 so we can help." Then **report it** in the Business Profile. |

## 8. Press

**Boilerplate ("About LyniaGo"):**

> LyniaGo is an on-demand delivery app in Harare, Zimbabwe. Customers send parcels by motorbike, name
> their own price and choose from verified riders, with live tracking and a delivery code at every
> hand-off. Businesses use LyniaGo as an on-demand delivery team, and motorbike owners use it to earn on
> their own hours. LyniaGo is operated by FortyoneX Studio (Private) Limited. https://lyniago.com ·
> WhatsApp +263 77 883 1938

**Pitch email** (send 5–7 days ahead, with an embargo):

```text
Subject: Harare app lets you name your price for a delivery — launching {date}   [or: "Verified riders + a delivery code: LyniaGo launches in Harare"]

Hi {first name},

{One line on why this outlet/reporter: e.g. "You covered inDrive's courier launch in 2024" / "your motorbike-deliveries feature"}.

On {date}, LyniaGo launches publicly in Harare: an on-demand delivery app where you set the pickup and
drop-off, name your price, and choose from nearby verified motorbike riders. Riders accept or counter;
hand-off is confirmed with a delivery code.

Three things that may interest your readers:
- Price: customers set it; the app suggests a fair start {only if decision 6 allows: "from US$1.50 + US$0.60/km"}.
- Safety: every rider verifies their national ID with a selfie check; every drop needs the delivery code.
- Riders: motorbike owners earn on their own hours {only if approved: "with 0% commission at launch"}.

Happy to arrange: an interview with {founder}, a rider and a merchant using it, screenshots and photos.
Press kit: {link}. Embargo: {date, time CAT}.

{name} · LyniaGo · +263 77 883 1938 · https://lyniago.com
```

**Fact sheet skeleton:**
- what it is (the entity sentence);
- launch date;
- areas served;
- how it works (three steps);
- price model (decision 6);
- payment;
- safety;
- rider requirements;
- for businesses;
- the company;
- contacts;
- the image list.

## 9. Rider page outline and JobPosting draft

**Outline for `/riders`** (layout by the design team, Phase 2 B5):
1. **Hero:** "Ride with LyniaGo in Harare. Earn on your terms."
2. **What you need:** a motorbike and its registration, a national ID, a smartphone, a quick selfie check.
3. **How jobs work:** go online when it suits you; see nearby requests; accept the customer's price or counter it.
4. **Getting paid:** the customer pays you in cash at the agreed price *(commission line only if approved)*.
5. **Safety:** delivery code, ratings, support line.
6. **Rider FAQ:** documents, areas, hours, what if a customer doesn't pay.
7. **Call to action:** download the app / WhatsApp.

**JobPosting JSON-LD** (check Google's current [JobPosting documentation](https://developers.google.com/search/docs/appearance/structured-data/job-posting) for required fields when implementing):

```json
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "Motorbike delivery rider (Harare)",
  "description": "<p>Deliver parcels across Harare with LyniaGo on your own hours. Go online when it suits you, see delivery requests near you, and accept the customer's price or counter it. You need a motorbike with its registration, a national ID and a smartphone; verification includes an ID photo and a selfie check.</p>",
  "datePosted": "YYYY-MM-DD",
  "validThrough": "YYYY-MM-DDT23:59:59+02:00",
  "employmentType": "CONTRACTOR",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "LyniaGo",
    "sameAs": "https://lyniago.com",
    "logo": "https://lyniago.com/assets/brand/lyniago-mark.svg"
  },
  "jobLocation": {
    "@type": "Place",
    "address": { "@type": "PostalAddress", "addressLocality": "Harare", "addressRegion": "Harare", "addressCountry": "ZW" }
  }
}
```

**Rules:**
- Only while you are genuinely recruiting. Keep `validThrough` current and remove the markup when paused.
- **No `baseSalary`:** earnings vary, so don't promise figures.
- Review Google's job-posting content policies before publishing. Postings that ask applicants to pay can be disallowed, which matters if the commission top-up gate is ever on (rate above 0%).

## 10. Play listing snippets (decision 5)

| Field | Draft |
|---|---|
| Short description (80 characters) | Send parcels across Harare by motorbike. Name your price, riders bid, you pick. |
| Full description, add to the opening | "…across Harare…" in the first sentence, plus one line listing the main areas served |
| Contact website | `https://lyniago.com` |
| Closing paragraph | Replace any "Lynia" with "LyniaGo"; support email on `lyniago.com` |

## 11. Merchant partner snippet

- **Instagram / TikTok bio line:** `🛵 Delivery across Harare with LyniaGo → lyniago.com`
- **Website or WhatsApp catalogue text:** "We deliver across Harare with LyniaGo: a verified rider brings your order, you can track it live, and hand-off is confirmed with a delivery code. lyniago.com"
- **Badge:** request a "Delivery by LyniaGo" badge from the design team (visual assets are design-owned).
