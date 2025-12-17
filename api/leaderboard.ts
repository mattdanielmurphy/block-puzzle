import * as ip from "./_lib/ip.js"
import * as rateLimit from "./_lib/rateLimit.js"
import * as validation from "./_lib/validation.js"

import type { VercelRequest, VercelResponse } from "@vercel/node"
import { errorJson, json } from "./_lib/http.js"
import { supabase } from "./_lib/supabase.js"

// Database schema assumed for this endpoint:
//
// CREATE TABLE scores (
//   id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
//   run_id TEXT UNIQUE NOT NULL,
//   name TEXT NOT NULL,
//   score INTEGER NOT NULL,
//   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );
//
// CREATE TABLE unverified_scores (
//   id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
//   name TEXT NOT NULL,
//   score INTEGER NOT NULL,
//   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );
//
// Also, a reminder to the user to set the following environment variables:
// SUPABASE_URL: The URL of your Supabase project.
// SUPABASE_SERVICE_ROLE_KEY: The service role key for your Supabase project.

type VerifiedEntry = { run_id: string; name: string; score: number; createdAt: string }

type LeaderboardResponse = {
	ok: true
	verified: VerifiedEntry[]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "GET") {
		console.log(`Leaderboard: Received ${req.method} request, expected GET.`)
		return errorJson(res, 405, "METHOD_NOT_ALLOWED", "Use GET")
	}
	if (!supabase) {
		console.log("Leaderboard: Supabase instance not available. Returning empty verified list.")
		const resp: LeaderboardResponse = { ok: true, verified: [] }
		return json(res, 200, resp)
	}

	// Rate limit: 60/min/IP
	const clientIp = ip.getClientIp(req)
	{
		// This may or may not work depending on whether rateLimit depends on redis.
		// For now, we leave it as is.
		const rl = await rateLimit.rateLimitFixedWindow({
			bucket: "leaderboard",
			ip: clientIp,
			limit: validation.LIMITS.leaderboardPerMinute,
			windowSec: 60,
		})
		if (rl.ok === false) {
			console.log(`Leaderboard: Rate limited for IP ${clientIp}. Retry after ${rl.retryAfterSec}s.`)
			res.setHeader("Retry-After", String(rl.retryAfterSec))
			return errorJson(res, 429, "RATE_LIMITED", "Too many requests")
		}
	}

	const limit = Math.max(1, Math.min(100, limitParam ? Number(limitParam) : 10))
	console.log(`Leaderboard: limit=${limit}`)
	if (!Number.isFinite(limit)) return errorJson(res, 400, "VALIDATION_ERROR", "limit must be a number")

	console.log(`Leaderboard: Fetching top ${limit} scores from Supabase.`)
	const { data: verified, error: verifiedError } = await supabase
		.from("scores")
		.select("run_id, name, score, created_at")
		.order("score", { ascending: false })
		.limit(limit)

	if (verifiedError) {
		console.error("Leaderboard: Error fetching verified scores from Supabase:", verifiedError)
		return errorJson(res, 500, "INTERNAL_SERVER_ERROR", "Could not fetch leaderboard.")
	}

	console.log("Leaderboard: Final 'verified' entries:", verified)

	const formattedVerified: VerifiedEntry[] = (verified || []).map((v) => ({
		run_id: v.run_id,
		name: v.name,
		score: v.score,
		createdAt: v.created_at,
	}))

	const resp: LeaderboardResponse = { ok: true, verified: formattedVerified }
	console.log("Leaderboard: Final response being sent:", resp)
	return json(res, 200, resp)
}