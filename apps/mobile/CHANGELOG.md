# Changelog

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
