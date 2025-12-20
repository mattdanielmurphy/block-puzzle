import { SupabaseClient, createClient } from "@supabase/supabase-js"

// Use environment variables for Supabase URL and Key
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let supabase: SupabaseClient | null = null

if (supabaseUrl && supabaseServiceRoleKey) {
	supabase = createClient(supabaseUrl, supabaseServiceRoleKey)
} else {
	console.warn("Supabase environment variables are not set. Leaderboard functionality will be disabled.")
}

/**
 * Helper to get the correct table or function name based on environment.
 * SAFE BY DEFAULT: Always use 'dev_' tables unless explicitly in production cloud.
 */
export const db = (name: string): string => {
	// Only use production tables if VERCEL_ENV is exactly 'production'
	// AND we have a VERCEL_REGION (cloud indicator).
	const isProd = process.env.VERCEL_ENV === "production" && !!process.env.VERCEL_REGION
	const useDev = !isProd

	if (name === "players") {
		console.log(`[Supabase DB] Using ${useDev ? "DEV" : "PROD"} tables. (VERCEL_ENV: ${process.env.VERCEL_ENV}, Region: ${process.env.VERCEL_REGION || "local"})`)
	}

	return useDev ? `dev_${name}` : name
}

export { supabase }
