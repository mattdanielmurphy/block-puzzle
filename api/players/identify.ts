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
				ip_address,
				user_agent,
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

		// 3. Score and uniqueify the players found
		// Scoring:
		// +10: Exact IP match
		// +5: User Agent match
		// +2: Partial IP (Network) match
		const playersMap = new Map<string, { id: string; name: string; score: number; best_score: number; chill_best_score: number; last_seen: string }>()

		for (const identity of identities || []) {
			const p: any = identity.players
			if (!p) continue

			let matchScore = 0
			if (identity.ip_address === clientIp) matchScore += 10
			else if (partialIpMatch && identity.ip_address.startsWith(partialIpMatch)) matchScore += 2

			if (identity.user_agent === userAgent) matchScore += 5

			const existing = playersMap.get(p.id)
			if (!existing || matchScore > existing.score) {
				playersMap.set(p.id, {
					id: p.id,
					name: p.name,
					score: matchScore,
					best_score: p.best_score || 0,
					chill_best_score: p.chill_best_score || 0,
					last_seen: identity.last_seen,
				})
			} else if (existing && matchScore === existing.score) {
				// If scores are equal, keep the most recently seen one
				if (new Date(identity.last_seen) > new Date(existing.last_seen)) {
					existing.last_seen = identity.last_seen
				}
			}
		}

		// Sort by match score (primary) and last_seen (secondary)
		const uniquePlayers = Array.from(playersMap.values()).sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score
			return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
		})

		return http.json(res, 200, { ok: true, players: uniquePlayers.slice(0, 10) })
	} catch (e: any) {
		console.error("Identify Player: Uncaught error:", e)
		return http.errorJson(res, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.")
	}
}
