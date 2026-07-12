import * as http from "../_lib/http"
import * as ip from "../_lib/ip"
import * as validation from "../_lib/validation"

import type { VercelRequest, VercelResponse } from "@vercel/node"
import { dbName, pool, connectionString } from "../_lib/db"

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "POST") return http.errorJson(res, 405, "METHOD_NOT_ALLOWED", "Use POST")
	if (!connectionString) return http.errorJson(res, 503, "SERVICE_UNAVAILABLE", "Database not available")

	const clientIp = ip.getClientIp(req)
	const userAgent = (req.headers["user-agent"] as string) || "UNKNOWN"

	let body: any
	try {
		body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
	} catch (e) {
		return http.errorJson(res, 400, "BAD_JSON", "Invalid JSON body")
	}

	const nameV = validation.validateName(body.name)
	if (!nameV.ok) {
		return http.errorJson(res, 400, "VALIDATION_ERROR", nameV.message)
	}
	const name = nameV.value

	try {
		const existingRes = await pool.query(`SELECT id, best_score, chill_best_score FROM ${dbName("players")} WHERE name = $1 LIMIT 1`, [name])
		const existingPlayer = existingRes.rows.length > 0 ? existingRes.rows[0] : null

		let playerId: string

		if (existingPlayer) {
			playerId = existingPlayer.id
		} else {
			try {
				const newPlayerRes = await pool.query(`INSERT INTO ${dbName("players")} (name) VALUES ($1) RETURNING id`, [name])
				playerId = newPlayerRes.rows[0].id
			} catch (insertError) {
				console.error("Sync Player: Error inserting player:", insertError)
				return http.errorJson(res, 500, "DATABASE_ERROR", "Could not sync player")
			}
		}

		await pool.query(`
			INSERT INTO ${dbName("player_identities")} (player_id, ip_address, user_agent, last_seen)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (player_id, ip_address, user_agent) DO UPDATE SET last_seen = EXCLUDED.last_seen
		`, [playerId, clientIp, userAgent, new Date().toISOString()])

		await pool.query(`UPDATE ${dbName("players")} SET last_seen = $1 WHERE id = $2`, [new Date().toISOString(), playerId])

		await pool.query(`UPDATE ${dbName("scores")} SET player_id = $1 WHERE name = $2 AND player_id IS NULL`, [playerId, name])
		await pool.query(`UPDATE ${dbName("chill_scores")} SET player_id = $1 WHERE name = $2 AND player_id IS NULL`, [playerId, name])

		return http.json(res, 200, {
			ok: true,
			status: "SYNCED",
			playerId,
			best_score: existingPlayer?.best_score || 0,
			chill_best_score: existingPlayer?.chill_best_score || 0,
		})
	} catch (e: any) {
		console.error("Sync Player: Uncaught error:", e)
		return http.errorJson(res, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.")
	}
}
