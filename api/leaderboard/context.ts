import * as ip from "../_lib/ip"
import * as rateLimit from "../_lib/rateLimit"
import * as validation from "../_lib/validation"

import type { VercelRequest, VercelResponse } from "@vercel/node"
import { dbName, pool, connectionString } from "../_lib/db"
import { errorJson, json } from "../_lib/http"

type VerifiedEntry = { name: string; score: number; rank: number }

type ContextualLeaderboardResponse = {
	ok: true
	topScore: VerifiedEntry | null
	playerRank: number
	surrounding: VerifiedEntry[]
	isPersonalBest: boolean
	personalBest?: { score: number } | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "GET") {
		return errorJson(res, 405, "METHOD_NOT_ALLOWED", "Use GET")
	}
	if (!connectionString) {
		return json(res, 200, { ok: true, topScore: null, playerRank: 0, surrounding: [] })
	}

	const clientIp = ip.getClientIp(req)
	const rl = await rateLimit.rateLimitFixedWindow({
		bucket: "leaderboard",
		ip: clientIp,
		limit: validation.LIMITS.leaderboardPerMinute,
		windowSec: 60,
	})
	if (rl.ok === false) {
		res.setHeader("Retry-After", String(rl.retryAfterSec))
		return errorJson(res, 429, "RATE_LIMITED", "Too many requests")
	}

	const { score: scoreParam, mode: modeParam, name: nameParam } = req.query
	const playerScore = scoreParam ? Number(scoreParam) : null
	const playerName = typeof nameParam === "string" ? nameParam : null
	const mode = typeof modeParam === "string" ? modeParam : "normal"
	const table = dbName(mode === "chill" ? "chill_scores" : "scores")

	try {
		// 1. Get Top Score
		const { rows: topData } = await pool.query(`SELECT name, score FROM ${table} ORDER BY score DESC LIMIT 1`)
		const topScore = topData.length > 0 ? { ...topData[0], rank: 1 } : null

		if (playerScore === null) {
			return json(res, 200, { ok: true, topScore, playerRank: 0, surrounding: [], isPersonalBest: false })
		}

		// 2. Get Player Rank
		const { rows: countRows } = await pool.query(`SELECT COUNT(*) as exact_count FROM ${table} WHERE score > $1`, [playerScore])
		const higherCount = parseInt(countRows[0].exact_count, 10)
		const playerRank = higherCount + 1

		// 3. Check Personal Best
		let isPersonalBest = true
		let personalBest: { score: number } | null = null
		if (playerName) {
			const { rows: pbRows } = await pool.query(`SELECT score FROM ${table} WHERE name = $1 ORDER BY score DESC LIMIT 1`, [playerName])
			if (pbRows.length > 0) {
				personalBest = { score: pbRows[0].score }
				if (pbRows[0].score >= playerScore) {
					isPersonalBest = false
				}
			}
		}

		// 4. Get surrounding (1 above, 1 below)
		// Above (score > playerScore, lowest such score -> ORDER BY score ASC)
		const { rows: aboveData } = await pool.query(`SELECT name, score FROM ${table} WHERE score > $1 ORDER BY score ASC LIMIT 1`, [playerScore])

		// Below (score < playerScore, highest such score -> ORDER BY score DESC)
		const { rows: belowData } = await pool.query(`SELECT name, score FROM ${table} WHERE score < $1 ORDER BY score DESC LIMIT 1`, [playerScore])

		const surrounding: VerifiedEntry[] = []
		if (aboveData && aboveData.length > 0) {
			surrounding.push({ name: aboveData[0].name, score: aboveData[0].score, rank: playerRank - 1 })
		}
		if (belowData && belowData.length > 0) {
			surrounding.push({ name: belowData[0].name, score: belowData[0].score, rank: playerRank + 1 })
		}

		const resp: ContextualLeaderboardResponse = {
			ok: true,
			topScore,
			playerRank,
			surrounding: surrounding.sort((a, b) => a.rank - b.rank),
			isPersonalBest,
			personalBest,
		}
		return json(res, 200, resp)
	} catch (e) {
		console.error("Contextual leaderboard error:", e)
		return errorJson(res, 500, "INTERNAL_SERVER_ERROR", "Could not fetch contextual leaderboard")
	}
}
