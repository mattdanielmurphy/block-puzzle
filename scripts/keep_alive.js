/**
 * Lightweight Supabase ping so the project stays active (free tier pauses after ~7 days idle).
 * Uses anon key + read-only HEAD-style queries on production tables.
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY as fallback)
 * GitHub Actions: set the same names as repository secrets.
 */
const { createClient } = require("@supabase/supabase-js")

try {
	require("dotenv").config()
} catch {
	// optional
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey =
	process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
	console.error(
		"Missing SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)",
	)
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const TABLES = ["scores", "players"]

async function pingTable(table) {
	const { error, count } = await supabase
		.from(table)
		.select("*", { count: "exact", head: true })

	if (error) {
		throw new Error(`${table}: ${error.message}`)
	}
	console.log(`[keep-alive] ${table} ok (count header: ${count ?? "n/a"})`)
}

async function main() {
	console.log(`[keep-alive] ${new Date().toISOString()} → ${supabaseUrl}`)
	for (const table of TABLES) {
		await pingTable(table)
	}
	console.log("[keep-alive] done")
}

main().catch((err) => {
	console.error("[keep-alive] failed:", err.message || err)
	process.exit(1)
})
