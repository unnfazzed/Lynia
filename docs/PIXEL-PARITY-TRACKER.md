# Pixel-parity tracker

Progress for the app-wide pixel-alignment workstream (`CLAUDE.md` → "Pixel parity"). Source of
truth is the **2026-08-10 rev 2** design export in `packages/design/`; the inventory below is
generated from `packages/design/EXPORT-MANIFEST.txt`.

**A screen counts as done only when the user has signed off on a side-by-side.** Not when a PR merged,
not when copy matched. Structure, geometry, colour, type and copy must all match the mock.

| Status | Meaning |
|---|---|
| ⬜ | not started |
| 🔧 | in progress |
| 👁 | built, awaiting the user's visual OK |
| ✅ | signed off by the user |
| ⛔ | designed but never built — out of scope here (restyle-existing-only, 2026-08-10); separate feature backlog |

**⛔ is provisional.** Only the states the 2026-08-05 audit named explicitly are pre-marked. Every
phase begins by verifying build status for its own screens against source — a screen is never
dropped from scope on the strength of a stale audit line.

Retired designs (`LJ home_launcher`; the nine `RJ` originals) are **absent from the gallery by
design** and therefore absent below — never align to them. Note `RJM board` and `LJ profile` ARE
current; only the `RJ` originals were retired.

**rev 2 added 31 states (the `SH·` shipped-states wave)** — the offline / draft-restore / keyless-
search / flag-off / permissions / proof-of-pickup / merchant-item-out states the app already ships
but that had never been designed. They are built-but-unaligned, so they start at ⬜ like any other
screen; the handoff sheet is `ui_kits/mobile/shipped-states.html` (SH1–SH12).

Counts: **295 designed states** — customer 122 · rider 98 · merchant 48 · admin 7 · safety sheet 20.

> **Lane wiring ≠ sign-off.** Phase 2 of the screenshot lane (PR for `claude/phase-2-multi-agent`) wired
> the app side of **47 screens** — the primary populated state of every top-level app route across all
> four surfaces — so an alignment reviewer can now generate a real side-by-side for them
> (`cd tools/parity && node pair.mjs --keys <src.id> --out out/sheet`) instead of an app-column
> "pending". This does **not** advance any status below: a screen still only earns 👁/✅ when its
> side-by-side is built and the user signs it off. The wiring is the *tool* that makes those sheets
> cheap to produce; the alignment work and sign-off remain per-screen. Wired keys and their fixtures
> are listed in `tools/parity/app-targets.mjs`; the coverage summary is in `docs/SCREENSHOT-LANE.md`.

---

## CUSTOMER (All Screens Gallery)


### C1 · First run

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | C1·1 | `LJ splash` | Splash | | |
| 👁 | C1·2 | `LJ onboard` | Onboarding · food  [FOOD] | auth/SMS cluster align (`docs/parity/PHASE3-auth.md`, `tools/parity/out/phase3_auth.png`) | |
| ⬜ | C1·3 | `LJ onboard_send` | Onboarding · send  [PARCEL] | | |
| ⬜ | C1·4 | `LJ onboard_shared` | Onboarding · one app  [BOTH] | | |
| 👁 | C1·5 | `LJ login` | Phone login | auth/SMS cluster align (`docs/parity/PHASE3-auth.md`, `tools/parity/out/phase3_auth.png`) | |
| 👁 | C1·6 | `LJ otp` | SMS OTP | auth/SMS cluster align (`docs/parity/PHASE3-auth.md`, `tools/parity/out/phase3_auth.png`) | |
| 👁 | C1·7 | `LJ role_select` | Choose your role | auth/SMS cluster align (`docs/parity/PHASE3-auth.md`, `tools/parity/out/phase3_auth.png`) | |
| 👁 | C1·8 | `LJ register` | Profile registration | auth/SMS cluster align (`docs/parity/PHASE3-auth.md`, `tools/parity/out/phase3_auth.png`) | |
| 👁 | C1·9 | `LJ perm_loc` | Permission · location | auth/SMS cluster align (`docs/parity/PHASE3-auth.md`, `tools/parity/out/phase3_auth.png`) | |
| ⬜ | C1·10 | `LJ perm_notif` | Permission · notifications | | |
| ⬜ | C1·11 | `LJ onboard_flag_off` | Onboarding · food off  [PARCEL] | | |
| ⬜ | C1·12 | `LJ role_select_flag_off` | Choose your role · food off | | |

### C2 · Home & orders

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| 👁 | C2·1 | `RC home` | Home · service tiles  [BOTH] | food browse cluster align (`docs/parity/PHASE4-browse.md`, `tools/parity/out/phase4_browse.png`) | |
| 👁 | C2·2 | `RC orders` | Orders · all services  [BOTH] | food browse cluster align (`docs/parity/PHASE4-browse.md`, `tools/parity/out/phase4_browse.png`) | compact accent live-order card replaces the stepper LiveOrderCard per the mock |
| ⬜ | C2·3 | `RC orders_empty` | Orders · empty  [BOTH] | | |
| ⬜ | C2·4 | `LJ home_flag_off` | Home · Food tile soon  [BOTH] | | |
| ⬜ | C2·5 | `LJ order_restore` | Cold start · order running  [BOTH] | | |
| ⬜ | C2·6 | `LJ stale_cache` | Orders · saved copy  [BOTH] | | |

### C3 · Browse & compose

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| 👁 | C3·1 | `RC list` | Restaurant list  [FOOD] | food browse cluster align (`docs/parity/PHASE4-browse.md`, `tools/parity/out/phase4_browse.png`) | header/rows aligned; filter chips, count line & hero row deviate on honest-data grounds — see doc |
| ⬜ | C3·2 | `RC list_loading` | List loading  [FOOD] | | |
| 👁 | C3·3 | `RC search` | Search  [FOOD] | food browse cluster align (`docs/parity/PHASE4-browse.md`, `tools/parity/out/phase4_browse.png`) | PLACES aligned; DISHES section deferred (no cross-restaurant dish index) — see doc |
| 👁 | C3·4 | `RC menu` | Menu  [FOOD] | food browse cluster align (`docs/parity/PHASE4-browse.md`, `tools/parity/out/phase4_browse.png`) | cover band + overhanging shop logo + floating back button replace the plain AppBar + thumb row |
| ⬜ | C3·5 | `RC item` | Item sheet  [FOOD] | | |
| 👁 | C3·6 | `LJ home_empty` | Send composer · no address  [PARCEL] | map-behind-sheet align (`docs/parity/PHASE3-send.md`, `tools/parity/out/send_v2.png`) | |
| ⬜ | C3·7 | `LJ addr_search` | Address search  [PARCEL] | | |
| ⬜ | C3·8 | `LJ addr_map_confirm` | Confirm pin on map  [PARCEL] | | |
| 👁 | C3·9 | `LJ home_pins` | Send · both set  [PARCEL] | map-behind-sheet align (`docs/parity/PHASE3-send.md`, `tools/parity/out/send_v2.png`) | |
| ⬜ | C3·10 | `LJ home_expanded` | Send · sheet expanded  [PARCEL] | | |
| ⬜ | C3·11 | `LJ disclaimer` | Broadcast disclaimer  [PARCEL] | | |
| ⬜ | C3·12 | `LJ draft_restored` | Draft restored  [PARCEL] | | |
| ⬜ | C3·13 | `LJ addr_unavailable` | Address search down  [PARCEL] | | |
| ⬜ | C3·14 | `LJ map_failed` | Map didn't load  [PARCEL] | | |
| ⬜ | C3·15 | `LJ loc_off` | Location off · composer  [PARCEL] | | |

### C4 · Commit & pay

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| 👁 | C4·1 | `RC cart` | Cart  [FOOD] | food cart & checkout cluster align (`docs/parity/PHASE4-checkout.md`, `tools/parity/out/phase4_checkout.png`) | header → shared AppBar; summary → shared PriceMath. EtaLine + ADD-A-DRINK upsell omitted (un-backed at cart stage) |
| ⛔ | C4·2 | `RC cart_note` | Note for the kitchen  [FOOD] | | |
| 👁 | C4·3 | `RC checkout_cash` | Checkout · CASH  [FOOD] | food cart & checkout cluster align (`docs/parity/PHASE4-checkout.md`, `tools/parity/out/phase4_checkout.png`) | header → shared AppBar; cash-consequence names the full total. Live address-entry block stands in for the mock's static summary row |
| 👁 | C4·4 | `RC checkout_wallet` | Checkout · WALLET  [FOOD] | food cart & checkout cluster align (`docs/parity/PHASE4-checkout.md`, `tools/parity/out/phase4_checkout.png`) | wallet-selected subtitle → provider list; verbatim note copy, ink type, lead bold |
| ⬜ | C4·5 | `RC placing` | Placing  [FOOD] | | |
| ⬜ | C4·6 | `LJ auction_finding` | Auction · finding  [PARCEL] | | |
| ⬜ | C4·7 | `LJ auction_live` | Auction · offers live  [PARCEL] | | |
| ⬜ | C4·8 | `LJ auction_counter` | Counter-offer review  [PARCEL] | | |

### C5 · The kitchen confirms

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | C5·1 | `RC await_accept` | Waiting on the kitchen  [FOOD] | | |
| ⬜ | C5·2 | `RC confirm_call` | They call to confirm  [FOOD] | | |
| ⬜ | C5·3 | `RC pay_push` | Push · payment requested  [FOOD] | | |
| 👁 | C5·4 | `RC pay_now` | Pay the restaurant  [FOOD] | food order tracker cluster align (`docs/parity/PHASE4-foodtrack.md`, `tools/parity/out/phase4_foodtrack.png`) | |
| ⛔ | C5·5 | `RC pay_wait` | Prompt sent  [FOOD] | | |
| ⬜ | C5·6 | `RC pay_manual` | Paid another way  [FOOD] | | |
| ⬜ | C5·7 | `RC pay_confirmed` | Waiting to be confirmed  [FOOD] | | |

### C6 · Track

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | C6·1 | `RC track_prep` | Prep countdown  [FOOD] | | |
| ⬜ | C6·2 | `RC track_secured` | Rider secured  [FOOD] | | |
| 👁 | C6·3 | `RC track_way` | On the way  [FOOD] | food order tracker cluster align (`docs/parity/PHASE4-foodtrack.md`, `tools/parity/out/phase4_foodtrack.png`) | map-bg+sheet + RiderCard are honest deviations (gray-map stub, no rider identity in food API) — see doc |
| 👁 | C6·4 | `LJ track_code` | Tracking · code issued  [PARCEL] | parcel tracking cluster align (`docs/parity/PHASE3-tracking.md`, `tools/parity/out/phase3_tracking.png`) | |
| 👁 | C6·5 | `LJ track_active` | Tracking · live  [PARCEL] | parcel tracking cluster align (`docs/parity/PHASE3-tracking.md`, `tools/parity/out/phase3_tracking.png`) | |

### C7 · Hand-off & close

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | C7·1 | `RC handoff` | Pay at the door  [FOOD] | | |
| ⬜ | C7·2 | `RC handoff_wait` | Waiting for rider confirm  [FOOD] | | |
| ⬜ | C7·3 | `RC handoff_code` | Both confirmed · code  [FOOD] | | |
| 👁 | C7·4 | `RC delivered_rate` | Delivered · rate the food  [FOOD] | food order tracker cluster align (`docs/parity/PHASE4-foodtrack.md`, `tools/parity/out/phase4_foodtrack.png`) | single rider rating vs mock's food+rider+chips is an honest deviation (API carries one score) — see doc |
| ⬜ | C7·5 | `LJ delivered_rate` | Delivered · rate the rider  [PARCEL] | | |
| ⬜ | C7·6 | `LJ completed` | Completed  [PARCEL] | | |
| ⬜ | C7·7 | `LJ rate_undo` | Rating sent · undo  [PARCEL] | | |

### C8 · Account & support

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| 👁 | C8·1 | `LJ profile` | Account | account cluster align (`docs/parity/PHASE3-account.md`, `tools/parity/out/phase3_account.png`) | |
| 👁 | C8·2 | `LJ history` | Orders · all services  [BOTH] | account cluster align (`docs/parity/PHASE3-account.md`, `tools/parity/out/phase3_account.png`) | mock key resolves to `RC.orders`; app target is standalone `/history` trips list — see doc |
| 👁 | C8·3 | `LJ notifications` | Notifications | account cluster align (`docs/parity/PHASE3-account.md`, `tools/parity/out/phase3_account.png`) | |
| ⬜ | C8·4 | `LJ notif_empty` | Notifications · empty | | |
| 👁 | C8·5 | `LJ help` | Help & support | account cluster align (`docs/parity/PHASE3-account.md`, `tools/parity/out/phase3_account.png`) | |
| 👁 | C8·6 | `LJ settings` | Settings | account cluster align (`docs/parity/PHASE3-account.md`, `tools/parity/out/phase3_account.png`) | |
| ⬜ | C8·7 | `LJ settings_perms` | Settings · real permissions | | |
| ⬜ | C8·8 | `LJ settings_perms_ok` | Settings · all granted | | |
| ⬜ | C8·9 | `LJ privacy` | Privacy | | |
| ⬜ | C8·10 | `LJ delete_account` | Delete account | | |
| ⬜ | C8·11 | `LJ delete_final` | Delete · final confirm | | |
| ⬜ | C8·12 | `LJ phone_masked` | Order ended · numbers masked  [BOTH] | | |

### C9 · Trust & safety

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | C9·1 | `LJ sos_idle` | SOS · live-trip control  [BOTH] | | |
| ⛔ | C9·2 | `LJ sos_confirm` | SOS · confirm  [BOTH] | | |
| ⬜ | C9·3 | `LJ sos_contacts` | SOS · contacts  [BOTH] | | |
| ⬜ | C9·4 | `LJ sos_error` | SOS · log failed (offline)  [BOTH] | | |
| ⬜ | C9·5 | `LJ report` | Report + block rider  [BOTH] | | |
| ⬜ | C9·6 | `LJ report_done` | Report sent  [BOTH] | | |
| ⬜ | C9·7 | `LJ trip_help` | Get help with this order  [BOTH] | | |
| ⬜ | C9·8 | `LJ trip_help_sent` | Issue logged  [BOTH] | | |

### C10 · Exceptions & edge

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | C10·1 | `RC list_empty` | Nothing open  [FOOD] | | |
| ⬜ | C10·2 | `RC list_error` | Offline list  [FOOD] | | |
| ⬜ | C10·3 | `RC menu_closed` | Closed restaurant  [FOOD] | | |
| ⬜ | C10·4 | `RC closed_interrupt` | Closes while browsing  [FOOD] | | |
| ⬜ | C10·5 | `RC cart_oos` | Item sold out  [FOOD] | | |
| ⬜ | C10·6 | `RC cart_price` | Price changed  [FOOD] | | |
| ⬜ | C10·7 | `RC cart_empty` | Empty cart  [FOOD] | | |
| ⬜ | C10·8 | `RC cart_min` | Under the minimum  [FOOD] | | |
| ⬜ | C10·9 | `RC checkout_offline` | Offline mid-checkout  [FOOD] | | |
| ⬜ | C10·10 | `RC pay_open` | Still unpaid · reminder  [FOOD] | | |
| ⛔ | C10·11 | `RC pay_failed` | Payment declined  [FOOD] | | |
| ⬜ | C10·12 | `RC item_removed` | One item unavailable  [FOOD] | | |
| ⬜ | C10·13 | `RC no_rider` | NO_RIDER  [FOOD] | | |
| ⬜ | C10·14 | `RC track_paused` | Live paused  [FOOD] | | |
| ⛔ | C10·15 | `RC rejected` | Rejected · refund pending  [FOOD] | | |
| ⬜ | C10·16 | `RC refunded` | Refunded  [FOOD] | | |
| ⬜ | C10·17 | `RC cancel_sheet` | Cancel pre-pickup  [FOOD] | | |
| ⛔ | C10·18 | `RC rider_cancelled` | Rider cancelled · re-finding  [FOOD] | | |
| ⬜ | C10·19 | `RC handoff_dispute` | Rider didn't confirm  [FOOD] | | |
| ⬜ | C10·20 | `RC failed_noshow` | No-show · returned  [FOOD] | | |
| ⛔ | C10·21 | `RC resume` | App resumed mid-order  [FOOD] | | |
| ⬜ | C10·22 | `LJ no_riders` | No riders online  [PARCEL] | | |
| ⬜ | C10·23 | `LJ select_race` | Rider just taken  [PARCEL] | | |
| ⬜ | C10·24 | `LJ auction_expired` | Auction expired  [PARCEL] | | |
| ⬜ | C10·25 | `LJ rider_cancelled` | Rider cancelled  [PARCEL] | | |
| ⬜ | C10·26 | `LJ track_paused` | Live paused  [PARCEL] | | |
| ⬜ | C10·27 | `LJ cancel` | Cancel · reason  [PARCEL] | | |
| ⬜ | C10·28 | `LJ cancelled` | Cancelled  [PARCEL] | | |
| ⬜ | C10·29 | `LJ undelivered` | Not delivered  [PARCEL] | | |
| ⬜ | C10·30 | `LJ track_dark` | Rider went dark  [PARCEL] | | |
| ⬜ | C10·31 | `LJ otp_cooldown` | OTP · resend cooldown | | |
| ⬜ | C10·32 | `LJ otp_resent` | OTP · code re-sent | | |
| ⬜ | C10·33 | `LJ otp_locked` | OTP · expired / locked | | |
| ⬜ | C10·34 | `LJ offline` | Offline banner | | |
| ⬜ | C10·35 | `LJ on_hold` | Account on hold | | |
| ⬜ | C10·36 | `LJ force_update` | Force update | | |
| ⛔ | C10·37 | `LJ no_gps` | Location off / no GPS | | |
| ⬜ | C10·38 | `LJ generic_error` | Generic error | | |
| ⬜ | C10·39 | `LJ conn_reconnecting` | Reconnecting banner | | |
| ⬜ | C10·40 | `LJ stale_cache_empty` | Offline · nothing saved | | |
| ⬜ | C10·41 | `LJ order_restore_error` | Restore failed  [BOTH] | | |
| ⬜ | C10·42 | `LJ draft_discard` | Discard draft · confirm  [PARCEL] | | |

## RIDER (All Screens Gallery)


### R1 · First run & sign in

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | R1·1 | `RJ splash` | Splash | | |
| ⬜ | R1·2 | `RJ onboard` | Onboarding · rider | | |
| ⬜ | R1·3 | `RJ login` | Phone sign-in | | |
| ⬜ | R1·4 | `RJ otp` | SMS OTP | | |
| ⬜ | R1·5 | `RJ role_select` | Choose your role | | |
| ⬜ | R1·6 | `RJ perm_loc` | Permission · location | | |
| ⬜ | R1·7 | `RJ perm_notif` | Permission · notifications | | |

### R2 · Become a rider (KYC)

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | R2·1 | `RJ kyc_intro` | Become a rider | | |
| ⬜ | R2·2 | `RJ kyc_form` | KYC form + consent | | |
| ⬜ | R2·3 | `RJ photo_capture` | ID photo · capture | | |
| ⬜ | R2·4 | `RJ photo_preview` | ID photo · preview | | |
| ⬜ | R2·5 | `RJ photo_uploading` | ID photo · uploading | | |
| ⬜ | R2·6 | `RJ kyc_pending` | Verification pending | | |
| ⬜ | R2·7 | `RJ kyc_verified` | Verified | | |

### R3 · Online & the one board

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | R3·1 | `RJM offline` | Offline  [BOTH] | | |
| 👁 | R3·2 | `RJM board` | Jobs · one list  [BOTH] | rider tabs cluster align (`docs/parity/PHASE5-ridertabs.md`, `tools/parity/out/phase5_ridertabs.png`) | white "Jobs near you" bar + bell (green BrandHeader removed), compact online pill, primary card actions; honest inert-socket "Reconnecting" + flag-off copy |
| 👁 | R3·3 | `RJM board_empty` | Online · nothing in range  [BOTH] | rider tabs cluster align (`docs/parity/PHASE5-ridertabs.md`, `tools/parity/out/phase5_ridertabs.png`) | |
| ⬜ | R3·4 | `RJM notifications` | One inbox  [BOTH] | | |
| ⬜ | R3·5 | `RJM board_food_off` | Jobs · food dispatch off  [PARCEL] | | |
| ⬜ | R3·6 | `RJM board_empty_food_off` | Food off · nothing in range  [PARCEL] | | |

### R4 · Taking a job

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | R4·1 | `RJM offer_parcel` | Parcel · name your fare  [PARCEL] | | |
| ⬜ | R4·2 | `RJ offer_sent` | Offer sent · waiting  [PARCEL] | | |
| ⬜ | R4·3 | `RJ picked` | Customer picked you  [PARCEL] | | |
| 👁 | R4·4 | `RJM offer_food` | Food · accept the job  [FOOD] | rider offer/job cluster align (`docs/parity/PHASE5-riderjobs.md`, `tools/parity/out/phase5_riderjobs.png`) | one screen serves both food-offer keys; the harness fixture is a live cash-dispatch offer, so the app matches `RR offer_cash` — the `RJM offer_food` no-countdown surface is the flag-off branch (honest deviation) |
| 👁 | R4·5 | `RR offer_cash` | Food · CASH collect  [FOOD] | rider offer/job cluster align (`docs/parity/PHASE5-riderjobs.md`, `tools/parity/out/phase5_riderjobs.png`) | added the cta-fill NEW ORDER timer banner, CASH PayTag + YOU EARN row, marked COLLECT FROM/DELIVER TO legs card, and the return-leg note; COLLECT AT THE DOOR + accept/pass labels already matched |
| ⬜ | R4·6 | `RR offer_upfront` | Food · kitchen wants upfront  [FOOD] | | |
| ⬜ | R4·7 | `RR offer_wallet` | Food · already paid  [FOOD] | | |

### R5 · The active job

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | R5·1 | `RJM active_parcel` | Active · parcel  [PARCEL] | | |
| 👁 | R5·2 | `RJ job_assigned` | Job · assigned  [PARCEL] | rider offer/job cluster align (`docs/parity/PHASE5-riderjobs.md`, `tools/parity/out/phase5_riderjobs.png`) | "Your job" + assigned pill, Agreed fare, revealed sender/recipient contacts (fixture now seeds the phones), items, stepper, "Confirm the job" verbatim; contacts render as JobDetailsCard "Call …" links vs the mock's boxed CallRows (shared-card shape, deviation) |
| ⬜ | R5·3 | `RJ job_pickup` | En route to pickup  [PARCEL] | | |
| ⬜ | R5·4 | `RJ job_verify` | Verify items at pickup  [PARCEL] | | |
| ⬜ | R5·5 | `RJ job_collect` | Parcel collected  [PARCEL] | | |
| ⬜ | R5·6 | `RJ job_dropoff` | En route to drop-off  [PARCEL] | | |
| 👁 | R5·7 | `RJM active_food` | Active · food  [FOOD] | rider offer/job cluster align (`docs/parity/PHASE5-riderjobs.md`, `tools/parity/out/phase5_riderjobs.png`) | fixture re-driven to the `picked_up` CARRY state: CashHeldStrip YOURS $2.50 / OWED $13.00 (goods debt open), food stepper mid-flow, plus the added "Collect $X at the door" accent card; CTA is "Navigate to the customer" (code entry lives at the door via the map-first leg, RR.nav_cust), header "Your job" (deviations) |
| 👁 | R5·8 | `RR nav_rest` | To the restaurant  [FOOD] | rider offer/job cluster align (`docs/parity/PHASE5-riderjobs.md`, `tools/parity/out/phase5_riderjobs.png`) | now its own fixture `rider_food_nav` at `en_route_pickup` → the map-dominant `FoodNavLeg` (full map + restaurant card + CASH PayTag + Open in Maps + arrival CTA); sheet sub-copy + missing ETA are FoodNavLeg copy deviations |
| ⬜ | R5·9 | `RR pay_merchant` | Pay the merchant  [FOOD] | | |
| ⬜ | R5·10 | `RR pickup_confirm` | Collect · CASH job  [FOOD] | | |
| ⬜ | R5·11 | `RR pickup_paid` | Collect · already PAID  [FOOD] | | |
| ⬜ | R5·12 | `RR nav_cust` | To the customer  [FOOD] | | |
| ⬜ | R5·13 | `RR doorstep` | Collect · confirm cash  [FOOD] | | |
| ⬜ | R5·14 | `RJM handoff` | Delivery code  [BOTH] | | |
| ⬜ | R5·15 | `RJ job_handoff` | Hand-off · parcel  [PARCEL] | | |
| ⬜ | R5·16 | `RJ job_delivered` | Delivered  [PARCEL] | | |
| ⬜ | R5·17 | `RR delivered` | Delivered · food  [FOOD] | | |
| ⬜ | R5·18 | `RR return_cash` | Return the kitchen's cash  [FOOD] | | |
| ⬜ | R5·19 | `RJM pickup_photo` | Proof of pickup · capture  [PARCEL] | | |
| ⬜ | R5·20 | `RJM pickup_photo_preview` | Proof of pickup · preview  [PARCEL] | | |

### R6 · Money

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| 👁 | R6·1 | `RJM money` | Money tab  [BOTH] | rider tabs cluster align (`docs/parity/PHASE5-ridertabs.md`, `tools/parity/out/phase5_ridertabs.png`) | accent-bordered balance card, cash-held strip, bare ledger rows; `yours` unmodelled at tab level (deviation) |
| ⬜ | R6·2 | `RJM gate_topup` | Gate · top up to keep riding  [BOTH] | | |
| ⬜ | R6·3 | `RJ topup_amount` | Top up · amount  [BOTH] | | |
| ⬜ | R6·4 | `RJ topup_wait` | Payment prompt · wait  [BOTH] | | |
| ⬜ | R6·5 | `RJ topup_success` | Top up · success  [BOTH] | | |
| ⬜ | R6·6 | `RJ wallet_low` | Balance low  [BOTH] | | |

### R7 · Account & support

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| 👁 | R7·1 | `RJM account` | Account | rider tabs cluster align (`docs/parity/PHASE5-ridertabs.md`, `tools/parity/out/phase5_ridertabs.png`) | identity card (`/auth/me`) + tile rows; profile/sign-out behind a tap on the identity card |
| ⬜ | R7·2 | `RJ bike_docs` | Bike & documents | | |
| ⬜ | R7·3 | `RJ history` | Job history  [BOTH] | | |
| ⬜ | R7·4 | `RJ settings` | Settings | | |
| ⬜ | R7·5 | `RJ help` | Help & support | | |
| ⬜ | R7·6 | `RJM strikes` | Reliability · strikes | | |

### R8 · Trust & safety

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | R8·1 | `RJ sos_idle` | SOS · live-job control  [BOTH] | | |
| ⬜ | R8·2 | `RJ sos_confirm` | SOS · confirm  [BOTH] | | |
| ⬜ | R8·3 | `RJ sos_contacts` | SOS · contacts  [BOTH] | | |
| ⬜ | R8·4 | `RJ report` | Report + block customer  [BOTH] | | |
| ⬜ | R8·5 | `RJ report_done` | Report sent  [BOTH] | | |
| ⬜ | R8·6 | `RJ job_help` | Get help with this job  [BOTH] | | |
| ⬜ | R8·7 | `RJ job_help_sent` | Issue logged  [BOTH] | | |

### R9 · Exceptions & edge

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | R9·1 | `RJ missed_order` | Job taken first  [PARCEL] | | |
| ⬜ | R9·2 | `RJ not_chosen` | Not chosen  [PARCEL] | | |
| ⬜ | R9·3 | `RJ bid_expired` | Auction expired · no pick  [PARCEL] | | |
| ⬜ | R9·4 | `RJ handoff_wrong` | Wrong code · lockout  [PARCEL] | | |
| ⬜ | R9·5 | `RJ undelivered` | Not delivered  [PARCEL] | | |
| ⬜ | R9·6 | `RJ job_bail` | Rider cancels (bail)  [PARCEL] | | |
| ⬜ | R9·7 | `RJ job_offline` | Connection lost mid-job  [PARCEL] | | |
| ⬜ | R9·8 | `RJ job_cancelled` | Customer cancelled  [PARCEL] | | |
| ⬜ | R9·9 | `RR offer_expired` | Offer expired  [FOOD] | | |
| ⬜ | R9·10 | `RR cancel_reason` | Drop the job · before pickup  [FOOD] | | |
| ⬜ | R9·11 | `RR cancel_blocked` | Can't drop after collecting  [FOOD] | | |
| ⬜ | R9·12 | `RR cash_dispute` | Customer confirmed, you didn't  [FOOD] | | |
| ⬜ | R9·13 | `RR code_wrong` | Wrong code  [FOOD] | | |
| ⬜ | R9·14 | `RR unreachable` | Customer unreachable  [FOOD] | | |
| ⬜ | R9·15 | `RR return_rest` | Return to restaurant  [FOOD] | | |
| ⬜ | R9·16 | `RR handback` | Hand back confirm  [FOOD] | | |
| ⬜ | R9·17 | `RR offline_resume` | Resumed mid-delivery  [FOOD] | | |
| ⬜ | R9·18 | `RJ kyc_failed` | Verification failed | | |
| ⬜ | R9·19 | `RJ kyc_expired` | ID expired (later) | | |
| ⬜ | R9·20 | `RJ photo_failed` | ID photo · upload failed | | |
| ⬜ | R9·21 | `RJ gate_out_of_area` | Gate · out of area | | |
| ⬜ | R9·22 | `RJ gate_cooldown` | Gate · cooldown | | |
| ⬜ | R9·23 | `RJ gate_banned` | Gate · account closed | | |
| ⬜ | R9·24 | `RJ gate_kyc_locked` | Gate · verification locked | | |
| ⬜ | R9·25 | `RJ topup_declined` | Top up · declined  [BOTH] | | |
| ⬜ | R9·26 | `RJ offline` | Offline banner | | |
| ⬜ | R9·27 | `RJ on_hold` | Account on hold | | |
| ⬜ | R9·28 | `RJ force_update` | Force update | | |
| ⬜ | R9·29 | `RJ no_gps` | Location off / no GPS | | |
| ⬜ | R9·30 | `RJ generic_error` | Generic error | | |
| ⬜ | R9·31 | `RJM pickup_photo_failed` | Proof photo · upload failed  [PARCEL] | | |
| ⬜ | R9·32 | `RJM strikes_final` | One strike from a pause | | |

## MERCHANT (All Screens Gallery ← RGD.MERCHANT; trailing (RV …) = Restaurants Vertical badge)


### M1 · Get on shift

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | M1·1 | `RM login` | Phone + OTP login  (RV M0·1) | | |
| ⬜ | M1·2 | `RM setup` | First login · setup  (RV M0·2) | | |
| ⬜ | M1·3 | `RM reboot` | Tablet rebooted mid-shift  (RV M0·b1) | | |

### M2 · The queue

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | M2·1 | `RM queue_empty` | Open · no orders  (RV M1·1) | | |
| ⬜ | M2·2 | `RM queue_loading` | Loading  (RV M1·2) | | |
| ⬜ | M2·3 | `RM queue_new` | NEW ORDER · alarm  (RV M1·3) | | |
| ⬜ | M2·4 | `RM queue_board` | Kitchen board · 3 live  (RV M1·4) | | |
| ⬜ | M2·5 | `RM two_orders` | Two orders at once  (RV M1·b1) | | |
| ⬜ | M2·6 | `RM offline` | Connection lost  (RV M1·b2) | | |
| ⬜ | M2·7 | `RM offline_order` | Order arrived offline  (RV M1·b3) | | |

### M3 · Accept & cook

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | M3·1 | `RM order_accept` | Accept + prep time  (RV M2·1) | | |
| ⬜ | M3·2 | `RM call_confirm` | Call, then request payment  (RV M2·6) | | |
| ⬜ | M3·3 | `RM awaiting_payment` | Awaiting payment · no clock  (RV M2·7) | | |
| ⬜ | M3·4 | `RM reject_sheet` | Reject · reason  (RV M2·2) | | |
| ⬜ | M3·5 | `RM waiting_rider` | Accepted · do not cook yet  (RV M2·3) | | |
| ⬜ | M3·6 | `RM cook_now` | Rider secured · cook now  (RV M2·4) | | |
| ⬜ | M3·7 | `RM mark_ready` | Mark ready  (RV M2·5) | | |
| ⬜ | M3·8 | `RM no_rider_merchant` | NO_RIDER · never cooked  (RV M2·b1) | | |
| ⬜ | M3·9 | `RM rider_cancelled` | Rider cancelled · re-dispatch  (RV M2·b2) | | |
| ⬜ | M3·10 | `RM item_out` | Don't have an item  (RV M2·8) | | |
| ⬜ | M3·11 | `RM item_out_wait` | New total · customer confirming  (RV M2·9) | | |

### M4 · Pickup confirm

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | M4·1 | `RM pickup_cash` | Upfront · confirm cash  (RV M3·1) | | |
| ⬜ | M4·2 | `RM pickup_collect` | Collect-and-return · release  (RV M3·1b) | | |
| ⬜ | M4·3 | `RM pickup_wallet` | WALLET · confirm before cooking  (RV M3·2) | | |
| ⬜ | M4·4 | `RM wallet_mismatch` | Short payment blocked  (RV M3·b1) | | |
| ⬜ | M4·5 | `RM pickup_done` | Handed over  (RV M3·3) | | |
| ⬜ | M4·6 | `RM cash_return` | Count the returned cash  (RV M3·4) | | |
| ⬜ | M4·7 | `RM rider_noshow` | Rider no-show  (RV M3·b2) | | |
| ⬜ | M4·8 | `RM refund_exec` | Refund after wallet paid  (RV M3·b3) | | |
| ⬜ | M4·9 | `RM pickup_reveal` | Pickup code · hidden  (RV M3·5) | | |
| ⬜ | M4·10 | `RM pickup_revealed` | Pickup code · revealed  (RV M3·6) | | |

### M5 · Run the shop

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | M5·1 | `RM catalog` | Menu · grouped by category  (RV M4·1) | | |
| ⬜ | M5·2 | `RM category_manage` | Categories · reorder & hide  (RV M4·2) | | |
| ⬜ | M5·3 | `RM category_edit` | New category  (RV M4·3) | | |
| ⬜ | M5·4 | `RM category_rename` | Edit / delete category  (RV M4·4) | | |
| ⬜ | M5·5 | `RM catalog_empty` | No categories yet  (RV M4·b1) | | |
| ⬜ | M5·6 | `RM item_edit` | Edit dish · photo required  (RV M4·5) | | |
| ⬜ | M5·7 | `RM dish_photo` | Dish photo · crop  (RV M4·6) | | |
| ⬜ | M5·8 | `RM dish_draft` | Draft · needs a photo  (RV M4·b2) | | |
| ⬜ | M5·9 | `RM oos_sheet` | Out of stock today  (RV M4·7) | | |
| ⬜ | M5·10 | `RM hours` | Operating hours  (RV M4·8) | | |
| ⬜ | M5·11 | `RM statement` | Weekly statement  (RV M4·9) | | |
| ⬜ | M5·12 | `RM eod` | End of day  (RV M4·10) | | |

### M6 · Shop front

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | M6·1 | `RM shop` | Shop profile  (RV M5·1) | | |
| ⬜ | M6·2 | `RM cash_rule` | Your cash rule  (RV M5·4) | | |
| ⬜ | M6·3 | `RM shop_crop` | Position the banner  (RV M5·2) | | |
| ⬜ | M6·4 | `RM shop_upload` | Uploading · compressing  (RV M5·3) | | |
| ⬜ | M6·5 | `RM shop_upload_failed` | Upload paused · offline  (RV M5·b1) | | |

## Restaurants Vertical gallery badges (explorations/restaurants/Restaurants Vertical.html)


## ADMIN (ui_kits/admin — pages, gallery badges A1-A7)

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | A1 | `index.html Overview` | dashboard | | |
| ⬜ | A2 | `orders.html Orders` | — monitor & detail | | |
| ⬜ | A3 | `riders.html Riders` | — directory & profile | | |
| ⬜ | A4 | `customers.html Customers` | — directory & profile | | |
| ⬜ | A5 | `cash.html Cash` | & settlements (business model retired — see EXPORT-README) | | |
| ⬜ | A6 | `kyc.html KYC` | — queue & review | | |
| ⬜ | A7 | `issues.html Issues` | — disputes | | |

## New customer flows sheet (ui_kits/mobile/new-flows.html)


## Trust, safety & recovery sheet (ui_kits/mobile/safety-flows.html; c=customer, r=rider)

| | Badge | Registry id | Screen | PR | Signed off |
|---|---|---|---|---|---|
| ⬜ | B1·1 | `c sos_idle` | Idle — SOS pinned  (ref R-16 · P1) | | |
| ⬜ | B1·2 | `c sos_confirm` | Confirm step  (ref Q3 · resolved) | | |
| ⬜ | B1·3 | `c sos_contacts` | Emergency contacts  (ref Q3 · resolved) | | |
| ⬜ | B1·4 | `c sos_error` | Log failed (offline)  (ref Offline-first) | | |
| ⬜ | B2·1 | `c report` | Report + block rider  (ref F-15 / R-11 · P1) | | |
| ⬜ | B2·2 | `c report_done` | Report sent  (ref F-15 / R-11) | | |
| ⬜ | B3·1 | `c trip_help` | Get help with this trip  (ref X-1 · P1) | | |
| ⬜ | B3·2 | `c trip_help_sent` | Issue logged  (ref X-1) | | |
| ⬜ | C·1 | `c otp_cooldown` | Resend cooldown  (ref A0-1 / R0-1 · Wave 4) | | |
| ⬜ | C·2 | `c otp_resent` | Code re-sent  (ref A0-1 / R0-1) | | |
| ⬜ | C·3 | `c otp_locked` | Expired / locked  (ref A0-1 / R0-1) | | |
| ⬜ | D·1 | `c track_dark` | Rider went dark  (ref R-04 / R-05 · C5) | | |
| ⬜ | A1 | `r gate_out_of_area` | Outside service area  (ref A1-1 / R2-2 · Wave 3) | | |
| ⬜ | A2 | `r gate_cooldown` | Short cooldown  (ref gates.ts · cooldown) | | |
| ⬜ | A3 | `r gate_banned` | Account closed  (ref gates.ts · banned) | | |
| ⬜ | A4 | `r gate_kyc_locked` | Verification locked  (ref R-04 · isKycLocked) | | |
| ⬜ | E·1 | `r photo_capture` | Capture  (ref P3 · KYC photo) | | |
| ⬜ | E·2 | `r photo_preview` | Preview & self-check  (ref P3 · KYC photo) | | |
| ⬜ | E·3 | `r photo_uploading` | Uploading (non-blocking)  (ref P3 · KYC photo) | | |
| ⬜ | E·4 | `r photo_failed` | Upload failed  (ref P3 · recoverable) | | |

## Support kit (ui_kits/support/screens.js)


## Interactive mobile kit flow states (ui_kits/mobile/app.js state machine)


## Shipped-states sheet (ui_kits/mobile/shipped-states.html; c=customer LJ, j=rider RJM, m=merchant RM)


## RETIRED ids (kept in registries for record; never align to these — see EXPORT-README)


---

Generated from `packages/design/EXPORT-MANIFEST.txt` (export 2026-08-10 rev 2). If a future export
changes the inventory, regenerate the skeleton but carry the status column across by hand — never
reset it.

