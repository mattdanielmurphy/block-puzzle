import * as http from "../_lib/http"
import * as ip from "../_lib/ip"
import * as rateLimit from "../_lib/rateLimit"
import * as validation from "../_lib/validation"

import type { VercelRequest, VercelResponse } from "@vercel/node"
import { db, supabase } from "../_lib/supabase"

// The following Postgres functions are required for this endpoint:
//
// CREATE OR REPLACE FUNCTION trim_verified_scores()
// RETURNS void AS $$
// BEGIN
//   DELETE FROM scores
//   WHERE id NOT IN (
//     SELECT id FROM (
//       SELECT id, ROW_NUMBER() OVER (PARTITION BY mode ORDER BY score DESC) as rn
//       FROM scores
//     ) t
//     WHERE rn <= 100
//   );
// END;
// $$ LANGUAGE plpgsql;

type SubmitBody = {
	runId: unknown
	name: unknown
	score: unknown
	mode: unknown
}

type SubmitResponse = {
	ok: true

	status: "ACCEPTED" | "NOT_PERSONAL_BEST"
	entry?: { name: string; score: number; createdAt: string }
	message?: string
}

async function parseJsonBody(req: VercelRequest): Promise<SubmitBody | null> {
	const b: any = (req as any).body
	if (!b) return null
	if (typeof b === "string") {
		try {
			return JSON.parse(b)
		} catch {
			return null
		}
	}
	return b
}

export async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		console.log(`Submit: Received ${req.method} request.`)

		if (req.method !== "POST") return http.errorJson(res, 405, "METHOD_NOT_ALLOWED", "Use POST")

		if (!supabase) {
			console.log("Submit: Supabase instance not available.")
			return http.errorJson(res, 503, "SERVICE_UNAVAILABLE", "Leaderboard is not available")
		}

		// A) Extract client IP from request headers
		const clientIp = ip.getClientIp(req)
		console.log(`Submit: Client IP: ${clientIp}`)

		// B) Rate limit: submit bucket (N per 60 seconds per IP)
		const submitRl = await rateLimit.rateLimitFixedWindow({
			bucket: "submit",
			ip: clientIp,
			limit: validation.LIMITS.submitPerMinute,
			windowSec: 60,
		})
		if (submitRl.ok === false) {
			console.log(`Submit: Rate limited for IP ${clientIp} on 'submit' bucket. Retry after ${submitRl.retryAfterSec}s.`)
			res.setHeader("Retry-After", String(submitRl.retryAfterSec))
			return http.errorJson(res, 429, "RATE_LIMITED", "Too many submissions")
		}

		console.log(`Submit: Rate limit check passed for IP ${clientIp} on 'submit' bucket.`)

		// C) Validate inputs
		const body = await parseJsonBody(req)
		console.log("Submit: Parsed request body:", body)

		if (!body) return http.errorJson(res, 400, "BAD_JSON", "Invalid JSON body")

		if (typeof body.runId !== "string" || !body.runId.trim()) {
			return http.errorJson(res, 400, "VALIDATION_ERROR", "runId must be a non-empty string")
		}
		const runId = body.runId.trim()

		// E) Accept score without replay verification (for now)
		// TODO: Add replay validation when/if cheating becomes a real problem
		const nameV = validation.validateName(body.name)
		if (nameV.ok === false) {
			return http.errorJson(res, 400, "VALIDATION_ERROR", nameV.message)
		}

		const scoreV = validation.validateScore(body.score)
		if (scoreV.ok === false) {
			return http.errorJson(res, 400, "VALIDATION_ERROR", scoreV.message)
		}

		const mode = typeof body.mode === "string" ? body.mode : "normal"
		const table = db(mode === "chill" ? "chill_scores" : "scores")
		const trimFunction = db(mode === "chill" ? "trim_chill_scores" : "trim_verified_scores")

		const userAgent = (req.headers["user-agent"] as string) || "UNKNOWN"

		// E1) Ensure player exists and get their ID
		let playerId: string | null = null
		const { data: player } = await supabase.from(db("players")).select("id").eq("name", nameV.value).limit(1).maybeSingle()

		if (player) {
			playerId = player.id
		} else {
			// Create new player record
			const { data: newPlayer, error: createPlayerError } = await supabase.from(db("players")).insert({ name: nameV.value }).select("id").single()

			if (createPlayerError) {
				console.error("Submit: Error creating player:", createPlayerError)
			} else {
				playerId = newPlayer.id
			}
		}

		// E1.5) Upsert identity if we have a playerId
		if (playerId) {
			await supabase.from(db("player_identities")).upsert(
				{
					player_id: playerId,
					ip_address: clientIp,
					user_agent: userAgent,
					last_seen: new Date().toISOString(),
				},
				{
					onConflict: "player_id,ip_address,user_agent",
				}
			)

			// Also update last_seen on player
			await supabase.from(db("players")).update({ last_seen: new Date().toISOString() }).eq("id", playerId)
		}

		// E2) Check if a better score already exists for this name (we'll stick to name-based PB for now, or should it be player_id based?)
		// User said: "link it to the scores and chill_scores... it'll use a combination of those [IP, UA] and if the player name is ever cleared..."
		// This implies we should probably check by player_id if we have it, or still by name?
		// Usually name is the identifier on the leaderboard.
		const { data: existingEntry } = await supabase.from(table).select("score").eq("name", nameV.value).order("score", { ascending: false }).limit(1).maybeSingle()

		if (existingEntry && existingEntry.score >= scoreV.value) {
			return http.json(res, 200, {
				ok: true,
				status: "NOT_PERSONAL_BEST",
				message: "A better or equal score already exists for this name.",
			})
		}

		// E3) Delete any previous scores for this name (to keep only one per player name)
		await supabase.from(table).delete().eq("name", nameV.value)

		// F) Insert score directly (no verification)
		const { data: entry, error: insertError } = await supabase
			.from(table)
			.insert({
				run_id: runId,
				name: nameV.value,
				score: scoreV.value,
				player_id: playerId, // Link to player
			})
			.select()
			.single()

		if (insertError) {
			if (insertError.code === "23505") {
				// Unique constraint violation
				return http.errorJson(res, 409, "ALREADY_SUBMITTED", "This runId has already been submitted")
			}
			console.error("Submit: Error inserting verified score:", insertError)
			return http.errorJson(res, 500, "INTERNAL_SERVER_ERROR", "Could not save score.")
		}

		// G) Update player's best score in players table
		if (playerId) {
			const bestScoreField = mode === "chill" ? "chill_best_score" : "best_score"
			await supabase
				.from(db("players"))
				.update({ [bestScoreField]: scoreV.value })
				.eq("id", playerId)
		}

		// G) Trim verified scores to 100
		const { error: deleteError } = await supabase.rpc(trimFunction)
		if (deleteError) console.error(`Submit: Error trimming ${table}:`, deleteError)

		const resp: SubmitResponse = { ok: true, status: "ACCEPTED", entry }
		return http.json(res, 200, resp)
	} catch (error: any) {
		console.error("Submit: Uncaught error in submit handler:", error.message || error)
		return http.errorJson(res, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.")
	}
}

export default handler
