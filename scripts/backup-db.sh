#!/usr/bin/env bash
# Safe SQLite backup for HERO Sidekick.
# Uses SQLite's online backup API (.backup) — consistent even while the app is
# running in WAL mode. Verifies the backup copy (not the live file), keeps 14
# days of daily snapshots, and fails loudly so cron can alert.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${DATABASE_PATH:-$ROOT_DIR/db/custom.db}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/db/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/custom.db.$STAMP"

mkdir -p "$BACKUP_DIR"

# Consistent online backup.
sqlite3 "$DB_PATH" ".timeout 10000" ".backup '$DEST'"

# Verify the backup copy itself.
CHECK="$(sqlite3 "$DEST" "PRAGMA integrity_check;" 2>&1 || true)"
if [ "$CHECK" != "ok" ]; then
  printf 'backup integrity check failed for %s: %s\n' "$DEST" "$CHECK" >&2
  rm -f "$DEST"
  exit 1
fi

SIZE="$(stat -c%s "$DEST")"
if [ "$SIZE" -lt 4096 ]; then
  printf 'backup suspiciously small (%s bytes): %s\n' "$SIZE" "$DEST" >&2
  rm -f "$DEST"
  exit 1
fi

chmod 600 "$DEST"
find "$BACKUP_DIR" -type f -name 'custom.db.*' -mtime +14 -delete
printf 'database backup created: %s (%s bytes)\n' "$DEST" "$SIZE"
