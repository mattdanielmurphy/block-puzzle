const { createClient } = require("@supabase/supabase-js")
require("dotenv").config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
	console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function migrate() {
	console.log("Running migration...")

	// Adding columns one by one as multi-statement might fail in some contexts
	const { error: err1 } = await supabase.rpc("exec_sql", { sql: "ALTER TABLE players ADD COLUMN IF NOT EXISTS best_score INTEGER DEFAULT 0;" })
	if (err1) console.log("Notice: Could not run ALTER TABLE via RPC (expected if exec_sql not defined).")

	console.log("Migration script complete. If you see errors above, please run the following SQL in the Supabase Dashboard SQL Editor manually:")
	console.log(`
ALTER TABLE players ADD COLUMN IF NOT EXISTS best_score INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS chill_best_score INTEGER DEFAULT 0;

-- Optional but recommended: Update current best scores
UPDATE players p
SET best_score = (
  SELECT COALESCE(MAX(score), 0)
  FROM scores s
  WHERE s.player_id = p.id
);

UPDATE players p
SET chill_best_score = (
  SELECT COALESCE(MAX(score), 0)
  FROM chill_scores s
  WHERE s.player_id = p.id
);
  `)
}

migrate()
