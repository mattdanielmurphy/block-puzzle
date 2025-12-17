import * as http from "../_lib/http"
import * as ip from "../_lib/ip"
import * as rateLimit from "../_lib/rateLimit"
import * as validation from "../_lib/validation"

import type { VercelRequest, VercelResponse } from "@vercel/node"

import { runReplay } from "../../src/engine/runReplay"
import { supabase } from "../_lib/supabase"

// The following Postgres functions are required for this endpoint:
//
// CREATE OR REPLACE FUNCTION trim_verified_scores()
// RETURNS void AS $$
// BEGIN
//   DELETE FROM scores
//   WHERE id NOT IN (
//     SELECT id FROM scores
//     ORDER BY score DESC
//     LIMIT 100
//   );
// END;
// $$ LANGUAGE plpgsql;

type SubmitBody = {
	runId: unknown
	name: unknown
	score: unknown
	replay?: unknown
}

type SubmitResponse = {
	ok: true
	status: "VERIFIED_ACCEPTED"
	entry: { name: string; score: number; createdAt: string }
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

		const nameV = validation.validateName(body.name)
		if (nameV.ok === false) {
			return http.errorJson(res, 400, "VALIDATION_ERROR", nameV.message)
		}

		const scoreV = validation.validateScore(body.score)
		if (scoreV.ok === false) {
			return http.errorJson(res, 400, "VALIDATION_ERROR", scoreV.message)
		}

		// IMPORTANT: require replay for ALL submissions
		const replayV = validation.validateReplay(body.replay)
		if (replayV.ok === false) {
			return http.errorJson(res, 400, "VALIDATION_ERROR", replayV.message)
		}

		// D) One-submit-per-runId: Check if runId already exists
		const { data: existingRun, error: existingRunError } = await supabase.from("scores").select("run_id").eq("run_id", runId).limit(1)

		if (existingRunError) {
			console.error("Submit: Error checking for existing runId:", existingRunError)
			return http.errorJson(res, 500, "INTERNAL_SERVER_ERROR", "Could not check for existing run.")
		}

		if (existingRun && existingRun.length > 0) {
			return http.errorJson(res, 409, "ALREADY_SUBMITTED", "This runId has already been submitted")
		}

		// E) ALWAYS verify replay (rate limit verification attempts)
		const verifyRl = await rateLimit.rateLimitMultiple([
			{ bucket: "verify", ip: clientIp, limit: validation.LIMITS.verifyPerMinute, windowSec: 60 },
			{ bucket: "verify", ip: clientIp, limit: validation.LIMITS.verifyPerHour, windowSec: 3600 },
		])
		if (verifyRl.ok === false) {
			res.setHeader("Retry-After", String(verifyRl.retryAfterSec))
			return http.errorJson(res, 429, "RATE_LIMITED", "Too many verification attempts")
		}

		const replayResult = runReplay({
			seed: replayV.value.seed,
			actions: replayV.value.moves,
			options: {
				maxActions: validation.LIMITS.maxReplayActions,
				maxDurationMs: validation.LIMITS.maxReplayDurationMs,
			},
		})

		if (!replayResult.isValid) {
			return http.errorJson(res, 400, "REPLAY_INVALID", "Replay verification failed", { reason: replayResult.reason })
		}

		if (replayResult.finalScore !== scoreV.value) {
			return http.errorJson(res, 400, "SCORE_MISMATCH", "Submitted score does not match replay", {
				computedScore: replayResult.finalScore,
			})
		}

		// F) Insert verified score
		const { data: entry, error: insertError } = await supabase.from("scores").insert({ run_id: runId, name: nameV.value, score: scoreV.value }).select().single()

		if (insertError) {
			if (insertError.code === "23505") {
				// Unique constraint violation
				return http.errorJson(res, 409, "ALREADY_SUBMITTED", "This runId has already been submitted")
			}
			console.error("Submit: Error inserting verified score:", insertError)
			return http.errorJson(res, 500, "INTERNAL_SERVER_ERROR", "Could not save score.")
		}

		// G) Trim verified scores to 100
		const { error: deleteError } = await supabase.rpc("trim_verified_scores")
		if (deleteError) console.error("Submit: Error trimming verified scores:", deleteError)

		const resp: SubmitResponse = { ok: true, status: "VERIFIED_ACCEPTED", entry }
		return http.json(res, 200, resp)
	} catch (error: any) {
		console.error("Submit: Uncaught error in submit handler:", error.message || error)
		return http.errorJson(res, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.")
	}
}

export default handler
