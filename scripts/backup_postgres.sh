#!/usr/bin/env bash
# ==============================================================================
# CRMS Production PostgreSQL Automated Backup Script
# APRA Prudential Standard APS 220 & Privacy Act 1988 Compliance
# ==============================================================================

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
POSTGRES_USER="${POSTGRES_USER:-crms_user}"
POSTGRES_DB="${POSTGRES_DB:-credit_system}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
BACKUP_FILE="${BACKUP_DIR}/crms_backup_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=30

mkdir -p "${BACKUP_DIR}"

echo "[CRMS BACKUP] Starting PostgreSQL database backup for '${POSTGRES_DB}' at $(date -u)..."

# Perform pg_dump with gzip compression
PGPASSWORD="${POSTGRES_PASSWORD:-crms_secure_pass_2026}" pg_dump \
  -h "${POSTGRES_HOST}" \
  -p "${POSTGRES_PORT}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --format=plain \
  --no-owner \
  --no-privileges | gzip > "${BACKUP_FILE}"

FILESIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[CRMS BACKUP] Backup successfully created: ${BACKUP_FILE} (Size: ${FILESIZE})"

# Enforce 30-day retention policy: purge archives older than 30 days
echo "[CRMS BACKUP] Purging backup files older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "crms_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "[CRMS BACKUP] Backup and retention cycle completed successfully."
