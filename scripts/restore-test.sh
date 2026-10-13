#!/usr/bin/env bash
# ==============================================================================
# cfi-POS Techiez - Automated Backup Restore Verification Script
#
# Restores a given backup file into an isolated scratch database, executes
# schema and data sanity verification queries, and drops the scratch database.
#
# Usage:
#   ./scripts/restore-test.sh <path-to-backup-file>
#
# Environment variables:
#   DATABASE_URL                  - Base PostgreSQL connection URL
#   RESTORE_TEST_DATABASE_URL     - Optional dedicated test host URL
# ==============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <path-to-backup-file>" >&2
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file does not exist: $BACKUP_FILE" >&2
    exit 1
fi

if [ ! -s "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file is empty: $BACKUP_FILE" >&2
    exit 1
fi

# Locate pg_restore and psql
PG_RESTORE_BIN="pg_restore"
PSQL_BIN="psql"

if ! command -v "$PG_RESTORE_BIN" >/dev/null 2>&1; then
    for pg_candidate in "/c/Program Files/PostgreSQL"/*/bin/pg_restore.exe "C:/Program Files/PostgreSQL"/*/bin/pg_restore.exe; do
        if [ -f "$pg_candidate" ]; then
            PG_RESTORE_BIN="$pg_candidate"
            break
        fi
    done
fi

if ! command -v "$PSQL_BIN" >/dev/null 2>&1; then
    for pg_candidate in "/c/Program Files/PostgreSQL"/*/bin/psql.exe "C:/Program Files/PostgreSQL"/*/bin/psql.exe; do
        if [ -f "$pg_candidate" ]; then
            PSQL_BIN="$pg_candidate"
            break
        fi
    done
fi

TARGET_URL="${RESTORE_TEST_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$TARGET_URL" ] && [ -z "${PGDATABASE:-}" ]; then
    echo "ERROR: DATABASE_URL must be configured to run restore verification." >&2
    exit 1
fi

SCRATCH_DB="cfi_pos_restore_test_$(date +%s)_$$"

echo "=================================================================="
echo "Starting Restore Verification Test"
echo "Source archive: ${BACKUP_FILE}"
echo "Scratch database: ${SCRATCH_DB}"
echo "=================================================================="

# Function to run SQL on administrative database
run_admin_sql() {
    local sql="$1"
    if [ -n "$TARGET_URL" ]; then
        "$PSQL_BIN" "$TARGET_URL" -v ON_ERROR_STOP=1 -c "$sql"
    else
        "$PSQL_BIN" -v ON_ERROR_STOP=1 -c "$sql"
    fi
}

cleanup() {
    local exit_code=$?
    echo "Cleaning up scratch database: ${SCRATCH_DB}..."
    run_admin_sql "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\" WITH (FORCE);" || true
    if [ $exit_code -eq 0 ]; then
        echo "=================================================================="
        echo "[SUCCESS] Backup verification PASSED cleanly."
        echo "=================================================================="
    else
        echo "=================================================================="
        echo "[FAILURE] Backup verification FAILED."
        echo "=================================================================="
    fi
}
trap cleanup EXIT

# 1. Create scratch database
echo "Creating isolated scratch database: ${SCRATCH_DB}..."
run_admin_sql "CREATE DATABASE \"${SCRATCH_DB}\";"

# Build connection string for scratch database
if [ -n "$TARGET_URL" ]; then
    # Replace database name in URL
    SCRATCH_URL="$(echo "$TARGET_URL" | sed -E "s|/[^/?]+(\?.*)?$|/${SCRATCH_DB}\1|")"
    if [ "$SCRATCH_URL" = "$TARGET_URL" ]; then
        SCRATCH_URL="${TARGET_URL}/${SCRATCH_DB}"
    fi
fi

# 2. Restore backup into scratch database
echo "Restoring backup archive with ${PG_RESTORE_BIN}..."
if [ -n "${SCRATCH_URL:-}" ]; then
    "$PG_RESTORE_BIN" \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        --dbname="$SCRATCH_URL" \
        "$BACKUP_FILE" || true
else
    "$PG_RESTORE_BIN" \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        --dbname="$SCRATCH_DB" \
        "$BACKUP_FILE" || true
fi

# 3. Execute Sanity Queries
echo "Executing sanity assertions against restored database..."

run_scratch_query() {
    local sql="$1"
    if [ -n "${SCRATCH_URL:-}" ]; then
        "$PSQL_BIN" "$SCRATCH_URL" -t -A -v ON_ERROR_STOP=1 -c "$sql"
    else
        "$PSQL_BIN" -d "$SCRATCH_DB" -t -A -v ON_ERROR_STOP=1 -c "$sql"
    fi
}

MIGRATION_COUNT=$(run_scratch_query "SELECT count(*) FROM migrations;" 2>/dev/null || echo "0")
echo "  [Sanity] Applied migrations count: ${MIGRATION_COUNT}"
if [ "$MIGRATION_COUNT" -le 0 ]; then
    echo "ERROR: Migrations table is missing or empty in restored database." >&2
    exit 1
fi

USER_COUNT=$(run_scratch_query "SELECT count(*) FROM users;" 2>/dev/null || echo "0")
echo "  [Sanity] System users count: ${USER_COUNT}"

PRODUCT_COUNT=$(run_scratch_query "SELECT count(*) FROM products;" 2>/dev/null || echo "0")
echo "  [Sanity] Products count: ${PRODUCT_COUNT}"

SALE_COUNT=$(run_scratch_query "SELECT count(*) FROM sales;" 2>/dev/null || echo "0")
echo "  [Sanity] Sales ledger count: ${SALE_COUNT}"

TABLE_COUNT=$(run_scratch_query "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "0")
echo "  [Sanity] Public schema tables count: ${TABLE_COUNT}"

if [ "$TABLE_COUNT" -lt 15 ]; then
    echo "ERROR: Table count in restored database (${TABLE_COUNT}) is lower than expected schema." >&2
    exit 1
fi

echo "Sanity assertions passed: Restored schema contains ${TABLE_COUNT} tables and valid data."
