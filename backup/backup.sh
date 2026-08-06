#!/bin/sh
set -eu

backup_root=/backups
staging_root=/tmp/rocket-workspace-backup
default_interval_hours="${BACKUP_INTERVAL_HOURS:-24}"
default_retention_days="${BACKUP_RETENTION_DAYS:-14}"

load_settings() {
  interval_hours="$default_interval_hours"
  retention_days="$default_retention_days"
  if [ -r /source/workspace/.rocket-workspace-settings.env ]; then
    while IFS='=' read -r key value; do
      case "$key" in BACKUP_INTERVAL_HOURS) interval_hours="$value" ;; BACKUP_RETENTION_DAYS) retention_days="$value" ;; esac
    done < /source/workspace/.rocket-workspace-settings.env
  fi
  case "$interval_hours" in ''|*[!0-9]*) echo "BACKUP_INTERVAL_HOURS must be a whole number." >&2; return 1 ;; esac
  case "$retention_days" in ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS must be a whole number." >&2; return 1 ;; esac
  [ "$interval_hours" -gt 0 ] || { echo "BACKUP_INTERVAL_HOURS must be greater than zero." >&2; return 1; }
}

mkdir -p "$backup_root/database" "$backup_root/workspace" "$backup_root/attachments" "$backup_root/status"

backup_once() {
  backup_id="$(date -u +%Y%m%dT%H%M%SZ)"
  stage="$staging_root/$backup_id"
  rm -rf "$stage"
  mkdir -p "$stage/attachments"

  echo "[$(date -u +%FT%TZ)] Starting backup $backup_id"
  PGPASSWORD="$PGPASSWORD" pg_dump --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$PGDATABASE" --format=custom --no-owner --no-acl --file="$stage/database.dump"

  tar -C /source/workspace -czf "$stage/workspace.tar.gz" .

  mc alias set local "http://$MINIO_ENDPOINT:$MINIO_PORT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
  mc mirror --overwrite "local/$MINIO_BUCKET" "$stage/attachments" >/dev/null
  tar -C "$stage" -czf "$stage/attachments.tar.gz" attachments
  rm -rf "$stage/attachments"

  {
    echo "backup_id=$backup_id"
    echo "created_at=$(date -u +%FT%TZ)"
    echo "database=$backup_id.dump"
    echo "workspace=$backup_id.tar.gz"
    echo "attachments=$backup_id.tar.gz"
    echo "retention_days=$retention_days"
  } > "$stage/manifest.txt"

  mv "$stage/database.dump" "$backup_root/database/$backup_id.dump"
  mv "$stage/workspace.tar.gz" "$backup_root/workspace/$backup_id.tar.gz"
  mv "$stage/attachments.tar.gz" "$backup_root/attachments/$backup_id.tar.gz"
  (cd "$backup_root" && sha256sum "database/$backup_id.dump" "workspace/$backup_id.tar.gz" "attachments/$backup_id.tar.gz") > "$backup_root/status/$backup_id.SHA256SUMS"
  mv "$stage/manifest.txt" "$backup_root/status/$backup_id.manifest.txt"
  printf '%s\n' "$backup_id" > "$backup_root/status/last-success.txt"
  find "$backup_root" -type f -mtime "+$retention_days" ! -name '.gitkeep' -delete
  rm -rf "$stage"
  echo "[$(date -u +%FT%TZ)] Finished backup $backup_id"
}

wait_for_next_backup() {
  elapsed_seconds=0
  while [ "$elapsed_seconds" -lt "$((interval_hours * 3600))" ]; do
    sleep 60
    elapsed_seconds=$((elapsed_seconds + 60))
    if ! load_settings; then
      interval_hours=24
      retention_days=14
      printf '%s\n' "$(date -u +%FT%TZ) backup settings are invalid" > "$backup_root/status/last-failure.txt"
    fi
  done
}

while true; do
  if ! load_settings; then
    interval_hours=24
    retention_days=14
    printf '%s\n' "$(date -u +%FT%TZ) backup settings are invalid" > "$backup_root/status/last-failure.txt"
    echo "[$(date -u +%FT%TZ)] Backup settings are invalid; retrying with safe defaults." >&2
  elif ! backup_once; then
    printf '%s\n' "$(date -u +%FT%TZ) backup failed" > "$backup_root/status/last-failure.txt"
    echo "[$(date -u +%FT%TZ)] Backup failed; retrying at the next interval." >&2
  else
    rm -f "$backup_root/status/last-failure.txt"
  fi
  wait_for_next_backup
done
