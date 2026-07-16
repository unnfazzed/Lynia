export const meta = {
  name: 'lane-bug-hunt',
  description: 'Agentic-loop bug hunt over one lane: diverse finders → adversarial-verify → sibling-sweep',
  whenToUse: 'Any bug-finding routine (BH/UX/DS/WD) or an interactive "find more bugs in <lane>" request. ' +
    'Pass args = a lane key ("wallet" | "bug-hunt" | "ux" | "deep-sweep") or a custom lane object ' +
    '{ key, context, lenses:[{key,prompt}] }. Read-only: it finds + verifies, it does NOT edit code.',
  phases: [
    { title: 'Find', detail: 'diverse finder lenses fan out across the lane surfaces' },
    { title: 'Verify', detail: 'a 3-skeptic panel adversarially refutes each candidate' },
    { title: 'Sibling-sweep', detail: 'grep the repo for the pattern signature of each confirmed bug' },
  ],
}

// ---------------------------------------------------------------------------
// The engine is lane-agnostic. A "lane" is { key, context, lenses[] }. The four
// built-in lanes below mirror docs/ROUTINES.md; pass a custom object via `args`
// for anything else. `args` may be a string (built-in key) or a full lane object.
// ---------------------------------------------------------------------------

const LEDGER = 'docs/KNOWN_BUGS.md'

const DEDUP = `
DEDUP: ${LEDGER} is the coordination ledger (~670 lines). Anything already recorded there
(WD-*, DS*, BH-*, UX*, F-*, KB-* ids, or trivially adjacent to an entry) is NOT a new finding — read the
relevant sections in Phase 0 and skip known bugs. Report only what prior runs MISSED.`

const REPO = `
Repo: Lynia — pnpm/Turbo monorepo. apps/api (NestJS + Prisma), apps/mobile (React Native + Expo),
apps/admin (Next.js), packages/shared. Payments are cash/offline; there is a prepaid COMMISSION wallet.
NO Android/Compose, NO payments/loan service. Tests mock Prisma (so @db.Uuid casts / FK / real SQL are
NOT exercised by unit tests — a rich seam for contract/data-integrity bugs).`

const LANES = {
  wallet: {
    key: 'wallet & data-lifecycle',
    context: `LANE = the path a dollar + a reporting datum travel: rider wallet (top-up ->
CommissionAccount.balance -> append-only CommissionLedger) -> per-ride commission debit on completion ->
earnings the rider sees -> admin dashboard numbers + the admin actions that mutate them. Bar: no txn lost/
double-counted/mis-recorded; balances/earnings/KPIs reconcile with ledger+orders; every admin mutating
action (wallet-credit, fare-adjust, cancel, hold/suspend/ban, KYC) is correct, authorized, audited, idempotent.
Key files: apps/api/src/wallet/*, apps/api/src/admin/*, apps/api/src/reports/*, apps/mobile/app/wallet/*,
apps/mobile/app/earnings/*, apps/api/prisma/schema.prisma.`,
    lenses: [
      { key: 'exactly-once-credit', prompt: 'Top-up + wallet-credit exactly-once / idempotency: confirmed-but-not-credited or double-credited; confirmation-vs-expiry races; re-opening an expired top-up; admin wallet-credit replay; missing unique constraints / CAS status transitions; retry-unsafe handlers.' },
      { key: 'ledger-reconciliation', prompt: 'balance != sum(CommissionLedger): any path mutating CommissionAccount.balance without an append-only ledger row (or vice-versa), or either outside the row-lock/tx; Decimal(10,2) drift; negative-balance handling; schema invariants code violates.' },
      { key: 'per-ride-debit', prompt: 'Per-ride commission debit on completion: !=1 ride_commission row per order; UNIQUE(riderId,orderId,type) bypass; fare-adjust delta breaking one-debit-per-order; debit outside the completion tx / without the balance lock; launch-rate 0% path; wrong basis.' },
      { key: 'earnings-tab', prompt: 'Rider earnings tab vs completed orders + ledger: totals that disagree; wrong period/timezone bucketing; double-counting cancelled/refunded/undelivered; missing empty/loading/error states; a client trusting a stale cache for money.' },
      { key: 'admin-dashboard-kpi', prompt: 'Admin KPIs + cash/settlements view: aggregates double-counting cancelled/refunded, mis-bucketing by timezone, disagreeing with orders+ledger, or reading balance instead of ledger; off-by-one date windows; rows silently dropped on a JOIN.' },
      { key: 'admin-action-authz-audit', prompt: 'Every admin mutating action (wallet-credit, fare-adjust, cancel, hold/lift, suspend/lift/ban/clear-hold, KYC) for: missing/object-level authz (IDOR); missing/forgeable AuditLog row; non-idempotent double-apply; non-CAS clobber; an actor/id string written into a typed (@db.Uuid) column.' },
      { key: 'concurrency-races', prompt: 'findUnique->decide->update without CAS/FOR UPDATE on money paths; a read outside the tx a write inside relies on; two admin actions racing on a balance/order; webhook vs user action; partial-failure leaving balance and ledger inconsistent.' },
      { key: 'contract-nullability', prompt: 'app<->API money contract: enum/nullability mismatch across Prisma/DTO/shared/clients; a nullable money field rendered NaN; a Decimal serialized to a JS float; a status enum the client does not handle.' },
    ],
  },
  'bug-hunt': {
    key: 'mobile journeys + app↔API contract seams',
    context: `LANE = mobile client journeys (onboarding, KYC capture, order creation, bidding UI, tracking,
completion), client state/lifecycle (process death, backgrounding, reconnect), and app<->API contract
mismatches (enums, nullability, realtime recovery, retry-safety of client calls). Key: apps/mobile/*, the
contracts in packages/shared, and the controllers they call in apps/api/src.`,
    lenses: [
      { key: 'journey-deadends', prompt: 'Journey dead-ends / unrecoverable states across onboarding, KYC capture, order creation, bidding, tracking, completion — a screen a user can enter but not leave, an action with no success/error resolution.' },
      { key: 'lifecycle', prompt: 'Client lifecycle: process death, backgrounding, socket reconnect, cold-start restore — stale/duplicated state, lost drafts, a replayed push routing to the wrong screen.' },
      { key: 'contract-seam', prompt: 'app<->API contract mismatch: enum/nullability drift between packages/shared, DTOs, and the mobile client; a field the client renders as NaN/undefined; a status the client does not handle.' },
      { key: 'retry-safety', prompt: 'Retry-safety of client calls: a non-idempotent mutation retried on flaky network double-applying; a missing idempotency key; an optimistic update that diverges from the server.' },
      { key: 'realtime-recovery', prompt: 'Realtime recovery: a WS event missed while backgrounded with no reconciling fetch; a room left/rejoined incorrectly; presence/tracking going stale without a watchdog.' },
    ],
  },
  ux: {
    key: 'user-experience friction',
    context: `LANE = journey-level friction, copy/jargon, missing/unclear error and empty states, dead ends
users can't recover from, notification-story coherence — and the CODE fixes for those. Key: apps/mobile/*,
apps/admin/* copy + state handling, notification/push copy in apps/api/src/notifications.`,
    lenses: [
      { key: 'error-empty-states', prompt: 'Missing/unclear/ dishonest error + empty + loading states — a failure shown as success, a blank screen with no guidance, a spinner with no timeout.' },
      { key: 'copy-honesty', prompt: 'Copy that misleads: false consequences, stale brand strings, jargon, an action whose label does not match what it does, a message that blames the wrong party.' },
      { key: 'recoverability', prompt: 'Dead ends a user cannot recover from: a gate with no CTA to resolve it, an on-hold/blocked state with no path forward, a form that can never succeed.' },
      { key: 'notification-coherence', prompt: 'Notification-story coherence: a push/feed row with no matching in-app row (or vice-versa), wrong deep-link routing, an event that produces no notification where the sibling event does.' },
    ],
  },
  'deep-sweep': {
    key: 'backend correctness / concurrency / security',
    context: `LANE = backend correctness — transactions/rollback, concurrency and idempotency, timer/expiry
boundaries, money/price integrity, object-level authorization, KYC-gate bypass — plus an adversarial
direct-API pass (bypass the client, hit endpoints with hostile payloads). Key: apps/api/src/* (esp.
never-audited internals + cross-cutting mechanisms).`,
    lenses: [
      { key: 'tx-rollback', prompt: 'Transaction/rollback correctness: a multi-write op not wrapped in a tx; a side-effect that commits when the main write rolls back (or vice-versa); a fire-and-forget without a catch crashing the process.' },
      { key: 'concurrency-idempotency', prompt: 'Concurrency + idempotency: findUnique->decide->update without CAS/lock; a webhook/user-action race; a non-idempotent endpoint replayed; a counter that double-increments.' },
      { key: 'authz-idor', prompt: 'Object-level authorization / IDOR: an endpoint that trusts a client-supplied id without an ownership/party gate; a role check missing on a mutating route; a KYC/standing gate bypass.' },
      { key: 'timer-expiry', prompt: 'Timer/expiry boundaries: off-by-one on an expiry window; a job with no retry/backoff; a scheduled close that races a manual transition; a stale-vs-live freshness fallback.' },
      { key: 'adversarial-api', prompt: 'Adversarial direct-API: hit endpoints bypassing the client with hostile payloads — forgeable headers, reserved-string collisions, oversized/negative/NaN values, enum injection, a write that should be admin-only reachable with a plain token.' },
    ],
  },
}

function resolveLane(a) {
  if (a && typeof a === 'object' && a.lenses) return a
  const key = typeof a === 'string' ? a : 'wallet'
  return LANES[key] || LANES.wallet
}

const lane = resolveLane(args)
const CONTEXT = `${REPO}\n${lane.context}\n${DEDUP}`

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string', description: 'path:line' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          category: { type: 'string' },
          description: { type: 'string', description: 'the defect: what breaks, and the input/state that triggers it' },
          repro: { type: 'string' },
          signature: { type: 'string', description: 'grep-able shape of the bug for sibling-sweep' },
          not_in_ledger: { type: 'boolean', description: 'true only after checking KNOWN_BUGS.md' },
        },
        required: ['title', 'file', 'severity', 'description', 'repro', 'signature', 'not_in_ledger'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    real: { type: 'boolean' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'string' },
    corrected_severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
  },
  required: ['real', 'confidence', 'reasoning'],
}

const SWEEP_SCHEMA = {
  type: 'object',
  properties: {
    grep_commands: { type: 'array', items: { type: 'string' } },
    hit_count: { type: 'number' },
    siblings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, vulnerable: { type: 'boolean' }, note: { type: 'string' } },
        required: ['file', 'vulnerable', 'note'],
      },
    },
  },
  required: ['grep_commands', 'hit_count', 'siblings'],
}

log(`Lane: ${lane.key} — ${lane.lenses.length} finder lenses`)
phase('Find')

// Pipeline: each lens finds, and its candidates verify the moment that lens returns (no barrier).
const perLens = await pipeline(
  lane.lenses,
  (l) => agent(
    `${CONTEXT}\n\nYou are a bug finder with ONE lens: ${l.key}.\n${l.prompt}\n\n` +
    `Phase 0: read the relevant parts of ${LEDGER} first; do NOT re-report anything already there. Read the ` +
    `actual source. Report ONLY concrete, code-grounded defects in THIS lens that cause an incorrect or ` +
    `harmful result — exact file:line, a concrete repro, a grep-able signature. Set not_in_ledger honestly. ` +
    `Empty findings is valid — do not invent marginal issues.`,
    { label: `find:${l.key}`, phase: 'Find', schema: FINDING_SCHEMA }
  ),
  (result, l) => {
    const fresh = (result?.findings || []).filter(f => f.not_in_ledger !== false)
    if (!fresh.length) return []
    return parallel(fresh.map(f => () =>
      // Perspective-diverse adversarial panel: 3 skeptics, each told to REFUTE.
      parallel([
        `Does this bug REALLY exist and produce a wrong result? Trace the cited code.`,
        `Is this a FALSE POSITIVE — already guarded elsewhere, mooted by a constraint/tx, or correct behavior?`,
        `Is this ALREADY in ${LEDGER} (any id or a trivially-adjacent entry)? If so it is not new.`,
      ].map(angle => () =>
        agent(
          `${CONTEXT}\n\nAdversarially verify this candidate. Default to real=false when uncertain.\n` +
          `Lens: ${l.key}\nTitle: ${f.title}\nFile: ${f.file}\nSeverity: ${f.severity}\n` +
          `Description: ${f.description}\nRepro: ${f.repro}\n\nYour angle: ${angle}\nRead the cited file first.`,
          { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA }
        )
      )).then(votes => {
        const v = votes.filter(Boolean)
        return { finding: f, lens: l.key, votes: v, confirmed: v.filter(x => x.real).length >= 2 }
      })
    ))
  }
)

const verified = perLens.flat().filter(Boolean)
const confirmed = verified.filter(v => v.confirmed)
log(`Find+Verify: ${verified.length} candidates, ${confirmed.length} survived the adversarial panel`)

phase('Sibling-sweep')
const swept = await parallel(confirmed.map(v => () =>
  agent(
    `${CONTEXT}\n\nA confirmed bug:\nTitle: ${v.finding.title}\nFile: ${v.finding.file}\n` +
    `Description: ${v.finding.description}\nPattern signature: ${v.finding.signature}\n\n` +
    `Grep the WHOLE repo for other occurrences of this bug SHAPE (the dominant defect pattern here is ` +
    `"one instance fixed, a sibling elsewhere stayed vulnerable"). Report the grep command(s), the raw hit ` +
    `count, and for each hit whether it is ALSO vulnerable, already-guarded, or unrelated.`,
    { label: `sweep:${v.finding.file}`, phase: 'Sibling-sweep', schema: SWEEP_SCHEMA }
  ).then(sweep => ({ ...v, sweep }))
))

const sev = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
const ranked = swept.filter(Boolean).sort((a, b) => (sev[a.finding.severity] ?? 9) - (sev[b.finding.severity] ?? 9))

return {
  lane: lane.key,
  summary: {
    lenses: lane.lenses.length,
    candidates: verified.length,
    confirmed: confirmed.length,
    vulnerable_siblings: ranked.reduce((n, r) => n + (r.sweep?.siblings?.filter(s => s.vulnerable).length || 0), 0),
  },
  findings: ranked.map(r => ({
    title: r.finding.title,
    severity: r.finding.severity,
    file: r.finding.file,
    lens: r.lens,
    description: r.finding.description,
    repro: r.finding.repro,
    verify: r.votes.map(x => `${x.real ? 'REAL' : 'refuted'}(${x.confidence})`).join(', '),
    vulnerable_siblings: (r.sweep?.siblings || []).filter(s => s.vulnerable),
    sweep_evidence: { commands: r.sweep?.grep_commands, hits: r.sweep?.hit_count },
  })),
}
