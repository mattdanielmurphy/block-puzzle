import * as ip from "../_lib/ip"
import * as rateLimit from "../_lib/rateLimit"
import * as validation from "../_lib/validation"

import type { VercelRequest, VercelResponse } from "@vercel/node"
import { db, supabase } from "../_lib/supabase"
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
	if (!supabase) {
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
	const table = db(mode === "chill" ? "chill_scores" : "scores")

	try {
		// 1. Get Top Score
		const { data: topData, error: topError } = await supabase.from(table).select("name, score").order("score", { ascending: false }).limit(1).maybeSingle()

		if (topError) {
			console.error("Contextual leaderboard: Error fetching top score:", topError)
			// We can continue if top score fails, but maybe better to know.
		}

		const topScore = topData ? { ...topData, rank: 1 } : null

		if (playerScore === null) {
			return json(res, 200, { ok: true, topScore, playerRank: 0, surrounding: [], isPersonalBest: false })
		}

		// 2. Get Player Rank
		const { count: higherCount, error: countError } = await supabase.from(table).select("*", { count: "exact", head: true }).gt("score", playerScore)

		if (countError) {
			console.error("Contextual leaderboard: Error fetching rank:", countError)
			throw countError // Let the catch block handle it
		}

		const playerRank = (higherCount ?? 0) + 1

		// 3. Check Personal Best
		let isPersonalBest = true
		let personalBest: { score: number } | null = null
		if (playerName) {
			const { data: existingScoreData, error: pbError } = await supabase.from(table).select("score").eq("name", playerName).order("score", { ascending: false }).limit(1).maybeSingle()

			if (pbError) {
				console.error("Contextual leaderboard: Error checking personal best:", pbError)
			}

			if (existingScoreData) {
				personalBest = { score: existingScoreData.score }
				if (existingScoreData.score >= playerScore) {
					isPersonalBest = false
				}
			}
		}

		// 4. Get surrounding (1 above, 1 below)
		// Above
		const { data: aboveData } = await supabase.from(table).select("name, score").gt("score", playerScore).order("score", { ascending: true }).limit(1)

		// Below
		const { data: belowData } = await supabase.from(table).select("name, score").lt("score", playerScore).order("score", { ascending: false }).limit(1)

		const surrounding: VerifiedEntry[] = []
		if (aboveData && aboveData.length > 0) {
			surrounding.push({ ...aboveData[0], rank: playerRank - 1 })
		}
		// Note: we don't include the player here because the client already has their name/score.
		// We'll return it as 'player' if requested or just let the client merge.
		if (belowData && belowData.length > 0) {
			surrounding.push({ ...belowData[0], rank: playerRank + 1 })
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
