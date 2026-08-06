#!/bin/sh
set -eu

backup_id="${1:-}"
backup_root="${BACKUP_ROOT:-/backups}"
[ -n "$backup_id" ] || { echo "Usage: restore-drill <backup-id>" >&2; exit 64; }
dump_file="$backup_root/database/$backup_id.dump"
[ -r "$dump_file" ] || { echo "Missing database backup: $dump_file" >&2; exit 1; }

# The drill never touches the running database. It restores into a uniquely
# named temporary database and removes it on every exit path.
suffix="$(date +%s)"
drill_db="${PGDATABASE}_restore_drill_${suffix}"
cleanup() { dropdb --if-exists --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$drill_db" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

echo "Creating isolated restore-drill database: $drill_db"
createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$drill_db"
pg_restore --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$drill_db" --no-owner --no-acl "$dump_file"
psql --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$drill_db" --tuples-only --no-align --command "SELECT 'documents=' || count(*) FROM \"Document\"; SELECT 'projects=' || count(*) FROM \"Project\";"
echo "Restore drill passed. The temporary database will now be removed."
