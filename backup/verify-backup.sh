#!/bin/sh
set -eu

backup_id="${1:-}"
backup_root="${BACKUP_ROOT:-/backups}"

[ -n "$backup_id" ] || { echo "Usage: verify-backup <backup-id>" >&2; exit 64; }

checksum_file="$backup_root/status/$backup_id.SHA256SUMS"
database_file="$backup_root/database/$backup_id.dump"
workspace_file="$backup_root/workspace/$backup_id.tar.gz"
attachments_file="$backup_root/attachments/$backup_id.tar.gz"

for file in "$checksum_file" "$database_file" "$workspace_file" "$attachments_file"; do
  [ -r "$file" ] || { echo "Missing backup file: $file" >&2; exit 1; }
done

echo "Verifying checksums for $backup_id"
(cd "$backup_root" && sha256sum -c "status/$backup_id.SHA256SUMS")
echo "Verifying workspace archive"
tar -tzf "$workspace_file" >/dev/null
echo "Verifying attachment archive"
tar -tzf "$attachments_file" >/dev/null
echo "Verifying PostgreSQL dump format"
pg_restore --list "$database_file" >/dev/null
echo "Backup $backup_id passed integrity verification."
