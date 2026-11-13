# Leaving Azure

Owner, 2026-11-13: the Azure bill can no longer be paid, so Lynia moves off Azure before the
subscription is disabled. A disabled subscription stops the API (the public app stops working);
its data is deleted some time after that, and Microsoft does not promise how long.

The target is **$0/month**: one Oracle Cloud *Always Free* ARM server in Johannesburg (data stays in
South Africa, as on Azure South Africa North) running the API, admin, Postgres 16 + PostGIS and Redis with
Docker Compose, behind Cloudflare (Tunnel, Access, R2), which already serves DNS and the web apps.

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

### Owner checklist

1. **Oracle Cloud**: home region *South Africa Central (Johannesburg)*. Create a VM: *Ampere A1*, 4 OCPU,
   24 GB, Ubuntu 24.04. At "Add SSH keys" choose *Generate a key pair for me* and download the private key.
2. **Cloudflare R2**: create buckets `lynia-media` and `lynia-backups`. *Manage R2 API tokens → Create*:
   Object Read & Write on those two buckets. Note the account id, access key id and secret.
   On `lynia-media` → *Settings → CORS policy*, allow `PUT` and `GET` from `https://app.lyniago.com` and
   `https://merchant.lyniago.com` with headers `content-type` and `if-none-match`.
3. **Cloudflare Zero Trust** (free plan):
   - *Networks → Tunnels → Create a tunnel* (cloudflared). Copy the token. Public hostnames:
     `api.lyniago.com` → `http://api:3000`, `admin.lyniago.com` → `http://admin:8080`. (Add them at
     switch-over: they take the names over from Azure.)
   - *Access → Applications → Self-hosted* for `admin.lyniago.com`, policy *Allow* your email. Copy the
     *Application Audience (AUD) Tag* and your team domain (`<team>.cloudflareaccess.com`).
4. **GitHub** → repo *Settings → Secrets and variables → Actions*:
   - Secret `SELFHOST_SSH_KEY`: the private key from step 1.
   - Secret `SELFHOST_ENV`: `infra/selfhost/.env.example`, filled in.
   - Variables `SELFHOST_ENABLED=true`, `SELFHOST_HOST=<the VM's public IP>`, `SELFHOST_USER=ubuntu`.
5. **Actions → "Deploy (self-hosted server)" → Run workflow.** The first run installs Docker, prints the
   server's host key (save it as Variable `SELFHOST_KNOWN_HOSTS`), migrates an empty database and starts
   everything. Nothing public points at it yet.

## Step 3 — switch over

1. Run the data export one last time.
2. On the server: restore the dump into the empty database and copy the photos into `lynia-media`
   (the decrypt commands are in Step 1; the media tarball's folders are the object keys).
3. Add the two public hostnames to the tunnel. Cloudflare moves `api.` and `admin.` from Azure to it.
4. Check `https://api.lyniago.com/healthz`, sign in on the app, open the admin console.
5. Turn Azure off. The apps call `api.lyniago.com`, so no app update or store release is needed.
