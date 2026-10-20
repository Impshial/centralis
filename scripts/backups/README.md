# Centralis backups

Settings → Backups is administrator-only. It controls daily backups, retention,
and manual requests. Data is stored in the private iDrive e2 bucket
`centralis-backups`, under a unique dated prefix for each run.

The worker runs in GitHub Actions, independently of an open browser. Two daily
checks cover 3 AM America/New_York across daylight saving time. GitHub can delay
scheduled starts. A second check skips a completed backup for the same local
date. Manual requests start through a server-side workflow dispatch.

## Coverage

- A PostgreSQL custom-format dump from a repeatable-read snapshot: application
  tables, values, relationships, functions, views, and database-managed Auth/
  Storage metadata. New tables are included automatically.
- Roles without database-role passwords, plus an archive inventory.
- All current objects in the configured Centralis iDrive source buckets.
- All current Supabase Storage objects listed in the database snapshot.
- The committed application source, migrations, and these instructions.

Backups do **not** include external provider accounts/settings, Vercel/Supabase/
GitHub environment secrets, database-role passwords, remotely hosted poster
images, or historical versions of source files. Keep these recovery credentials
in a separate password manager. SecureIt encrypted records still need their
original unlock credentials. A file backup spans an interval; pause application
writes if exact alignment between database rows and file bytes is required.

The worker fails instead of silently skipping inaccessible tables/files. It
marks a backup complete only after dumping the database, checking the archive
inventory, copying the files, checking uploads, and writing `_complete.json`.
This is not a restore rehearsal. Rehearse a restore in an isolated environment
before relying on the backup for production recovery.

## One-time setup

1. Apply `202610200003_centralis_backups.sql`. It creates only new backup
   control-plane tables and an administrator RPC.
2. Deploy the updated `browse-storage` and `get-storage-object-url` Supabase
   functions **before creating the backup bucket**. They exclude backup archives
   from ordinary application storage browsing/downloads. Use credentials scoped
   only to application source buckets for those functions when possible.
3. In this repository, create the GitHub Actions environment
   **centralis-backups**. For unattended daily operation, do not require a human
   reviewer on every run. Add these environment secrets:

   | Secret | Value |
   | --- | --- |
   | `BACKUP_DATABASE_URL` | Supabase direct or **session-mode** pooler PostgreSQL connection string, with sufficient privileges to dump the whole database. Require SSL. Do not use the transaction-mode pooler. |
   | `IDRIVE_E2_ENDPOINT` | HTTPS endpoint for the existing Centralis iDrive account/region. |
   | `IDRIVE_E2_REGION` | Region, usually `us-east-1` for this S3-compatible endpoint. |
   | `IDRIVE_E2_ACCESS_KEY_ID` | Worker access key: read/list source buckets; create/read/write/delete only the backup destination. |
   | `IDRIVE_E2_SECRET_ACCESS_KEY` | Matching worker secret key. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Used only by the worker to read all private Supabase Storage files. Never put it in frontend code. |

   Optional environment variables: `IDRIVE_SOURCE_BUCKETS` (comma-separated;
   defaults to `centralis`) and `SUPABASE_URL` (defaults to the existing project).
   Include **every bucket used for Centralis uploads**. The destination must
   never be listed as a source.

4. For the app's **Back up now** button, create a fine-grained GitHub token
   limited to this repository with Actions read/write permission. Set
   `GITHUB_BACKUP_TOKEN` in the Vercel server environment. The existing
   `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`) must
   also be present. Do not paste credentials into chat, commits, or browser
   settings. Redeploy Vercel after changing environment variables.
5. Merge the workflow to the default branch, enable GitHub Actions, and run
   **Centralis backup** once manually from the Actions page. The worker creates
   the destination with a private ACL if absent and rejects public ACLs/policies.
   At or after 3 AM Eastern, it also performs the first daily backup. Before
   that time it checks in; use Back up now after the check-in to request a copy.
6. Confirm a `completed` run in Settings → Backups, a matching `_complete.json`
   in iDrive, and perform the recovery rehearsal below. Check GitHub billing and
   iDrive capacity: these are full daily copies, including file contents.

If setup is incomplete, the app displays **Setup needed**. A green recent worker
check means the worker connected, not that a backup succeeded; inspect the
latest completed run. Failed workflows also use GitHub's normal notifications.
Scheduled workflows can be delayed or disabled by GitHub inactivity rules;
the app identifies a stale worker after three days.

Retention defaults to 30 days. Only recorded backup prefixes older than the
retention window are deleted, and only after a fresh backup completes. Source
buckets are never deleted or modified. Failed partial copies are also eligible
for cleanup after this interval. Pausing the daily schedule preserves existing
copies and allows manual backups.

## Recovery rehearsal

Do not restore over production as a test.

1. Choose a completed run. Download its prefix to a private machine using your
   iDrive administrative tools. Confirm `_complete.json` is present. Verify
   archive SHA-256 values against the `archives` entries and file mappings in
   `files.ndjson`. Backups may contain private personal data and auth records.
2. Read `database-contents.txt`. Create an isolated PostgreSQL/Supabase instance
   matching `postgres_major`, with required extensions. Use `pg_restore --list
   database.dump` to inspect the dump. For a fresh disposable PostgreSQL target,
   restore required roles and then run `pg_restore --no-owner --no-acl
   --exit-on-error --dbname TARGET database.dump`.
3. A hosted Supabase project already owns managed schemas and roles. Do not
   blindly restore the entire dump into it. Follow Supabase's restore guide,
   use `pg_restore --use-list` to select application objects and the appropriate
   managed-schema **data**, and resolve platform-owned object conflicts in the
   isolated target. Do not ignore restore errors.
4. Use each line of `files.ndjson` to map the backed-up key to its original
   `bucket` and `name`. Restore files into **test** buckets first. Verify sizes
   and SHA-256 values where recorded. iDrive server-side copies also record
   source/destination ETags; multipart ETags are not plain SHA-256 checksums.
5. Restore application configuration from your password manager and source from
   `application.tar.gz`/GitHub. Set test credentials and verify sign-in, record
   counts, foreign keys, sequences, custom movie values, uploaded images,
   source documents, and representative records from every Centralis module.
6. Record the rehearsal result and recovery time outside the backed-up database.
   Production recovery needs a separately authorized maintenance window.

References: [Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[Supabase backup coverage](https://supabase.com/docs/guides/platform/backups),
[iDrive object copy](https://www.idrive.com/s3-storage-e2/guides/copy_object).
