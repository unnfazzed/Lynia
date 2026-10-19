# Prompt for Claude Design (paste as the first message)

```
Design "Own bikers v1" for LyniaGo, inside the existing LyniaGo design system. Read BRIEF.md first; it is the work
order and its product decisions are final.

Use the lynia-design skill (SKILL.md, readme.md, tokens/). Extend the handoffs I attached, don't start fresh:
- merchant-v2 (its BRIEF.md wins over its drawings) for the merchant screens: T3 Account, S4 Book a rider,
  K1 board, K5 cash card, T2/T2b Money, sheets, info strips;
- merchant-mobile E2/E3 for the Team list and invite rows (the roster and invite sheet are built from them);
- rider-v2 for the biker screens: MintTop, BoardMap, JobCard, food offer F1–F4, active job A1–A13/B1–B6,
  cancel sheets X6/X8, Money M1–M12, Account;
- empty-states-v2 for every empty state; first-run-v2 for the full-screen sheet; ui_kits/admin for the console.
- shop-front-v1 shows what a finished export looks like.

Hard rules:
1. Draw every frame in BRIEF.md §3 (OB-M1–M14, OB-R1–R13, OB-A1–A4) and every state in §4.
   Phone frames at 360×720, plus 320×640 versions of OB-M2, OB-M8, OB-R2, OB-R4, OB-R10. Admin at 1440×900.
2. Tokens only, no new tokens. Inter 400/600/700, tabular numbers for money and times. Lucide icons, stroke 2,
   always with a text label.
3. Every tap target is drawn at size: at least 44px (--target-min); the one primary per screen is 52px.
4. User-facing copy says "biker", never "rider" (the old handoffs say rider; new strings must not).
   The one exception is the "From your Preferred riders" group header in OB-M5, which names the retired feature.
5. Biker app: no Retry buttons and no pull-to-refresh; failures say what the app is doing ("Trying again in 10 s").
   Merchant and admin use "Try again".
6. Never red text on white: danger = --danger-wash fill with --danger-ink text.
7. Fleet jobs show no fare, no commission, no top-up and no strikes anywhere in the biker app.
8. Use the copy in BRIEF.md verbatim. Only strings marked (draft) may be reworded.
9. Only two new parts are allowed: the countdown bar (OB-M9) and the roster state chip. Build everything else from
   parts the attached handoffs already draw.

Export it like shop-front-v1, as "own-bikers-v1": README.md (screen index by data-screen-label, layout, tokens used,
open items, the DESIGN-DEVIATIONS entry text), "Own bikers v1 - all screens.html" + "(standalone).html",
screens/*.png, copy.ts (every string, keyed OB.merchant / OB.biker / OB.admin, new strings marked NEW),
CLAUDE-CODE-PROMPT.md (build order split into merchant, biker and admin PRs), and tokens/ unchanged.

Before drawing, list any place where BRIEF.md conflicts with an attached handoff and how you resolved it.
```
