#!/usr/bin/env bash
# Daily MySQL Backup & Restore Verification Script (Spec §9.1, §13.3 NFR-09)
set -euo pipefail

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"
DB_NAME="${DB_NAME:-vaultra}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/vaultra-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${BACKUP_DIR}/${DB_NAME}-${STAMP}.sql.gz"
VERIFY_DB="${DB_NAME}_verify_${STAMP}"

mkdir -p "${BACKUP_DIR}"
MYSQL_PWD_ARGS=()
if [[ -n "${DB_PASS}" ]]; then
  export MYSQL_PWD="${DB_PASS}"
fi

echo "[1/5] Dumping database ${DB_NAME} -> ${OUT_FILE}..."
mysqldump --single-transaction --routines --triggers \
  -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "${DB_NAME}" | gzip -9 > "${OUT_FILE}"

SHA256="$(sha256sum "${OUT_FILE}" | awk '{print $1}')"
echo "${SHA256}  $(basename "${OUT_FILE}")" > "${OUT_FILE}.sha256"
echo "[2/5] Backup SHA-256: ${SHA256}"

echo "[3/5] Verifying backup by restoring into temporary database ${VERIFY_DB}..."
mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -e "CREATE DATABASE \`${VERIFY_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
trap 'mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -e "DROP DATABASE IF EXISTS \`${VERIFY_DB}\`;"' EXIT
gunzip -c "${OUT_FILE}" | mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "${VERIFY_DB}"

TABLE_COUNT="$(mysql -N -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "${VERIFY_DB}" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${VERIFY_DB}';")"
if [[ "${TABLE_COUNT}" -lt 50 ]]; then
  echo "ERROR: Restore verification failed — expected >=50 tables, found ${TABLE_COUNT}" >&2
  exit 1
fi
echo "[4/5] Restore verification succeeded (${TABLE_COUNT} tables verified)."

if [[ -n "${R2_BUCKET_URI:-}" ]]; then
  echo "[5/5] Uploading backup to R2 (${R2_BUCKET_URI}) and pruning local backups > ${RETENTION_DAYS} days..."
  aws s3 cp "${OUT_FILE}" "${R2_BUCKET_URI}/" --endpoint-url "${R2_ENDPOINT_URL}"
  aws s3 cp "${OUT_FILE}.sha256" "${R2_BUCKET_URI}/" --endpoint-url "${R2_ENDPOINT_URL}"
else
  echo "[5/5] Pruning local backups older than ${RETENTION_DAYS} days..."
fi

find "${BACKUP_DIR}" -name "${DB_NAME}-*.sql.gz*" -mtime +"${RETENTION_DAYS}" -delete
echo "Backup & verify complete."

