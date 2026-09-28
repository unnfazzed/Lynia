# Owner decisions for the search plan

Each decision unblocks part of the plan. Record the answer and date here (or in the PR that acts on it),
and mirror anything that affects the website in D-42 ([`../DESIGN-DEVIATIONS.md`](../DESIGN-DEVIATIONS.md)).

| # | Decision | Recommendation | Unblocks | Status |
|---|---|---|---|---|
| 1 | Ship the head tags (title, description, `og:site_name`, JSON-LD) as launch edits? | **Yes**: nothing visible changes; same path as the privacy-link fix | Phase 0 §6 | Open |
| 2 | Analytics: stay at "none", or run cookie-free Cloudflare Web Analytics as a manual snippet? | **Manual snippet**: the only way to see visits from ChatGPT/Perplexity | AI-referral measurement, real-user speed data | Open |
| 3 | New pages: one handoff export per page, or approved templates? | **Per export for the first batch**; revisit templates when content becomes regular | Phase 2 | Open |
| 4 | Keep the GitHub repo public? | **Owner's call.** Private if CI minutes allow; otherwise public with the site in its description | Phase 0 §8 (brand results) | Open |
| 5 | Allow "Harare" in the Play listing *text*? | **Yes, in the descriptions**; keep screenshots place-free if that's the reason for the rule | Phase 1 §2 | Open |
| 6 | Publish prices and the service area on the site and in press? | **Yes, once final**: it's the #1 question people and AI assistants ask | Phase 2 FAQ, Phase 1 press and Business Profile service areas | Open |
| 7 | Add the monthly "Search & AI visibility watch" routine? | **Yes, after Phase 0** (it needs API credentials) | [05 §6](./05-ai-visibility-engine.md#6-proposed-routine-decision-7-search--ai-visibility-watch) | Open |
| 8 | Let AI *training* crawlers in (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, Meta-ExternalAgent, CCBot)? | **Allow**: a new brand wants to be in the models' memory; the page has nothing proprietary | Phase 0 §3b | Open |
| 9 | Prohibited and oversized items: what can't be sent? | **Define it before launch** (design backlog A1-2 rates it a P1 liability) | FAQ #6, press, rider safety | Open |
| 10 | Which real address is the base for the Business Profile (hidden) and directories that require one? | A staffed Harare office or depot, central if possible | Phase 1 §3 and §7 | Open |
| 11 | Say "0% commission at launch" in public rider copy? | **Only with a committed period** (e.g. "for the first 3 months"); the rate is an env setting | `/riders` page, press angle | Open |

---

## Notes per decision

**1. Head tags.**
- **What:** pixel-identical edits recorded in `LAUNCH_EDITS` and D-42, and reported to the design team so the next export carries them.
- **Status:** drafted and partly verified in [07 §1](./07-drafts.md#1-head-tags-lane-b-launch-edits). The JSON-LD placement has a known 404-derivation issue to resolve first.
- **Alternative:** ask the design team to put them into the next export, which is slower but needs no launch edits.

**2. Analytics.**
- **Today:** "none" (D-42, README TODO #5). Meanwhile Cloudflare was *injecting* its beacon, and the CSP blocked it; switching that off is Phase 0 §3a either way.
- **What the manual snippet adds:** referrers (`chatgpt.com`, `perplexity.ai`, `gemini.google.com`) and real-user Core Web Vitals.
- **What it costs:** a few KB per visit, a CSP change and a checker allowance ([06 §3](./06-keywords-and-measurement.md#3-measurement-stack)).
- **Without it:** Search Console, Bing, the Business Profile, Cloudflare server-side analytics and the AI panel still work.

**3. Pages.**
- **Per export:** full design control and the existing checker as-is; one design round-trip per page.
- **Templates:** faster once content is regular (Delivery Index, area pages), but they need a small build step and checker support. That is an engineering task, plus a change to the "ship as-is" rule.

**4. GitHub repo.**
- **Why it matters:** today the repo is what Google and AI assistants find for "LyniaGo", including ops history.
- **Cost of going private:** Actions minutes (private repos have a monthly allowance; public repos don't) and anything that relies on public access.
- **Middle ground:** stay public, and set the repo description to "LyniaGo — on-demand delivery in Harare" with website `https://lyniago.com`.

**5. Play listing text.** `store-assets/google-play/README.md` bans place names on customer-facing store surfaces. Play search ranks on title and description text, so "Harare" there helps local discovery. Screenshots can stay place-free.

**6. Prices and area.**
- Both are marked **pilot** in code: `pricing.ts` says "tune at the pricing T0 spike", and `policy.ts` says "replace with the real coverage boundary … before launch".
- **Once final, publish:**
  - the *model*: you name the price, and the app suggests a fair start from US$X + US$Y/km;
  - the *area*, as text.
- **Until then:** the FAQ can explain the model without numbers.

**7. Routine.** It follows [`../ROUTINES.md`](../ROUTINES.md)'s universal policies (ships a PR and merges on green). It needs a Search Console service-account credential, a Bing API key and AI provider keys, stored in the routine environment and **never** in GitHub Actions (public logs).

**8. Training crawlers.** Search and assistant fetchers (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot, Claude-User) should be allowed regardless; they are how assistants cite live pages. Training crawlers are the real choice.

**9. Prohibited items.** Customers, press and AI assistants will ask what can be sent. The typical list covers cash, hazardous or illegal goods, perishables beyond a time limit, and anything a motorbike can't carry safely, with a size and weight ceiling. The final list is a product and legal decision.

**10. Base address.**
- **Business Profile:** Google needs a real address even when it's hidden (service-area business). Proximity to it affects who sees the listing.
- **Directories:** some require an address. Use the same one everywhere, and never a virtual office.

**11. Commission.** `packages/shared/src/policy.ts` sets the rider commission `ratePct: 0` and notes it can be flipped by an environment change. Publishing "0%" without a time frame creates a promise that is easy to break.
