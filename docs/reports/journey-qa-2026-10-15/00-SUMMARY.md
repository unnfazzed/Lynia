# Journey QA 2026-10-15 — summary (R8)

Lane: R8 (synthesis + must-fix) · Harness: none booted (synthesis of R0–R7 and a re-check at `file:line`) · main SHA:
`28e4437` (unchanged since every lane ran) · plan: `docs/routines/journey-qa-24h.md`

**Bottom line: there are no blockers on either side.** Across 8 lanes there are **0 P0s**. One P1 code defect was
confirmed and is fixed in this PR (JQ-R3-01, the biker top-up). The other two P1s are about shipping, not code:
testers run an old build, and the map fix still needs watching. Everything else is P2/P3 and goes in the ledger.

| Lane | Harness | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| R0 harness + baseline | live | 0 | 0 | 0 | 0 |
| R1 biker onboarding + KYC | live | 0 | 0 | 1 | 3 |
| R2 biker job loop | live + trace | 0 | 0 | 1 | 3 |
| R3 wallet + switch | live + static | 0 | **1** | 3 | 1 |
| R4 customer onboarding + Send | live API, static UI | 0 | 0 | 2 (harness) | 4 |
| R5 customer tracking | static + R2 trace | 0 | 0 | 1 | 0 |
| R6 low connectivity | live via proxy, static device | 0 | 0 | 2 | 2 |
| R7 field signals | Sentry / PostHog / Expo | 0 | 3 (2 shipping, 1 not reproduced) | 4 | 2 |

## What was fixed here

| id | sev | fix | regression test |
|---|---|---|---|
| JQ-R3-01 | P1 (money: false success) | `TopUpFlow.tsx`: the top-up idempotency key now includes a nonce made once per mount. The server replays any earlier intent with the same `(rider, key)` forever (`wallet.service.ts:514-516`). Before this fix, a later visit to Top up with the same amount, number and provider got the old, already-settled intent back: the screen said "Top-up done", no EcoCash prompt was sent and the balance did not move. A retry within one visit still reuses its key, so BH-09's dedupe is kept. No UI or copy change. | `top-up-flow.test.tsx` "JQ-R3-01": the test mounts the flow twice. Within one visit the retry key stays the same. A second visit gets a new key. The test fails without the fix. |

I re-checked JQ-R3-01 on `28e4437`. The bug came in with #1173 (`6cef4a1`), which is newer than the testers' build
(`dbcb21f`), so **no tester has hit it**, and the fix lands before it ships.

## Top problems per journey

**Biker**

1. **Wallet top-up (fixed).** JQ-R3-01 above.
2. **Late EcoCash approval reads as "nothing was taken"** (JQ-R3-02, P2). Say a biker approves after the 90 s
   window. The app has already said "Nothing was taken from your EcoCash". The server then credits the payment
   quietly, and a biker who believes the message may pay twice. The fix needs a copy or state change, so it is
   **NEEDS OWNER**.
3. **Refused bid on a thin wallet is a dead end** (JQ-R3-03, P2). The bid is refused and a toast appears, but there
   is no route to Top up. The designed top-up wall can no longer trigger, because since #1154 the server never
   refuses going online for balance. The fix needs a UI action, so it is **NEEDS OWNER**.
4. **Switching to customer with no data** (JQ-R3-04, P2). The app goes offline on a best-effort basis. If that call
   fails, the biker stays online on the server for about 15 min while on the customer side. A job that reaches them
   is not lost.
5. **The customer's map freezes if the OEM kills the app mid-job** (JQ-R2-01, P2, static). The background GPS task
   drops fixes when the JS runtime restarts headless. The customer gets the "went quiet" state. This needs a device
   to confirm.
6. **Photo re-PUT 409 on old builds** (JQ-R1-01, P2, `fixed-on-main-not-shipped`).

**Customer**

1. **Cancel or raise-price on a weak link shows a sticky false failure** (JQ-R6-01, JQ-R6-02 and JQ-R5-01, the same
   root cause). The write succeeds, but the response is lost. A `ttl:0` "couldn't …" toast stays up, and Try again
   gets a 409 or 400. The rider side already got the same fix (UX15-08). These are P2s (wrong feedback, the journey
   still completes), so under §5 they are ledger rows. Each fix is about 3 lines and touches no UI. It is the first
   thing to take next.
2. **Sign-in funnel** (JQ-R7-04, logged as P1 but not reproduced). PostHog shows about 6.8 `/phone` views per user.
   R4 ran OTP live and I read `phone.tsx:92-103` and `verify.tsx:282-285`; neither shows a loop. I re-graded it to
   P2, to watch in the funnel data.
3. **The server trusts the client's form for Send** (JQ-R4-03 and JQ-R4-04, P3). The server accepts a junk contact
   phone, a $0.01 fare and a 366 km trip at $3. The app's form blocks all of these.

## Speed (localhost floor; R6 adds about 800 ms RTT per call)

| Journey step | Server floor | At 800 ms RTT (R6) |
|---|---|---|
| OTP request / verify | 88–108 / 22–39 ms | ≈ 850 ms each |
| Create Send | 27–37 ms | 822 ms |
| Bid / select | 39–82 / 24–46 ms | ≈ 825 ms each |
| Stage change / deliver / rating | 9–23 / 10–13 / 21–36 ms | ≈ 813–838 ms |
| Top-up create / poll | 5–8 / 3 ms | — |
| Customer: sign-in → order placed | 4 sequential calls | ≈ 3.4 s |
| Biker: sign-in → first bid | 9 sequential calls | ≈ 7.4 s |

The server adds no measurable cost; over a weak link, the round trip is the whole wait. No device frame timings or
bundle measurement exist for this SHA (JQ-R6-04: 60 KB of headroom against `size-budget.json`).

## Low-connectivity verdict

**Pass, with two P2s.** Every money, order and auth write is safe to replay (R6 §2). Bid, select, stage, deliver,
rate and the biker's cancel all reconcile a lost response to success. Reachability needs 2 failed probes before it
flips the app offline. The boot is bounded (5 s reads, 20 s give-up). Sockets renew their token on reconnect.
Polling pauses in the background. The two gaps are the customer's cancel and raise-price (above). Not covered:
live WebSocket timing over a lossy link, and anything on a real budget phone.

## fixed-on-main-not-shipped (so: is a `closed` build due?)

Testers are on **0.52.0 (vc 47, `dbcb21f`)**. That build is missing:

- #1160, biker onboarding (ONB-HP);
- #1185, auth, upload-409 and wallet hardening (JQ-R1-01);
- #1187, socket token renewal;
- #1173, Paynow top-ups;
- this PR's JQ-R3-01 fix.

**A `closed`-profile build is due**, so testers can exercise the current journeys. This is the owner's call. R8
dispatched nothing. Per REL-01/02, an OTA cannot rescue the vc 47 binary if the fingerprint moved, so plan on a
build, not an OTA.

## NEEDS OWNER

1. **Dispatch a `closed`-profile build** (above). Pass `profile: closed` explicitly.
2. **JQ-R3-02:** what should the app say when a top-up times out (copy or state)? And should a late credit send a
   push?
3. **JQ-R3-03:** should a refused bid offer "Top up" (a UI action)?
4. **JQ-R7 (Play credential):** `playstore_crashes` fails with `invalid_grant`. Re-link the Play service account.
5. **JQ-R7 (client RUM):** `/client-metrics` has no connector.
6. **JQ-R7-05:** is `/settings/delete-account` meant to be the final screen? 9 of 109 sessions end there.
7. **JQ-R7-02:** check Sentry for `compose-map-not-loaded` over the next day. The last event was 2026-10-06, before
   the MOB-MAP-04 GCP fix.

## Harness defects (not app code; for the next QA run)

JQ-R4-01/02: `up.sh` runs `psql "$DATABASE_URL"`, and the `?schema=public` suffix breaks it. As a result the
admin JWT has an empty subject, and the "already seeded?" guard can wipe the seed. JQ-R2-02: `NODE_PATH` does not
work for ESM; symlink `harness/node_modules` instead. The plan's §3 also needs `apt-get update` before installing
PostGIS. None of these is fixed here: the harness is a report artefact.

## Follow-up plan (2026-10-15, after the run)

Every finding now has a destination. **PR A** (this follow-up) fixes the code that needs no copy or UI change:

| id | outcome |
|---|---|
| JQ-R6-01 | Raise price re-reads the order on error; a raise that landed is a success, not a sticky toast. |
| JQ-R6-02 / JQ-R5-01 | Cancel re-reads on error; a cancelled or ended order closes the panel with no "still active" toast. |
| JQ-R3-04 | The switch waits for the job read (asks the server if unsettled) and retries going offline once. |
| JQ-R6-03 | Bid 409s carry a machine `reason`; the app matches it (message kept as a fallback for old APIs). |
| JQ-R4-05 | A country code typed digit by digit is stripped like a pasted one. |
| JQ-R4-03 | The API rejects an implausible Send contact phone (the form's `normalizePhone` gate). |
| JQ-R3-05 | Stale `use-topup.ts` comment corrected. |
| JQ-R4-01/02, JQ-R2-02 | `up.sh`: psql gets the URL without `?schema=`, a psql error never reads as "unseeded", the ESM `node_modules` symlink is made (and gitignored). Plan §3 gains `apt-get update`. |

**Closed:** JQ-R2-04 (the 429 is the delivery-code brute-force throttle), JQ-R7-05 (a confirmed delete signs out, so
the session ends there), JQ-R7-07 (the 20 s re-read runs only while the wallet read fails), and the notes JQ-R1-03/04,
JQ-R2-03, JQ-R4-06, JQ-R7-03/08/09.

**Next:** PR B, the headless background-GPS fallback (JQ-R2-01). PR C, the owner's decisions of 2026-10-15: hedged
late-top-up copy + a push on a late credit (JQ-R3-02), and a "Top up" action on the low-balance bid refusal
(JQ-R3-03), each with its `DESIGN-DEVIATIONS.md` entry.

**Still the owner's:** a `closed`-profile build (ships JQ-R1-01, JQ-R7-01 and everything above), re-linking the Play
service account, a `/client-metrics` connector, a fare floor / distance cap (JQ-R4-04), a message for
`device_signup_cap` (JQ-R1-02), and the Sentry check on `compose-map-not-loaded` (JQ-R7-02) on 2026-10-16.
