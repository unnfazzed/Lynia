# Phase 1: Launch window (Play public, backend up)

**Why this phase matters most:** for "courier / delivery … Harare" searches, Google shows the **map pack**
(three Business Profiles) above the web results. AI assistants lean on the same signals: reviews, directory
listings and press. This phase builds all of them in the weeks around the public launch.

## Gates: do not start until all of these are true

- [ ] **The Play listing is public** (closed test done, production access granted): [`../PLAY-STORE-SUBMISSION.md`](../PLAY-STORE-SUBMISSION.md). Until then, nothing may say "on Google Play".
- [ ] **The backend is back** (Azure migration): [`../plans/2026-09-24-gcp-to-azure-migration.md`](../plans/2026-09-24-gcp-to-azure-migration.md). Reviews and press will send real users.
- [ ] **The service area and pricing are final** (they replace the pilot values in `packages/shared/src/policy.ts` and `pricing.ts`). The Business Profile service areas and all copy must match them.
- [ ] **A prohibited and oversized items notice exists** (design backlog A1-2). Press and customers will ask "what can I send?".
- [ ] **Phase 0 is done**, at minimum steps 1–5.

| # | Step | Who | Lane |
|---|---|---|---|
| 1 | Play links on the website | Claude | B (already planned in D-42) |
| 2 | Play listing optimisation | Owner (+ Claude drafts) | A |
| 3 | Google Business Profile | Owner | A |
| 4 | Apple Business + Bing Places | Owner | A |
| 5 | Reviews engine | Owner/ops (+ Claude drafts replies) | A |
| 6 | Launch press | Owner (+ Claude drafts) | A |
| 7 | Directory citations | Owner or ops | A |
| 8 | Merchant and partner links | Ops | A |
| 9 | Social launch | Owner/ops | A |

---

## 1. Play links on the website (Claude, Lane B)

Already decided in D-42 (README TODO #1). Add one `LAUNCH_EDITS` entry per button:
- the three "Download the app" buttons, "Send a parcel" and "Become a rider" point to
  `https://play.google.com/store/apps/details?id=zw.co.lynia` with `target="_blank" rel="noopener"`;
- "How it works" stays `#riders`.

Follow the D-42 retirement note.

**Tips:**
- **Attribution without a tracker (owner's call, since it changes the approved URL):** append a Play referrer, for example
  `&referrer=utm_source%3Dlyniago.com%26utm_medium%3Dwebsite%26utm_campaign%3Dhero`, with a different campaign per
  button. Play Console's acquisition report then shows installs from the website. No script is needed.
- **Verify in the smoke:** after the deploy, `bash apps/website/smoke.sh` runs. Also check that the links open the listing on a real Android phone.

## 2. Play listing optimisation (Owner, with Claude drafts)

Play search is where many Android users (88% of Zimbabwe's phones) look for apps. The listing also
appears in Google web results for "delivery app Harare".

- **Title** (30 characters): keep "LyniaGo", or add a descriptor such as `LyniaGo: Parcel Delivery`. Descriptive words are allowed; claims like "#1" or "best" are not.
- **Short description** (80 characters): if decision 5 allows place names, use
  `Send parcels across Harare by motorbike. Name your price, riders bid, you pick.` (79 characters).
- **Full description:** mention Harare naturally two or three times, plus the main areas you serve, how payment
  works (cash for parcels), safety (verified riders, delivery code) and the website. Never stuff keywords.
- **Category:** Maps & Navigation, the same as inDrive and Bolt. Keep it.
- **Ratings:** the Play In-App Review prompt after a completed delivery is the strongest lever. It is an
  **app change, so it needs a design mock first** (`CLAUDE.md`: "Not drawn ⇒ not rendered"). Request it from the design team.
- **Contact details:** website `https://lyniago.com` and a `lyniago.com` support email (Phase 0 step 5).

## 3. Google Business Profile (Owner): the biggest single lever

### 3a. Create it

1. <https://business.google.com> → **Add business**.
2. **Business name: `LyniaGo`**, exactly. **Never** "LyniaGo Parcel Delivery Harare": keyword-stuffed names get profiles suspended.
3. **Primary category: Courier service.** Secondary: **Delivery service**. (Add "Food delivery"-type categories only once food is public, and only if Google offers a fitting one.)
4. **"Add a location customers can visit?" → No.** That makes it a **service-area business** with the address hidden. You still enter a real base address privately.
   - Use a real, staffed place in Harare (office or depot). Never a virtual office or a P.O. box.
   - Proximity to this hidden base affects which searchers see you, so central is better.
5. **Service areas:** up to 20, only the areas you really serve (the final boundary from the gate above). Examples if served: CBD, Avenues, Avondale, Belgravia, Milton Park, Mount Pleasant, Borrowdale, Highlands, Greendale, Eastlea, Msasa, Hatfield, Waterfalls, Mabelreign, Marlborough, Westgate, Mbare, and Chitungwiza, Ruwa or Epworth if covered. Google caps the area at about 2 hours' drive from base.
6. **Phone:** `+263 77 883 1938`. **Website:** `https://lyniago.com`.
7. **Verify** (see 3b).

### 3b. Verification: prepare a video

Google picks the method for your region and business type. For a new service-area business it is usually a
**video recording**. The rules ([Google's help](https://support.google.com/business/answer/14271705)):
- **At least 30 seconds, one continuous take, no editing.**
- **Show where you are:** street signs, a nearby landmark or neighbouring businesses around your base.
- **Show the business operating:** a branded LyniaGo motorbike box or rider gear, a rider with a bike, and the rider app on a phone.
- **Show that you manage it:** unlock the office or store room, open the LyniaGo admin console on a laptop, or show registration documents for FortyoneX Studio (Private) Limited.
- **Timing:** review takes up to 5 business days. Don't edit the profile while it is pending.

### 3c. Complete the profile (a complete profile ranks better)

- **Description:** from [07-drafts.md §4](./07-drafts.md#4-google-business-profile-text). Maximum 750 characters, no links, no "best/cheapest" claims.
- **Hours:** the real hours in which you take orders and answer WhatsApp. Update them for public holidays.
- **Opening date:** the launch date.
- **Services:** Parcel delivery; Business deliveries; Rider sign-up; and Food delivery only once it is public. Each gets a one-line description ([07 §4](./07-drafts.md#4-google-business-profile-text)).
- **Photos:** logo, cover, and **real photos**. Riders with branded boxes at recognisable Harare places (with the riders' consent), the team, app screens. Add a few more every month.
- **Social profiles:** link the Phase 0 profiles, where the field offers them.
- **Review link:** Home → **Ask for reviews**. Copy the short link for the reviews engine (§5).

### 3d. Keep it alive (weekly, 15 minutes)

- **Post one Update a week.** Drafts are in [07 §4](./07-drafts.md#4-google-business-profile-text); the AI engine drafts new ones monthly ([05](./05-ai-visibility-engine.md)).
- **Reply to every review within 24–48 hours.** Templates are in [07 §7](./07-drafts.md#7-whatsapp-and-review-messages).
- **Watch Performance monthly:** searches, calls, website clicks.
- **Renaming, recategorising or moving the base right after verification can trigger re-verification.** Get it right first.

**How map-pack ranking works:**
- **Relevance:** category, services and description match the search.
- **Prominence:** review count, rating and recent velocity; links and press; directory consistency.
- **Proximity:** distance to the searcher.

You control the first two.

## 4. Apple Business and Bing Places (Owner)

- **Apple Business** (Apple Maps, Siri; 12% of phones): <https://businessconnect.apple.com>. Brand and Location Management is available in Zimbabwe. Use the same name, category, phone and website.
- **Bing Places** (Bing Maps, Copilot): <https://www.bingplaces.com> → **Import from Google Business Profile** after 3a is verified. Zimbabwe support could not be confirmed on 2026-09-28; if the import fails, skip it.

## 5. Reviews engine (ops, with Claude drafting replies)

Reviews are the biggest ranking factor you control, and AI assistants quote them.

**Process:**
1. After every completed delivery, ops sends **every** customer (and every merchant, weekly) a short WhatsApp with the Business Profile review link. Template: [07 §7](./07-drafts.md#7-whatsapp-and-review-messages).
2. **Never offer anything in return, and never ask only the happy customers.** Google bans both incentives and "review gating", and can remove all your reviews.
3. **Privacy notice first.** It promises *"We do not send you marketing messages. The messages we send are about your own orders."* A post-delivery "how did we do?" message is arguably order-related. Get it confirmed, or update the notice, before starting.
4. **Replies:**
   - The AI engine drafts a reply to each new review; a person approves and posts it within 24–48 hours.
   - **Negative reviews:** apologise, move the conversation to WhatsApp, fix the problem, and never argue or reveal order details publicly.
5. **Target:** a steady 3–5 new reviews a week beats a burst. Irregular spikes look suspicious.

**Play Store ratings:** see §2 (the in-app prompt needs a design mock).

## 6. Launch press (Owner, with Claude drafting pitches)

Each story is a **local link** to lyniago.com and a **source AI assistants cite** when asked "what delivery
apps are in Harare?".

| Outlet | Why | Link |
|---|---|---|
| **Techzim** | Covers startup launches (inDrive courier 2024, Kose 2026) | <https://www.techzim.co.zw/> |
| The Herald / Business Weekly | Mainstream business coverage; Business Weekly covered inDrive courier | <https://www.heraldonline.co.zw/>, <https://www.businessweekly.co.zw/> |
| Sunday Mail | Ran "Motorbike deliveries reshape city life", a natural follow-up | <https://www.sundaymail.co.zw/> |
| NewsDay | Local news. Its *Branding Voice* section is **paid** (useful for awareness; its links are usually marked sponsored) | <https://www.newsday.co.zw/> |
| 263Chat, Pindula News, StartupBiz, ZimLive, iHarare, Equity Axis, Business Times | Tech and business reach; Pindula also runs a wiki (§7) | <https://www.263chat.com/>, <https://news.pindula.co.zw/>, <https://startupbiz.co.zw/> |

**Angles** (all true today):
- You name the price for a parcel, and riders accept or counter.
- Safety: ID and selfie verified riders, plus a delivery code at every hand-off.
- Income for motorbike owners on their own hours; if the owner approves, 0% commission at launch.
- Built in Harare.

**Press kit:** logo, 3–4 app screenshots, founder photo and quote, a one-page fact sheet (launch date,
areas, how it works, prices only if decision 6 allows), and contacts. Pitch and boilerplate:
[07 §8](./07-drafts.md#8-press).

**Tips:**
- **Pitch 5–7 days before the public date,** with an embargo. Follow up once.
- **Ask for the link to be `https://lyniago.com`,** not only the Play listing. The site is what builds rankings.
- **Never pay for "SEO links" or guest posts on link farms.**

## 7. Directory citations (Owner or ops, about 2 hours)

Use the **identical** name, phone, website and description everywhere: the NAP block in
[07 §5](./07-drafts.md#5-nap-block-for-directories). Track each listing in a sheet with these columns:
site, URL, date, login owner, status.

| Priority | Directory | URL | Note |
|---|---|---|---|
| 1 | ZimbabweYP (Courier Services, Harare) | <https://www.zimbabweyp.com/> | Its category page already ranks for "courier services Harare" |
| 1 | Facebook Page (Phase 0) | — | Facebook pages fill local results |
| 1 | Apple Business, Bing Places (§4) | — | Maps |
| 2 | The Directory | <https://thedirectory.co.zw/> | |
| 2 | ZimPlaza | <https://www.zimplaza.co.zw/listing/> | Free listing |
| 2 | Zimbabwe Yellow Page | <https://www.zimyellowpage.com/> | |
| 2 | classifieds.co.zw directory | <https://www.classifieds.co.zw/directory> | |
| 2 | WhoDoYou (Harare courier) | <https://www.whodoyou.com/l/harare--zimbabwe/courier-delivery-service> | Ranks for "delivery service Harare" |
| 2 | Zikimall directory | <https://directory.zikimall.com/> | Ranks for "motorbike delivery Harare" |
| 3 | ZimBiz Directory | <https://zimbizdirectory.com/> | |
| 3 | SMEAZ business directory | <https://www.smeaz.org.zw/shop-online/business-directory> | |
| 3 | Byolife | <https://byolife.co.zw/> | Lists Hwindi |
| 3 | My Guide Zimbabwe | <https://www.myguidezimbabwe.com/> | |
| 3 | Tisitano, Ownai (classifieds) | <https://tisitano.com/>, <https://www.ownai.co.zw/> | Rider-recruitment ads |
| 3 | Pindula (company page) | <https://www.pindula.co.zw/> | Neutral, factual tone; cite the press coverage |
| Later | Ndeipi (food) | <https://ndeipi.co.zw/> | Once food is public |
| Later | Job boards: iHarare Jobs, Vacancy Mail and similar | — | Rider recruitment; links back to `/riders` (Phase 2) |

**Tips:**
- **Never use a fake or virtual address.** Where an address is mandatory, use the real base or registered office, identical everywhere.
- **Skip paid "submit to 500 directories" packages.** Spam links hurt.
- **Recheck twice a year.** Directories edit or drop listings.

## 8. Merchant and partner links (ops)

Every restaurant or shop that onboards is a local website, Instagram and WhatsApp presence:
- **Ask each merchant** to add "Order delivery via LyniaGo" with a link to `https://lyniago.com` to their site, Instagram bio and WhatsApp catalogue. Snippet: [07 §11](./07-drafts.md#11-merchant-partner-snippet).
- **Badge:** ask the design team for a "Delivery by LyniaGo" badge. Visual assets are design-owned.
- **Relevance:** local business links are exactly the prominence signal that local ranking rewards.

## 9. Social launch (Owner/ops)

- **Launch week:**
  - a "how it works" video (Send in three steps);
  - "now live in Harare";
  - a rider-recruitment post;
  - "for businesses";
  - a short founder story.
- **Harare Facebook groups** (buy-and-sell, community, business): read each group's rules, post as yourself, **declare you're from LyniaGo**, answer questions, and don't spam links.
- **Pin a post** with the website and WhatsApp number on each profile.

---

## Launch-week checklist

- [ ] Play buttons on the site go to the public listing; the smoke is green
- [ ] Play listing: website field set, "LyniaGo" only, Harare in the text (if decision 5 allows)
- [ ] Business Profile created and verification submitted; description, services, hours and photos complete
- [ ] Apple Business done; Bing Places imported
- [ ] Review-request message approved against the privacy notice; the first 20 requests sent
- [ ] Press kit ready; pitches out with an embargo; stories live on the public date
- [ ] 10 directory citations with identical details
- [ ] 5 merchants linking to lyniago.com
- [ ] AI panel re-run one week after launch ([05](./05-ai-visibility-engine.md))
