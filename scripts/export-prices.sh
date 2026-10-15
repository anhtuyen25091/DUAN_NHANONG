#!/usr/bin/env bash
# Xuất dữ liệu giá (danh mục, nguồn giá, giá, nhật ký thu thập, gói xem giá) ra file .sql.gz để nạp vào máy khác.
# Không xuất tài khoản, đơn mua bán, sổ thu chi.
#
#   scripts/export-prices.sh                 # đọc DB_* trong backend/.env
#   scripts/export-prices.sh duong/dan.sql.gz
#
# Nạp vào máy khác (đã chạy `php artisan migrate`):
#   gunzip -c nhanong-gia-….sql.gz | mysql --default-character-set=utf8mb4 -h 127.0.0.1 -u nhanong -p nhanong
set -euo pipefail
cd "$(dirname "$0")/.."

env_value() { grep -E "^$1=" backend/.env | tail -1 | cut -d= -f2- | tr -d '"'; }
DB_HOST=$(env_value DB_HOST); DB_PORT=$(env_value DB_PORT); DB_DATABASE=$(env_value DB_DATABASE)
DB_USERNAME=$(env_value DB_USERNAME); DB_PASSWORD=$(env_value DB_PASSWORD)

MYSQLDUMP=$(command -v mysqldump || true)
# Máy dev dùng DBngin: mysqldump không nằm trong PATH
[ -z "$MYSQLDUMP" ] && MYSQLDUMP=$(ls /Users/Shared/DBngin/mysql/*/bin/mysqldump 2>/dev/null | tail -1)
[ -z "$MYSQLDUMP" ] && { echo "Không tìm thấy mysqldump"; exit 1; }

TABLES="categories products regions price_sources prices unmatched_names crawl_logs plans"
OUT=${1:-exports/nhanong-gia-$(date +%Y%m%d-%H%M).sql.gz}
mkdir -p "$(dirname "$OUT")"

{
  echo "-- Dữ liệu giá Nhà Nông, xuất lúc $(date '+%d/%m/%Y %H:%M'). Bảng: $TABLES"
  echo "SET FOREIGN_KEY_CHECKS=0;"
  MYSQL_PWD="$DB_PASSWORD" "$MYSQLDUMP" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" \
    --single-transaction --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 \
    --add-drop-table "$DB_DATABASE" $TABLES
  echo "SET FOREIGN_KEY_CHECKS=1;"
} | gzip -9 > "$OUT"

echo "Đã xuất: $OUT ($(du -h "$OUT" | cut -f1))"
