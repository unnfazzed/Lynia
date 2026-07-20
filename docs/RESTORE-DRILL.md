# Backup Restore Drill Runbook

Prove the Cloud SQL backups are real by restoring one. PITR + automated backups are enabled on
`lynia-pg` (`infra/terraform/sql.tf`) but have **never been exercised** — *a backup that has never
restored is a hope* (`docs/LAUNCH-READINESS.md` LR7). This runbook restores production data into a
throwaway scratch instance, boots verification against it, records the **RTO**, and tears the scratch
instance down so it costs nothing. It never touches production.

Companion to the incident runbook (`docs/IR-RUNBOOK.md` §3 recover) and the provisioning audit
(`scripts/gcp-provisioning-verify.sh`). Closes the DR half of LR7.

> Keep this runnable at 3am. The commands below are copy-paste, with the real instance name and region
> filled in. Do the drill on a calm day first, then re-drill after any Terraform change to `sql.tf`.

---

## Legend

| Mark | Meaning |
|---|---|
| 🧑‍✈️ **FOUNDER-EXECUTED** | Spends money and/or mutates cloud resources against project `lynia-500911`. Only the founder runs these (per `docs/LAUNCH-READINESS.md` §1 "Prod is founder-touched only"). Agents prepare; they do not run `gcloud`. |
| 💵 | This step provisions a billable resource. The teardown step (§7) removes it — do not skip teardown. |
| 🖥️ | Local/read-only — safe to run from any authenticated workstation. |

---

## 0. Facts (from `infra/terraform/sql.tf` + `variables.tf`)

| Thing | Value |
|---|---|
| GCP project | `lynia-500911` |
| Region | `africa-south1` |
| Prod SQL instance | `lynia-pg` |
| Engine | PostgreSQL 16 (`POSTGRES_16`), edition `ENTERPRISE`, tier `db-custom-1-3840` |
| Database | `lynia` · app user `lynia` |
| Connection name | `lynia-500911:africa-south1:lynia-pg` |
| Backups | `enabled = true`, daily `start_time = 02:00` UTC (~04:00 CAT) |
| PITR | `point_in_time_recovery_enabled = true` (WAL archiving) |
| Availability | `ZONAL` (pilot; no standby) |
| Scratch instance (this drill) | `lynia-pg-restore-drill` |

---

## 1. Prerequisites 🖥️

1. **gcloud** authenticated as a principal with `roles/cloudsql.admin` (clone/restore/create/delete
   instances) on `lynia-500911`:
   ```bash
   gcloud auth login
   gcloud config set project lynia-500911
   gcloud config set compute/region africa-south1
   ```
2. **Cloud SQL Auth Proxy v2** (`cloud-sql-proxy`) — to reach the scratch instance without opening a
   public IP. Install: https://cloud.google.com/sql/docs/postgres/sql-proxy#install
3. **psql** (the PostgreSQL client) — the verification script uses it.
4. This repo checked out (for `scripts/restore-drill-verify.sh`).
5. Confirm a restore point actually exists before you start 🖥️:
   ```bash
   # Automated backups available to restore from:
   gcloud sql backups list --instance=lynia-pg --project=lynia-500911

   # PITR window — clones can target any timestamp from earliestRestoreTime to now:
   gcloud sql instances describe lynia-pg --project=lynia-500911 \
     --format='value(settings.backupConfiguration.pointInTimeRecoveryEnabled,
                     settings.backupConfiguration.transactionLogRetentionDays)'
   ```
   If `backups list` is empty or PITR is `False`, **stop** — there is nothing to restore, which is
   itself the finding (fix `sql.tf` and re-run a backup first).

---

## 2. Start the clock, pick a recovery point 🖥️

RTO is measured from the moment you *decide to restore* to the moment the restored DB is *verified
healthy*. Note the wall-clock time now — this is `T0`:

```bash
date -u '+%Y-%m-%dT%H:%M:%SZ'   # write this down as T0
```

Pick the point-in-time to recover to. For a drill, "a few minutes ago" exercises PITR + WAL replay
(the most realistic recovery); it must be inside the PITR window and RFC3339 **UTC with milliseconds**:

```bash
# e.g. 15 minutes ago, formatted the way `gcloud sql instances clone` wants:
PITR_TS="$(date -u -d '15 minutes ago' '+%Y-%m-%dT%H:%M:%S.000Z')"
echo "$PITR_TS"
```

---

## 3. Restore into a scratch instance

### Path A — PITR clone (preferred: exercises point-in-time recovery) 🧑‍✈️💵

`clone` builds a brand-new instance from `lynia-pg` at `$PITR_TS`. The source keeps serving,
untouched. The clone lands in the same region (`africa-south1`) and inherits the source's tier.

```bash
gcloud sql instances clone lynia-pg lynia-pg-restore-drill \
  --point-in-time "$PITR_TS" \
  --project lynia-500911
```

> Omit `--point-in-time` to clone the current state instead (does not exercise WAL replay). A clone
> can take several minutes on a populated instance — that duration is a real component of your RTO.

### Path B — restore an automated backup onto a fresh scratch instance 🧑‍✈️💵

Use this if PITR is unavailable, or to additionally prove the daily backup itself is restorable.
`backups restore` **overwrites** its target, so the target must be a throwaway you just created —
never an instance with data you care about.

```bash
# 1. Create an empty scratch instance (same engine + region; small is fine for a drill):
gcloud sql instances create lynia-pg-restore-drill \
  --database-version=POSTGRES_16 --edition=ENTERPRISE \
  --tier=db-custom-1-3840 --region=africa-south1 \
  --no-assign-ip --project=lynia-500911

# 2. Find the backup id to restore (newest first):
gcloud sql backups list --instance=lynia-pg --project=lynia-500911

# 3. Restore that backup onto the scratch instance (OVERWRITES lynia-pg-restore-drill):
gcloud sql backups restore <BACKUP_ID> \
  --restore-instance=lynia-pg-restore-drill \
  --backup-instance=lynia-pg \
  --project=lynia-500911
```

Wait until the scratch instance is `RUNNABLE`:

```bash
gcloud sql instances describe lynia-pg-restore-drill --project=lynia-500911 \
  --format='value(state)'
```

---

## 4. Point a connection at the scratch DB

### 4a. Give the app user a temporary password on the scratch instance 🧑‍✈️

A clone copies the `lynia` user but you don't hold its plaintext password (it lives in Secret
Manager). Set a throwaway one **on the scratch instance only** — the real prod credential is never
touched:

```bash
SCRATCH_PW="$(openssl rand -base64 24 | tr -d '/+=')"
gcloud sql users set-password lynia \
  --instance=lynia-pg-restore-drill \
  --password="$SCRATCH_PW" \
  --project=lynia-500911
```

### 4b. Start the Cloud SQL Auth Proxy against the scratch instance 🖥️

In a second terminal (leave it running):

```bash
cloud-sql-proxy lynia-500911:africa-south1:lynia-pg-restore-drill --port 5433
```

### 4c. Build the scratch `DATABASE_URL` 🖥️

```bash
export DATABASE_URL="postgresql://lynia:${SCRATCH_PW}@127.0.0.1:5433/lynia"
```

---

## 5. Verify the restore is healthy 🖥️

Run the verification script. It asserts the schema is intact, the DB is populated, and — reusing the
**same invariants as the roadmap's ledger integrity job (item 1.3)** — that the money data is
self-consistent (balances reconstruct from the ledger, every confirmed top-up has its credit, every
per-ride debit carries its receipt). It exits non-zero on any failed invariant.

```bash
scripts/restore-drill-verify.sh "$DATABASE_URL"
# or, since DATABASE_URL is exported:
scripts/restore-drill-verify.sh
```

Expect `N passed, 0 failed`. Optionally, boot a throwaway API against the scratch DB for an
end-to-end smoke (never point a *deployed* service at it — a local process only):

```bash
# From apps/api, with DATABASE_URL pointing at the proxy and a dummy REDIS_URL / secrets:
pnpm --filter @lynia/api exec prisma migrate status   # schema matches migrations?
curl -fsS localhost:3000/healthz                       # if you booted the API locally
```

---

## 6. Stop the clock — record the RTO 🖥️

```bash
date -u '+%Y-%m-%dT%H:%M:%SZ'   # this is T1
```

RTO = `T1 − T0`. Record it in §9 below. RPO for a PITR clone is ~0 (you chose the recovery point); for
a backup restore it is "time since the backup ran" (up to ~24h given the daily `02:00` schedule).

---

## 7. Teardown — delete the scratch instance 💵🧑‍✈️

**Do this even if the drill failed.** A left-over Cloud SQL instance bills continuously.

```bash
# Stop the proxy (Ctrl-C in its terminal), then:
gcloud sql instances delete lynia-pg-restore-drill --project=lynia-500911 --quiet
```

If deletion is refused because the scratch instance inherited deletion protection, clear it first:

```bash
gcloud sql instances patch lynia-pg-restore-drill --no-deletion-protection --project=lynia-500911
gcloud sql instances delete lynia-pg-restore-drill --project=lynia-500911 --quiet
```

Confirm it is gone:

```bash
gcloud sql instances list --project=lynia-500911 --format='value(name)' | grep restore-drill \
  && echo "STILL PRESENT — delete it" || echo "scratch instance gone ✓"
```

---

## 8. Checklist (tick as you go)

- [ ] Prereqs met: gcloud auth (`cloudsql.admin`), `cloud-sql-proxy`, `psql` (§1)
- [ ] `gcloud sql backups list` shows a backup **and/or** PITR is enabled (§1.5)
- [ ] `T0` recorded; recovery point `$PITR_TS` chosen inside the PITR window (§2)
- [ ] 🧑‍✈️💵 Scratch instance `lynia-pg-restore-drill` created via clone (Path A) or restore (Path B) (§3)
- [ ] Scratch instance reached `RUNNABLE` (§3)
- [ ] 🧑‍✈️ Temp password set on scratch `lynia` user; proxy up on `:5433`; `DATABASE_URL` built (§4)
- [ ] `scripts/restore-drill-verify.sh` run → **`0 failed`** (§5)
- [ ] (optional) API booted against the scratch DB / `prisma migrate status` clean (§5)
- [ ] `T1` recorded; **RTO computed** (§6)
- [ ] 💵🧑‍✈️ Scratch instance **deleted**; `gcloud sql instances list` confirms it is gone (§7)
- [ ] RTO + gotchas written into §9 and the LR7 exit-test line (`ENG-REVIEW.md`, per LR7)
- [ ] LR7 box ticked in `docs/LAUNCH-READINESS.md` **only after this drill actually ran**

---

## 9. Drill record (fill in each time)

| Date (UTC) | Path (A clone / B backup) | Recovery point | T0 | T1 | **RTO** | Verify result | Operator |
|---|---|---|---|---|---|---|---|
| _pending — first drill not yet run_ | | | | | | | |

**Gotchas / notes observed during the drill** (append):

- _(none yet — record anything surprising: clone duration, proxy quirks, missing IAM, verify warnings)_

---

## 10. Backup-config review — risks worth fixing before launch

Findings from reading `infra/terraform/sql.tf` while writing this runbook. None block the drill; all
are worth a founder decision before LR7 closes:

1. **Backup storage location is not pinned.** `backup_configuration` sets no `location`, so automated
   backups default to a Google multi-region that may sit **outside `africa-south1`** — a data-residency
   consideration under the Zimbabwe Cyber & Data Protection Act (the same concern LR8 tracks). Decide
   the backup region deliberately and set `backup_configuration.location`.
2. **Retention windows rely on defaults.** Neither `backup_retention_settings.retained_backups` nor
   `transaction_log_retention_days` is set, so both fall to Cloud SQL defaults (~7 days). If the
   intended DR window is longer, set them explicitly — and confirm the PITR window in §1.5 covers the
   recovery point you plan to be able to reach.
3. **`ZONAL` availability = backups but no standby.** A zone failure means restore-from-backup (this
   runbook), not automatic failover. LR7 item 2 already flags the `REGIONAL` flip for launch; until
   then, this drill *is* the DR story.
4. **Prod `deletion_protection` defaults to `false`** (`var.deletion_protection`). Unrelated to
   restores, but an accidental `terraform destroy` / console delete of `lynia-pg` would not be blocked.
   Consider setting it `true` for prod before launch.

---

*Exit test (LR7): this drill performed once, RTO + gotchas recorded above and in `ENG-REVIEW.md`, then
the LR7 box ticked in `docs/LAUNCH-READINESS.md`.*
