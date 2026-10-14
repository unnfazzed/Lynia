# R6 — Low connectivity + budget phone

Lane: R6 · Model: Sonnet · Harness: **live** (R0's `up.sh`/`drive.mjs`, API on :3000, reached through a 400 ms latency + ~10 % response-drop proxy on :3100) for the REST retry-safety half; **static** for the device half (no phone, no Hermes build, no browser run) · main SHA: `28e4437` · run 2026-10-14 ~18:30 UTC · report only, no app code changed

**Verdict: the app is unusually well hardened for a weak link.** The server is replay-safe where it matters (money, order create, auth), and the client reconciles a lost response for bid, select, stage, deliver, rate and the rider's cancel. Two customer-side mutations (raise price, cancel) do not, and leave a misleading, un-dismissable failure toast over an action that actually succeeded. Both are P2. No P0/P1.

## 1. Method

- `proxy.mjs` (scratchpad, **not committed**): a Node HTTP forwarder. It adds 400 ms each way (≈ 800 ms RTT, inside `RTT_BUDGET_MS` 600 ms…2×), lets the request **reach the server and complete**, then destroys the client socket instead of answering (`/__drop_next=N` forces N drops; otherwise 10 % random). That is the worst case for retry safety: the write is committed, the client never hears.
- For each write: send through the proxy with the response dropped, then replay the **identical** request until an answer lands (the app's manual "Try again"). Script `retry.mjs` (scratchpad). Fresh accounts per run.
- The WebSocket was **not** routed through the proxy (HTTP-only forwarder). Socket reconnect behaviour is covered statically + by the jest suite, not live.

## 2. Retry safety: a dropped response, then the identical request replayed

| Write | 1st (committed, answer lost) | Replay answer | Safe? | How the app copes |
|---|---|---|---|---|
| `POST /orders` **with** `idempotencyKey` | dropped | 201, same order; 1 active order | **yes** | `send.tsx:515` always sends `sentKey.current ?? idempotencyKey` |
| `POST /orders` **no key** | dropped | 201, **new** order; 3 active orders | no (server) | App never omits it (`send.tsx:463-523`, `checkout.tsx:324`), so not reachable from the app; any other client duplicates |
| `POST /orders/:id/offers` (bid) | dropped | 409 `You already responded… (one round only)` (`offers.service.ts:17`) | yes | `app/rider/offer/[jobId].tsx:108` treats exactly that message as success (see JQ-R6-03) |
| `…/offers/:id/select` | dropped | 409 `order_closed` | yes | LC-C08 reconcile `app/order/[id].tsx:431-`; `select-offer-reconcile.test.tsx` passes |
| `…/status` confirmed → dropoff (×4) | dropped | 409 `Order is not <prev>` | yes | `advanceReconciled` via `getOrder`, `app/rider/job.tsx:402-422` |
| `…/delivery-code/reveal` | dropped | 201, same code | yes | idempotent read-like POST |
| `…/deliver` | dropped | 409 `not ready for delivery` | yes | `getOrder` reconcile → delivered screen, `app/rider/job.tsx:464-` |
| `…/rating` | dropped | 409 `Order already rated` | yes | BH-07 treats 409 as confirmation (`job.tsx:566`) |
| `POST /wallet/topups` **with** key | dropped | 201, same intent | **yes** | `TopUpFlow.tsx:104` seeds the key |
| `POST /wallet/topups` no key | dropped | 201, **second** intent | no (server) | App always sends a key (`TopUpFlow.tsx:164`) |
| `…/cancel` (customer) | dropped | 409 `can't be cancelled anymore` (`order-lifecycle.service.ts:1062`) | server ok | **client does not reconcile → JQ-R6-02** |
| `…/price` (raise) | dropped | 400 `must be higher than your current price` (`orders.service.ts:594`) | server ok | **client does not reconcile → JQ-R6-01** |
| `POST /auth/otp/verify` | dropped | 201 same code accepted (post-verify grace, `otp-store.ts:18`) | yes | – |
| `POST /auth/refresh` (old token replayed) | dropped | 201, new pair (`auth.service.ts:886-946`, replay-of-rotation window) | yes | no false sign-out on a lost refresh response |

Answer to the plan's question — *what does a retried bid, select or deliver do?* Server: 409, no double effect. Client: each is reconciled to success. The ones that are not reconciled are customer cancel and raise-price.

## 3. Findings

| id | sev | journey step | what the user sees | repro | evidence file:line | proof | in KNOWN_BUGS? | fixed-on-main-not-shipped? |
|---|---|---|---|---|---|---|---|---|
| JQ-R6-01 | **P2** | Customer, order screen, **raise price** (+ $0.50) on a weak link | Taps +$0.50; the server commits and re-pings riders, but the response is lost. A **persistent** (`ttl:0`) toast "couldn't raise" + Try again stays up. Try again replays the same fare and gets 400 "must be higher than your current price" → a second failure. The price on screen does refresh (via `onSettled` invalidate), so the toast contradicts the screen. Tapping +$0.50 instead of Try again raises a second time. | Drop the response of `POST /orders/:id/price {proposedFare:4}`; replay it. | `app/order/[id].tsx:551-562` (`onError` only shows the toast, no reconcile); server `orders.service.ts:594` | `retry.mjs` rows "raise price" / "raise price #2": first `dropped(UND_ERR_SOCKET)`, replay `400 Your new price must be higher than your current price.` | no (`rg raiseM\|raiseFail` → 0 rows) | no |
| JQ-R6-02 | **P2** | Customer, order screen, **cancel** | Same shape: cancel commits, response lost → persistent "cancel failed — Try again" toast; Try again → 409 "This order can't be cancelled anymore — it's already past that point", i.e. the user reads it as "stuck, can't cancel" on an order that **is** cancelled. Order status flips on the 15 s poll (`open_for_offers`) or the socket `order:status`; the toast stays until tapped. After assignment with a live socket there is no poll, so a dead socket leaves the stale panel. Rider-side `cancelM` has the identical bug fixed (UX15-08: `refresh()` on error, `app/rider/job.tsx:547-551`); the customer sibling was missed. | Drop the response of `POST /orders/:id/cancel`; replay. | `app/order/[id].tsx:646-657` (`onError` toast, `ttl:0`, no `invalidateQueries`); contrast `app/rider/job.tsx:547-551`; server `order-lifecycle.service.ts:1062` | `retry.mjs` row "cancel": first dropped, replay `409 …can't be cancelled anymore — it's already past that point.` | sibling UX15-08 (rider side only); customer side not listed | no |
| JQ-R6-03 | P3 | Biker bid reconciliation | Works today. The "lost response ⇒ success" path matches the **English server message string** `"You already responded to this order (one round only)"`; reword it (or localise) and a bid that landed is shown as a failed bid with Retry that 409s forever. Prefer a machine `code`. | – | `app/rider/offer/[jobId].tsx:108` vs `offers.service.ts:17` | read; `retry.mjs` row "bid accept" confirms the message today | no | no |
| JQ-R6-04 | P3 | Budget phone, JS bundle | No bundle measurement exists for this SHA (CI's measure steps were skipped, see R0). Headroom is thin: last measured export 8,107,677 B vs budget 8,168,000 B = **60 KB (0.74 %)**, Hermes 7,746,522 vs 7,807,000. Not a user bug; the next feature PR will trip the gate. Static only. | – | `apps/mobile/size-budget.json` | arithmetic from the file | no | – |

Recommended handling for R8 (report-only here): JQ-R6-01/02 are each ≈ 3 lines (`void qc.invalidateQueries({ queryKey: orderKey(orderId) })` in `onError`, mirroring `onSettled`; for cancel, also drop the toast if the refetched status is `cancelled`) with no UI change, so they fit the P1-sized rule if R8 wants them. Left as P2 by the severity table (glitch/wrong feedback, works).

## 4. Static review: what I checked and found sound (no finding)

- **`src/api/client.ts`**: every request carries `AbortController` at `STANDARD_TIMEOUT_MS` 15 s covering the **body** too (`:140-175`); proactive pre-send token refresh (P09); single-flight refresh shared by concurrent 401s (`inflightRefresh`, `:243`/`:380-388`); transient refresh failure rejects as status 0 and **does not sign out**; only an auth-guard 401 triggers refresh, so a wrong delivery code is never replayed (`:204-`). Conditional-GET/ETag on all GETs → 304 costs headers only.
- **`src/query/client.ts`**: mutations `retry:false` by policy (`:30`), reads retry ≤ 2 with jittered backoff and only for status 0/5xx (`ApiError.retryable`); offline mutations **pause** and show "queued" (`pendingOrQueued`).
- **`src/net/reachability.ts`**: a failed request does not flip the app offline; it needs 2 failed `/health` probes 2 s apart (`CONFIRM_FAILS`, `CONFIRM_GAP_MS`). With 10 % response loss the false-offline odds per failure are ~1 %. Recovery probe backs off 2 s → 30 s. NET-FF false-offline path is guarded.
- **`src/realtime/socket.ts`**: LC-C14 `auth` callback re-reads the live token on every reconnect. The 1 s → 60 s backoff (`KICK_RETRY_*`) governs only the server-refused handshake (`io server disconnect`); a bare drop uses socket.io's own defaults (infinite reconnect). Every consumer (`use-order-socket`, `use-rider-board`, `use-rider-job-socket`, `use-rider-location`) re-subscribes on `connect` and refetches over REST on connect/connect_error. Websocket → polling fallback. *Not exercised live (proxy was HTTP-only).*
- **Uploads**: `uploadImage` timeout scales with body (`uploadTimeoutMs`, 10 KB/s floor, 120 s cap); a create-only 409 is success (`uploads.ts:76-78`). Every caller re-mints a URL per attempt, so the 409 is only hit on a true transport re-PUT. Photos: camera `quality 0.6` then downscale to 1280 px long edge JPEG 0.7 (`image-downscale.ts`, ≈ 150–400 KB); manipulator failure/OOM falls back to the original bytes. All five upload paths call `downscaleForUpload` (`rider-documents.ts:108`, `delivery-proof.ts:19,36`, `use-prescription-photos.ts:50`, `use-pickup-photo.ts:163`). If the picker returns no width/height it skips the downscale (`computeResizeTarget` → null), which is the only unbounded-size path; the Expo picker always supplies them.
- **Polling cost**: heartbeat 20 s; order screen 15 s while `open_for_offers`, 5 s only when the socket is down and the order is active, otherwise 0; notifications unread 30 s and **focus-gated** (`use-notifications-unread.ts:29`); rider board 8-15 s only when the socket is not connected; app-wide `focusManager` stops all `refetchInterval`s in the background (`query/client.ts` `wireFocusManager`). 1 s render ticks exist (`rider/job.tsx:855`, `order/[id].tsx:788`) but are gated to the offline banner / grace window.
- **Boot** (`src/boot/*`): reads are bounded at 5 s (`BOOT_READ_TIMEOUT_MS`), the splash gives up at 20 s (`GIVE_UP_MS`) and shows an offline state with retry rather than hanging; query cache persists 7 days (24 h for day-limited keys) so a returning user paints from disk (`persist.ts:111-150`), throttled writes 3 s.

## 5. Tests run

`pnpm --filter @lynia/mobile exec jest app/order/__tests__ src/net src/realtime` → **28 suites, 252 tests, all pass** (31 s), incl. `offline-cold-start`, `order-screen-perf`, `select-offer-reconcile`, `socket`, `reachability`, `network-policy`. (Jest reports one leaked worker handle on exit, unrelated to results.)

## 6. Speed (through the 400 ms-each-way link, DROP=0, one full happy path, `happy.mjs`)

| Step | cumulative ms | per call |
|---|---|---|
| customer OTP request + verify (2 calls) | 1,695 | ≈ 850 |
| `PATCH /auth/me` | 2,512 | 817 |
| biker login + name (3 calls) | 4,953 | ≈ 810 |
| `riders/become` (auto-verified) | 5,779 | 826 |
| online + heartbeat (2) | 7,415 | ≈ 818 |
| create Send | 8,237 | 822 |
| board GET | 9,062 | 825 |
| bid / list offers / select | 9,900 / 10,713 / 11,537 | ≈ 825 |
| 4 stage changes | 14,788 | ≈ 813 each |
| reveal + deliver (2) | 16,414 | ≈ 813 |
| rate | 17,252 | 838 |

Every REST call is ≈ 810-840 ms = 2 × 400 ms + ≈ 15-40 ms server work: **the server adds no measurable cost; latency is entirely RTT.** Round trips the user waits on: customer sign-in-to-order-placed ≈ 4 sequential calls (OTP request, verify, name, create) ≈ 3.4 s at this RTT; biker sign-in-to-first-bid ≈ 9 calls ≈ 7.4 s. With 10 % loss, ~1 in 10 of those calls needs a manual retry; the writes above are safe to retry.

## 7. Not done / limits (said plainly)

- **Device side is static.** No budget Android, no Hermes bundle measured (CI skipped the measuring steps for this SHA), no frame timing, no re-render profile of the map screens. JQ-R6-04 and the image-size claims are read from code and `size-budget.json`, not measured.
- **Optional step 5 (Chromium + CDP Slow 3G/6× CPU against a web export) was not run** — no time budget for a production web export with non-loopback API URL and CORS in this slot.
- WebSocket reconnect timing was not measured live; jest + code reading only.
- Upload endpoints 500 locally (no storage creds), so the 409-on-re-PUT path is code-read only.
