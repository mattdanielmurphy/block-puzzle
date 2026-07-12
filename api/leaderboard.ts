import * as ip from "./_lib/ip"
import * as rateLimit from "./_lib/rateLimit"
import * as validation from "./_lib/validation"

import type { VercelRequest, VercelResponse } from "@vercel/node"
import { dbName, pool, connectionString } from "./_lib/db"
import { errorJson, json } from "./_lib/http"

type VerifiedEntry = { run_id: string; name: string; score: number; createdAt: string }

type LeaderboardResponse = {
	ok: true
	verified: VerifiedEntry[]
}

type VerifiedScore = {
	run_id: string
	name: string
	score: number
	created_at: Date
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "GET") {
		console.log(`Leaderboard: Received ${req.method} request, expected GET.`)
		return errorJson(res, 405, "METHOD_NOT_ALLOWED", "Use GET")
	}
	if (!connectionString) {
		console.log("Leaderboard: Database connection string not available. Returning empty verified list.")
		const resp: LeaderboardResponse = { ok: true, verified: [] }
		return json(res, 200, resp)
	}

	// Rate limit: 60/min/IP
	const clientIp = ip.getClientIp(req)
	{
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

	const { limit: limitParam, mode: modeParam } = req.query
	const limit = Math.max(1, Math.min(100, limitParam ? Number(limitParam) : 10))
	if (!Number.isFinite(limit)) return errorJson(res, 400, "VALIDATION_ERROR", "limit must be a number")

	const mode = typeof modeParam === "string" ? modeParam : "normal"
	const table = dbName(mode === "chill" ? "chill_scores" : "scores")

	try {
		const { rows: verified } = await pool.query<VerifiedScore>(
			`SELECT run_id, name, score, created_at FROM ${table} ORDER BY score DESC LIMIT $1`,
			[limit]
		)

		const formattedVerified: VerifiedEntry[] = verified.map(v => ({
			run_id: v.run_id,
			name: v.name,
			score: v.score,
			createdAt: v.created_at.toISOString(),
		}))

		const resp: LeaderboardResponse = { ok: true, verified: formattedVerified }
		return json(res, 200, resp)
	} catch (error) {
		console.error("Leaderboard DB Error:", error)
		return errorJson(res, 500, "INTERNAL_SERVER_ERROR", "Could not fetch leaderboard.")
	}
}
