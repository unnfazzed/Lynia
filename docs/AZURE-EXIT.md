# Leaving Azure

Owner, 2026-11-13: the Azure bill can no longer be paid, so Lynia moves off Azure before the
subscription is disabled. A disabled subscription stops the API (the public app stops working);
its data is deleted some time after that, and Microsoft does not promise how long.

**Done 2026-11-15 (switch-over 16:15–16:40 UTC).** Lynia now runs on one **Hetzner Cloud CAX11** server
(`lynia-1`, Arm64, 2 vCPU / 4 GB, Nuremberg, Germany; about $9/month with IPv4 and backups) behind Cloudflare,
which already served DNS and the web apps. Oracle Always Free was the first plan; the owner chose Hetzner
(2026-11-15) for reliability. The server runs the API, admin, Postgres 16 + PostGIS and Redis with Docker
Compose; Cloudflare provides the Tunnel (no open port but SSH), Access (admin login) and R2 (photos and
backups).

Where things are, for whoever looks next:

| What | Where |
|---|---|
| Server | Hetzner Console, project *lynia*, `lynia-1` (`91.99.163.34`), firewall `lynia-ssh-only` (TCP 22 only), daily Hetzner backups on |
| Stack | `~/lynia` on the server (`infra/selfhost/`), written by `.github/workflows/deploy-selfhost.yml` |
| Database | Postgres container, volume `pgdata`; nightly encrypted dump to R2 `lynia-backups/db/` (14 days) |
| Photos | R2 bucket `lynia-media` (location hint ignored: it was created in ENAM, eastern US) |
| Tunnel | Cloudflare → Networking → Tunnels → `lynia-hetzner`: `api.lyniago.com` → `http://api:3000`, `admin.lyniago.com` → `http://admin:8080` |
| Admin login | Zero Trust → Access → app `admin` (policy *Owner*), team `blue-salad-dc8d.cloudflareaccess.com` |
| Secrets | GitHub secret `SELFHOST_ENV` (copied from Key Vault `kv-lynia-37420b`); SSH key `SELFHOST_SSH_KEY` |
| Edge cache | Cloudflare → lyniago.com → Cache Rules → *API browse cache* (see "Latency" below) |

**Still to do:** switch off the Azure workflows (merges still start *Release (Azure)*: do not approve it),
then delete the Azure resource groups (stops the bill). The privacy notice naming Germany + the United States
is live since 2026-11-15 (lawyer-approved); the owner's POTRAZ notification and the Hetzner/Cloudflare DPAs are
tracked in `docs/PLAY-STORE-SUBMISSION.md` §7.3.

## Step 1 — get the data out (do this first)

Postgres has no public endpoint, so the export runs **inside Azure**, as one execution of the migrate
job (`.github/workflows/azure-db-export.yml`, running `scripts/azure-export-job.sh`).

1. **Make a passphrase** of 24+ characters (e.g. five or six random words). Write it down somewhere
   outside GitHub. **Without it the export can never be decrypted.**
2. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**:
   name `DB_EXPORT_PASSPHRASE`, value the passphrase.
3. GitHub → **Actions → "Azure Data Export (leaving Azure)" → Run workflow** (keep *include media* on).
   If the `production` environment asks for approval, approve it.
4. A green run means the database dump was downloaded back, decrypted and read by `pg_restore`. The run
   summary shows the manifest (table count, photo count, sizes).
5. The files are in **Releases → Drafts → `data-export-…`**. **Never publish that release.** Drafts are
   visible only to people with push access, and every file is AES-256 encrypted because this repo is
   public.

Run it again closer to the switch-over: the last export before Azure goes off is the one restored.

### If media is skipped

Above 5 GiB of photos the job skips the media tarball (its disk is too small) and says so in the
manifest. The photos are then copied straight to Cloudflare R2 with `rclone` during step 2.

### Decrypting

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in lynia-db-STAMP.dump.enc -out lynia-db.dump
```

```bash
cat lynia-media-STAMP.tar.enc.part* | openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 | tar -xf - -C media/
```

Both ask for the passphrase. Restore the database into an empty Postgres 16 with PostGIS available:

```bash
pg_restore --no-owner --no-privileges --dbname "postgresql://lynia:PASSWORD@localhost:5432/lynia" lynia-db.dump
```

## Step 2 — the new home

The code is ready (`CLOUD_PROVIDER=cloudflare`, `SCHEDULER_AUTH=secret`, admin login through Cloudflare
Access) and the server runs `infra/selfhost/docker-compose.yml`: API, admin, Postgres 16 + PostGIS,
Redis, a cron container (the two nightly jobs + an encrypted database backup to R2) and `cloudflared`.
No port is open to the internet; everything comes in through the Cloudflare Tunnel.
`.github/workflows/deploy-selfhost.yml` builds the images and updates the server.

### Copy the keys out of Key Vault first

In the Azure portal: **Key vaults → the Lynia vault → Objects → Secrets**. For each of
`PII-ENCRYPTION-KEY`, `JWT-SIGNING-SECRET`, `TOKEN-HASH-SECRET`, `ADMIN-API-TOKEN` and every vendor key
you use (Didit, Bird, WhatsApp, Paynow, Telegram, Sentry, FCM), open the current version → **Show Secret
Value** and save it in your password manager. **`PII-ENCRYPTION-KEY` is the only way to read the stored
national IDs.**

### Owner checklist (as done)

1. **Hetzner Cloud**: account verified with ID. SSH key `lynia-deploy` made on the owner's PC
   (`ssh-keygen -t ed25519`). Server: *Cost-Optimized → Arm64 (Ampere) → CAX11*, **Ubuntu 24.04**, public
   IPv4 + IPv6, the SSH key, backups on, name `lynia-1`. Firewall: inbound TCP 22 (and ICMP) only.
   Billing is monthly in arrears, capped at the monthly price.
2. **Cloudflare R2** (enable R2 on the free plan first; it needs a payment method): buckets `lynia-media`
   and `lynia-backups`. Choose the location hint in the dashboard **the first time a name is created**:
   a hint is ignored for a name that was used before. *Manage API tokens → Create Account API token*:
   Object Read & Write on those two buckets. On `lynia-media` → *Settings → CORS policy*:
   `[{"AllowedOrigins":["https://app.lyniago.com","https://merchant.lyniago.com"],"AllowedMethods":["GET","PUT","HEAD"],"AllowedHeaders":["content-type","if-none-match"],"ExposeHeaders":["etag"],"MaxAgeSeconds":3600}]`
3. **Cloudflare Tunnel** (*Networking → Tunnels → Create a tunnel*, cloudflared, Docker): copy the token
   after `--token`, do not run the command, add no route until switch-over.
4. **Cloudflare Access** (Zero Trust free plan; *Access controls → Applications → Self-hosted*) for
   `admin.lyniago.com` with an *Allow emails* policy. Copy the AUD tag; the team domain is under
   *Access settings*.
5. **GitHub** → repo *Settings → Secrets and variables → Actions*:
   - Secret `SELFHOST_SSH_KEY`: the private key (`Get-Content $HOME\.ssh\lynia-deploy -Raw | Set-Clipboard`).
   - Secret `SELFHOST_ENV`: `infra/selfhost/.env.example`, filled in. Every value on one line (squeeze the
     FCM JSON with `ConvertFrom-Json | ConvertTo-Json -Compress` and wrap it in single quotes). Copy each Key
     Vault value from the version page's *Show Secret Value*, not the version id; skip `*-STAGING`,
     `DATABASE-URL`, `REDIS-URL`, `ADMIN-ENTRA-CLIENT-SECRET`.
   - Variables `SELFHOST_ENABLED=true`, `SELFHOST_HOST=91.99.163.34`, `SELFHOST_USER=root`,
     `SELFHOST_KNOWN_HOSTS=<the server's ssh-ed25519 line>`.
6. **Actions → "Deploy (self-hosted server)" → Run workflow.** If the API refuses to start, the run names
   the rejected settings (never their values; the logs are public). The first deploy failed once on swapped
   `DEMO_OTP_PHONE` / `DEMO_OTP_CODE` values.

## Latency: cache the browse screens at Cloudflare

The server is in Germany, so every API call from Zimbabwe adds ~150–200 ms. The catalogue reads are the
same for every customer, so Cloudflare keeps a copy at its edge (Harare/Johannesburg) for 60 seconds
(owner decision 2026-11-15, option A: menus, prices and catalogues become readable without signing in).

The API marks exactly nine routes shareable (`@EdgeCache()`, `apps/api/src/common/edge-cache.decorator.ts`;
the spec fails if it appears anywhere else): `GET /restaurants`, `/restaurants/search`,
`/restaurants/search/popular`, `/restaurants/popular`, `/restaurants/:id/menu`, `/shops`, `/shops/search`,
`/shops/popular`, `/shops/:id/catalogue`. Only a successful response is marked; a 404 or a kill-switch
503 keeps `private, no-cache`. Phones still revalidate every time (`max-age=0`).

Cloudflare does not cache JSON on its own. At switch-over, add one rule: Cloudflare dashboard →
`lyniago.com` → **Caching → Cache Rules → Create rule**, *Edit expression*:

```
(http.host eq "api.lyniago.com" and http.request.method eq "GET" and (
  http.request.uri.path in {"/restaurants" "/restaurants/search" "/restaurants/search/popular" "/restaurants/popular" "/shops" "/shops/search" "/shops/popular"}
  or (starts_with(http.request.uri.path, "/restaurants/") and ends_with(http.request.uri.path, "/menu"))
  or (starts_with(http.request.uri.path, "/shops/") and ends_with(http.request.uri.path, "/catalogue"))
))
```

Then: **Cache eligibility → Eligible for cache**, **Edge TTL → Use cache-control header if present**.
Leave the cache key at its default (scheme, host, path, query string, `Origin`). Everything else under
`/restaurants` (orders, schedule slots, reminders) is per-user and sends `private`, which Cloudflare never
stores. Check it worked: the second request for a menu within a minute answers `cf-cache-status: HIT`.

## Step 3 — switch over

1. Run the data export one last time.
2. **Actions → "Restore Azure export onto the self-hosted server" → Run workflow**, type `REPLACE`.
   It takes the newest export draft, replaces the server's database with it, checks every table's row
   count against the dump (any difference fails the run: do not switch traffic then), copies the photos
   into the R2 media bucket, migrates and waits for a healthy API (`.github/workflows/selfhost-restore.yml`).
3. Cloudflare → lyniago.com → **DNS**: delete the `api` and `admin` CNAMEs (Azure:
   `ca-lynia-api.kindsmoke-1451ff14.southafricanorth.azurecontainerapps.io` and
   `ca-lynia-admin.kindsmoke-1451ff14.southafricanorth.azurecontainerapps.io`, DNS only). Then at once, on the
   tunnel → **Add route → Published application**: `api` → `http://api:3000`, `admin` → `http://admin:8080`.
   **Rollback**: delete the two routes and re-create those two CNAMEs.
4. Check `https://api.lyniago.com/healthz` (`"provider":"cloudflare"`), sign in on the app, open a menu
   (photos), open the admin console.
5. Turn Azure off once nothing has gone wrong for a day or two. The apps call `api.lyniago.com`, so no app
   update or store release is needed.

### What happened on 2026-11-15

- Final export `data-export-20261115-161338` (16:15 UTC); restore: 48 tables, 1,598 rows, 0 mismatches;
  286/286 photos in R2; 121 migrations, none pending.
- National-ID key checked on the server: 10/10 encrypted IDs decrypt and their hashes match.
- `app.lyniago.com` showed no photos: its CSP only allowed `*.blob.core.windows.net`. Fixed by allowing
  `*.r2.cloudflarestorage.com` (#1360). Safari kept the old page (and its CSP) in the offline shell until a
  fresh load.
- Anyone signed out during the move lost the web app's saved delivery location: sign-out clears it on
  purpose (`apps/mobile/src/logic/home-location.ts`).
