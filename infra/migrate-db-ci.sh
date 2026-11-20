#!/usr/bin/env bash
# Supabase → AlloyDB migration, run inside Cloud Build (infra/cloudbuild-migrate.yaml) so it uses
# Google's network instead of Cloud Shell's. Same steps and safety rules as infra/migrate-db.sh.
#
# SAFETY: Supabase is the live source of truth and is only ever READ.
#   - The only commands sent to Supabase are pg_dump (always a READ ONLY transaction) and
#     SELECT count(*) inside BEGIN READ ONLY ... ROLLBACK (the server rejects any write).
#   - Everything else targets AlloyDB through the local Auth Proxy, database ${DB_NAME} only.
#
# Environment (set by the Cloud Build config): INSTANCE_URI DB_NAME DB_ADMIN_USER MODE
# Secrets (Secret Manager → env): PGPASS AUTH_PW and, unless MODE=from-code, SUPABASE_DB_URL
set -euo pipefail
: "${INSTANCE_URI:?}" "${DB_NAME:?}" "${DB_ADMIN_USER:?}" "${PGPASS:?}" "${AUTH_PW:?}"
MODE="${MODE:-supabase}"
PORT="${PROXY_PORT:-5433}"
PROXY_BIN="${PROXY_BIN:-/workspace/bin/alloydb-auth-proxy}"
WORK="$(mktemp -d)"
log() { printf '\n▶ %s\n' "$*"; }
ok()  { printf '✔ %s\n' "$*"; }

log "Starting the AlloyDB Auth Proxy"
"$PROXY_BIN" "$INSTANCE_URI" --public-ip --address 127.0.0.1 --port "$PORT" >"$WORK/proxy.log" 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true; rm -rf "$WORK"' EXIT
for _ in $(seq 1 30); do grep -q "ready for new connections" "$WORK/proxy.log" && break; sleep 2; done
grep -q "ready for new connections" "$WORK/proxy.log" || { cat "$WORK/proxy.log"; echo "Auth Proxy did not start"; exit 1; }
ok "proxy ready"

target() { # psql on AlloyDB: target <db> [psql args]
  local db="$1"; shift
  PGPASSWORD="$PGPASS" psql "host=127.0.0.1 port=${PORT} user=${DB_ADMIN_USER} dbname=${db} sslmode=disable" -v ON_ERROR_STOP=1 "$@"
}
source_ro() { # read-only query on Supabase: source_ro <sql>
  env -u PGPASSWORD psql "$SUPABASE_DB_URL" -tA -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY" -c "$1" -c "ROLLBACK" | grep -E '^[0-9]+$'
}

log "Checking the connection to AlloyDB"
if ! target postgres -tAc "SELECT version()"; then
  echo "Could not connect through the Auth Proxy. Proxy log:"; cat "$WORK/proxy.log"
  exit 1
fi

log "Creating database ${DB_NAME} and extensions (AlloyDB)"
target postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  target postgres -c "CREATE DATABASE ${DB_NAME}"
target "$DB_NAME" -q <<SQL
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
ALTER DATABASE ${DB_NAME} SET search_path = public, extensions;
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END \$\$;
SQL
ok "database ready"

if [ "$MODE" = "from-code" ]; then
  log "Creating the schema from infra/sql/schema-from-code.sql (no data)"
  target "$DB_NAME" -q -c "SET search_path = public, extensions" -f infra/sql/schema-from-code.sql
else
  : "${SUPABASE_DB_URL:?SUPABASE_DB_URL secret is empty}"
  case "$SUPABASE_DB_URL" in
    *@127.0.0.1*|*@localhost*) echo "Refusing: the Supabase URL points at this machine."; exit 1 ;;
  esac

  log "Dumping schema 'public' from Supabase (read-only)"
  env -u PGPASSWORD pg_dump "$SUPABASE_DB_URL" --schema=public --format=custom --no-owner --no-privileges \
    --no-publications --no-subscriptions --file="$WORK/supabase.dump"
  ok "dump $(du -h "$WORK/supabase.dump" | cut -f1)"

  log "Restoring into AlloyDB database ${DB_NAME} (row-level-security policies skipped)"
  pg_restore -l "$WORK/supabase.dump" | grep -vE " POLICY | ROW SECURITY |SCHEMA - public" > "$WORK/restore.list"
  PGPASSWORD="$PGPASS" pg_restore --no-owner --no-privileges --use-list="$WORK/restore.list" \
    --dbname="host=127.0.0.1 port=${PORT} user=${DB_ADMIN_USER} dbname=${DB_NAME} sslmode=disable" \
    "$WORK/supabase.dump" 2>"$WORK/restore.err" || true
  if [ -s "$WORK/restore.err" ]; then
    echo "pg_restore messages (often harmless):"; grep -iE "error" "$WORK/restore.err" | head -20 || true
  fi

  log "Row counts: Supabase vs AlloyDB"
  printf '%-28s %10s %10s\n' table supabase alloydb
  for t in $(target "$DB_NAME" -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"); do
    src=$(source_ro "SELECT count(*) FROM public.\"$t\"" 2>/dev/null || echo '?')
    dst=$(target "$DB_NAME" -tAc "SELECT count(*) FROM public.\"$t\"")
    flag=""; [ "$src" = "$dst" ] || flag="  <- differs"
    printf '%-28s %10s %10s%s\n' "$t" "$src" "$dst" "$flag"
  done
fi

log "PostgREST roles and grants"
target "$DB_NAME" -q -v authenticator_password="$AUTH_PW" -f infra/sql/postgrest-roles.sql
ok "roles ready"

log "AlloyDB ScaNN vector index"
target "$DB_NAME" -q <<'SQL' || echo "ScaNN index not created (AlloyDB-only feature, or no rows yet); vector search still works"
CREATE EXTENSION IF NOT EXISTS alloydb_scann;
CREATE INDEX IF NOT EXISTS textbook_embeddings_scann ON textbook_embeddings
  USING scann (embedding cosine) WITH (num_leaves = 10);
SQL

ok "Migration finished. Next: bash infra/deploy.sh"
