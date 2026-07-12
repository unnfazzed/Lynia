# Lynia — Bug-Hunt Journey Inventory

_Exhaustive coverage checklist for the discovery pass. Every journey is numbered; each is marked
✅ once audited against the failure classes (state-machine, concurrency, idempotency, partial
failure, timeout/expiry, auth, input validation, offline, error handling, data integrity)._

_**Pass 2 (2026-07-12, HEAD 6578eab):** re-audit of all journeys at current HEAD. Pass 1
(2026-07-11/12, base 3dc606b) completed all of 1–61; its findings are F-01…F-10 in
`BUGHUNT_FINDINGS.md`. Pass 1 pre-dated PR #190 (OTP verify grace window, proof-of-pickup photo,
background GPS through nav handoff, fare-adjustment provenance, tracking re-render isolation), so
journeys 62–66 are new. Marks below are Pass-2 marks._

Actors: **Customer** (sender), **Rider**, **Admin/Ops**, **System** (background jobs, webhooks,
cron), **Recipient** (non-user, receives parcel + delivery code).

Scope surfaces mapped:
- **API** (NestJS): auth, orders, order-lifecycle, offers, matching, offer-expiry, riders, kyc,
  tracking (REST + WS gateway), notifications, issues, reports/blocks, sos, settlements, admin
  (orders/riders/customers/audit), uploads, privacy, observability/client-metrics, health.
- **Mobile** (Expo): auth/OTP, order compose/broadcast/track, rider onboard/KYC/board/job, push,
  realtime sockets, offline/reachability, version gate, drafts, background location task.
- **Admin** (Next.js): console-auth middleware, server actions, KYC decision, moderation.
- **Shared** (`@lynia/shared`): contracts (zod), pricing, geo, policy/status-sets, offer-ranking, phone.
- **Background/System**: offer-expiry worker + DB reconciler, rating auto-close worker + reconciler,
  presence watchdog, retention purge sweep, Didit KYC webhook, FCM push, "notify-me" waiting list.

---

## A. Customer journeys

1. ⬜ Sign in / sign up via phone OTP (request code → verify → session mint → profile setup).
2. ⬜ OTP unhappy paths: expired code, wrong code (attempt cap), too many sends (rate limits), re-request, lost response/retry.
3. ⬜ Complete profile (name, optional national ID) after first verify.
4. ⬜ Accept pre-broadcast liability disclaimer (A1-8) before composing.
5. ⬜ Compose an order (waypoints, items, note, photo, declared value, proposed fare) within service corridor.
6. ⬜ Broadcast the order (opens `open_for_offers`), incl. idempotent double-tap / timeout-retry.
7. ⬜ Order rejected: outside service corridor; account on hold; validation failure.
8. ⬜ Watch the auction: countdown, riders-nearby supply signal, "notify me when a rider's online".
9. ⬜ Receive offers; view offer list (rider PII); block-filtered; select an offer (guarded CAS → assigned).
10. ⬜ Auction expires with no pick (`expired`) → prompt to re-broadcast at higher price.
11. ⬜ Concurrent select vs expiry vs another select (double-assign protection, stale offer).
12. ⬜ Track the assigned ride: live rider position (WS + REST snapshot), status milestones, phone reveal window.
13. ⬜ Relay the delivery code to the recipient; re-issue (rotate) the code after a lockout.
14. ⬜ Customer cancels (any live status); pre- vs post-pickup; effect on rider (no strike) + offers.
15. ⬜ Rider bails → auto re-broadcast (F-01): customer moved to fresh auction via `order:rebroadcast`.
16. ⬜ Delivery completes → rate the rider (closes order) or auto-close after rating window.
17. ⬜ Order ends `undelivered` (rider couldn't hand over) — terminal screen, reason, attempt count, call rider.
18. ⬜ Raise an issue / get help on a trip; report + block the counterparty after a trip.
19. ⬜ Raise SOS on a live trip (emergency contacts, ops + counterparty alert).
20. ⬜ Cold start / app-kill mid-flow: restore active order (`mine/active-order`), replay push deep link.
21. ⬜ Offline / lost connectivity: request sent but response lost; reconnect mid-track; reachability banner; token refresh single-flight.
22. ⬜ Trip history + in-app notifications feed (derived, read-only).
23. ⬜ Account deletion / right-to-erasure (blocked mid-ride; anonymise in place).
24. ⬜ Forced app update (build-time + server-driven version gate).

## B. Rider journeys

25. ⬜ Become a rider (bike reg + KYC photo upload → submit to vendor / manual review).
26. ⬜ KYC outcomes: auto-approve, auto-decline (score), needs-review hold, webhook replay/out-of-order, expired ID (1·b2).
27. ⬜ KYC resubmit (retry) within attempt cap (A-02 lock after 2 declines) + support dead-end copy.
28. ⬜ Duplicate national-ID flag (A-04 ban-evasion signal) surfaced to reviewer.
29. ⬜ Go online / offline; gated by KYC + account standing + reliability on-hold + cooldown + corridor.
30. ⬜ Join the open-order board (WS geo-cell scoping + REST `GET /orders/open`); board eligibility gate.
31. ⬜ Receive new-order broadcast (push + WS board); redaction (no contactPhone pre-assignment).
32. ⬜ Make an offer (accept proposed fare, or counter); one-round rule; self-bid block; block-pair block.
33. ⬜ Offer not chosen (`order:taken`) / auction expired (`bid:expired`) board signals.
34. ⬜ Get assigned → confirm details → en_route_pickup → pickup item verification (checklist) → picked_up.
35. ⬜ Stream GPS while active (WS `rider:location`, coalesced emit, heartbeat, geo index).
36. ⬜ Enter recipient delivery code → `delivered`; wrong-code attempts + lockout + re-issue resync.
37. ⬜ Mark undelivered (post-pickup only): unreachable / refused / wrong_address / breakdown + reliability effect.
38. ⬜ Rider cancels (pre-pickup only): strike → cooldown at limit; auto re-broadcast of the job.
39. ⬜ Rate the sender after delivery (recorded-only, two-way rating).
40. ⬜ Reliability score movement (penalties/recovery, on-hold hysteresis, admin clear-hold).
41. ⬜ Cancelled-but-collected hand-back (R8): reopen surfaces the held parcel + sender contact.
42. ⬜ Cold start mid-job: restore active job (`mine/active`); presence stale escalation both directions.
43. ⬜ Blocked states copy + support call row (KYC-locked / suspended / on_hold / banned).

## C. Admin / Ops journeys

44. ⬜ Console access (fail-closed behind IAP; operator identity → audit attribution).
45. ⬜ KYC review + decision (approve / decline w/ reason / expire / reset); attempt-lock; audit-in-tx.
46. ⬜ Rider moderation: suspend / lift / ban / clear-hold (force offline; ban not lift-able); audit-in-tx.
47. ⬜ Customer moderation: hold / lift (blocks broadcast); audit-in-tx.
48. ⬜ Order monitor + detail (timeline, stuck detection, masked PII, OTP-mismatch note).
49. ⬜ Admin cancel order / adjust agreed fare; terminal-state + no-agreed-fare guards; audit-in-tx.
50. ⬜ Disputes queue: list / detail / resolve (refund / rider_strike / close); CAS on double-resolve; refund cap.
51. ⬜ Commission overview (read-only, prepaid 0% at launch).
52. ⬜ Audit-action write path (every ConfirmModal).

## D. System / background journeys

53. ⬜ Offer-window expiry (BullMQ job idempotent by jobId) + DB reconciler backstop.
54. ⬜ Rating auto-close (delayed job) + DB reconciler backstop.
55. ⬜ Presence watchdog (rider heartbeat + customer-socket, cluster-wide one-shot dedup).
56. ⬜ Didit KYC webhook (HMAC v1/v2, timestamp replay window, fail-closed, monotonic apply).
57. ⬜ FCM push fan-out + dead-token pruning; device-token re-homing on shared device.
58. ⬜ "Notify me" waiting-list drain when a rider comes online nearby.
59. ⬜ Data-retention purge sweep (GPS scrub + session purge) via scheduler OIDC.
60. ⬜ Live-position pipeline: Redis leading, PG throttled flush, geo index eviction, snapshot fallback.
61. ⬜ Client-RUM metrics ingest (strict schema, clamped labels).

## E. New since Pass 1 (PR #190 delta)

62. ⬜ OTP verify lost-response retry: 60s hash-only grace window (re-verify same code → fresh session); replay/brute-force bounds; Redis vs in-memory store parity.
63. ⬜ Proof-of-pickup parcel photo: rider capture → client downscale → upload (auth/limits/content-type) → attach to order (state guard, idempotency) → customer/admin view.
64. ⬜ Background GPS streaming through external-nav handoff (expo-task-manager background task: start/stop lifecycle, permissions, battery/duplicate emits, task leaks after job end, cross-account).
65. ⬜ Admin fare-adjustment provenance (who/when/old→new surfaced on order detail; audit source integrity).
66. ⬜ Customer live-tracking re-render isolation + `order-tracking` derivation logic (stale-tick handling, countdown drift).

---

_Status: Pass 2 in progress._
