#!/usr/bin/env bash
# Copy the Paatam database from Supabase into AlloyDB (schema, SQL functions and data),
# then create the PostgREST roles. Run in Cloud Shell from the repo root:
#
#   bash infra/migrate-db.sh              # from Supabase (asks for the connection string, hidden)
#   bash infra/migrate-db.sh --from-code  # no Supabase: create the schema from infra/sql/schema-from-code.sql
#
# Uses Docker images for pg_dump/psql (Cloud Shell has Docker) and the AlloyDB Auth Proxy.
#
# SAFETY: Supabase is the live source of truth and is only ever READ.
#   - The only commands sent to Supabase are pg_dump (always runs in a READ ONLY transaction)
#     and SELECT count(*) wrapped in BEGIN READ ONLY ... ROLLBACK (the server rejects any write).
#   - Every CREATE / restore / GRANT / ALTER below targets AlloyDB only, through the local
#     Auth Proxy (127.0.0.1:5433); the Supabase URL is never passed to those commands.
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh

MODE="${1:-supabase}"
PG_IMAGE="postgres:17"   # client tools only; newer pg_dump reads older servers
WORK="$(mktemp -d)"
PROXY_PORT=5433
trap 'docker stop paatam-alloydb-proxy >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

log "Starting the AlloyDB Auth Proxy on 127.0.0.1:${PROXY_PORT}"
# Official proxy image; authenticates with your Cloud Shell login (token valid for 1 hour).
docker run -d --rm --name paatam-alloydb-proxy --network host \
  gcr.io/alloydb-connectors/alloydb-auth-proxy:latest \
  "$INSTANCE_URI" --public-ip --address 127.0.0.1 --port "$PROXY_PORT" \
  --token "$(gcloud auth print-access-token)" >/dev/null
PROXY_PID=""
for _ in $(seq 1 30); do
  docker logs paatam-alloydb-proxy 2>&1 | grep -q "ready for new connections" && break
  sleep 2
done
docker logs paatam-alloydb-proxy 2>&1 | grep -q "ready for new connections" || {
  docker logs paatam-alloydb-proxy; echo "Auth Proxy did not start"; exit 1; }

PGPASS="$(secret_value paatam-db-postgres-password)"
target() { # psql against AlloyDB; usage: target <db> [psql args...]
  local db="$1"; shift
  docker run --rm -i --network host -e PGPASSWORD="$PGPASS" -v "$WORK:/work" -v "$PWD/infra/sql:/sql:ro" "$PG_IMAGE" \
    psql "host=127.0.0.1 port=${PROXY_PORT} user=postgres dbname=${db} sslmode=disable" -v ON_ERROR_STOP=1 "$@"
}

log "Creating database ${DB_NAME} and extensions"
target postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  target postgres -c "CREATE DATABASE ${DB_NAME}"
# Supabase keeps extensions in schema "extensions"; mirror that so dumped column types resolve.
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

if [ "$MODE" = "--from-code" ]; then
  log "Creating the schema from infra/sql/schema-from-code.sql (no data)"
  target "$DB_NAME" -q -c "SET search_path = public, extensions" -f /sql/schema-from-code.sql
else
  log "Supabase connection string"
  echo "Supabase dashboard → Connect → Session pooler (IPv4) → URI, with your database password filled in."
  read -rsp "Paste it here (input hidden): " SUPABASE_DB_URL; echo
  [ -n "$SUPABASE_DB_URL" ] || { echo "No connection string given"; exit 1; }
  # Guard: the source must be the remote Supabase database, never the local AlloyDB proxy.
  case "$SUPABASE_DB_URL" in
    *@127.0.0.1*|*@localhost*|*"port=${PROXY_PORT}"*|*":${PROXY_PORT}/"*)
      echo "Refusing: that connection string points at this machine (the AlloyDB target), not Supabase."; exit 1 ;;
  esac

  log "Dumping schema 'public' from Supabase (read-only)"
  docker run --rm --network host -e SRC="$SUPABASE_DB_URL" -v "$WORK:/work" "$PG_IMAGE" \
    sh -c 'pg_dump "$SRC" --schema=public --format=custom --no-owner --no-privileges \
           --no-publications --no-subscriptions --file=/work/supabase.dump'
  ok "dump $(du -h "$WORK/supabase.dump" | cut -f1)"

  log "Restoring into AlloyDB (row-level-security policies skipped)"
  docker run --rm -v "$WORK:/work" "$PG_IMAGE" sh -c \
    'pg_restore -l /work/supabase.dump | grep -vE " POLICY | ROW SECURITY |SCHEMA - public" > /work/restore.list'
  docker run --rm --network host -e PGPASSWORD="$PGPASS" -v "$WORK:/work" "$PG_IMAGE" \
    pg_restore --no-owner --no-privileges --use-list=/work/restore.list \
      --dbname="host=127.0.0.1 port=${PROXY_PORT} user=postgres dbname=${DB_NAME} sslmode=disable" \
      /work/supabase.dump 2>"$WORK/restore.err" || true
  if [ -s "$WORK/restore.err" ]; then
    warn "pg_restore reported (often harmless) messages:"; grep -E "error|ERROR" "$WORK/restore.err" | head -20 || true
  fi

  log "Row counts: Supabase vs AlloyDB"
  TABLES=$(target "$DB_NAME" -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")
  printf '%-28s %10s %10s\n' table supabase alloydb
  for t in $TABLES; do
    src=$(docker run --rm --network host -e SRC="$SUPABASE_DB_URL" "$PG_IMAGE" \
      psql "$SRC" -tA -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY" -c "SELECT count(*) FROM public.\"$t\"" -c "ROLLBACK" 2>/dev/null \
      | grep -E '^[0-9]+$' || echo '?')
    dst=$(target "$DB_NAME" -tAc "SELECT count(*) FROM public.\"$t\"")
    flag=""; [ "$src" = "$dst" ] || flag="  ← differs"
    printf '%-28s %10s %10s%s\n' "$t" "$src" "$dst" "$flag"
  done
  unset SUPABASE_DB_URL
fi

log "PostgREST roles and grants"
target "$DB_NAME" -q -v authenticator_password="$(secret_value paatam-pgrst-authenticator-password)" -f /sql/postgrest-roles.sql
ok "roles ready"

log "AlloyDB ScaNN vector index (falls back to the existing HNSW/none if not available)"
target "$DB_NAME" -q <<'SQL' || warn "ScaNN index not created (needs data in textbook_embeddings); RAG still works"
CREATE EXTENSION IF NOT EXISTS alloydb_scann;
CREATE INDEX IF NOT EXISTS textbook_embeddings_scann ON textbook_embeddings
  USING scann (embedding cosine) WITH (num_leaves = 10);
SQL

ok "Database ready. Next: bash infra/deploy.sh"
