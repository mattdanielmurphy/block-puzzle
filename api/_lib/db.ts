import { Pool } from "pg"
import * as fs from "fs"
import * as path from "path"

// Globally ignore self-signed certificate errors for local development 
// when connecting to custom VPS postgres databases.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

// Forcefully read .env.local because Vercel CLI sometimes ignores it in favor of cloud variables
let localUrl = ""
try {
	const envFile = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf-8")
	// Try MY_DB_URL first, then POSTGRES_URL
	const matchMyDb = envFile.match(/MY_DB_URL="([^"]+)"/)
	const matchPg = envFile.match(/POSTGRES_URL="([^"]+)"/)
	if (matchMyDb) localUrl = matchMyDb[1]
	else if (matchPg) localUrl = matchPg[1]
} catch (e) {
	console.error("Could not forcefully read .env.local:", e)
}

// Use custom localUrl to bypass Vercel Cloud integrations, then fallback to standard POSTGRES_URL
const connectionString = localUrl || process.env.MY_DB_URL || process.env.POSTGRES_URL || process.env.SUPABASE_URL

export const pool = new Pool({
	connectionString,
	ssl: { rejectUnauthorized: false }
})

/**
 * Helper to get the correct table or function name based on environment.
 * SAFE BY DEFAULT: Always use 'dev_' tables unless explicitly in production cloud.
 */
export const dbName = (name: string): string => {
	// Only use production tables if VERCEL_ENV is exactly 'production'
	// AND we have a VERCEL_REGION (cloud indicator).
	const isProd = process.env.VERCEL_ENV === "production" && !!process.env.VERCEL_REGION
	const useDev = !isProd

	if (name === "players") {
		console.log(`[DB] Using ${useDev ? "DEV" : "PROD"} tables. (VERCEL_ENV: ${process.env.VERCEL_ENV}, Region: ${process.env.VERCEL_REGION || "local"})`)
	}

	return useDev ? `dev_${name}` : name
}

export { connectionString }
