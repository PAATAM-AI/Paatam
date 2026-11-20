-- Roles PostgREST uses on AlloyDB. Run as the "postgres" user after the schema/data is loaded.
-- psql variable :authenticator_password must be set (infra/migrate-db.sh passes it).
--
--   postgrest_authenticator  LOGIN, used by the PostgREST sidecar to connect (no table rights itself)
--   paatam_api               the role the backend's PostgREST token switches to (full app access)
--   anon                     role for requests without a token: no rights at all

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'paatam_api') THEN CREATE ROLE paatam_api NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgrest_authenticator') THEN
    CREATE ROLE postgrest_authenticator LOGIN NOINHERIT;
  END IF;
END $$;

ALTER ROLE postgrest_authenticator WITH PASSWORD :'authenticator_password';
GRANT anon, paatam_api TO postgrest_authenticator;

GRANT USAGE ON SCHEMA public TO paatam_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO paatam_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO paatam_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO paatam_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO paatam_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO paatam_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO paatam_api;

-- Supabase installs pgvector in schema "extensions"; make its types visible either way.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA extensions TO paatam_api';
    EXECUTE 'ALTER ROLE paatam_api SET search_path = public, extensions';
  END IF;
END $$;

-- The API is the only client (PostgREST is a private sidecar), so Supabase row-level-security
-- policies (written for anon keys / auth.uid()) are not used here.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
