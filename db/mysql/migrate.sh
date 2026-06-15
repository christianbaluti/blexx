#!/usr/bin/env bash
# Run all MySQL migrations and seeds in order.
# Usage:
#   DB_HOST=localhost DB_USER=root DB_PASS=secret ./migrate.sh
#
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"
DB_NAME="${DB_NAME:-moderntech}"

run() {
  echo "==> $1"
  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" ${DB_PASS:+-p"$DB_PASS"} < "$1"
}

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Order matters: schema -> seed -> views -> procedures -> triggers
for f in "$DIR"/schema/*.sql;     do run "$f"; done
for f in "$DIR"/seed/*.sql;       do run "$f"; done
for f in "$DIR"/views/*.sql;      do run "$f"; done
for f in "$DIR"/procedures/*.sql; do run "$f"; done
for f in "$DIR"/triggers/*.sql;   do run "$f"; done

echo "Done. Database '$DB_NAME' is ready."
