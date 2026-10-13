#!/usr/bin/env bash
# ==============================================================================
# cfi-POS Techiez - Automated Database Backup Script
#
# Creates a compressed, timestamped pg_dump backup with retention management
# and optional S3-compatible cloud storage replication.
#
# Usage:
#   ./scripts/backup.sh
#
# Environment variables:
#   DATABASE_URL         - PostgreSQL connection URL (e.g. postgresql://user:pass@host:5432/dbname)
#   BACKUP_DIR           - Local directory to store backups (default: ./backups)
#   BACKUP_PREFIX        - Filename prefix (default: cfi_pos_backup)
#   RETENTION_DAYS       - Days to retain local backups (default: 7)
#   BACKUP_S3_BUCKET     - Optional S3 bucket name (e.g. my-pos-backups)
#   AWS_ENDPOINT_URL     - Optional S3-compatible endpoint (e.g. Cloudflare R2 / MinIO)
# ==============================================================================

set -euo pipefail

# Find pg_dump executable
PG_DUMP_BIN="pg_dump"
if ! command -v "$PG_DUMP_BIN" >/dev/null 2>&1; then
    # Look for Windows PostgreSQL installations if not on default PATH
    for pg_candidate in "/c/Program Files/PostgreSQL"/*/bin/pg_dump.exe "C:/Program Files/PostgreSQL"/*/bin/pg_dump.exe; do
        if [ -f "$pg_candidate" ]; then
            PG_DUMP_BIN="$pg_candidate"
            break
        fi
    done
fi

if ! command -v "$PG_DUMP_BIN" >/dev/null 2>&1 && [ ! -f "$PG_DUMP_BIN" ]; then
    echo "ERROR: pg_dump utility not found on PATH or in standard locations." >&2
    exit 1
fi

if [ -z "${DATABASE_URL:-}" ] && [ -z "${PGDATABASE:-}" ]; then
    echo "ERROR: Neither DATABASE_URL nor PGDATABASE is set. Provide connection details via environment variables." >&2
    exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-cfi_pos_backup}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILENAME="${BACKUP_PREFIX}_${TIMESTAMP}.dump"
BACKUP_FILEPATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

mkdir -p "$BACKUP_DIR"

echo "=================================================================="
echo "Starting PostgreSQL backup: ${BACKUP_FILENAME}"
echo "Target directory: ${BACKUP_DIR}"
echo "=================================================================="

START_TIME=$(date +%s)

if [ -n "${DATABASE_URL:-}" ]; then
    "$PG_DUMP_BIN" \
        --format=custom \
        --compress=9 \
        --no-owner \
        --no-privileges \
        --file="$BACKUP_FILEPATH" \
        "$DATABASE_URL"
else
    "$PG_DUMP_BIN" \
        --format=custom \
        --compress=9 \
        --no-owner \
        --no-privileges \
        --file="$BACKUP_FILEPATH"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [ ! -s "$BACKUP_FILEPATH" ]; then
    echo "ERROR: Backup file ${BACKUP_FILEPATH} was not created or is empty." >&2
    rm -f "$BACKUP_FILEPATH"
    exit 1
fi

BACKUP_SIZE="$(ls -lh "$BACKUP_FILEPATH" | awk '{print $5}')"
echo "Backup completed successfully in ${DURATION}s."
echo "Backup archive: ${BACKUP_FILEPATH} (${BACKUP_SIZE})"

# Retention Policy Enforcement
echo "Enforcing local retention policy (${RETENTION_DAYS} days)..."
if [ "$RETENTION_DAYS" -gt 0 ]; then
    find "$BACKUP_DIR" -type f -name "${BACKUP_PREFIX}_*.dump" -mtime +"$RETENTION_DAYS" -exec rm -v {} \; 2>/dev/null || true
fi

# Optional S3-compatible cloud replication
S3_TARGET="${BACKUP_S3_BUCKET:-${S3_BUCKET:-}}"
if [ -n "$S3_TARGET" ]; then
    echo "Replicating backup to S3 bucket: ${S3_TARGET}..."
    if command -v aws >/dev/null 2>&1; then
        AWS_ARGS=()
        if [ -n "${AWS_ENDPOINT_URL:-}" ]; then
            AWS_ARGS+=(--endpoint-url "$AWS_ENDPOINT_URL")
        fi
        aws s3 cp "$BACKUP_FILEPATH" "s3://${S3_TARGET}/${BACKUP_FILENAME}" "${AWS_ARGS[@]}"
        echo "Uploaded ${BACKUP_FILENAME} to s3://${S3_TARGET}/"
    else
        echo "WARNING: S3 bucket specified but aws CLI is not installed. Skipping cloud replication." >&2
    fi
fi

echo "=================================================================="
echo "Backup routine completed successfully."
echo "=================================================================="
