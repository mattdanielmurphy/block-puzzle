import * as http from "../_lib/http"
import * as ip from "../_lib/ip"
import * as rateLimit from "../_lib/rateLimit"
import * as validation from "../_lib/validation"

import type { VercelRequest, VercelResponse } from "@vercel/node"

import { supabase } from "../_lib/supabase"

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
		const table = mode === "chill" ? "chill_scores" : "scores"
		const trimFunction = mode === "chill" ? "trim_chill_scores" : "trim_verified_scores"

		// E2) Check if a better score already exists for this name
		const { data: existingEntry } = await supabase
			.from(table)
			.select("score")
			.eq("name", nameV.value)
			.order("score", { ascending: false })
			.limit(1)
			.single()

		if (existingEntry && existingEntry.score >= scoreV.value) {
			return http.json(res, 200, {
				ok: true,
				status: "NOT_PERSONAL_BEST",
				message: "A better or equal score already exists for this name.",
			})
		}

		// E3) Delete any previous scores for this name (to keep only one per player)
		await supabase.from(table).delete().eq("name", nameV.value)

		// F) Insert score directly (no verification)
		const { data: entry, error: insertError } = await supabase
			.from(table)
			.insert({ run_id: runId, name: nameV.value, score: scoreV.value })
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
