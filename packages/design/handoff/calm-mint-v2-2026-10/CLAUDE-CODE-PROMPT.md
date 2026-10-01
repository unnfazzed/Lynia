# Work order: Calm Mint v2 (Home + onboarding)
Stack: React Native (Expo), Android-first. Read `README.md` first. The pixel target is `Calm Mint v2 - all screens.html?screen=<ID>` at 360px.

## Do
1. Build the tokens from README §1 into the theme first. Replace gold #F2B705 with highlight #FFD23F everywhere it was used.
2. Home (H1–H6) exactly as README §2:
   - address control → location sheet
   - 4 live service tiles (no SOON)
   - two rails (Popular restaurants, Popular shops)
   - the Free delivery tag on cards
   - one floating live-order bar above the tab bar
3. Use the SVGs in `assets/service-icons/v2/` and `assets/illustrations/` verbatim, via react-native-svg.
4. Customer onboarding C1→C5. WhatsApp-only OTP, auto-read and auto-verify, resend enabled after the countdown. Name is First name + Surname, two fields.
5. Rider onboarding R1→R3 with a resumable checklist. Persist the step server-side so a reopened app resumes it.
6. Ask for permissions in context (location on Home's first address need, notifications after the first order).
7. Copy every string verbatim from the reference HTML.
8. Gate everything in README §5 behind flags. Hide the Free tag and the shops rail when the data is absent.

## Don't
- Don't add shadows, new font weights (only 400/600/700), new colours, or SOON chips.
- Don't add a Send-a-parcel card on Home, free-delivery rails, a role choice screen, a national ID at sign-up, an SMS fallback link, or a Verify button on OTP.
- Don't touch the Account screens (customer or rider). They're already designed.
- Don't use photos over 25KB (lazy-load them), or Lottie, blur or video.

## Acceptance checklist
- [ ] H1 matches at 360×720; H3 matches at 320×640 (the "Food" label, the name wrapping, the circles clear of the chevron)
- [ ] Every control is ≥44px; primary CTAs are 52px
- [ ] Tabular numerals on every price, ETA, rating, code and timer
- [ ] A rail with fewer than 2 items is hidden; the skeleton shows on first load
- [ ] The live bar shows only with running orders, shows "+N order(s)" for 2 or more, and opens Orders
- [ ] OTP auto-fills, auto-verifies, and shows resend on WhatsApp after 0:00
- [ ] C1 and R1 hero panels are inset 12px with 20px clear space below the illustration
- [ ] Body text contrast ≥4.5:1; nothing in coral, sky or brand green is used as text
- [ ] Each screen is ≤150KB of assets
