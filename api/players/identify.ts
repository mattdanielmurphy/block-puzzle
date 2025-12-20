import * as http from "../_lib/http"
import * as ip from "../_lib/ip"

import type { VercelRequest, VercelResponse } from "@vercel/node"

import { supabase } from "../_lib/supabase"

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "GET") return http.errorJson(res, 405, "METHOD_NOT_ALLOWED", "Use GET")
	if (!supabase) return http.json(res, 200, { ok: true, players: [] })

	const clientIp = ip.getClientIp(req)
	const userAgent = (req.headers["user-agent"] as string) || "UNKNOWN"

	console.log(`[Identify] Client IP: ${clientIp}`)
	console.log(`[Identify] User Agent: ${userAgent}`)

	try {
		// 1. Prepare network prefix for home network matching
		const isIpv6 = clientIp.includes(":")
		let partialIpMatch: string | null = null
		if (isIpv6) {
			const segments = clientIp.split(":")
			if (segments.length >= 4) partialIpMatch = segments.slice(0, 4).join(":")
		} else if (clientIp !== "127.0.0.1") {
			const segments = clientIp.split(".")
			if (segments.length >= 3) partialIpMatch = segments.slice(0, 3).join(".")
		}

		// 2. Search player_identities for matching IP or User Agent
		// We join with the players table to get the name and scores
		let query = supabase.from("player_identities").select(`
				last_seen,
				players (
					id,
					name,
					best_score,
					chill_best_score
				)
			`)

		// Filter by IP (Exact or Prefix) OR User Agent
		const uaMatch = `user_agent.eq.${userAgent}`
		const ipMatch = partialIpMatch ? `ip_address.like.${partialIpMatch}%` : `ip_address.eq.${clientIp}`

		query = query.or(`${ipMatch},${uaMatch}`)

		const { data: identities, error } = await query.order("last_seen", { ascending: false }).limit(20)

		if (error) {
			console.error("Identify: Query error:", error)
			throw error
		}

		// 3. Extract and uniqueify the players found
		const playersMap = new Map<string, any>()

		for (const identity of identities || []) {
			const p: any = identity.players
			if (p && !playersMap.has(p.id)) {
				playersMap.set(p.id, {
					id: p.id,
					name: p.name,
					best_score: p.best_score || 0,
					chill_best_score: p.chill_best_score || 0,
					last_seen: identity.last_seen,
				})
			}
		}

		const uniquePlayers = Array.from(playersMap.values()).sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime())

		return http.json(res, 200, { ok: true, players: uniquePlayers.slice(0, 3) })
	} catch (e: any) {
		console.error("Identify Player: Uncaught error:", e)
		return http.errorJson(res, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.")
	}
}
