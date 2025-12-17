import { createClient } from "@supabase/supabase-js"

// Use environment variables for Supabase URL and Key
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let supabase = null

if (supabaseUrl && supabaseServiceRoleKey) {
	supabase = createClient(supabaseUrl, supabaseServiceRoleKey)
} else {
	console.warn("Supabase environment variables are not set. Leaderboard functionality will be disabled.")
	// The leaderboard will just not work.
}

export { supabase }