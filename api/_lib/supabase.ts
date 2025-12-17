import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
	console.warn("Supabase URL not set. Using a mock client.")
}

if (!supabaseKey) {
	console.warn("Supabase service role key not set. Using a mock client.")
}

// If credentials are not provided, use a mock client to avoid crashing the app.
// The leaderboard will just not work.
const supabase =
	supabaseUrl && supabaseKey
		? createClient(supabaseUrl, supabaseKey, {
				auth: {
					// In a serverless environment, we don't need to persist the session.
					persistSession: false,
				},
		  })
		: null

export { supabase }
