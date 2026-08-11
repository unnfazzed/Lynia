# Phase 3 — Customer auth / SMS cluster alignment

Structure-first pixel-parity alignment of the six customer auth/SMS screens against the design mocks in
`packages/design/explorations/journey/screens.jsx` (OTP resend/cooldown/locked states in
`screens-safety.jsx`). The gallery/mock wins over any code comment.

- **Side-by-side:** `tools/parity/out/phase3_auth.png`
  (`cd tools/parity && node pair.mjs --keys "LJ.login,LJ.otp,LJ.onboard,LJ.role_select,LJ.perm_loc,LJ.register" --out out/phase3_auth`
  → all six print `mock ok · app ok`).
- **Verify:** `pnpm --filter @lynia/mobile typecheck` clean; `pnpm --filter @lynia/mobile test` = **907 passed**.

Values/tokens: all new geometry uses `@lynia/shared` tokens (`space`, `radius`, `color`, `font`,
`touchTargetMin`). The two bespoke pixel sizes the mocks draw outside the type scale (onboarding title
`22`, SystemState title `19` / message `13`) are hardcoded to match the mock, per "strict mock sizes" —
they are not values a token defines.

---

## LJ.login → `apps/mobile/app/phone.tsx`

Mock `Login` (screens.jsx L610–618): Lockup → Heading → Sub → phone Field → "Send code".

| Mock rule | File:line change |
|---|---|
| Heading copy is **"Welcome to Lynia"** (not "Sign in to get started") | `phone.tsx:33` |
| Sub copy is **"We'll SMS a one-time code to this number."** (not "We'll text you a one-time code to verify this number.") | `phone.tsx:34` |

Structure was already correct (BrandLockup size 40 = the mock's Dove40+Wordmark24 `Lockup`; phone Field;
"Send code" CTA). The empty-state placeholder `+263 77 000 0000` and `ErrorText` are honest functional
elements (the field renders empty at rest; the mock shows a filled value), kept.

## LJ.otp → `apps/mobile/app/verify.tsx`

Mock `Otp` idle (screens.jsx L619–629) + `OtpState` cooldown/resent/locked (screens-safety.jsx L226–256):
no top bar, in-body heading, resend as an **inline centred link/countdown** (not a ghost button), bottom
ghost **Back**.

| Mock rule | File:line change |
|---|---|
| **No top bar** — the mock draws no `AppBar`; the way back is a bottom ghost button | Removed `<AppBar onBack=…>` and dropped the `AppBar` import (`verify.tsx:10,~120`); added `<Button label="Back" variant="ghost" onPress={() => router.back()} />` above `ErrorText` (`verify.tsx:~228`) |
| Heading **"Check your messages"** (not "Enter your code") | `verify.tsx:~124` |
| Sub ends **"… by SMS."** | `verify.tsx:~127` — real-user branch now `We sent a 6-digit code to ${phone} by SMS.` |
| Idle Field carries the hint **"SMS can take a minute on a busy network."** | `verify.tsx:~166` — `hint` added (Field suppresses it while the locked `error` shows) |
| Locked Field error is **"That code has expired."** (mock `OtpState locked`) | `verify.tsx:~167` |
| Locked explainer copy is the mock's verbatim **"Codes last 10 minutes, and 5 wrong tries locks one. Send a fresh code — it resets your attempts too."** | `verify.tsx:~181` |
| **Resend is a centred inline row, not a ghost `Button`** — idle green "Didn't get it? Resend code"; during cooldown a muted clock + "Resend in m:ss" / "Resend again in m:ss" (tabular) | `verify.tsx:~190–214` — the `<Button variant="ghost" label="Resend code in …">` replaced by a `<Pressable>` with `minHeight: touchTargetMin`, `justifyContent:"center"`; branches on `cooldown`/`resent` |

Preserved: the wall-clock cooldown (`cooldownEndsAt` + AppState recompute), `requestFreshCode`,
expiry/lockout recovery gate (`isOtpExpiredOrLocked`), autofill hints, and the post-verify routing.
The `resent` accent-wash confirmation banner already matched the mock and is unchanged.

## LJ.onboard → `apps/mobile/app/onboarding.tsx`

Mock `Onboarding slide={0}` (screens.jsx L730–751): brand row + Skip → centred 120px mint disc/52px icon
→ title → body → dots → CTA.

| Mock rule | File:line change |
|---|---|
| Slide title is the mock's bespoke **22px** (the app used the h2=20 token) | `onboarding.tsx:98` |

Everything else already matched: `SEND_FOOD_SLIDES` is the mock's `ONBOARD` copy verbatim, and the parity
harness resolves `restaurantsEnabled` **on** (installRouter answers all-ON), so slide 0 renders "Food from
kitchens near you" exactly as the mock. The flag-off parcels set is the §1 escape-hatch state, not a
divergence.

## LJ.role_select → `apps/mobile/app/role.tsx`

Mock `RoleSelect` (screens.jsx L649–672): **Lockup** → Heading → Sub → customer Opt (selected) → rider Opt
→ CTA.

| Mock rule | File:line change |
|---|---|
| The screen **opens with the brand lockup** above the heading (the app had none) | `role.tsx:37–41` — added `<View style={{ marginBottom: space.xl }}><BrandLockup size={40} /></View>`; `BrandLockup` added to the `../src/ui` import (`role.tsx:7`) |

The customer-option copy already follows `restaurantsEnabled` correctly (flag-on "Use LyniaGo / Order food,
send parcels, more services soon." = the mock; flag-off is the escape-hatch wording), the rider option and
"Continue as a customer" CTA already matched, and the selected mint-wash chip state already matched.

## LJ.perm_loc → `apps/mobile/app/permissions.tsx`

Mock `PermLoc` (screens.jsx L849) renders the DS **`SystemState`**: 84px surface disc / 36px text-green
icon, 19px title, one 13px muted sentence (max 230), then primary/secondary actions **grouped under the
copy**. The app's `Prime` had diverged to a 96px mint disc, 40px icon, 24px title, and bottom-pinned
buttons.

| Mock rule | File:line change |
|---|---|
| Disc **84px, surface fill** (not 96px mint) + **36px** icon | `permissions.tsx:~135` |
| Title **19px**; message **13px / lineHeight 20 / maxWidth 230 / marginTop 4** | `permissions.tsx:~139–143` |
| Actions sit **directly under the copy** in the centred group (not pinned to the screen bottom) | `permissions.tsx:~144` — buttons moved inside the centred `View` in an `alignSelf:"stretch"` block |
| Location secondary is **"Enter address manually"** (mock), not "Not now" | `permissions.tsx:~102` — new `secondaryLabel` prop; customer = "Enter address manually", rider keeps "Not now" (a rider has no pickup address to type); notifications step keeps "Not now" per `PermNotif` |

Preserved: the primed-flag skip/forward, the async `primeLocation`/`primeNotifications` handlers and their
`busy` spinner (kept on the shared `Button`, which `SystemState`'s internal buttons can't show), and the
role-framed message text.

## LJ.register → `apps/mobile/app/profile/setup.tsx`

Mock `Register` (screens.jsx L632–646): Heading → Sub → **single "Full name"** → **verified "Phone number"
field (badge)** → "National ID number" → **"Continue"**. The app had First+Last, no phone field, and
"Save and continue".

| Mock rule | File:line change |
|---|---|
| Sub copy **"You're sending parcels. Just a name and ID for your account record — no documents, no verification."** | `setup.tsx:~95` |
| **Single "Full name" field** (not First + Last) | `setup.tsx:~101` — `firstName`/`lastName` state collapsed to one `fullName`; a `splitName()` helper (first whitespace-run = given, rest = family) splits it at the two boundaries that still need the halves — the durable draft and the `updateProfile` PATCH — so the account record + contract floor (both names non-empty) are unchanged (`setup.tsx:~28,~62,~67,~74`) |
| **Verified phone field with the "Verified" badge** + hint "Verified by SMS ✓" | `setup.tsx:~110–122` — read-only `<Field editable={false}>` showing the number, wrapped in a relative `View` with an absolute check-icon + "Verified" badge (top:30/right:12, accentText). The number is threaded as a route param from `verify.tsx:~93` (`router.replace({ pathname:"/profile/setup", params:{ phone } })`) — setup had no other source for it |
| National ID hint **"Stored on your account only — we don't verify it. Riders go through a separate ID check."** | `setup.tsx:~127` |
| CTA **"Continue"** (not "Save and continue") | `setup.tsx:~129` |

Supporting change: `Field` gained an additive `editable?: boolean` prop (`src/ui/index.tsx`) for the
read-only phone display; default behaviour is unchanged. Preserved: the encrypted durable draft
(LC-C10) — it still stores `{firstName,lastName,idNumber}`, now written via `splitName(fullName)` and
recombined on hydrate, so `profile-draft.ts` and its test are untouched. `setup.test.tsx` updated to the
new single-field structure + "Continue" label (both draft-persistence cases retained).
Register fixture (`tools/parity/mobile/fixtures/auth_register.mjs`) now sets the `phone` param so the
sheet shows the verified field populated.

---

## Honest deviations (not faked)

- **LJ.otp app renders the just-sent cooldown, the mock renders idle.** `verify.tsx` initialises a 60s
  cooldown on mount (a code was genuinely just sent from the phone screen), so the parity sheet shows the
  app's resend row as "Resend in 1:00" while the canonical `LJ.otp` mock draws the resting "Didn't get it?
  Resend code" link. This is real behaviour, not a divergence — the cooldown row itself matches the
  `screens-safety.jsx otp_cooldown` mock; the idle link appears once the countdown expires.
- **LJ.perm_loc "Enter address manually" is label-only from this screen.** The mock's secondary label is
  applied verbatim (customer branch), but its `onSkip` still advances the priming flow (the existing
  behaviour); the manual-address destination (`NoGps` / address entry) is not wired from here. Candidate
  for `docs/DESIGN-DEVIATIONS.md` if the user wants the action wired, not just the label.
- **LJ.register single "Full name" ↔ first/last contract.** The mock draws one name field; the account
  record and `UpdateProfileRequest` keep given/family names separate. The app honours the mock visually
  (one field) and splits on the first whitespace run at the draft + PATCH boundaries. A single-word name
  therefore leaves `canSubmit` false (no family name) — the same non-empty-both-names floor the contract
  enforces. Flag for `docs/DESIGN-DEVIATIONS.md` only if the split heuristic needs to be user-visible.
- **Empty resting states** on `LJ.login` / `LJ.register` (name + ID) show placeholders where the mock
  shows filled values — the honest empty form the parity fixtures render.
