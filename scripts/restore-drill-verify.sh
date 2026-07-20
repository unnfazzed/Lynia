#!/usr/bin/env bash
# restore-drill-verify.sh — post-restore health + ledger-integrity check for the
# backup restore drill (docs/RESTORE-DRILL.md, roadmap item 1.7 / LR7).
#
# Given a DATABASE_URL pointing at a RESTORED SCRATCH database (a PITR clone or a
# backup restored onto a throwaway Cloud SQL instance — NEVER production), this
# script asserts the restore actually produced a healthy, self-consistent DB:
#
#   • the expected tables exist (a partial/failed restore is caught here);
#   • row counts are reported and the DB is non-empty as expected;
#   • the money invariants hold — the SAME assertions the roadmap's ledger
#     integrity job (item 1.3, docs/plans/2026-rider-wallet-design.md step 6)
#     specifies, run against the restored bytes:
#       A. every CommissionAccount.balance == SUM(its CommissionLedger.amount)
#       A2. every CommissionAccount.balance == its latest ledger balanceAfter
#       B. every CONFIRMED TopUp has exactly one ledger credit (catches a
#          *missing* credit; the unique top_up_id already bars doubles)
#       B2. no ledger credit points at a missing / non-confirmed TopUp
#       C. every ride_commission debit carries its order_id + rate_pct + fare
#          receipt fields (design OV-2A)
#       D1. every ledger row's rider has a CommissionAccount
#       D2. every ledger order_id resolves to a real Order
#
# Money math is done in Postgres NUMERIC (exact), NOT JS floats — deliberately,
# per the roadmap's decimal-safety concern (item 2.1). An empty wallet (pre-flip
# pilot) trivially passes every invariant (0 rows = 0 violations), which is
# correct: an empty ledger is a consistent ledger.
#
# Exit status: 0 iff every REQUIRED check passes; non-zero on any failed
# invariant or a partial/unreachable restore. WARNs never fail the run.
#
# Requires: psql (libpq) on PATH, reachable via DATABASE_URL. Makes NO changes —
# every query is read-only.
#
# Usage:
#   scripts/restore-drill-verify.sh "postgresql://user:pass@127.0.0.1:5433/lynia"
#   DATABASE_URL="postgresql://..." scripts/restore-drill-verify.sh
#
# Typical drill wiring (see docs/RESTORE-DRILL.md): start the Cloud SQL Auth
# Proxy against the SCRATCH instance, then point this at 127.0.0.1:<proxy-port>.

set -uo pipefail

DATABASE_URL="${1:-${DATABASE_URL:-}}"

PASS=0 FAIL=0 WARN=0
ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       fix: %s\n' "$2"; }
warn() { WARN=$((WARN+1)); printf '  \033[33mWARN\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       note: %s\n' "$2"; }
hdr()  { printf '\n== %s\n' "$1"; }

if [ -z "$DATABASE_URL" ]; then
  echo "restore-drill-verify: no DATABASE_URL." >&2
  echo "  Usage: $0 <DATABASE_URL>   (or set DATABASE_URL in the environment)" >&2
  echo "  Point it at the RESTORED SCRATCH database, never production." >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "restore-drill-verify: psql not found on PATH — install the postgresql client." >&2
  exit 2
fi

# Scalar query helper: echoes the single value; returns psql's exit code so
# callers can distinguish "0 violations" from "query/connection failed".
q() { psql "$DATABASE_URL" --no-psqlrc -Atq -c "$1"; }

# ---------------------------------------------------------------------------
hdr "Connectivity"
if ! SRV="$(q "SELECT current_database() || ' @ ' || COALESCE(inet_server_addr()::text,'socket')")"; then
  bad "cannot connect to the restored database via DATABASE_URL" \
      "check the Cloud SQL Auth Proxy is up and the URL host/port/creds are right (docs/RESTORE-DRILL.md §Connect)"
  printf '\n%d passed, %d failed, %d warnings — ABORTED\n' "$PASS" "$FAIL" "$WARN"
  exit 1
fi
ok "connected: $SRV"
# Loud guard against pointing this at prod by accident.
if printf '%s' "$SRV" | grep -qiE 'lynia-pg[^-]|:lynia-pg$'; then
  warn "server string mentions the prod instance name" "confirm this is the SCRATCH clone, not lynia-pg itself"
fi

# ---------------------------------------------------------------------------
hdr "Schema — required tables present (a partial restore fails here)"
REQUIRED="profiles riders orders commission_accounts commission_ledger top_ups"
MISSING=""
for t in $REQUIRED; do
  present="$(q "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$t' LIMIT 1")"
  if [ "$present" = "1" ]; then ok "table $t"; else bad "table $t MISSING" "restore is partial/failed — re-run the clone/restore step"; MISSING="$MISSING $t"; fi
done
if [ -n "$MISSING" ]; then
  bad "one or more core tables are missing —$MISSING" "cannot run integrity checks against a partial restore"
  printf '\n%d passed, %d failed, %d warnings\n' "$PASS" "$FAIL" "$WARN"
  exit 1
fi

# ---------------------------------------------------------------------------
hdr "Row counts (sanity — is the restore populated?)"
TOTAL=0
for t in profiles riders orders commission_accounts commission_ledger top_ups; do
  c="$(q "SELECT count(*) FROM $t")"; c="${c:-0}"
  printf '       %-22s %s rows\n' "$t" "$c"
  TOTAL=$((TOTAL + c))
done
if [ "$TOTAL" -eq 0 ]; then
  warn "every core table is empty" \
       "expected only for a restore of a brand-new/empty instance; if you cloned a POPULATED prod, this means the wrong point-in-time or a bad restore — investigate"
else
  ok "restore is populated ($TOTAL rows across core tables)"
fi
PROFILES="$(q "SELECT count(*) FROM profiles")"; PROFILES="${PROFILES:-0}"
if [ "$PROFILES" -eq 0 ] && [ "$TOTAL" -gt 0 ]; then
  warn "profiles table is empty but other tables are not" "unusual for a real restore — sanity-check the point-in-time"
fi

# ---------------------------------------------------------------------------
hdr "Ledger integrity invariants (item 1.3 assertions, run on the restored data)"

# check NAME SQL FIXHINT — SQL must return a single integer = violation count.
check() {
  local name="$1" sql="$2" fix="${3:-}"
  local n
  if ! n="$(q "$sql")"; then
    bad "$name — query errored (schema drift in the restore?)" "$fix"
    return
  fi
  n="${n:-0}"
  if [ "$n" -eq 0 ]; then ok "$name — 0 violations"; else bad "$name — $n violation(s)" "$fix"; fi
}

# A. balance == SUM(ledger.amount). Riders with an account but no ledger rows
#    (sum NULL) must have balance 0 — COALESCE handles that.
check "A · balance == SUM(ledger.amount) per rider" \
  "SELECT count(*) FROM commission_accounts a
   LEFT JOIN (SELECT rider_id, SUM(amount) AS s FROM commission_ledger GROUP BY rider_id) l
     ON l.rider_id = a.rider_id
   WHERE a.balance <> COALESCE(l.s, 0)" \
  "cached balance drifted from the ledger — a corrupt/incomplete restore or real drift; diff with:
       SELECT a.rider_id, a.balance, COALESCE(SUM(l.amount),0) FROM commission_accounts a LEFT JOIN commission_ledger l ON l.rider_id=a.rider_id GROUP BY a.rider_id, a.balance HAVING a.balance <> COALESCE(SUM(l.amount),0);"

# A2. balance == latest balanceAfter (deterministic tie-break by created_at,id).
#     Only riders that HAVE ledger rows are checked (LATERAL yields no row otherwise).
check "A2 · balance == latest ledger balanceAfter" \
  "SELECT count(*) FROM commission_accounts a
   JOIN LATERAL (
     SELECT balance_after FROM commission_ledger l
     WHERE l.rider_id = a.rider_id ORDER BY l.created_at DESC, l.id DESC LIMIT 1
   ) last ON true
   WHERE a.balance <> last.balance_after" \
  "balance disagrees with the last written running total (if A passed too, suspect identical created_at timestamps on the last two rows — otherwise real drift)"

# B. every confirmed TopUp has >=1 ledger credit (unique top_up_id makes it exactly 1).
check "B · confirmed TopUp has a ledger credit (no missing credit)" \
  "SELECT count(*) FROM top_ups t
   WHERE t.status = 'confirmed'
     AND NOT EXISTS (SELECT 1 FROM commission_ledger l WHERE l.top_up_id = t.id)" \
  "a confirmed top-up with no credit = money in, balance not raised; list:
       SELECT id, rider_id, amount FROM top_ups t WHERE status='confirmed' AND NOT EXISTS (SELECT 1 FROM commission_ledger l WHERE l.top_up_id=t.id);"

# B2. no ledger credit references a missing or non-confirmed TopUp (orphan credit).
check "B2 · ledger top_up_id resolves to a confirmed TopUp" \
  "SELECT count(*) FROM commission_ledger l
   WHERE l.top_up_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM top_ups t WHERE t.id = l.top_up_id AND t.status = 'confirmed')" \
  "a credit points at a missing/unconfirmed top-up — orphaned or inconsistent restore"

# C. ride_commission debits carry their receipt fields (order_id, rate_pct, fare).
check "C · ride_commission rows have order_id + rate_pct + fare" \
  "SELECT count(*) FROM commission_ledger
   WHERE type = 'ride_commission' AND (order_id IS NULL OR rate_pct IS NULL OR fare IS NULL)" \
  "a per-ride debit is missing its show-the-math receipt fields (design OV-2A)"

# D1. every ledger row's rider has a CommissionAccount (balance is reconstructable).
check "D1 · every ledger rider has a CommissionAccount" \
  "SELECT count(*) FROM commission_ledger l
   WHERE NOT EXISTS (SELECT 1 FROM commission_accounts a WHERE a.rider_id = l.rider_id)" \
  "ledger rows exist for a rider with no account row — reconstructable-balance invariant broken"

# D2. every non-null ledger order_id resolves to a real Order (no dangling FK).
check "D2 · every ledger order_id resolves to an Order" \
  "SELECT count(*) FROM commission_ledger l
   WHERE l.order_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = l.order_id)" \
  "dangling order reference in the ledger — inconsistent restore"

# ---------------------------------------------------------------------------
printf '\n%d passed, %d failed, %d warnings\n' "$PASS" "$FAIL" "$WARN"
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32mRestore looks healthy — record the RTO in docs/RESTORE-DRILL.md.\033[0m\n'
  exit 0
fi
printf '\033[31mRestore FAILED verification — do NOT trust this backup path until the failures are explained.\033[0m\n'
exit 1
