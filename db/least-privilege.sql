-- Least-privilege login for the Blockdoku / Don Blocko leaderboard API.
-- Run ONCE as the database owner; the password comes in as a psql variable so it never lands in a file:
--   psql "$OWNER_URL" -v app_pw="$(openssl rand -base64 32 | tr -d '/+=')" -f db/least-privilege.sql
-- Then set MY_DB_URL (Vercel Production + Preview) to the same URL with user blockdoku_app and that password, and redeploy.
-- The app needs only row access: no DDL, no other tables, no role or schema changes.

\set ON_ERROR_STOP on
SELECT format('CREATE ROLE blockdoku_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'blockdoku_app') \gexec
ALTER ROLE blockdoku_app CONNECTION LIMIT 40;

-- Tables the guards need (normally created by the app on first run as owner).
ALTER TABLE players ADD COLUMN IF NOT EXISTS owner_hash text;
ALTER TABLE dev_players ADD COLUMN IF NOT EXISTS owner_hash text;
CREATE TABLE IF NOT EXISTS used_runs (run_id text PRIMARY KEY, used_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS dev_used_runs (run_id text PRIMARY KEY, used_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rate_limits (bucket text NOT NULL, key text NOT NULL, window_start bigint NOT NULL, count int NOT NULL DEFAULT 0, PRIMARY KEY (bucket, key, window_start));
CREATE TABLE IF NOT EXISTS dev_rate_limits (bucket text NOT NULL, key text NOT NULL, window_start bigint NOT NULL, count int NOT NULL DEFAULT 0, PRIMARY KEY (bucket, key, window_start));

SELECT format('GRANT CONNECT ON DATABASE %I TO blockdoku_app', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO blockdoku_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
	players, player_identities, scores, chill_scores, used_runs, rate_limits,
	dev_players, dev_player_identities, dev_scores, dev_chill_scores, dev_used_runs, dev_rate_limits
	TO blockdoku_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO blockdoku_app;
-- The trim functions run as their owner so they keep working; the app may only call them.
DO $$
DECLARE f text;
BEGIN
	FOREACH f IN ARRAY ARRAY['trim_verified_scores', 'trim_chill_scores', 'dev_trim_verified_scores', 'dev_trim_chill_scores'] LOOP
		IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = f) THEN
			EXECUTE format('ALTER FUNCTION %I() SECURITY DEFINER', f);
			EXECUTE format('ALTER FUNCTION %I() SET search_path = public', f);
			EXECUTE format('GRANT EXECUTE ON FUNCTION %I() TO blockdoku_app', f);
		END IF;
	END LOOP;
END $$;
