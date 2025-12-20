import * as http from "../_lib/http"
import * as ip from "../_lib/ip"
import * as validation from "../_lib/validation"

import type { VercelRequest, VercelResponse } from "@vercel/node"

import { supabase } from "../_lib/supabase"

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "POST") return http.errorJson(res, 405, "METHOD_NOT_ALLOWED", "Use POST")
	if (!supabase) return http.errorJson(res, 503, "SERVICE_UNAVAILABLE", "Database not available")

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
		// 1. Check if this player NAME already exists (ignoring fingerprint initially)
		// We want to enforce "One Player Entity per Name" to keep the UUID consistent.
		// If they exist, we UPDATE their fingerprint to the current one.
		// This sacrifices "multi-device concurrent memory" for "consistent UUID".
		const { data: existingPlayer } = await supabase.from("players").select("id, best_score, chill_best_score").eq("name", name).limit(1).maybeSingle()

		let playerId: string

		if (existingPlayer) {
			playerId = existingPlayer.id
		} else {
			// Create new player record if they've never played before
			const { data: newPlayer, error: insertError } = await supabase.from("players").insert({ name: name }).select("id").single()

			if (insertError) {
				console.error("Sync Player: Error inserting player:", insertError)
				return http.errorJson(res, 500, "DATABASE_ERROR", "Could not sync player")
			}
			playerId = newPlayer.id
		}

		// 2. Upsert the current identity (IP + UA) for this player
		// This automatically handles having multiple IPs/UAs for one player
		await supabase.from("player_identities").upsert(
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

		// 3. Mark the player themselves as last seen
		await supabase.from("players").update({ last_seen: new Date().toISOString() }).eq("id", playerId)

		// 3. Link existing scores with this name to this new playerId if they don't have one
		await supabase.from("scores").update({ player_id: playerId }).eq("name", name).is("player_id", null)
		await supabase.from("chill_scores").update({ player_id: playerId }).eq("name", name).is("player_id", null)

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
