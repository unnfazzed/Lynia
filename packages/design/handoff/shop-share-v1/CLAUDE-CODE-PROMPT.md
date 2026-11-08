# Claude Code prompt: Shop share links v1

Paste this into Claude Code from the repo root. The package lives at `packages/design/handoff/shop-share-v1/`.

---

You are building **shop share links** for LyniaGo. The design is final: read `packages/design/handoff/shop-share-v1/README.md` first (its rules win over the drawings), then the plan `docs/plans/2026-11-07-shop-share-links.md` (§7 build lanes, §11 eng review E1–E4).

**Reference files**
- `Shop share v1 - all screens.html`: every state at 360×720 and 320×640 (+ desktop). One frame: `?screen=SH-A2` (add `-320` for small). `?marks=1` outlines what's new.
- `copy.ts`: every user-facing string as `SH`. Ship it verbatim (e.g. `apps/mobile/src/ui/share/copy.ts`, and the merchant + website strings next to their code).
- `DESIGN-DEVIATIONS-entry.md`: add it to `docs/DESIGN-DEVIATIONS.md` as **D-129** in the first PR. Add to CLAUDE.md: "Shop share links follow their own handoff (`handoff/shop-share-v1/`)".
- `ss-*.js`: design reference only. Rebuild with the apps' own components (`StoreCover`, `CompactBar`, `Sheet`, `EmptyState`, `Toast`, merchant `AppBar`/sheet, `FleetInviteSheet` pattern). Don't port the markup.

**Rules**
- Tokens only; no new tokens. Zero new shadows in the apps. Targets ≥ 44, one 52 primary. Green text `#006630` only. "Biker", never "rider". Names wrap 2 lines then ellipsis.
- Not drawn ⇒ not built. If you need a state that isn't drawn, stop and ask.
- Before sign-in, only a live shop's name, logo and cover are public (DR16).

**Order (one PR each, plan §11.8)**
1. **API (lane A).** `Merchant.shareCode` migration + backfill (unique, retry on collision, referral alphabet, 6 chars). `share.controller/service`: `GET /share/:code` (JWT) → `{merchantId, service}`; `GET /share/:code/card` (public) → `{name, logoThumb, coverThumb}`. Identical 404 for unknown / not live / paused. `@Throttle` on both. `Order.shareCode` (nullable). Tests per §11.3.
2. **Website (lane B).** `apps/website/shop.js` beside `invite.js`: `/s/<CODE>` renders SH-W1a/W1b/W2/W3/W4/W5/W6 by user agent; Android fires the `intent://` URL from E1 with the Play fallback (`utm_medium=shop_share&utm_content=<CODE>`); `/s/<CODE>/card.jpg` streams a fresh signed thumbnail composed per SH-W7a/b/c, `cache-control: public, max-age=86400`. og tags per README §4. API down → generic card, never a 5xx. `site/` is untouched.
3. **Mobile pending shop + arrival (lane C).** `src/logic/pending-shop.ts` (`{code, savedAt, source}`, 7-day expiry, cleared by `clearDeviceState`, Play-referrer code used once per install). `install-referral.ts` returns `{referralCode, shopCode}` with strictly separate parsers. `app/s/[code].tsx` + add `/s/` to `SIGNED_OUT_ROUTES`. Skip C1 when a code is pending; the chip on C2/C4/C5/permission asks (SH-S1–S6); hold the Add to Home Screen tip until after the first link order. Arrival SH-A1–A8, biker sheet via `switch-to-customer.ts`. **E4:** table tests asserting today's boot/sign-in destinations are unchanged with no shop pending, plus one Playwright web run `/s/<CODE>` → sign-in → shop.
4. **Share buttons (lane D, merge after C).** Customer Share disc on the cover, tint band and compact bar for all three services (SH-C1–C4) → `Share.share`. Merchant: "Share your shop" row (live only) + `ShopShareSheet` (SH-M1–M6), QR screen + A6 save/print (SH-M4/M4p; add a QR encoder, EC level M). PostHog `shop_link_shared` / `opened` / `ordered`.
5. **Parity.** Screenshots at 360 and 320 for every SH id against the reference frames; screen inventory; a11y labels (README §3).

When unsure, the README's sections 2–4 are the spec.
