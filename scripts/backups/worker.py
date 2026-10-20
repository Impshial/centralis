"""Centralis backup worker. Credentials stay in the runner's environment.

All writes target new backup tables and the dedicated backup bucket.
No application tables, source files, or source storage settings are changed.
"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import quote
from zoneinfo import ZoneInfo

import boto3
from botocore.exceptions import ClientError
import psycopg
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row
import requests

DESTINATION = "centralis-backups"
ROOT = "centralis/v1/"
EASTERN = ZoneInfo("America/New_York")
UTC = dt.timezone.utc


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing runner secret: {name}")
    return value


def daily_due(now, enabled, latest):
    local = now.astimezone(EASTERN)
    return enabled and local.hour >= 3 and (
        latest is None or latest.astimezone(EASTERN).date() < local.date()
    )


def safe_prefix(value):
    # Retention can delete only prefixes created by this worker, never source data.
    import re
    return bool(re.fullmatch(r"centralis/v1/\d{4}-\d{2}-\d{2}/[a-f0-9-]{36}/", value or ""))


def check_private_bucket(s3):
    try:
        s3.head_bucket(Bucket=DESTINATION)
    except ClientError as error:
        if str(error.response["Error"]["Code"]) not in ("404", "NoSuchBucket", "NotFound"):
            raise
        s3.create_bucket(Bucket=DESTINATION, ACL="private")
    def has_public_grant(acl):
        public_groups = {
            f"{scheme}://acs.amazonaws.com/groups/global/{group}"
            for scheme in ("http", "https")
            for group in ("AllUsers", "AuthenticatedUsers")
        }
        return any(item.get("Grantee", {}).get("URI") in public_groups
                   for item in acl.get("Grants", []))

    if has_public_grant(s3.get_bucket_acl(Bucket=DESTINATION)):
        try:
            s3.put_bucket_acl(Bucket=DESTINATION, ACL="private")
        except ClientError as error:
            raise RuntimeError(
                "Cannot make centralis-backups private. Allow this backup key to "
                "update the destination bucket ACL, or set that bucket's ACL to private."
            ) from error
        if has_public_grant(s3.get_bucket_acl(Bucket=DESTINATION)):
            raise RuntimeError("centralis-backups still grants public access after setting its ACL to private.")
    try:
        policy = json.loads(s3.get_bucket_policy(Bucket=DESTINATION)["Policy"])
        for statement in policy.get("Statement", []):
            if statement.get("Effect") == "Allow" and "*" in json.dumps(statement.get("Principal")):
                raise RuntimeError("The backup bucket policy must not grant public access.")
    except ClientError as error:
        if error.response["Error"]["Code"] not in ("NoSuchBucketPolicy", "NoSuchPolicy"):
            raise


def file_hash(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def upload_verified(s3, path, key):
    digest = file_hash(path)
    size = Path(path).stat().st_size
    s3.upload_file(str(path), DESTINATION, key,
                   ExtraArgs={"ACL": "private", "Metadata": {"sha256": digest}})
    head = s3.head_object(Bucket=DESTINATION, Key=key)
    if head["ContentLength"] != size or head.get("Metadata", {}).get("sha256") != digest:
        raise RuntimeError("Backup upload verification failed.")
    downloaded = hashlib.sha256()
    body = s3.get_object(Bucket=DESTINATION, Key=key)["Body"]
    try:
        for chunk in iter(lambda: body.read(1024 * 1024), b""):
            downloaded.update(chunk)
    finally:
        body.close()
    if downloaded.hexdigest() != digest:
        raise RuntimeError("Backup archive checksum verification failed.")
    return {"key": key, "bytes": size, "sha256": digest}


def postgres_command(db_url, version, folder, program, args):
    connection = conninfo_to_dict(db_url)
    env = os.environ.copy()
    names = {"host": "PGHOST", "port": "PGPORT", "user": "PGUSER", "password": "PGPASSWORD",
             "dbname": "PGDATABASE", "sslmode": "PGSSLMODE", "options": "PGOPTIONS"}
    command = ["docker", "run", "--rm", "--network", "host",
               "-v", f"{folder}:/backup"]
    for key, name in names.items():
        if key in connection:
            env[name] = connection[key]
            command += ["-e", name]
    env.setdefault("PGSSLMODE", "require")
    if "sslmode" not in connection:
        command += ["-e", "PGSSLMODE"]
    command += [f"postgres:{version}", program, *args]
    result = subprocess.run(command, env=env, capture_output=True, timeout=3600)
    if result.returncode:
        # Never log connection strings, private row data, or command stderr.
        raise RuntimeError(f"{program} failed; verify database permissions and connectivity.")
    return result.stdout


def database_snapshot(db_url, folder):
    with psycopg.connect(db_url, row_factory=dict_row) as db:
        db.execute("set transaction isolation level repeatable read, read only")
        snapshot = db.execute("select pg_export_snapshot() as id").fetchone()["id"]
        version = int(db.execute("show server_version_num").fetchone()["server_version_num"]) // 10000
        if version not in range(14, 19):
            raise RuntimeError("This PostgreSQL version needs a matching backup client.")
        tables = db.execute("""
          select schemaname,tablename from pg_tables
          where schemaname not in ('pg_catalog','information_schema')
          order by schemaname,tablename
        """).fetchall()
        objects = db.execute("select bucket_id,name,metadata from storage.objects order by bucket_id,name").fetchall()
        postgres_command(db_url, version, folder, "pg_dump", [
            "--format=custom", "--no-owner", "--no-acl", "--snapshot", snapshot,
            "--file=/backup/database.dump",
        ])
        listing = postgres_command(db_url, version, folder, "pg_restore", ["--list", "/backup/database.dump"])
        if b"TABLE DATA" not in listing:
            raise RuntimeError("The database archive contains no table data.")
        (folder / "database-contents.txt").write_bytes(listing)
        postgres_command(db_url, version, folder, "pg_dumpall", [
            "--roles-only", "--no-role-passwords", "--file=/backup/roles.sql",
        ])
    return {"postgres_major": version, "tables": tables}, objects


def copy_idrive(s3, sources, prefix, manifest):
    count = total = 0
    for bucket in sources:
        if bucket == DESTINATION:
            raise RuntimeError("The backup destination cannot be a source bucket.")
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
            for obj in page.get("Contents", []):
                source_key = obj["Key"]
                # Hashed destination names avoid key length and path collisions.
                key = prefix + "files/idrive/" + hashlib.sha256(
                    (bucket + "\0" + source_key).encode()).hexdigest()
                # Managed copy handles objects over 5 GB via multipart copy.
                s3.copy({"Bucket": bucket, "Key": source_key}, DESTINATION, key,
                        ExtraArgs={"ACL": "private", "CopySourceIfMatch": obj["ETag"]})
                head = s3.head_object(Bucket=DESTINATION, Key=key)
                if head["ContentLength"] != obj["Size"]:
                    raise RuntimeError("An iDrive file copy failed verification.")
                manifest.write(json.dumps({"source": "idrive", "bucket": bucket,
                    "name": source_key, "key": key, "bytes": obj["Size"],
                    "source_etag": obj["ETag"], "backup_etag": head["ETag"]}) + "\n")
                count += 1
                total += obj["Size"]
    return count, total


def copy_supabase(s3, objects, prefix, folder, manifest):
    count = total = 0
    if not objects:
        return count, total
    base = required("SUPABASE_URL").rstrip("/")
    token = required("SUPABASE_SERVICE_ROLE_KEY")
    for obj in objects:
        url = f"{base}/storage/v1/object/authenticated/{quote(obj['bucket_id'], safe='')}/{quote(obj['name'], safe='/')}"
        path = folder / "storage-object.tmp"
        with requests.get(url, headers={"apikey": token, "Authorization": f"Bearer {token}"},
                          stream=True, timeout=(30, 300)) as response:
            if response.status_code != 200:
                raise RuntimeError("A Supabase Storage file could not be read; backup is incomplete.")
            with path.open("wb") as stream:
                for chunk in response.iter_content(1024 * 1024):
                    stream.write(chunk)
        expected = (obj.get("metadata") or {}).get("size")
        if expected is not None and path.stat().st_size != int(expected):
            raise RuntimeError("A Storage file changed during backup; retry the run.")
        key = prefix + "files/supabase/" + hashlib.sha256(
            (obj["bucket_id"] + "\0" + obj["name"]).encode()).hexdigest()
        result = upload_verified(s3, path, key)
        manifest.write(json.dumps({"source": "supabase", "bucket": obj["bucket_id"],
            "name": obj["name"], **result}) + "\n")
        path.unlink()
        count += 1
        total += result["bytes"]
    return count, total


def apply_retention(db, s3, days, current_id):
    # Do not remove any old backup unless a new complete backup exists.
    rows = db.execute("""
      select id,backup_prefix from public.centralis_backup_runs
      where id<>%s and status in ('completed','failed')
        and requested_at < now() - make_interval(days => %s)
        and backup_prefix is not null
    """, (current_id, days)).fetchall()
    for row in rows:
        prefix = row["backup_prefix"]
        if not safe_prefix(prefix):
            raise RuntimeError("Retention rejected an unexpected backup path.")
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=DESTINATION, Prefix=prefix):
            objects = [{"Key": item["Key"]} for item in page.get("Contents", [])]
            if objects:
                result = s3.delete_objects(Bucket=DESTINATION, Delete={"Objects": objects, "Quiet": True})
                if result.get("Errors"):
                    raise RuntimeError("An old backup could not be fully removed.")
        db.execute("update public.centralis_backup_runs set status='expired' where id=%s", (row["id"],))


def run():
    db_url = required("BACKUP_DATABASE_URL")
    endpoint = required("IDRIVE_E2_ENDPOINT")
    if not endpoint.startswith("https://"):
        raise RuntimeError("Use an HTTPS iDrive endpoint.")
    sources = [s.strip() for s in os.environ.get("IDRIVE_SOURCE_BUCKETS", "centralis").split(",") if s.strip()]
    if not sources or DESTINATION in sources:
        raise RuntimeError("Configure source buckets separately from the backup bucket.")
    s3 = boto3.client("s3", endpoint_url=endpoint,
        region_name=os.environ.get("IDRIVE_E2_REGION") or "us-east-1",
        aws_access_key_id=required("IDRIVE_E2_ACCESS_KEY_ID"),
        aws_secret_access_key=required("IDRIVE_E2_SECRET_ACCESS_KEY"),
        config=boto3.session.Config(request_checksum_calculation="when_required",
                                    response_checksum_validation="when_required"))
    check_private_bucket(s3)
    with psycopg.connect(db_url, autocommit=True, row_factory=dict_row) as db:
        if not db.execute("select pg_try_advisory_lock(71021,1) as locked").fetchone()["locked"]:
            print("Another backup worker is active.")
            return
        with db.transaction():
            settings = db.execute("""
              update public.centralis_backup_settings set last_worker_check=now()
              where id returning *
            """).fetchone()
            # No other worker can hold the lock now. A leftover running row represents a crashed run.
            db.execute("""update public.centralis_backup_runs set status='failed',finished_at=now(),
              error='The previous worker stopped before completing the backup.' where status='running'""")
            job = db.execute("select * from public.centralis_backup_runs where status='queued' order by requested_at limit 1").fetchone()
            latest = db.execute("select max(finished_at) as at from public.centralis_backup_runs where status='completed'").fetchone()["at"]
            if not job and daily_due(dt.datetime.now(UTC), settings["enabled"], latest):
                job = db.execute("insert into public.centralis_backup_runs(source) values('daily') returning *").fetchone()
            if not job:
                print("Worker checked in. No backup is due.")
                return
            run_id = job["id"]
            prefix = ROOT + dt.datetime.now(UTC).date().isoformat() + "/" + str(run_id) + "/"
            workflow_url = f"https://github.com/{os.environ.get('GITHUB_REPOSITORY','Impshial/centralis')}/actions/runs/{os.environ.get('GITHUB_RUN_ID','')}"
            db.execute("""update public.centralis_backup_runs set status='running',started_at=now(),
              backup_prefix=%s,workflow_url=%s,error=null where id=%s""", (prefix, workflow_url, run_id))
        try:
            with tempfile.TemporaryDirectory(prefix="centralis-backup-") as temporary:
                folder = Path(temporary)
                database, objects = database_snapshot(db_url, folder)
                # Include the committed application code and recovery documentation.
                result = subprocess.run(["git", "archive", "--format=tar.gz", f"--output={folder / 'application.tar.gz'}", "HEAD"],
                                        capture_output=True, timeout=120)
                if result.returncode:
                    raise RuntimeError("Could not archive the application source.")
                records = [upload_verified(s3, folder / name, prefix + name) for name in (
                    "database.dump", "database-contents.txt", "roles.sql", "application.tar.gz")]
                with (folder / "files.ndjson").open("w", encoding="utf8") as manifest:
                    n1, b1 = copy_idrive(s3, sources, prefix, manifest)
                    n2, b2 = copy_supabase(s3, objects, prefix, folder, manifest)
                records.append(upload_verified(s3, folder / "files.ndjson", prefix + "files.ndjson"))
                complete = {"format": "centralis.backup.v1", "completed_at": dt.datetime.now(UTC).isoformat(),
                    "database": database, "archives": records, "idrive_buckets": sources,
                    "file_count": n1 + n2, "total_bytes": b1 + b2 + sum(r["bytes"] for r in records),
                    "commit": os.environ.get("GITHUB_SHA"), "restore_guide": "scripts/backups/README.md",
                    "limitations": ["File copies span the backup window; pause writes for exact database/file alignment.",
                        "External provider settings, hosting secrets, database-role passwords, and remote poster URLs are not archived.",
                        "A successful copy is not a restore rehearsal. Restore to an isolated project before production recovery."]}
                marker = folder / "_complete.json"
                marker.write_text(json.dumps(complete, indent=2), encoding="utf8")
                upload_verified(s3, marker, prefix + "_complete.json")
            db.execute("""update public.centralis_backup_runs set status='completed',finished_at=now(),
              file_count=%s,total_bytes=%s where id=%s""", (complete["file_count"], complete["total_bytes"], run_id))
            try:
                apply_retention(db, s3, settings["retention_days"], run_id)
            except Exception:
                db.execute("update public.centralis_backup_runs set retention_warning=%s where id=%s",
                           ("Backup completed; some older copies could not be removed.", run_id))
            print(f"Backup completed: {complete['file_count']} files, {complete['total_bytes']} bytes.")
        except Exception as error:
            # Avoid persisting exception text containing credentials, URLs, or private data.
            safe = str(error) if isinstance(error, RuntimeError) else f"{type(error).__name__}: backup failed; check runner configuration and permissions."
            db.execute("update public.centralis_backup_runs set status='failed',finished_at=now(),error=%s where id=%s",
                       (safe[:500], run_id))
            raise RuntimeError(safe) from None


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else f"{type(error).__name__}: backup could not start.")
        raise SystemExit(1)
