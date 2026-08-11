# Phase 5 — Rider ONBOARDING cluster alignment (RJ kyc / docs / top-up)

Pixel-parity (structure-first) alignment of the rider onboarding screens against their current
gallery mocks. The current rider design is **RJM** (one app: Jobs · Money · Account); the KYC and
wallet onboarding surfaces still carry their `RJ` mock ids in the gallery and are current. The
gallery/mock wins over any code comment; the retired nine `RJ` originals are never aligned to.

- **Side-by-side:** `tools/parity/out/phase5_rideronboard.png`
  (`cd tools/parity && node pair.mjs --keys "RJ.kyc_intro,RJ.bike_docs,RJ.topup_amount" --out out/phase5_rideronboard`
  → all three print `mock ok · app ok`).
- **Result:** `pnpm --filter @lynia/mobile typecheck` clean, `lint` clean, `test` **907/907** pass.

Layout/structure only. No KYC submission (`completeProfile`/`becomeRider`), image
picker/downscale/presign/upload chain, KYC-draft persistence/resume, `getMe` document read, or
top-up amount/rail/validation state was changed — only how the onboarding chrome is laid out. Per
the harness's honest stubs, the KYC form paints its empty first state (the secure-store shim answers
the draft empty), the documents rows read a verified fixture rider, and the top-up amount step runs
under `isTestBuild()` (the fixture flips `Constants.expoConfig.extra.testBuild`) so the
`TopUpSimulator` renders instead of the release "call support" screen — none of these are faked.

**Scope note — one screen realizes each beat; two of three were already aligned.** `become.tsx` and
`top-up.tsx` (via `TopUpSimulator`) already realized their mocks' structure from the earlier rider
passes, so their remaining deltas are build-honest copy/state deviations, documented below.
`documents.tsx` carried the one real structural gap (heading in the AppBar vs the mock's in-body
Heading) and is the file changed this pass.

---

## RJ.bike_docs → `app/rider/documents.tsx` (the aligned target)

Fixture `rider_documents`: `GET /auth/me` answers a verified rider (`bikeReg` `ABZ 4417`,
`kycStatus: "verified"`), so each row shows its `Verified` pill and the footer reads the
verified-and-stored copy.

| # | Mock rule (`rider-screens.jsx` `BikeDocs`, lines 714-739) | File change that satisfies it |
|---|---|---|
| 1 | Title + sub drawn **in-body** — a `Heading "Bike & documents"` (marginBottom 0 inside a header row) then `Sub "What we verified to let you ride."` — with **no top bar title** | Moved the title/sub **out of the `AppBar`** (which had `title=`/`sub=`) into an in-body `Heading` + `Sub`, leaving the bar as a **back-only chevron** — the same pattern the aligned `job.tsx` / `become.tsx` pushed screens use. Sub now carries the mock's trailing period (`…let you ride.`). |
| 2 | A `Card` of three rows — each: `Icon`(19, accent-text) + label(14/600/ink) + optional value(12/muted, tabular) + a trailing `StatusPill` **or** `chevron-right` | Unchanged — `Row` already renders icon + label + value + trailing pill. `National ID` (masked) and `Bike registration` (`ABZ 4417`) carry `Verified` pills. |
| 3 | A surface card (no border/shadow) with the "checked … and stored securely … contact support" footer line | Unchanged — the surface footer card already renders `footerCopy(kycStatus)`. |

Preserved: the `getMe` query, the `isLoading` skeleton, the `isError` retry `EmptyState`, the
`!rider` "haven't set up yet" branch, the status-aware `footerCopy`, the full ID mask, and the
"View verification status" ghost for an unverified rider.

**Honest deviations (not faked):**
- **Rider-photo row shows a `Verified` pill; the mock draws a `chevron-right`.** The mock's `Row`
  falls back to a chevron only when a row has no pill — implying the photo row is tappable. In the
  app the photo row navigates nowhere, so a chevron would advertise a tap that does nothing; every
  row carries its verified pill instead. Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **National ID reads `••••••` (fully masked), not the mock's `631•••••••` (3-digit prefix).** The
  `/auth/me` rider payload carries no ID number, and the screen's own rule is "never show it in full
  even to its owner"; a partial prefix isn't available and isn't shown. Candidate for
  `docs/DESIGN-DEVIATIONS.md`.
- **Footer names no vendor** ("verified and stored securely") where the mock says "checked by
  **Didit** and stored securely". The app's footer is status-aware (verified/pending/unverified) and
  the verified string omits the partner name; same vendor-name omission as `become.tsx`. Candidate
  for `docs/DESIGN-DEVIATIONS.md`.

---

## RJ.kyc_intro → `app/rider/become.tsx`

Fixture `rider_kyc_intro`: the screen reads no network on mount (it hydrates an on-device KYC draft,
which the inert secure-store shim answers empty), so it paints its populated first state — the
name/ID card, the bike-reg + photo-capture card, the id-card reassurance block, and the "Submit for
verification" button. No app-code edits this pass.

`become.tsx` realizes the **`kyc_form`** beat (`rider-screens.jsx` lines 180-210): `Heading
"Become a rider"` + `Sub`, a `Card` of First/Last/National-ID fields, a `Card` of Bike registration
+ "Your photo" + the capture affordance, a surface reassurance card, and the "Submit for
verification" button. That structure already matches the current form mock.

**Honest deviations (not faked):**
- **The parity shot pairs the `kyc_intro` empty-state mock with the `become.tsx` form — an inherent
  beat difference.** `RJ.kyc_intro` (`rider-screens.jsx` `KycIntro`) is the pre-form intro
  empty-state: a centred `id-card` icon, "Set up as a rider", a message, and a single "Become a
  rider" CTA. The app realizes THAT beat **upstream on the rider board**
  (`rider/(tabs)/index.tsx` — the not-a-rider `EmptyState` "Set up as a rider" + "Become a rider"),
  whose button routes into `become.tsx` — which is the **`kyc_form`** beat. Re-showing the intro
  inside `become.tsx` would duplicate the board and double-gate the rider, so the form is the
  correct beat for this file. A true like-for-like intro comparison belongs to the board surface.
  Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **The form renders empty; the `kyc_form` mock is pre-filled** (Tendai / Moyo / ID / `ABZ 1234` /
  "Photo added — retake"). The harness hydrates the KYC draft empty (honest stub), so the app paints
  the blank first state — same screen, unfilled.
- **Reassurance copy names no vendor and is build-aware.** The mock reads "checked by our
  verification partner **Didit** … **Privacy policy**"; the app's real-build copy drops the vendor
  name and the privacy link and adds the honest "you'll finish in your browser" step (and swaps to a
  test-build string under `isTestBuild()`). Deliberate build-honest divergence predating this pass.
  Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **National ID field has no "8–12 digits" hint.** The mock hints `inputMode="numeric"` + "The 8–12
  digits on your national ID card."; the app's field is a **text** keyboard because Zimbabwean
  national IDs are alphanumeric (e.g. `63-123456 A 12`), so a digits-only hint would be inaccurate.
  Functional divergence, not a structural miss. Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **A back-only `AppBar` chevron sits above the in-body Heading.** The `kyc_form` mock draws no top
  bar; the chevron is the sanctioned repo replacement for the retired bottom ghost "Back" (same as
  `job.tsx`). Kept.

---

## RJ.topup_amount → `app/wallet/top-up.tsx` (via `TopUpSimulator`)

Fixture `rider_topup`: flips `Constants.expoConfig.extra.testBuild` on the shim's shared Constants
object so `isTestBuild()` → true and `top-up.tsx` mounts the `TopUpSimulator` amount step (the
release build renders the honest "call support to top up" screen). `GET /wallet` + `/wallet/config`
back the shown balance and the min/max top-up bounds. No app-code edits this pass.

`TopUpSimulator`'s `amount` step (`src/ui/rider/TopUpSimulator.tsx`) already realizes the
`topup_amount` mock (`rider-screens-wallet.jsx` lines 108-134): `Sub "Add to your commission
balance…"`, an `Amount (USD)` field with the "Minimum top-up is $5.00" hint, the **5/10/20 preset
chips** (accent-bordered + accent-wash on the selected pill, 44px, radius-pill), a `Phone number`
field, the `"Pay with"` label, the rail radio rows (accent-bordered when selected), and the
"Request $10.00 via EcoCash" CTA. `Heading "Top up"` comes from `top-up.tsx`.

**Honest deviations (not faked):**
- **A `TEST BUILD` banner + a red `SIMULATED — no payment request was sent (test build)` strip sit
  above the form.** There is no payment-rail integration (`WalletService.creditFromTopup` has no
  callers), so the whole self-serve flow is a labelled walkthrough gated behind `isTestBuild()`; a
  real release build renders the "call support" screen. The strip is load-bearing honesty, not an
  invented extra. Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **Rail rows use a neutral `wallet` mark, not the mock's brand logos.** No EcoCash/InnBucks/O'mari
  brand assets ship in the app; the neutral mark stands in rather than inventing a lookalike.
  Candidate for `docs/DESIGN-DEVIATIONS.md`.
- **Phone hint is conditionally phrased** ("This is the number that **would** get the payment prompt
  — change it if you'**d** pay from another line") vs the mock's present-tense line, matching the
  simulation framing.
- **No "‹ Wallet" back crumb above the heading.** The mock draws one; the RJM design renamed
  Wallet → Money, so a stale "Wallet" crumb isn't reintroduced. The screen keeps its `Heading` only.
