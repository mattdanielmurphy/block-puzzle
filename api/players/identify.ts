import * as http from "../_lib/http"
import * as ip from "../_lib/ip"

import type { VercelRequest, VercelResponse } from "@vercel/node"
import { dbName, pool, connectionString } from "../_lib/db"

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "GET") return http.errorJson(res, 405, "METHOD_NOT_ALLOWED", "Use GET")
	if (!connectionString) return http.json(res, 200, { ok: true, players: [] })

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
		const identitiesTable = dbName("player_identities")
		const playersTable = dbName("players")

		let queryStr = `
			SELECT 
				i.ip_address, 
				i.user_agent, 
				i.last_seen as identity_last_seen,
				p.id as player_id,
				p.name,
				p.best_score,
				p.chill_best_score
			FROM ${identitiesTable} i
			JOIN ${playersTable} p ON i.player_id = p.id
			WHERE i.user_agent = $1 OR i.ip_address = $2
		`
		const params = [userAgent, clientIp]

		if (partialIpMatch) {
			queryStr += ` OR i.ip_address LIKE $3`
			params.push(`${partialIpMatch}%`)
		}

		queryStr += ` ORDER BY i.last_seen DESC LIMIT 20`

		const { rows: identities } = await pool.query(queryStr, params)

		// 3. Score and uniqueify the players found
		const playersMap = new Map<string, { id: string; name: string; score: number; best_score: number; chill_best_score: number; last_seen: string }>()

		for (const identity of identities) {
			if (!identity.player_id) continue

			let matchScore = 0
			if (identity.ip_address === clientIp) matchScore += 10
			else if (partialIpMatch && identity.ip_address.startsWith(partialIpMatch)) matchScore += 2

			if (identity.user_agent === userAgent) matchScore += 5

			const existing = playersMap.get(identity.player_id)
			const lastSeen = identity.identity_last_seen.toISOString()

			if (!existing || matchScore > existing.score) {
				playersMap.set(identity.player_id, {
					id: identity.player_id,
					name: identity.name,
					score: matchScore,
					best_score: identity.best_score || 0,
					chill_best_score: identity.chill_best_score || 0,
					last_seen: lastSeen,
				})
			} else if (existing && matchScore === existing.score) {
				if (new Date(lastSeen) > new Date(existing.last_seen)) {
					existing.last_seen = lastSeen
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
