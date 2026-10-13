# Backup Restore Drill Runbook

Prove the Postgres backups are real by restoring one. Azure takes automatic backups of the production
server and keeps 7 days of point-in-time restore (PITR), but **no restore has been done on Azure yet**:
a backup that has never been restored is a hope. This drill restores production into a throwaway server,
checks it with `scripts/restore-drill-verify.sh`, records the recovery time (RTO), and deletes everything
it created. It never writes to production.

Companion to [IR-RUNBOOK §3](IR-RUNBOOK.md). Run the commands in **Azure Cloud Shell (Bash)** as the
owner. Steps marked 💵 create billable resources; §6 deletes them, so never skip it.

> **Not yet run on Azure.** The commands follow the Azure CLI as documented but have not been executed
> against this subscription. Record anything that differs in §8.

---

## 0. Facts (from `infra/azure/data.tf`, `variables.tf`, `locals.tf`)

| Thing | Value |
|---|---|
| Resource group | `rg-lynia-prod-san` (South Africa North) |
| Production server | `psql-lynia-prod-<suffix>` (the suffix is fixed per subscription; `az postgres flexible-server list -g rg-lynia-prod-san -o table`) |
| Engine | Azure Database for PostgreSQL Flexible Server, version 16, SKU `B_Standard_B1ms`, 32 GB |
| Database / admin login | `lynia` / `lynia_admin` |
| Network | Private access only, VNet-injected into `snet-pg`, private DNS zone `lynia-prod.private.postgres.database.azure.com` |
| Backups | Automatic. `backup_retention_days = 7`, so any point in the last 7 days can be restored |
| Geo-redundant backup | **Off** (`geo_redundant_backup_enabled = false`): no restore into another region |
| High availability | None (no standby). A zone failure means restore from backup, which is this drill |
| Connection string | Key Vault secret `DATABASE-URL` (`sslmode=require`) |
| Scratch server (this drill) | `psql-lynia-restore-drill` |
| Scratch client app (this drill) | `ca-restore-drill` in environment `cae-lynia-prod` |

---

## 1. Prerequisites

1. In Cloud Shell, set the names once:
   ```bash
   RG=rg-lynia-prod-san
   SRC=$(az postgres flexible-server list -g "$RG" --query "[0].name" -o tsv); echo "$SRC"
   V=$(gh variable get AZ_KEY_VAULT_NAME -R unnfazzed/Lynia)
   SCRATCH=psql-lynia-restore-drill
   ```
2. You need rights to create a Flexible Server and a Container App in `$RG`, and to read `DATABASE-URL`
   from the vault.
3. Confirm there is something to restore from:
   ```bash
   az postgres flexible-server show -g "$RG" -n "$SRC" --query "{retention:backup.backupRetentionDays, earliest:backup.earliestRestoreDate, geo:backup.geoRedundantBackup}" -o table
   ```
   If `earliest` is empty, stop: there is nothing to restore, and that is the finding.

---

## 2. Start the clock, pick a recovery point

RTO runs from the moment you decide to restore to the moment the restored database checks out. Write
down `T0`:

```bash
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

For the drill, restore to 15 minutes ago. It must be inside the PITR window, in UTC:

```bash
PITR_TS="$(date -u -d '15 minutes ago' '+%Y-%m-%dT%H:%M:%SZ')"; echo "$PITR_TS"
```

---

## 3. Restore into a scratch server 💵

PITR builds a **new** server from the source's backups. The source keeps serving, untouched.

```bash
az postgres flexible-server restore -g "$RG" -n "$SCRATCH" \
  --source-server "$SRC" --restore-time "$PITR_TS"
```

A server with private access restores into a private network too. Check where it landed and that it is
`Ready`:

```bash
az postgres flexible-server show -g "$RG" -n "$SCRATCH" \
  --query "{state:state, fqdn:fullyQualifiedDomainName, subnet:network.delegatedSubnetResourceId}" -o table
```

If it did not land in `snet-pg` of `vnet-lynia-prod`, pass `--subnet` and `--private-dns-zone` explicitly
(see `az postgres flexible-server restore --help`). The restore time is a real part of your RTO.

---

## 4. Connect to the scratch server

The scratch server has no public endpoint, so the check must run from inside the VNet. Nothing in the
repo does this yet. Use a temporary Container App in the production environment, running the official
`postgres:16` image (it has `psql` and `bash`).

1. Build the scratch connection string. The restored server keeps the source's admin login and
   password, so only the host changes. The value never prints:
   ```bash
   SCRATCH_HOST=$(az postgres flexible-server show -g "$RG" -n "$SCRATCH" --query fullyQualifiedDomainName -o tsv)
   SRC_HOST=$(az postgres flexible-server show -g "$RG" -n "$SRC" --query fullyQualifiedDomainName -o tsv)
   SCRATCH_URL=$(az keyvault secret show --vault-name "$V" -n DATABASE-URL --query value -o tsv | sed "s/@${SRC_HOST}:/@${SCRATCH_HOST}:/")
   case "$SCRATCH_URL" in *"@${SCRATCH_HOST}:"*) echo "points at scratch";; *) echo "STOP: not rewritten"; unset SCRATCH_URL;; esac
   ```
2. Start the client app 💵 (no ingress, one replica):
   ```bash
   az containerapp create -g "$RG" -n ca-restore-drill --environment cae-lynia-prod \
     --workload-profile-name Consumption --image docker.io/library/postgres:16 \
     --command sleep --args infinity --min-replicas 1 --max-replicas 1 --cpu 0.25 --memory 0.5Gi \
     --secrets "dburl=$SCRATCH_URL" --env-vars DATABASE_URL=secretref:dburl -o none
   unset SCRATCH_URL
   az containerapp exec -g "$RG" -n ca-restore-drill --command bash
   ```

---

## 5. Check the restore

Inside the `ca-restore-drill` shell, fetch and run the check:

```bash
apt-get update -qq && apt-get install -y -qq curl >/dev/null
curl -fsSL https://raw.githubusercontent.com/unnfazzed/Lynia/main/scripts/restore-drill-verify.sh -o /tmp/verify.sh
bash /tmp/verify.sh            # reads DATABASE_URL from the environment
```

`scripts/restore-drill-verify.sh` is read-only. It checks the expected tables exist, reports row
counts, and asserts the wallet money invariants (balances rebuild from the ledger, every confirmed
top-up has exactly one credit, every commission debit carries its receipt fields). Expect
`N passed, 0 failed`. It exits non-zero on any failed invariant.

Leave the shell. Write down `T1` (`date -u '+%Y-%m-%dT%H:%M:%SZ'`). **RTO = T1 − T0.** RPO for a PITR
restore is the gap between the recovery point and the incident.

---

## 6. Teardown 💵

Do this even if the drill failed. A left-over server bills every hour.

```bash
az containerapp delete -g "$RG" -n ca-restore-drill --yes
az postgres flexible-server delete -g "$RG" -n "$SCRATCH" --yes
az postgres flexible-server list -g "$RG" --query "[].name" -o tsv | grep -q restore-drill \
  && echo "STILL PRESENT: delete it" || echo "scratch server gone"
```

---

## 7. Checklist

- [ ] Names set; `earliest` restore date shown (§1)
- [ ] `T0` recorded; `$PITR_TS` inside the 7-day window (§2)
- [ ] 💵 `psql-lynia-restore-drill` restored and `Ready` (§3)
- [ ] 💵 `ca-restore-drill` running with the scratch `DATABASE_URL` (§4)
- [ ] `restore-drill-verify.sh` → `0 failed` (§5)
- [ ] `T1` recorded; RTO computed (§5)
- [ ] 💵 Both scratch resources deleted (§6)
- [ ] Result written into §8

---

## 8. Drill record

| Date (UTC) | Recovery point | T0 | T1 | **RTO** | Verify result | Operator |
|---|---|---|---|---|---|---|
| _not yet run on Azure_ | | | | | | |

Notes (restore duration, network surprises, missing permissions, verify warnings):

- _(none yet)_

---

## 9. Backup risks worth a decision before launch

From `infra/azure/data.tf`:

1. **7-day window.** `backup_retention_days = 7` is the shortest useful setting. Azure allows up to 35.
   A problem found after a week cannot be undone.
2. **No geo-redundant backup.** Losing South Africa North loses the backups with it. Enabling it later
   may require recreating the server (unverified); decide before data grows.
3. **No off-cloud copy.** Everything sits in one Azure subscription. Off-cloud backups are an open Phase 8
   item in `docs/plans/2026-09-24-gcp-to-azure-migration.md`.
4. **No standby.** A zone outage means a restore (this drill), not a failover.
5. **Nothing blocks deleting the server** besides `terraform-apply-azure.yml`'s destroy guard. There is no
   Azure resource lock in `infra/azure`.
