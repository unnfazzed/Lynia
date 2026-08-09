# LC loop C — offline & 2G resilience — 2026-08-09 (LANE COMPLETE)

**Mode:** OPTIMIZE (all 5 audit territories C-T1…C-T5 already checked; every Day-0 defect
C-D0a…C-D0e already fixed; C-O5, C-O6, C-O7, C-O8, C-O9, C-O1, C-O2, C-O4 already done; C-O3 struck
as a duplicate of Lane A's A-O17, resolved when A-O17 landed). First (and last) unchecked
checklist item: **C-O10** — switch the mobile realtime socket's captured `auth` object to a
refresh-safe callback (LC-C14, C-T5 finding).

## What was wrong

`apps/mobile/src/realtime/socket.ts`'s `acquireSocket` — the single ref-counted shared connection
every realtime hook (order/board/job/location) opens through (A-O17) — passed a captured
`auth: { token }` **object** to `io()`. Socket.IO's own internal auto-reconnect logic (a bare
network drop, entirely independent of React) replays that same captured object on every retry
attempt. A dead zone outlasting the access-token TTL (900s, `ACCESS_TTL_SECONDS`) therefore left
the socket retrying its handshake with a now-expired token — repeated failed connections — until
an unrelated REST call (a hook's own `connect_error` handler doing `refetchOrder`/`healBoard`/
`refetchJob`, or a poll fallback) happened to 401, drove the existing single-flight refresh, and
rotated `session.accessToken` in `AuthContext`. Only then did the hook's `[…, token, …]` effect
dependency see a new value, tear down the stale shared entry, and re-`acquireSocket` with the
fresh token.

Self-heals — never a permanently stuck state, since every hook's `connect_error` handler already
fires a REST call on each retry — and needs an outage longer than 15 minutes to ever matter, so
this never met the audit's same-run DEFECT bar (no lost work / dead end / double-apply /
stale-as-fresh). It's real hardening, though: `apps/merchant/app/lib/queue-socket.ts`'s
`createMerchantQueueSocket` had already fixed the identical shape via an `auth` **callback**
(`(cb) => cb({ token: loadMerchantSession()?.accessToken ?? "" })`), with its own comment stating
the exact rationale — "a reconnect after the original access token has rotated still authenticates
with whatever's current in the session cookie." The mobile app never got the matching fix.

## What shipped

`acquireSocket`'s `io()` call now passes `auth: (cb) => cb({ token: getCurrentAccessToken() ??
token })` instead of the captured object, matching the merchant pattern.

`getCurrentAccessToken()` is a new export in `apps/mobile/src/api/client.ts` — it reads the exact
same `AuthProvider`-registered `hooks.getSession()` ref the REST client already uses to attach its
own bearer header on every fetch. No new state, no new SecureStore read, no circular import
(`client.ts` has never depended on anything under `src/realtime`): the socket module simply asks
the same source of truth the REST layer already trusts. Because `auth` is now a function, Socket.IO
invokes it fresh on **every** (re)connection attempt — including one it fires internally after a
bare network drop, with no React re-render involved — so the handshake always presents whatever
token is current at that instant instead of the token captured when the shared entry was first
opened.

Falls back to the token the entry was keyed on (`acquireSocket(token)`'s own parameter) if the
hook isn't wired yet — e.g. a test harness or any other caller that invokes `acquireSocket` before
an `AuthProvider` has mounted `configureApi`.

**Not a mutation retry path.** C-O10's lane rule ("every retry-path change must prove idempotency")
does not apply here in the mutation sense — this changes only which bearer credential a
socket handshake presents on each attempt, not the semantics or replay-safety of any state-changing
call. No idempotency key/CAS/unique-constraint is implicated.

## Verification

- `apps/mobile/src/realtime/__tests__/socket.test.tsx`: 3 new cases —
  - `auth` is passed as a function, not a plain object.
  - the callback, invoked twice against a mocked `getCurrentAccessToken()` that changes value
    between calls (simulating a token rotation while the same shared entry is still alive, i.e.
    Socket.IO's own reconnect invoking the same `auth` function again), returns the **current**
    token both times — not the one captured at `acquireSocket` call time.
  - the callback falls back to the keyed token when the mocked hook has no current session.
  - Confirmed all three fail against the pre-fix code (verified by temporarily reverting
    `socket.ts`/`client.ts` and re-running: `auth` was a plain object, so the shape assertion and
    both callback-invocation assertions threw/failed).
- `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test` — all
  green (127 suites / 905 tests).
- `pnpm typecheck && pnpm lint && pnpm test` (full monorepo) — all green.

## Ledger

`LC-C14` marked **FIXED** in `docs/KNOWN_BUGS.md`. `C-O10` ticked in
`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C.

## Lane C is now COMPLETE

Every §5 Lane C box is checked or struck with a reason: all 5 Day-0 defects (C-D0a…C-D0e), all 5
audit territories (C-T1…C-T5), and all 8 real optimization items (C-O5, C-O6, C-O7, C-O8, C-O9,
C-O1, C-O2, C-O4, C-O10 — nine total, C-O3 struck as superseded by Lane A's A-O17). Per the program
doc's SELF-DISABLE instruction, this firing's job is to disable the `LC loop C — offline & 2G
resilience` trigger.

**Could not complete the disable from this session**: `ToolSearch` for `list_triggers`/
`update_trigger`/`create_trigger`/`trigger` in this session's toolset returned nothing — only the
session-local `CronCreate`/`CronList`/`CronDelete` tools are available, and those operate on an
in-memory per-session job store that cannot reach this account-level Routine (the exact same gap
`docs/routines/harare-loops.md`'s Lane D closing note records for LC loop D, 2026-08-04 onward).
Recorded in `docs/routines/harare-loops.md` — needs either a future session with `update_trigger`
available, or the founder disabling "LC loop C — offline & 2G resilience" directly in the claude.ai
Routines UI. Until disabled, any further firing is a safe no-op (the program doc's exit criteria
treat "every §5 box checked or struck" as done — nothing is left to audit or optimize) — wasted
tokens, not a correctness risk.
