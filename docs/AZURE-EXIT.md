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

## Step 2 — the new home (in progress)

- Oracle Cloud account, home region **South Africa Central (Johannesburg)**, one Ampere A1 server
  (4 OCPU / 24 GB, Ubuntu). The card check needs a small temporary hold (~$1) on the card.
- Cloudflare: R2 bucket for media, Zero Trust (Tunnel + Access) for `api.` and `admin.`.
- Code: an R2 storage adapter, admin sign-in through Cloudflare Access instead of Azure Easy Auth,
  a shared-secret scheduler token instead of Entra, `docker-compose.prod.yml`, and a deploy workflow
  replacing `release-azure.yml`.

## Step 3 — switch over

Final export → restore → point `api.lyniago.com` / `admin.lyniago.com` at the tunnel → smoke checks →
turn Azure off. The apps call `api.lyniago.com`, so no app update or store release is needed.
