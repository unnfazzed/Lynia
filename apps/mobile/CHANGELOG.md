# Changelog

## [0.34.0](https://github.com/unnfazzed/Lynia/compare/v0.33.0...v0.34.0) (2026-08-13)


### Features

* **parity:** CI-blocking rendered-conformance guardrail (jest, no browser) ([e4248ff](https://github.com/unnfazzed/Lynia/commit/e4248ff0ccfd7a2a5649016bf192d0eca6050cdd))
* **payments:** remove the SIMULATED/PREVIEW markers from the unbacked payment screens ([2162d8b](https://github.com/unnfazzed/Lynia/commit/2162d8b71f7f79d0a02c3962d2cd4fb924065f6b))


### Bug Fixes

* **mobile:** errors speak once and clear themselves; delete background error cards ([b458c2e](https://github.com/unnfazzed/Lynia/commit/b458c2e2feb37dec13d2ef36261e2d1df7c10843))
* **mobile:** remove dead code failing oxlint (unblocks parity CI) ([5192e84](https://github.com/unnfazzed/Lynia/commit/5192e8475135d93eb2e91e5542f83d182549b122))

## [0.33.0](https://github.com/unnfazzed/Lynia/compare/v0.32.1...v0.33.0) (2026-08-12)


### Features

* **payments:** ship the top-up and food-checkout previews behind a server kill switch ([da70866](https://github.com/unnfazzed/Lynia/commit/da7086646030c3549bac490d69c56e2fde126553))


### Bug Fixes

* **nav:** mock-aligned dead-end fixes — pay-screen back, item-approval footer ([13015f9](https://github.com/unnfazzed/Lynia/commit/13015f9aeeb0009af01ccb133f7d06040ff83b07))

## [0.32.1](https://github.com/unnfazzed/Lynia/compare/v0.32.0...v0.32.1) (2026-08-12)


### Performance Improvements

* **mobile:** cut the cold-start graph, unbraid the boot gates, measure launch ([#735](https://github.com/unnfazzed/Lynia/issues/735)) ([bd2eb75](https://github.com/unnfazzed/Lynia/commit/bd2eb75d59cc734aeec3fb3f996d71f2c5148923))

## [0.32.0](https://github.com/unnfazzed/Lynia/compare/v0.31.0...v0.32.0) (2026-08-12)


### Features

* **home:** remove the Send again rail — AppHome contract, owner decision D-13 ([d97e051](https://github.com/unnfazzed/Lynia/commit/d97e051fd70558630ae5bbde2cc50dfe1c9f76c5))
* **send:** remove on-device draft from the send-parcel flow ([7143de4](https://github.com/unnfazzed/Lynia/commit/7143de41a99d396958212274ff5eaab5fcafa6bf))


### Bug Fixes

* **nav:** food-lane P0s — live-order back-stack, push routing, placing guard ([6fbbe56](https://github.com/unnfazzed/Lynia/commit/6fbbe5621d0310cc2060c96c74eb71bbf39da1a0))

## [0.31.0](https://github.com/unnfazzed/Lynia/compare/v0.30.0...v0.31.0) (2026-08-12)


### Features

* **home:** one live-order card per running job — align RC.home to the design mock ([befb559](https://github.com/unnfazzed/Lynia/commit/befb559543190568cec50afd845e897c5b692ee1))
* **parity:** Foundation-F.a render-helper/SHELL unwrap + adopt rider account ([cea3583](https://github.com/unnfazzed/Lynia/commit/cea3583cd264023b6877eec4eff027440d0b9967))
* **parity:** Foundation-F.c — map/sheet region codegen + adopt send-composer ([#704](https://github.com/unnfazzed/Lynia/issues/704)) ([85f85c5](https://github.com/unnfazzed/Lynia/commit/85f85c58e7cbb87c4a29749bbc4296cbd11dba20))
* **parity:** Foundation-F.d region-adopt live composites (RC.await_accept, RC.track_prep) ([#705](https://github.com/unnfazzed/Lynia/issues/705)) ([1957168](https://github.com/unnfazzed/Lynia/commit/1957168387ad5a3f00e4a16ac8e62088d622fd9c))
* **parity:** Foundation-F.e transpiler idioms + final sweep (LJ.role_select, LJ.role_select_flag_off) ([#706](https://github.com/unnfazzed/Lynia/issues/706)) ([378c430](https://github.com/unnfazzed/Lynia/commit/378c4309bfaa56f6090b70daace830c861efdac2))
* **parity:** rider RJM realignment — adopt active_food ([#714](https://github.com/unnfazzed/Lynia/issues/714)) ([49a6fa6](https://github.com/unnfazzed/Lynia/commit/49a6fa63971125b0b8542de2140279d8263c9131))
* **parity:** rider RJM realignment — adopt active_parcel cash_strip ([36c7910](https://github.com/unnfazzed/Lynia/commit/36c7910b6aeb07f44c44926a05a8cb37ac175e46))
* **parity:** rider RJM realignment — adopt board empty + offline states ([#710](https://github.com/unnfazzed/Lynia/issues/710)) ([118d29a](https://github.com/unnfazzed/Lynia/commit/118d29a46a131b81112dde4ea59c773aa637303f))
* **parity:** rider RJM realignment — adopt offer_food (remove non-existent cash-upfront variant) ([#712](https://github.com/unnfazzed/Lynia/issues/712)) ([cb6364c](https://github.com/unnfazzed/Lynia/commit/cb6364ce1d324264f3a5f8e677c11eec32e3d4de))
* **parity:** rider RJM realignment — adopt offer_parcel ([#713](https://github.com/unnfazzed/Lynia/issues/713)) ([c20a380](https://github.com/unnfazzed/Lynia/commit/c20a3803171651912b285975df13ca15e8a417fc))
* **parity:** rider RJM realignment — plan + adopt board list (RJM.board#list) ([#709](https://github.com/unnfazzed/Lynia/issues/709)) ([7ae6f52](https://github.com/unnfazzed/Lynia/commit/7ae6f5246dc21e32a8c7fb3c86095fbd5192a2fb))


### Bug Fixes

* **mobile:** stop the old flag-off UI flashing on every cold start ([#720](https://github.com/unnfazzed/Lynia/issues/720)) ([b44ce57](https://github.com/unnfazzed/Lynia/commit/b44ce578a3c765940ef6a8af39612d30505dec0b))

## [0.30.0](https://github.com/unnfazzed/Lynia/compare/v0.29.0...v0.30.0) (2026-08-11)


### Features

* **parity:** codegen-adopt customer account cluster (LJ.notifications; defer profile/settings/history) ([cc754cd](https://github.com/unnfazzed/Lynia/commit/cc754cdbc22d6e786030ef75d0a9701acf9c0f59))
* **parity:** codegen-adopt customer auth cluster (LJ.login, LJ.onboard, LJ.perm_loc, LJ.perm_notif) ([4753c52](https://github.com/unnfazzed/Lynia/commit/4753c52e4a32e62be29ac635409eba9e245463e6))
* **parity:** codegen-adopt customer system/error states cluster (LJ.force_update; defer on_hold/generic_error) ([#694](https://github.com/unnfazzed/Lynia/issues/694)) ([73a1e0e](https://github.com/unnfazzed/Lynia/commit/73a1e0e5b30c59532d9c72406bd02ca9ebf09e8a))
* **parity:** codegen-adopt food browse/discovery cluster (RC.closed_interrupt; defer RC.home/RC.search/RC.menu_closed) ([f1a2af1](https://github.com/unnfazzed/Lynia/commit/f1a2af1f0a3fcb33a09ab5e2359259c00cba3566))
* **parity:** region-adopt food cart cluster (RC.cart#footer; defer summary/lines/eta/upsell/oos/price/min/note) ([#698](https://github.com/unnfazzed/Lynia/issues/698)) ([fe2e2a8](https://github.com/unnfazzed/Lynia/commit/fe2e2a8cc378d1f3ba5fa8a7475162fbd217e905))
* **parity:** region-adopt food checkout cluster (RC.checkout_cash summary + footer) ([59d2b36](https://github.com/unnfazzed/Lynia/commit/59d2b360ea8e777ba95ee709b143cecb48919b45))

## [0.29.0](https://github.com/unnfazzed/Lynia/compare/v0.28.0...v0.29.0) (2026-08-11)


### Features

* **parity:** Foundation-E region/fragment guarding + adopt RC.menu (first interactive screen) ([7a60cf0](https://github.com/unnfazzed/Lynia/commit/7a60cf085890674ff01cb0f2302bd5477ff6321b))
* **pay:** payment-prompt push flow for food orders ([#670](https://github.com/unnfazzed/Lynia/issues/670)) ([#687](https://github.com/unnfazzed/Lynia/issues/687)) ([67f5d3a](https://github.com/unnfazzed/Lynia/commit/67f5d3a4c035c12d6eabe3ba2e3f5e36d3923161))

## [0.28.0](https://github.com/unnfazzed/Lynia/compare/v0.27.0...v0.28.0) (2026-08-11)


### Features

* **discovery:** cross-restaurant dish search index ([#673](https://github.com/unnfazzed/Lynia/issues/673) part b) ([#686](https://github.com/unnfazzed/Lynia/issues/686)) ([73465c6](https://github.com/unnfazzed/Lynia/commit/73465c6041d865145b7f45810c3113eea931ba1e))
* **discovery:** restaurant rating + prep baseline on the food list card ([#673](https://github.com/unnfazzed/Lynia/issues/673) part a) ([#684](https://github.com/unnfazzed/Lynia/issues/684)) ([cf64092](https://github.com/unnfazzed/Lynia/commit/cf640927bd25930af72436b3316de07bb1b87a0d))
* **food:** expose assigned rider identity on food orders ([#671](https://github.com/unnfazzed/Lynia/issues/671)) ([e6a01c4](https://github.com/unnfazzed/Lynia/commit/e6a01c4170f56379043905f71e052f3f46b6df95))
* **parity:** codegen-adopt food cluster (RC.placing; defer RC.list/menu/cart/checkout/orders data) ([4ab4bc1](https://github.com/unnfazzed/Lynia/commit/4ab4bc13631fba8899c305ce28527c4bf9ebe7f3))
* **parity:** DS primitives (PriceMath/Banner/CoverPhoto/MenuRow) + empty-state Card + adopt RC.cart_empty ([fd1fbbe](https://github.com/unnfazzed/Lynia/commit/fd1fbbe4a073b772c2ac74c2f53c8c5c122631fe))
* **parity:** Foundation-D primitives (EtaLine/ShopLogo/FoodThumb/Screen.footer) + adopt food data cluster ([#685](https://github.com/unnfazzed/Lynia/issues/685)) ([d15b736](https://github.com/unnfazzed/Lynia/commit/d15b7368fd159bb40dcd1ab28be5eb9683545477))
* **parity:** mock→RN codegen + structural-snapshot guardrail (foundation, LJ.help proven E2E) ([#668](https://github.com/unnfazzed/Lynia/issues/668)) ([6c08f98](https://github.com/unnfazzed/Lynia/commit/6c08f988a5c37f59277ae2c35fe2580206b74fb4))
* **parity:** multi-state adoption model + FlatList≡map equivalence + adopt food-list states ([#678](https://github.com/unnfazzed/Lynia/issues/678)) ([72b38fa](https://github.com/unnfazzed/Lynia/commit/72b38faba79646096e4bee1485c940cbfa9f2a2e))
* **parity:** Screen banner slot + guardrail slot verification + adopt RC.list_error ([8443520](https://github.com/unnfazzed/Lynia/commit/8443520c1bdf4603ff023441e51011bacd187eb3))


### Bug Fixes

* **parity:** harden mock→RN codegen (display:flex→row, list-in-&lt;Text&gt;, className) + regen LJ.help ([#675](https://github.com/unnfazzed/Lynia/issues/675)) ([a2a6e6f](https://github.com/unnfazzed/Lynia/commit/a2a6e6fd61c7aa7d48ad7ccca115d12da7fbc7ad))

## [0.27.0](https://github.com/unnfazzed/Lynia/compare/v0.26.0...v0.27.0) (2026-08-11)


### Features

* **parity:** align rider offer/job cluster to mocks ([6269a13](https://github.com/unnfazzed/Lynia/commit/6269a13f8ee4d8f63d0ddb65a92ae2a60384d12f))
* **parity:** align rider onboarding cluster to mocks ([521e1ab](https://github.com/unnfazzed/Lynia/commit/521e1abe160c84d4c12a61bcabc734c6dbfe9cdd))

## [0.26.0](https://github.com/unnfazzed/Lynia/compare/v0.25.0...v0.26.0) (2026-08-11)


### Features

* **parity:** align customer food browse cluster to mocks ([ee993d4](https://github.com/unnfazzed/Lynia/commit/ee993d41ade0960d781ff68c167cacc9d68aeb48))
* **parity:** align customer food cart & checkout cluster to mocks ([aec83b7](https://github.com/unnfazzed/Lynia/commit/aec83b790c2f95e2b9158a550eb8c1a87adceb9b))
* **parity:** align customer food order tracker cluster to mocks ([4c6ce4a](https://github.com/unnfazzed/Lynia/commit/4c6ce4a4a27d0fcad901c65376c796f8622bba43))

## [0.25.0](https://github.com/unnfazzed/Lynia/compare/v0.24.0...v0.25.0) (2026-08-11)


### Features

* **parity:** align customer parcel tracking cluster to mocks ([6d12bf9](https://github.com/unnfazzed/Lynia/commit/6d12bf9507f9caa70a15e682bc1aa23b2a078ee5))

## [0.24.0](https://github.com/unnfazzed/Lynia/compare/v0.23.0...v0.24.0) (2026-08-11)


### Features

* **parity:** align customer account cluster to mocks ([86f7f3c](https://github.com/unnfazzed/Lynia/commit/86f7f3c068d3e8af4e6256f00f83c3a211b1083c))

## [0.23.0](https://github.com/unnfazzed/Lynia/compare/v0.22.1...v0.23.0) (2026-08-11)


### Features

* **parity:** align send-home template — map-behind-sheet, rows in sheet, single top-bar action ([2ab909e](https://github.com/unnfazzed/Lynia/commit/2ab909ed9b0216b1164ca04419a4ad0957c437dc))

## [0.22.1](https://github.com/unnfazzed/Lynia/compare/v0.22.0...v0.22.1) (2026-08-10)


### Bug Fixes

* **design:** execute the notable kit-vs-shipped partials (customer, rider, merchant) ([#638](https://github.com/unnfazzed/Lynia/issues/638)) ([b8a8453](https://github.com/unnfazzed/Lynia/commit/b8a8453f2235de11c780bd4c52057bc292d2df45))

## [0.22.0](https://github.com/unnfazzed/Lynia/compare/v0.21.0...v0.22.0) (2026-08-10)


### Features

* **mobile:** build the five missing kit primitives (AppBar, Money, SystemState, CodeInput, food nav legs) and adopt them ([#633](https://github.com/unnfazzed/Lynia/issues/633)) ([d404781](https://github.com/unnfazzed/Lynia/commit/d404781d0d474d6b0e4609151a054eb40b92a377))

## [0.21.0](https://github.com/unnfazzed/Lynia/compare/v0.20.5...v0.21.0) (2026-08-05)


### Features

* build the outstanding kit screens, with unbuilt rails honestly stubbed ([282f569](https://github.com/unnfazzed/Lynia/commit/282f569ce9fcb7fe99b58bcc8e8f902186c84b53))


### Bug Fixes

* **merchant:** validate the decoded image size in the crop sheet ([056686c](https://github.com/unnfazzed/Lynia/commit/056686c2628696f5594147aca965fc48da1c4307))

## [0.20.5](https://github.com/unnfazzed/Lynia/compare/v0.20.4...v0.20.5) (2026-08-05)


### Bug Fixes

* **design:** per-surface alignment sweep — merchant, admin, rider, parcel, food ([#619](https://github.com/unnfazzed/Lynia/issues/619)) ([680415b](https://github.com/unnfazzed/Lynia/commit/680415b81fd2e400b6fb53b636f291cbe6eaabcb))

## [0.20.4](https://github.com/unnfazzed/Lynia/compare/v0.20.3...v0.20.4) (2026-08-05)


### Bug Fixes

* **mobile:** make the customer food tracker work, and wire the resume warm-paint ([2228e1f](https://github.com/unnfazzed/Lynia/commit/2228e1f11c9cd83f3f0b8f6ace2b35345dd9f1cd))

## [0.20.3](https://github.com/unnfazzed/Lynia/compare/v0.20.2...v0.20.3) (2026-08-05)


### Bug Fixes

* **mobile:** close three kit-vs-shipped correctness gaps ([307cca2](https://github.com/unnfazzed/Lynia/commit/307cca20de3f2b6e1bc538de7dbd9517b462387f))

## [0.20.2](https://github.com/unnfazzed/Lynia/compare/v0.20.1...v0.20.2) (2026-08-05)


### Bug Fixes

* **design:** align foundations + shared primitives to the kit ([0b71c8c](https://github.com/unnfazzed/Lynia/commit/0b71c8ca4152143416ddb06fcaa276178ea37f17))

## [0.20.1](https://github.com/unnfazzed/Lynia/compare/v0.20.0...v0.20.1) (2026-08-05)


### Bug Fixes

* **mobile:** keep the remind-me control behind the ui/api boundary ([3e40106](https://github.com/unnfazzed/Lynia/commit/3e40106ad9dc18a889f556d847cd268e2750e501))

## [0.20.0](https://github.com/unnfazzed/Lynia/compare/v0.19.0...v0.20.0) (2026-08-05)


### Features

* **mobile:** build addr_map_confirm, adopt the kit's tracking route hand-off ([#606](https://github.com/unnfazzed/Lynia/issues/606)) ([b1856f1](https://github.com/unnfazzed/Lynia/commit/b1856f1f6dadf66fb1f4665a83fd5f2c83b64d1e))

## [0.19.0](https://github.com/unnfazzed/Lynia/compare/v0.18.1...v0.19.0) (2026-08-05)


### Features

* **mobile:** adopt the kit's search-first addressing; audit all journey flows ([25991a9](https://github.com/unnfazzed/Lynia/commit/25991a9d6f96ccd6c64db6b9d7510a98774e3af5))

## [0.18.1](https://github.com/unnfazzed/Lynia/compare/v0.18.0...v0.18.1) (2026-08-05)


### Bug Fixes

* **mobile:** unbreak EAS builds (REL-03) + EAS phase-log visibility ([#601](https://github.com/unnfazzed/Lynia/issues/601)) ([2fb0e4b](https://github.com/unnfazzed/Lynia/commit/2fb0e4baf26199360c63b2e4c3ca93fcc7aa6002))

## [0.18.0](https://github.com/unnfazzed/Lynia/compare/v0.17.13...v0.18.0) (2026-08-05)


### Features

* **mobile,api:** align pre-auth screens + restaurant photos with the joint-launch design ([f498a93](https://github.com/unnfazzed/Lynia/commit/f498a938de05c36a9eee93748dab7bcefc4d385d))


### Bug Fixes

* **mobile:** evidence-gate the "Couldn't check for an active order" banner ([16bfefa](https://github.com/unnfazzed/Lynia/commit/16bfefa3a1da5c0cf5d57b720ca4bee215efefb5))

## [0.17.13](https://github.com/unnfazzed/Lynia/compare/v0.17.12...v0.17.13) (2026-08-04)


### Bug Fixes

* **mobile:** ALR-09 — honest queued state for offline-paused mutations (C-O1) ([#576](https://github.com/unnfazzed/Lynia/issues/576)) ([a09c03e](https://github.com/unnfazzed/Lynia/commit/a09c03e6cf23e5809aa305e6d4484893703c15f2))
* **mobile:** app installs but never starts — bound the font gate, drop resource shrinking ([#589](https://github.com/unnfazzed/Lynia/issues/589)) ([698e80d](https://github.com/unnfazzed/Lynia/commit/698e80da7e274910e8a7ad042c7b4336616a2810))
* **mobile:** central client reliability policy — timeout/retry/backoff (C-O2) ([#582](https://github.com/unnfazzed/Lynia/issues/582)) ([e463cec](https://github.com/unnfazzed/Lynia/commit/e463cecf70fc82fdc99f9ec4524954660678c957))
* **mobile:** gate rider activeJob self-heal poll on online/active-job (A-O4) ([#584](https://github.com/unnfazzed/Lynia/issues/584)) ([cd0e5ac](https://github.com/unnfazzed/Lynia/commit/cd0e5ac07530239dc0e91dc093b517b40f0c9286))
* **mobile:** provision Sentry for Android crash telemetry (LR20) ([#593](https://github.com/unnfazzed/Lynia/issues/593)) ([5d62fb4](https://github.com/unnfazzed/Lynia/commit/5d62fb48ed1030d416b9ef5b2e6855cd32a0c160))
* **mobile:** stop version bumps rotating the OTA runtime version (REL-01) ([26b25c8](https://github.com/unnfazzed/Lynia/commit/26b25c84c113509373c9e2a0ffa0e5fe7207aea5))


### Performance Improvements

* **mobile,api:** B-O10 — cursor-paginate GET /restaurants (LC loop B) ([#583](https://github.com/unnfazzed/Lynia/issues/583)) ([76c6531](https://github.com/unnfazzed/Lynia/commit/76c6531577770609686b5d5fdb6921d10cad7761))
* **mobile:** B-O13 — bound rider board's resolved-order id Sets (LC loop B) ([3320388](https://github.com/unnfazzed/Lynia/commit/3320388e9339325078dccc8b729ce9dc28ec5156))

## [0.17.12](https://github.com/unnfazzed/Lynia/compare/v0.17.11...v0.17.12) (2026-08-04)


### Bug Fixes

* **mobile:** rider Money-tab wallet ledger loses history past 25 entries (LC-B-SIB-2) ([c4ff1d5](https://github.com/unnfazzed/Lynia/commit/c4ff1d539e6c184caa8432c1fb9593585f9de93d))

## [0.17.11](https://github.com/unnfazzed/Lynia/compare/v0.17.10...v0.17.11) (2026-08-04)


### Performance Improvements

* **mobile:** A-O15 — skip redundant active-order refetch when cache is fresh ([#571](https://github.com/unnfazzed/Lynia/issues/571)) ([cac8897](https://github.com/unnfazzed/Lynia/commit/cac88976b0a502962d63f5bded755bb2d2f9eb47))

## [0.17.10](https://github.com/unnfazzed/Lynia/compare/v0.17.9...v0.17.10) (2026-08-04)


### Bug Fixes

* **mobile:** declare expo-modules-autolinking — RN-core autolinking emitted a nonexistent import under pnpm strict layout ([cab6d4a](https://github.com/unnfazzed/Lynia/commit/cab6d4a07db2f145ceaa8a3eca46d82578f441fd))
* **mobile:** target API 35 (Play hard requirement for new apps) + auto-increment versionCode ([0a3bfed](https://github.com/unnfazzed/Lynia/commit/0a3bfed380878182fbd760f74a401c6444497382))

## [0.17.9](https://github.com/unnfazzed/Lynia/compare/v0.17.8...v0.17.9) (2026-08-04)


### Bug Fixes

* **mobile:** declare expo-asset, babel-preset-expo, @sentry/cli as direct deps (EAS pnpm strict layout) ([19d4efd](https://github.com/unnfazzed/Lynia/commit/19d4efd4757abdf71c4e623ff8ac1e980ef3aa30))
* **mobile:** disable Sentry source-map auto-upload until Sentry is provisioned ([#562](https://github.com/unnfazzed/Lynia/issues/562)) ([130d20c](https://github.com/unnfazzed/Lynia/commit/130d20c1f2103b20f0de5ad26f08015bf7b5472f))

## [0.17.8](https://github.com/unnfazzed/Lynia/compare/v0.17.7...v0.17.8) (2026-08-04)


### Bug Fixes

* **mobile:** C-O7 — persist pickup-proof photo capture before upload fires (LC-C09) ([#551](https://github.com/unnfazzed/Lynia/issues/551)) ([48c91c7](https://github.com/unnfazzed/Lynia/commit/48c91c79032f0339bdf83f7149cda7027a87e832))
* **mobile:** gitignore CNG output dirs (fingerprint parity); docs: attempt-4 findings ([#550](https://github.com/unnfazzed/Lynia/issues/550)) ([1cb2451](https://github.com/unnfazzed/Lynia/commit/1cb245112e167fd8897eb51a3f4aeba7908c1faa))
* **mobile:** pin EAS builder pnpm to 10.33.0 (fingerprint path parity) ([#547](https://github.com/unnfazzed/Lynia/issues/547)) ([c6ab2c2](https://github.com/unnfazzed/Lynia/commit/c6ab2c27f4b35bdcbb5eb5d1523616d0a6d30075))


### Performance Improvements

* **api:** A-O14 — omit null cash-handshake/debt/refund fields from food order responses ([#553](https://github.com/unnfazzed/Lynia/issues/553)) ([71811f0](https://github.com/unnfazzed/Lynia/commit/71811f02562bf5c04f3bdd487f03921cba8fe0b5))
* **mobile:** B-O7 — defer push-register/version-gate/feature-flags behind bootstrap ([#549](https://github.com/unnfazzed/Lynia/issues/549)) ([8e31bcc](https://github.com/unnfazzed/Lynia/commit/8e31bcc54b858e26cc9b257a04ada57be8b03809))

## [0.17.7](https://github.com/unnfazzed/Lynia/compare/v0.17.6...v0.17.7) (2026-08-03)


### Bug Fixes

* **mobile:** declare Expo owner for robot-token CI; docs: record pipeline armed end-to-end ([1938c5b](https://github.com/unnfazzed/Lynia/commit/1938c5bbf1b08b5feb92f3b68c5854f6ecdadc9c))

## [0.17.6](https://github.com/unnfazzed/Lynia/compare/v0.17.5...v0.17.6) (2026-08-03)


### Bug Fixes

* **mobile:** LC-B B-O2/B-O9 — memo boundaries for JobCard/JobDetailsCard/ComposeMap ([#525](https://github.com/unnfazzed/Lynia/issues/525)) ([0c01896](https://github.com/unnfazzed/Lynia/commit/0c018969c2be14950154542b7af4afb2e0585bc2))

## [0.17.5](https://github.com/unnfazzed/Lynia/compare/v0.17.4...v0.17.5) (2026-08-03)


### Performance Improvements

* **mobile:** virtualize rider board open-orders list, cap board cache (LC-B B-O1b/B-O12) ([74e55df](https://github.com/unnfazzed/Lynia/commit/74e55dfcfe11e05ad17b7aafabe323bbd7ad7fac))

## [0.17.4](https://github.com/unnfazzed/Lynia/compare/v0.17.3...v0.17.4) (2026-08-03)


### Performance Improvements

* **mobile:** A-O12 — redirect zod v4 locales barrel out of the Hermes bundle ([b64efa6](https://github.com/unnfazzed/Lynia/commit/b64efa6f980dab1aa7cb131b7dfdc91be13d8464))
* **mobile:** B-O1 — virtualize history and notifications lists with FlatList ([e1648c3](https://github.com/unnfazzed/Lynia/commit/e1648c372ca008861858f00b29e2ba8ecf3b63bf))

## [0.17.3](https://github.com/unnfazzed/Lynia/compare/v0.17.2...v0.17.3) (2026-08-03)


### Bug Fixes

* **mobile:** persist profile-setup draft so an app kill can't lose the typed name/ID (LC-C10) ([0a2672b](https://github.com/unnfazzed/Lynia/commit/0a2672b88c846ee2ebd223c6c63878e40d0ba182))

## [0.17.2](https://github.com/unnfazzed/Lynia/compare/v0.17.1...v0.17.2) (2026-08-03)


### Bug Fixes

* **mobile:** B-T3 list/memory audit — unbounded restaurant list + rider sentOffers growth ([#495](https://github.com/unnfazzed/Lynia/issues/495)) ([3eea99a](https://github.com/unnfazzed/Lynia/commit/3eea99a7cccf5e7fd21333bfac78ed850aa1e8e8))

## [0.17.1](https://github.com/unnfazzed/Lynia/compare/v0.17.0...v0.17.1) (2026-08-01)


### Bug Fixes

* **mobile:** per-weight Inter imports, restore AD_ID strip, drop dead expo-localization ([2f269de](https://github.com/unnfazzed/Lynia/commit/2f269de92665cb48295588f692da56a84fd616db))

## [0.17.0](https://github.com/unnfazzed/Lynia/compare/v0.16.0...v0.17.0) (2026-07-31)


### Features

* **mobile,api:** D5 — rider food jobs (Lane D complete) ([90aa349](https://github.com/unnfazzed/Lynia/commit/90aa34922026b133a9a7b0c5a060f857a403a50f))

## [0.16.0](https://github.com/unnfazzed/Lynia/compare/v0.15.0...v0.16.0) (2026-07-31)


### Features

* **mobile:** A4 — customer home/orders five-states + retirement sweep ([150b91a](https://github.com/unnfazzed/Lynia/commit/150b91a8a31bf6e9463a26d5e5342e099b82d0f3))
* **mobile:** D3 — food order track: prep ring, rider-secured, cancel, NO_RIDER apology, refunded ([3155071](https://github.com/unnfazzed/Lynia/commit/3155071ae8080c3e75aaa49e932e77457e09f16f))
* **mobile:** D4 — food doorstep handshake, delivery code reveal, delivered+rate, no-show ([2d4bf4f](https://github.com/unnfazzed/Lynia/commit/2d4bf4fb6e0d12738ee7aa14f235ac4585c74177))

## [0.15.0](https://github.com/unnfazzed/Lynia/compare/v0.14.0...v0.15.0) (2026-07-30)


### Features

* **mobile:** A3 — Orders + Account tabs absorb history/profile content ([70329f7](https://github.com/unnfazzed/Lynia/commit/70329f7a41e25ae61886f9fe2ee39012e98545f7))
* **mobile:** B4 — one active-job screen: per-type Stepper + live cash-held split ([00736ef](https://github.com/unnfazzed/Lynia/commit/00736efd10dfccd4a9d79b911d5765b2c8b14bf6))

## [0.14.0](https://github.com/unnfazzed/Lynia/compare/v0.13.0...v0.14.0) (2026-07-30)


### Features

* **mobile:** B3 — merge Wallet + Earnings into one rider Money tab ([6087c27](https://github.com/unnfazzed/Lynia/commit/6087c2722640513b115d9b5344b858f441a90c7d))

## [0.13.0](https://github.com/unnfazzed/Lynia/compare/v0.12.1...v0.13.0) (2026-07-29)


### Features

* **mobile:** strip AD_ID permission from merged Android manifest ([c2c5c17](https://github.com/unnfazzed/Lynia/commit/c2c5c17d85967d7c9db771aa592ce565a4ebc4db))

## [0.12.1](https://github.com/unnfazzed/Lynia/compare/v0.12.0...v0.12.1) (2026-07-29)


### Bug Fixes

* **mobile:** break LiveOrderCard's circular import with ui/index ([a7ef039](https://github.com/unnfazzed/Lynia/commit/a7ef0394f61d65bf75014952c3ab12f640e09036))

## [0.12.0](https://github.com/unnfazzed/Lynia/compare/v0.11.0...v0.12.0) (2026-07-29)


### Features

* **play:** Play Store submission package + the two policy blockers it found ([a088a46](https://github.com/unnfazzed/Lynia/commit/a088a461b9700a9308be1f16072ed474414755ef))

## [0.11.0](https://github.com/unnfazzed/Lynia/compare/v0.10.5...v0.11.0) (2026-07-29)


### Features

* **mobile:** A1 — root tab shell (Home | Orders | Account) + Send demotion ([0cdb004](https://github.com/unnfazzed/Lynia/commit/0cdb004746ff18f0f1158b2d8d047f9ae0a3d9c7))

## [0.10.5](https://github.com/unnfazzed/Lynia/compare/v0.10.4...v0.10.5) (2026-07-27)


### Bug Fixes

* **ci,mobile:** restore main to green; harden the merchant flag wiring ([8617d95](https://github.com/unnfazzed/Lynia/commit/8617d951458481066ea077b5fd5acb2768125db2))
* **mobile:** pin @sentry/react-native to ~6.10 — the 720 KB bundle regression ([a4c9710](https://github.com/unnfazzed/Lynia/commit/a4c971023e4c401f11cc04a046474cca80013386))

## [0.10.4](https://github.com/unnfazzed/Lynia/compare/v0.10.3...v0.10.4) (2026-07-26)


### Bug Fixes

* **ux:** close a keystore-failure signup dead end, unify admin write-action errors, fix rider push routing (UX26-01/02/03) ([#392](https://github.com/unnfazzed/Lynia/issues/392)) ([f588e6a](https://github.com/unnfazzed/Lynia/commit/f588e6ac183d8157fe83d5717c72e5593985ef7c))

## [0.10.3](https://github.com/unnfazzed/Lynia/compare/v0.10.2...v0.10.3) (2026-07-25)


### Bug Fixes

* **api,mobile:** rider presence-recovery push + board-room re-scope race (BH-25a/BH-25b) ([b7935f3](https://github.com/unnfazzed/Lynia/commit/b7935f3c70495a018d34c418e250b9e761d1c5aa))

## [0.10.2](https://github.com/unnfazzed/Lynia/compare/v0.10.1...v0.10.2) (2026-07-21)


### Bug Fixes

* **mobile,admin:** earnings list-vs-total reconciliation + stale stuck-order copy (WD-027/WD-028) ([#377](https://github.com/unnfazzed/Lynia/issues/377)) ([25e7d58](https://github.com/unnfazzed/Lynia/commit/25e7d586fdc192c6016208e9ef965c687b95a358))

## [0.10.1](https://github.com/unnfazzed/Lynia/compare/v0.10.0...v0.10.1) (2026-07-21)


### Bug Fixes

* **mobile:** BH-23/24 — sign-out leaks sent bids; rider rating corrupts to 0.0 ([#369](https://github.com/unnfazzed/Lynia/issues/369)) ([364e535](https://github.com/unnfazzed/Lynia/commit/364e535ee81b593b95673e536c2aec01b1a012b7))

## [0.10.0](https://github.com/unnfazzed/Lynia/compare/v0.9.0...v0.10.0) (2026-07-20)


### Features

* **mobile:** wire @sentry/react-native crash reporting (roadmap 1.1 / LR20) ([7bf836e](https://github.com/unnfazzed/Lynia/commit/7bf836e88bc7f5177ceb75602e84e588607ce5f6))

## [0.9.0](https://github.com/unnfazzed/Lynia/compare/v0.8.1...v0.9.0) (2026-07-20)


### Features

* architecture hardening roadmap — Phase 1 (safety net & visibility) ([8846519](https://github.com/unnfazzed/Lynia/commit/8846519295dab9effebd03fea81b6c0c56c17961))

## [0.8.1](https://github.com/unnfazzed/Lynia/compare/v0.8.0...v0.8.1) (2026-07-20)


### Bug Fixes

* **mobile:** pin @babel/runtime to 7.x — the v8 major broke expo export ([397e7e7](https://github.com/unnfazzed/Lynia/commit/397e7e71140b25e9acc51e6c5ebe8433b839c664))

## [0.8.0](https://github.com/unnfazzed/Lynia/compare/v0.7.5...v0.8.0) (2026-07-20)


### Features

* **mobile:** calibrate JS bundle-size budget + record measured size deltas ([b5ebfbe](https://github.com/unnfazzed/Lynia/commit/b5ebfbe5134ea4c083e5d34759c448fed4077af9))
* **mobile:** DoorDash-style app-size program — lean icon imports, size guardrails (wip) ([91ab44c](https://github.com/unnfazzed/Lynia/commit/91ab44cc54e277c7d03709ca5fcdc8d044ebb51a))


### Bug Fixes

* **mobile:** escape backslashes before underscores in size-report markdown (CodeQL) ([aeb2839](https://github.com/unnfazzed/Lynia/commit/aeb2839e4eb0d97e06d9e3b94442f3924d1280f8))

## [0.7.5](https://github.com/unnfazzed/Lynia/compare/v0.7.4...v0.7.5) (2026-07-20)


### Performance Improvements

* **wave-2b:** ship the two Loop-A-confirmed fixes — focus-gated home poll, extracted auction clock ([#345](https://github.com/unnfazzed/Lynia/issues/345)) ([c6411df](https://github.com/unnfazzed/Lynia/commit/c6411df70d4d900afbba61ae81ec262e4fa1552a))

## [0.7.4](https://github.com/unnfazzed/Lynia/compare/v0.7.3...v0.7.4) (2026-07-20)


### Bug Fixes

* **mobile,api,admin:** active-order error visibility + commission-rate copy honesty + fare-adjust feed fallback (UX20-01..04) ([#340](https://github.com/unnfazzed/Lynia/issues/340)) ([1095e70](https://github.com/unnfazzed/Lynia/commit/1095e701439cccd48cb74e517bb7221ef3422bf1))
* **mobile,api:** persist rider sent-offer list and dedupe issue-raise (BH-21, BH-22) ([#339](https://github.com/unnfazzed/Lynia/issues/339)) ([87078e9](https://github.com/unnfazzed/Lynia/commit/87078e9df62c48ec2393c5cc61c74951fa45fbc1))


### Performance Improvements

* **wave-2:** BFF bootstrap, standardized cache layer, lightweight heartbeat, feed parallelization + weekly perf routine ([#338](https://github.com/unnfazzed/Lynia/issues/338)) ([d52eb97](https://github.com/unnfazzed/Lynia/commit/d52eb97694da338bd92c48e307c32c9a6b49944c))

## [0.7.3](https://github.com/unnfazzed/Lynia/compare/v0.7.2...v0.7.3) (2026-07-19)


### Performance Improvements

* **api,mobile:** compression, ETag/304 revalidation, snapshot micro-cache, warm-boot query persistence ([#334](https://github.com/unnfazzed/Lynia/issues/334)) ([4065689](https://github.com/unnfazzed/Lynia/commit/4065689f57d4e3f44285f324ad07a2e59e5a8bca))

## [0.7.2](https://github.com/unnfazzed/Lynia/compare/v0.7.1...v0.7.2) (2026-07-19)


### Bug Fixes

* **wallet:** gate admin KPI counts on current status + invalidate wallet cache on completion (WD-024..026) ([e8c090c](https://github.com/unnfazzed/Lynia/commit/e8c090cbd52fe9097894169789891e1aa7777f90))

## [0.7.1](https://github.com/unnfazzed/Lynia/compare/v0.7.0...v0.7.1) (2026-07-19)


### Bug Fixes

* **bug-hunt:** BH-18..20 — account-push misroute, pending-rating wipe, sticky presence banner ([#323](https://github.com/unnfazzed/Lynia/issues/323)) ([03ff2e9](https://github.com/unnfazzed/Lynia/commit/03ff2e951a72170f23a180cb749ff6cb2c00318d))
* **ux:** UX19-01..04 — filter-blind admin empty states, fabricated 48h contest deadline, dead-control feed-tap detour, false evidence-review claim ([#325](https://github.com/unnfazzed/Lynia/issues/325)) ([fcdca21](https://github.com/unnfazzed/Lynia/commit/fcdca213b6cf022fdc2fef3ddbed407324c7dba7))

## [0.7.0](https://github.com/unnfazzed/Lynia/compare/v0.6.4...v0.7.0) (2026-07-18)


### Features

* **auth:** add Bird SMS OTP channel for sign-up/sign-in ([b7002fe](https://github.com/unnfazzed/Lynia/commit/b7002fe7a8df57fe6852b1d1e5aaa804ed0ee614))

## [0.6.4](https://github.com/unnfazzed/Lynia/compare/v0.6.3...v0.6.4) (2026-07-18)


### Bug Fixes

* **mobile:** close P0/P1 launch blockers from gstack Android review (ALR-01..06) ([208c68d](https://github.com/unnfazzed/Lynia/commit/208c68d4c1e055f53ee022845ea5108f6c2c33cf))

## [0.6.3](https://github.com/unnfazzed/Lynia/compare/v0.6.2...v0.6.3) (2026-07-18)


### Bug Fixes

* **bughunt:** profile-setup dead end, advanceM 409 reconciliation, pickup-checklist wipe (BH-15..17) ([#295](https://github.com/unnfazzed/Lynia/issues/295)) ([c2b9ed7](https://github.com/unnfazzed/Lynia/commit/c2b9ed7e75ce9c5371945d60e994e3c10cccf634))

## [0.6.2](https://github.com/unnfazzed/Lynia/compare/v0.6.1...v0.6.2) (2026-07-17)


### Bug Fixes

* **wallet-audit:** stale-fare adjudication race, Trip History/Earnings cache gap, KYC audit-forgery gap (WD-021..023) ([bd0867c](https://github.com/unnfazzed/Lynia/commit/bd0867cf9b0c7c18051d9fe7ced0ce46f0b30890))

## [0.6.1](https://github.com/unnfazzed/Lynia/compare/v0.6.0...v0.6.1) (2026-07-17)


### Bug Fixes

* **mobile:** reconcile activeJob on rider-board reconnect/foreground, expire stale bid drafts ([#285](https://github.com/unnfazzed/Lynia/issues/285)) ([2765c17](https://github.com/unnfazzed/Lynia/commit/2765c17e89eb4d0286789a06c67ca391aa9f9bbb))

## [0.6.0](https://github.com/unnfazzed/Lynia/compare/v0.5.0...v0.6.0) (2026-07-16)


### Features

* **pod:** proof-of-drop capture for delivery disputes (IR16-11, KB-POD-DISPUTE Phase A) ([30c1739](https://github.com/unnfazzed/Lynia/commit/30c17391e1fbc87140ff8ff785ac6fade4ad7bee))

## [0.5.0](https://github.com/unnfazzed/Lynia/compare/v0.4.4...v0.5.0) (2026-07-16)


### Features

* **identity:** soft device binding — per-device signup throttle + recycle signal (IR16-10) ([3d08065](https://github.com/unnfazzed/Lynia/commit/3d08065418bef1878af6ff5c616f9865582db3b7))

## [0.4.4](https://github.com/unnfazzed/Lynia/compare/v0.4.3...v0.4.4) (2026-07-16)


### Bug Fixes

* **wallet-audit:** commission-basis floor, ledger orderId, KYC dup-ID gate, top-up dead-end (WD-012..017, DOC-16-01/02/05) ([#271](https://github.com/unnfazzed/Lynia/issues/271)) ([8ac6ac9](https://github.com/unnfazzed/Lynia/commit/8ac6ac97e0b80b43be10b6eab1bf1723799992d6))

## [0.4.3](https://github.com/unnfazzed/Lynia/compare/v0.4.2...v0.4.3) (2026-07-16)


### Bug Fixes

* **ux:** UX review UX16-01..08 — wallet top-up durability, reorder note carry-through, SOS/admin copy honesty ([#267](https://github.com/unnfazzed/Lynia/issues/267)) ([d789039](https://github.com/unnfazzed/Lynia/commit/d789039cfb2ef2ec13dd9f2977f31094c5d47167))

## [0.4.2](https://github.com/unnfazzed/Lynia/compare/v0.4.1...v0.4.2) (2026-07-16)


### Bug Fixes

* **bughunt:** mobile journey + contract-seam fixes BH-07..BH-12 ([#264](https://github.com/unnfazzed/Lynia/issues/264)) ([9062ba0](https://github.com/unnfazzed/Lynia/commit/9062ba0493e7979ec802b0c9630cffbf40cd7bd9))

## [0.4.1](https://github.com/unnfazzed/Lynia/compare/v0.4.0...v0.4.1) (2026-07-15)


### Bug Fixes

* **wallet:** reconcile commission ledger on fare-adjust + audit/idempotency + earnings truncation (WD-001..011) ([#262](https://github.com/unnfazzed/Lynia/issues/262)) ([ac0e8ad](https://github.com/unnfazzed/Lynia/commit/ac0e8ad061c075387511da41ef4f1b6aa86e5330))

## [0.4.0](https://github.com/unnfazzed/Lynia/compare/v0.3.0...v0.4.0) (2026-07-15)


### Features

* **wallet:** reveal the wallet by default at 0% commission ([61779b0](https://github.com/unnfazzed/Lynia/commit/61779b0b66e6bc098820f75a2339e42a0ee49df6))

## [0.3.0](https://github.com/unnfazzed/Lynia/compare/v0.2.4...v0.3.0) (2026-07-15)


### Features

* **wallet:** rider prepaid commission wallet (PR1 core) ([38d265c](https://github.com/unnfazzed/Lynia/commit/38d265ca97157d537290e10ea4d5ba83350e9ee2))

## [0.2.4](https://github.com/unnfazzed/Lynia/compare/v0.2.3...v0.2.4) (2026-07-15)


### Bug Fixes

* **bughunt:** remediate 2026-07-14 night bug-hunt findings BH-03..BH-06 ([#248](https://github.com/unnfazzed/Lynia/issues/248)) ([8d6703a](https://github.com/unnfazzed/Lynia/commit/8d6703a6a2aafada0ec1d2dc16aac4ca7f62a0a3))
* **ux:** 2026-07-15 UX review — rider terminal durability, zod error honesty, push routing gaps ([cef861a](https://github.com/unnfazzed/Lynia/commit/cef861aa8f344ee3e145538527a7bff141e7b3bd))

## [0.2.3](https://github.com/unnfazzed/Lynia/compare/v0.2.2...v0.2.3) (2026-07-14)


### Bug Fixes

* **deep-sweep:** execute deferred DS14-10..15 (KB-BOARD-REVOKE etc.) ([be60830](https://github.com/unnfazzed/Lynia/commit/be60830ea55f731a8eb7532eebdd16c313860f0d))

## [0.2.2](https://github.com/unnfazzed/Lynia/compare/v0.2.1...v0.2.2) (2026-07-14)


### Bug Fixes

* bug-hunt follow-up — WhatsApp OTP delivery webhook, pickup-tick persistence, rotate-code CAS ([#236](https://github.com/unnfazzed/Lynia/issues/236)) ([f28d1f1](https://github.com/unnfazzed/Lynia/commit/f28d1f179ced5e5076722f8c68060ba191b8f61e))
* **ux:** follow-up on 07-14 deferred items — notify-me orderId, feed synthesis ([#237](https://github.com/unnfazzed/Lynia/issues/237)) ([5e44010](https://github.com/unnfazzed/Lynia/commit/5e44010c794dfd22a1e343dbb0e921623de7792d))

## [0.2.1](https://github.com/unnfazzed/Lynia/compare/v0.2.0...v0.2.1) (2026-07-14)


### Bug Fixes

* **mobile:** capture device location on customer/rider-viewer SOS ([db9ba00](https://github.com/unnfazzed/Lynia/commit/db9ba00c064f7751df8680a09316fd07154c831a))
* **mobile:** confirm before the rider's "Back" button kills live tracking mid-delivery ([658cca6](https://github.com/unnfazzed/Lynia/commit/658cca609d9749a43b54666241752ce1402598c6))
* **orders:** stop blaming the rider (or the customer) for an ops cancel ([d839d96](https://github.com/unnfazzed/Lynia/commit/d839d96ad5c52b76ad5359c4395549a7d1e96718))
* **shared:** make JobCancelledEvent.cancelledBy optional for rollout skew ([f32f02c](https://github.com/unnfazzed/Lynia/commit/f32f02c932155d45d997d1bfa70f2db4e8ad26dc))
* **ux:** daily UX/usability review — 20 fixes (rider-viewer gating, token-refresh resilience, heartbeat/push routing, expiry honesty, KYC-freeze bypass, +more) ([96a953c](https://github.com/unnfazzed/Lynia/commit/96a953c13818d4949e99c539da43354a9e2e5bc3))

## [0.2.0](https://github.com/unnfazzed/Lynia/compare/v0.1.0...v0.2.0) (2026-07-13)


### Features

* **brand:** outline the wordmark to vectors; unit-prove the font patch ([9b87f25](https://github.com/unnfazzed/Lynia/commit/9b87f257970e7fe6f21084029980cb1e07b40a83))
* build the three server-dependent mockup gaps (KYC-expiry, no-riders-online, customer hold) ([23a8a8b](https://github.com/unnfazzed/Lynia/commit/23a8a8b573119624a8c048c15b106d08be6bff9c))
* build the two deferred 2·b1 items (order-taken notice + notify-me) ([4ae3feb](https://github.com/unnfazzed/Lynia/commit/4ae3febd493ddcd92d9f6e8df7f6ae9aab01f760))
* client RUM (glass-to-glass latency) + draggable BottomSheet ([2128b7a](https://github.com/unnfazzed/Lynia/commit/2128b7af4fc2ee5f7ee18ba8e4721ecac5d7674d))
* **design:** adopt the LyniaGo design system + align app tokens ([8cbaedd](https://github.com/unnfazzed/Lynia/commit/8cbaedd0589df4c960656e644b8b52da39b2ed17))
* **kyc:** photo capture + upload and failed-KYC retry (Phase-3 dev build) ([2f81758](https://github.com/unnfazzed/Lynia/commit/2f81758ba2eb37172bd8aa13ec2ea3a3b771840c))
* **lint:** replace noop lint scripts with oxlint across all four packages ([68f1b25](https://github.com/unnfazzed/Lynia/commit/68f1b257dec898df637159e3be6f86fd08338284))
* live auction + smooth tracking + optimistic UI (inDrive-parity P0) ([0152f6f](https://github.com/unnfazzed/Lynia/commit/0152f6f6a2b39f82cc0eb4ac217e0942c343e230))
* **mobile:** buffer rider GPS across reconnects, feed socket into reachability ([5085ba8](https://github.com/unnfazzed/Lynia/commit/5085ba8d1913d229edb945569931b2e5e6397e17))
* **mobile:** close 3 remaining mockup-alignment gaps ([406fd7a](https://github.com/unnfazzed/Lynia/commit/406fd7ac179246d536b95e62420c294ef97429a7))
* **mobile:** cut app over to the live HTTPS API (Task A, 3-lens reviewed) ([3848d2c](https://github.com/unnfazzed/Lynia/commit/3848d2c5572239a44f28c1dee9cd61fdcbaf5600))
* **mobile:** deferred UX items — rider identity, receipt/share, warm-paint earnings, compose collapse ([eeab739](https://github.com/unnfazzed/Lynia/commit/eeab7396702c6f99d70b88b57841a15ed02b881f))
* **mobile:** fail soft on network loss instead of dead-ending ([572109b](https://github.com/unnfazzed/Lynia/commit/572109b5dcbdd634ba0e238da9415ce06e3b6ca7))
* **mobile:** gated TLS certificate-pinning config plugin (SECURITY §P3-1) ([45fe9dc](https://github.com/unnfazzed/Lynia/commit/45fe9dca9f2e6ad30bc0f6f778e5ab5f51545475))
* **mobile:** implement Inter + Fredoka, Lucide icons, brand lockup, contrast ([c4b4a75](https://github.com/unnfazzed/Lynia/commit/c4b4a75d51d8f5d815c301ce11bfac3717432ebc))
* **mobile:** keep GPS streaming through the Google Maps route handoff ([14ecff2](https://github.com/unnfazzed/Lynia/commit/14ecff26b615a1f6d364db0266d6b33fac8b879e))
* **mobile:** key-gated PostHog analytics wired for eas integrations:posthog:connect ([cc1d5a8](https://github.com/unnfazzed/Lynia/commit/cc1d5a80566ba6879bf1ed25324d7112c8127a91))
* **mobile:** key-gated PostHog analytics, wired for eas integrations:posthog:connect ([e8f0055](https://github.com/unnfazzed/Lynia/commit/e8f0055a0a56ca6e8a6cda96ddde05558d8711ca))
* **mobile:** link EAS project and add convex client dependency ([0b95f53](https://github.com/unnfazzed/Lynia/commit/0b95f53cc0352adb31f41b9f6f1994dd1aff647e))
* **mobile:** native map + tap-to-pin for pickup/drop-off ([e8fc325](https://github.com/unnfazzed/Lynia/commit/e8fc325978e7af7ac28d71a8484cb659157444e0))
* **mobile:** P0 UX richness — haptics, live ETA headline, rider avatars ([4519c99](https://github.com/unnfazzed/Lynia/commit/4519c99f2dc7bd0b30d54a2ff38147f18e1862af))
* **mobile:** P1 UX richness — saved recipients, price band, delivered celebration ([ccac636](https://github.com/unnfazzed/Lynia/commit/ccac6361c5485125e57a3b0187899c5587d37045))
* **mobile:** P2 UX richness — in-app toasts + one-tap reorder + warm-paint history ([fc69028](https://github.com/unnfazzed/Lynia/commit/fc69028f82934061bdc5bbd7f450e8242078c25c))
* **mobile:** register the device FCM token after login ([4a266dc](https://github.com/unnfazzed/Lynia/commit/4a266dcfe7e6f552abb6f978f53c0d3e133f06eb))
* **mobile:** show KYC consent/disclosure before opening the Didit flow ([6ce8a48](https://github.com/unnfazzed/Lynia/commit/6ce8a481ccb702dc4fb72ed42838ae5ac7f9ff21))
* **mobile:** show last-known job at an offline cold start (rider) ([a0eaf84](https://github.com/unnfazzed/Lynia/commit/a0eaf84693cdf8edfd69b6ac5746f0d60c1b577d))
* **mobile:** show last-known order at an offline cold start ([349abb5](https://github.com/unnfazzed/Lynia/commit/349abb54c5b5dfec95410eb5ebf2b29008fa2868))
* **mobile:** wire google-services.json into the Android build for FCM ([3f402c6](https://github.com/unnfazzed/Lynia/commit/3f402c6b696808b05c54f17f4c434cf3c0b57038))
* **mobile:** wire google-services.json into the Android build for FCM ([e531744](https://github.com/unnfazzed/Lynia/commit/e531744a6908bac18ccc7939bcd64216ec01ba54))
* multi line-items — the ITEM-DESIGN-REVIEW model, backward compatible ([1dd9382](https://github.com/unnfazzed/Lynia/commit/1dd9382e298e827635cdbb4fd652eb3cfafba9c9))
* **phase-3:** rider-broadcast push + batched FCM + in-app KYC hand-off ([5c86f3e](https://github.com/unnfazzed/Lynia/commit/5c86f3ed09a446f7112cbf9517119856b3edc43b))
* **photos:** client-side downscale before upload + proof-of-pickup parcel photo ([5d20612](https://github.com/unnfazzed/Lynia/commit/5d20612581ab137ebd68ed2d7f84441a8431cc44))
* prod boot-guard, geo-scoped board push, pickup_geog index, GEO nearby, map-anchored home ([2332125](https://github.com/unnfazzed/Lynia/commit/23321253d1bded2675ede7d8c53380f9a61dd471))
* **profile:** honor needsProfile with a name-entry step (C12) ([cf49b43](https://github.com/unnfazzed/Lynia/commit/cf49b43fb14b263c18e18a5c0c6a3357891baf74))
* Redis live-position, geo-scoped board, auction countdown, device UX ([88cbf72](https://github.com/unnfazzed/Lynia/commit/88cbf7231c6e520e171144ac7baa46cf8e445c3e))
* **release:** execute the deferred launch-deployment items — staging stack, force-update gate, metric-gated canary, release train ([6be3512](https://github.com/unnfazzed/Lynia/commit/6be3512eaeec261d5151968f2ebf461124006e20))
* **release:** implement the launch deployment pipelines — canary Cloud Run deploys, Play/OTA release lanes, GitHub guardrails ([6a6ebba](https://github.com/unnfazzed/Lynia/commit/6a6ebba0c8fc71e73ba0db1b6c4935ac27613b20))
* **safety:** propagate final 2026 trust/safety design into the apps ([221dd1e](https://github.com/unnfazzed/Lynia/commit/221dd1ecdef8e9a3a41dd9da9d2a71e5ba7300dd))
* **test-build:** GitHub-built sideloadable test APK + QA mobile fixes ([e5cbaed](https://github.com/unnfazzed/Lynia/commit/e5cbaed9663fa37475fee8adb4aa6ee41afed20e))
* **tracking:** live map on the order screen (rider + pickup/drop-off) ([a495ed2](https://github.com/unnfazzed/Lynia/commit/a495ed2b22a74e6ca500a553badcf46d16992f62))
* **tracking:** live map on the rider job screen too ([f362cee](https://github.com/unnfazzed/Lynia/commit/f362ceed18d5db39ea3e03d2d843a060be16324a))


### Bug Fixes

* **api,mobile:** order creation had no idempotency protection ([ca2f27d](https://github.com/unnfazzed/Lynia/commit/ca2f27d88435ff0b78a1d367e22be2a46eaa58dc))
* bug-hunt sweep — offer-list PII leak, tracking races, journey dead-ends, broken test suites ([#188](https://github.com/unnfazzed/Lynia/issues/188)) ([ff4996d](https://github.com/unnfazzed/Lynia/commit/ff4996db9da45b3e7bd0bee7ee122d2ab86c89e3))
* close wave-3 re-review findings — draft clamp, heartbeat staleness, polish ([7820140](https://github.com/unnfazzed/Lynia/commit/7820140d49a705b4a8bc3076d0d8f229037828fb))
* complete review-pass fixes — screens conformance, call buttons, boot brand ([3145b2c](https://github.com/unnfazzed/Lynia/commit/3145b2c3c383a27a905e840ec02757eca366f044))
* **contracts:** centralize DELIVERY_OTP_MAX_ATTEMPTS, type offer status against shared enum ([9b745ef](https://github.com/unnfazzed/Lynia/commit/9b745ef9d4e5b668978d764646080ac95fe28cba))
* correctness bugs across settlement, admin, auth, tracking, mobile ([e0a79ea](https://github.com/unnfazzed/Lynia/commit/e0a79ea28685c9de002bb7414c52442ef1c319f0))
* **deps:** repair dependabot group bump that broke CI on main ([be638da](https://github.com/unnfazzed/Lynia/commit/be638da7093165aff305ff7c13f62d26fa487325))
* **design-review:** rider gate recovery, out_of_area wiring, SOS re-alert, map fallback ([c2b636c](https://github.com/unnfazzed/Lynia/commit/c2b636c439b4181fa406119ee535a585b4405f5d))
* **mobile:** address code-review findings on the UX-richness changes ([f7ad30f](https://github.com/unnfazzed/Lynia/commit/f7ad30f4558c90ec7deeaa255a0365015f264abc))
* **mobile:** address review findings on the deferred-items diff ([2d189b2](https://github.com/unnfazzed/Lynia/commit/2d189b24df0ad7e57cf6410cba8533ca03ddf344))
* **mobile:** customer tracking — rebroadcast grace + stale-GPS (round 2) ([c5ed2dd](https://github.com/unnfazzed/Lynia/commit/c5ed2dda5558f878d44a97fa72846b043bd12611))
* **mobile:** customer tracking and rider board never refetched on foreground resume ([2a14678](https://github.com/unnfazzed/Lynia/commit/2a14678671e56341630919a075a4c82bd828cbca))
* **mobile:** fold in P3 a11y + OTP-copy polish ([a76cbd6](https://github.com/unnfazzed/Lynia/commit/a76cbd66cce4b9dfaaf0568e44e49cf0f023268f))
* **mobile:** forbidden-order dead-end retry + duplicate rider-job navigation ([#204](https://github.com/unnfazzed/Lynia/issues/204)) ([a3d1d54](https://github.com/unnfazzed/Lynia/commit/a3d1d54892e09c326f75297ab9d7b3efe250f0ae))
* **mobile:** guard undefined image-picker asset (noUncheckedIndexedAccess) ([d2405ec](https://github.com/unnfazzed/Lynia/commit/d2405ecf8975e2d41ff2d25d0f0b6cd1c7aacfce))
* **mobile:** honest KYC copy on the test build become-rider screen ([398e551](https://github.com/unnfazzed/Lynia/commit/398e55141fee042a77be3a4a45cdef4634983271))
* **mobile:** jest testMatch silently excluded .ts test files ([cd8487f](https://github.com/unnfazzed/Lynia/commit/cd8487fdd807b073b69fc9e7cfc5a60724f37710))
* **mobile:** order-compose dead ends — false map-fallback copy, silent declared-value disable ([6630813](https://github.com/unnfazzed/Lynia/commit/663081318afbde89d643b688973c64a28d74b72b))
* **mobile:** PickupChecklist all-items-unticked was a soft dead end ([c33f3ee](https://github.com/unnfazzed/Lynia/commit/c33f3ee2f9d74d27fe73bcc44d903aa644e91004))
* **mobile:** pin Kotlin 1.9.25 for the Android release build ([94935a7](https://github.com/unnfazzed/Lynia/commit/94935a7fc0ddd4755e890882b1e22863beee2b30))
* **mobile:** push/notification tap-through was a dead end for most statuses ([8e8e621](https://github.com/unnfazzed/Lynia/commit/8e8e621c1c15cf9a0ec306f42f06395d6ff9ec69))
* **mobile:** resolve @posthog/core subpath exports in Metro (SDK 52) ([afd030e](https://github.com/unnfazzed/Lynia/commit/afd030ebb7ea5c1715c8a9f8e89c9fe47f274ee0))
* **mobile:** rider job socket didn't self-heal on connect/connect_error ([cc003c9](https://github.com/unnfazzed/Lynia/commit/cc003c94c2366d6715f20b4b81927e2b5270e8c2))
* **mobile:** rider P3s + selection deep-link (round 2) ([d98d901](https://github.com/unnfazzed/Lynia/commit/d98d901f2771fb8638f47924ba74cfe8facb562f))
* **mobile:** rider routing (R3), sign-out data scrub (S1/P1-2), OTP resend (C3) ([a1c6d2b](https://github.com/unnfazzed/Lynia/commit/a1c6d2bd473adf79294a2c9a0d7f841b10f41ad6))
* **mobile:** rider undelivered/cancel/OTP/support + customer order/compose/map UX ([292d237](https://github.com/unnfazzed/Lynia/commit/292d237ef1be05463b59441e942ba57258015447))
* **mobile:** rider's bid-compose card had no persistence across rotation/kill ([ddd65a5](https://github.com/unnfazzed/Lynia/commit/ddd65a592c5c041968fa3ff51cffa25b2c3f2898))
* **mobile:** stale cold-start push notification could replay across account switch ([2ae3aa1](https://github.com/unnfazzed/Lynia/commit/2ae3aa1787a90debe72bf4937318f8ba81ca5bea))
* **mobile:** StatusPill rendered every order status the same neutral grey ([d737474](https://github.com/unnfazzed/Lynia/commit/d7374744774b24608966f3d0f9f9d210205c93ad))
* **mobile:** winner "not chosen" flash, money formatting, timer leaks ([4896182](https://github.com/unnfazzed/Lynia/commit/48961821769d4a12c004019521e9e79c3b8c84b8))
* **mobile:** wire the rider dead-end flows into job.tsx (R1/R2/R9) ([88c5182](https://github.com/unnfazzed/Lynia/commit/88c51829898bb5bd1076b41a191d4f1e49caf19e))
* **privacy:** hide counterparty phone once an order is completed (F-09) ([f3c33a7](https://github.com/unnfazzed/Lynia/commit/f3c33a7f6965e16442776c4f12299ed8ffe441c6))
* **R8:** reveal sender phone on the collected-cancel hand-back + resume refetch (post-review) ([1d5963b](https://github.com/unnfazzed/Lynia/commit/1d5963bf09ddad798232ca43d91f30b4e377d95c))
* remediate bug-hunt findings F-01…F-10 ([3f15c42](https://github.com/unnfazzed/Lynia/commit/3f15c420e4c5ed63c9b63c932da33a7490ae09cb))
* resolve bugs across user flows and operational infrastructure ([#143](https://github.com/unnfazzed/Lynia/issues/143)) ([cccd76b](https://github.com/unnfazzed/Lynia/commit/cccd76b49244b73dfc1ea9a2a58f74698bdadfcf))
* **round2:** admin mutation 400s (wrong body shape) + mobile error honesty ([294969e](https://github.com/unnfazzed/Lynia/commit/294969e142a5ba1078d3b8dfbefdee18dfbc696e))
* **round2:** shared-device push re-home, pool fast-fail, board IDOR gates, rider warm-boot ([a84490e](https://github.com/unnfazzed/Lynia/commit/a84490e486e3f2c8e339f69c7693fc5b8423b3d4))
* tail hardening — dev-auth allowlist, gateway map prune, R8 hand-back on reopen ([30b5ed5](https://github.com/unnfazzed/Lynia/commit/30b5ed5caa11a61b63f849a9d67bcce2b0ecd85a))
* **uploads:** bound the signed KYC-photo upload to 8 MiB ([a4cfacd](https://github.com/unnfazzed/Lynia/commit/a4cfacd48bd1e904d4c304d0c6c60528a583e05a))
* **ux:** 2026-07-10 UX review — ambiguous states, data frugality, honest copy ([e44df1f](https://github.com/unnfazzed/Lynia/commit/e44df1fc97e553efbe0b5b05d34f450e90db4bde))
* **ux:** 2026-07-11 usability review — 22 findings implemented ([#187](https://github.com/unnfazzed/Lynia/issues/187)) ([a752e59](https://github.com/unnfazzed/Lynia/commit/a752e5970e1d4acd3eafbc3079ab6154f0efd739))
* **ux:** 2026-07-12 usability review — 16 findings implemented ([#202](https://github.com/unnfazzed/Lynia/issues/202)) ([e996911](https://github.com/unnfazzed/Lynia/commit/e996911ee7c7c2aafe6f19285ba0675803fb2cf5))
* **ux:** connectivity, input-forgiveness, and honest-status batch ([0ca1325](https://github.com/unnfazzed/Lynia/commit/0ca1325cd367f7d983fc8ac62bfd885bd2dec96d))
* **ux:** customer cold-start restore + idempotency key that survives an app kill ([ce36229](https://github.com/unnfazzed/Lynia/commit/ce362294ee9880e758459ac6ed7b838140d0d9fa))
* **ux:** follow-up UX review — history/KYC honesty, cancel context, role-toggle guard, admin stuck banner ([d72daee](https://github.com/unnfazzed/Lynia/commit/d72daee1896aa7bf94327859f5c93a90b39be01f))
* **ux:** follow-up UX review — history/KYC honesty, cancel context, role-toggle guard, admin stuck banner ([de1be2f](https://github.com/unnfazzed/Lynia/commit/de1be2f90cc3adad95c61aacd40c9e0df28f8ffd))
* **ux:** honest in-app feed for rider-bail rebroadcast + no-supply expiry ([2dd0caf](https://github.com/unnfazzed/Lynia/commit/2dd0cafacff645fa2bb23ef924545ef89d56451d))
* **ux:** persist the KYC form so a camera-launch OOM kill doesn't lose it ([#11](https://github.com/unnfazzed/Lynia/issues/11)) ([e2b6a36](https://github.com/unnfazzed/Lynia/commit/e2b6a36c4b61201806a53c23f8de802b2f56f737))
* **ux:** plain-language copy, push routing, outbound timeouts, honest KYC labels ([be11b42](https://github.com/unnfazzed/Lynia/commit/be11b429087e13352b635d84d2fd6c03eb13863f))


### Performance Improvements

* **mobile:** isolate GPS-tick and countdown re-renders to the components that need them ([64958ce](https://github.com/unnfazzed/Lynia/commit/64958cec615736b3500b981fefd9bffdaeef78de))
* P2 scale-polish — WS coalesce, history indexes, explicit pool, rating-on-tap ([2fa90c2](https://github.com/unnfazzed/Lynia/commit/2fa90c2ef2b486d53f857a2b2b7daa96fa193a6f))
