import * as http from "../_lib/http"
import * as ip from "../_lib/ip"
import * as rateLimit from "../_lib/rateLimit"
import * as validation from "../_lib/validation"

import type { VercelRequest, VercelResponse } from "@vercel/node"
import { dbName, pool, connectionString } from "../_lib/db"

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

		if (!connectionString) {
			console.log("Submit: DB instance not available.")
			return http.errorJson(res, 503, "SERVICE_UNAVAILABLE", "Leaderboard is not available")
		}

		// A) Extract client IP from request headers
		const clientIp = ip.getClientIp(req)
		console.log(`Submit: Client IP: ${clientIp}`)

		// B) Rate limit
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

		const mode = typeof body.mode === "string" ? body.mode : "normal"
		const table = dbName(mode === "chill" ? "chill_scores" : "scores")
		const trimFunction = dbName(mode === "chill" ? "trim_chill_scores" : "trim_verified_scores")

		const userAgent = (req.headers["user-agent"] as string) || "UNKNOWN"

		// Transaction for safely committing score
		const client = await pool.connect()
		try {
			await client.query("BEGIN")

			// E1) Ensure player exists and get their ID
			let playerId: string | null = null
			const playerRes = await client.query(`SELECT id FROM ${dbName("players")} WHERE name = $1 LIMIT 1`, [nameV.value])
			
			if (playerRes.rows.length > 0) {
				playerId = playerRes.rows[0].id
			} else {
				// Create new player record
				const newPlayerRes = await client.query(`INSERT INTO ${dbName("players")} (name) VALUES ($1) RETURNING id`, [nameV.value])
				playerId = newPlayerRes.rows[0].id
			}

			// E1.5) Upsert identity if we have a playerId
			if (playerId) {
				await client.query(`
					INSERT INTO ${dbName("player_identities")} (player_id, ip_address, user_agent, last_seen)
					VALUES ($1, $2, $3, $4)
					ON CONFLICT (player_id, ip_address, user_agent) DO UPDATE SET last_seen = EXCLUDED.last_seen
				`, [playerId, clientIp, userAgent, new Date().toISOString()])

				// Also update last_seen on player
				await client.query(`UPDATE ${dbName("players")} SET last_seen = $1 WHERE id = $2`, [new Date().toISOString(), playerId])
			}

			// E2) Check if a better score already exists for this name
			const existingRes = await client.query(`SELECT score FROM ${table} WHERE name = $1 ORDER BY score DESC LIMIT 1`, [nameV.value])
			if (existingRes.rows.length > 0 && existingRes.rows[0].score >= scoreV.value) {
				await client.query("ROLLBACK")
				return http.json(res, 200, {
					ok: true,
					status: "NOT_PERSONAL_BEST",
					message: "A better or equal score already exists for this name.",
				})
			}

			// E3) Delete any previous scores for this name (to keep only one per player name)
			await client.query(`DELETE FROM ${table} WHERE name = $1`, [nameV.value])

			// F) Insert score directly
			let entry
			try {
				const insertRes = await client.query(`
					INSERT INTO ${table} (run_id, name, score, player_id)
					VALUES ($1, $2, $3, $4)
					RETURNING name, score, created_at
				`, [runId, nameV.value, scoreV.value, playerId])
				
				entry = {
					name: insertRes.rows[0].name,
					score: insertRes.rows[0].score,
					createdAt: insertRes.rows[0].created_at.toISOString()
				}
			} catch (err: any) {
				if (err.code === "23505") {
					await client.query("ROLLBACK")
					return http.errorJson(res, 409, "ALREADY_SUBMITTED", "This runId has already been submitted")
				}
				throw err
			}

			// G) Update player's best score in players table
			if (playerId) {
				const bestScoreField = mode === "chill" ? "chill_best_score" : "best_score"
				await client.query(`UPDATE ${dbName("players")} SET ${bestScoreField} = $1 WHERE id = $2`, [scoreV.value, playerId])
			}

			// G) Trim verified scores to 100
			// Call the RPC function via SQL (it should exist on Postgres just like Supabase)
			try {
				await client.query(`SELECT ${trimFunction}()`)
			} catch (trimErr) {
				console.error(`Submit: Error trimming ${table}:`, trimErr)
			}

			await client.query("COMMIT")

			const resp: SubmitResponse = { ok: true, status: "ACCEPTED", entry }
			return http.json(res, 200, resp)

		} catch (error) {
			await client.query("ROLLBACK")
			throw error
		} finally {
			client.release()
		}

	} catch (error: any) {
		console.error("Submit: Uncaught error in submit handler:", error.message || error)
		return http.errorJson(res, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.")
	}
}

export default handler
