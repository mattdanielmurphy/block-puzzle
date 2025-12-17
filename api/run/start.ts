import type { VercelRequest, VercelResponse } from "@vercel/node"
import { errorJson, json } from "../_lib/http"
import * as ip from "../_lib/ip"
import * as rateLimit from "../_lib/rateLimit"
import * as validation from "../_lib/validation"
import { generateRunToken } from "../_lib/runToken"

// `crypto` is a global in Node.js >= 15.0.0. Vercel's Node.js runtime for
// Serverless Functions supports this.
function generateRandomUint32(): number {
	const array = new Uint32Array(1)
	crypto.getRandomValues(array)
	return array[0]
}

function generateRandomUuid(): string {
	// crypto.randomUUID() is also available in Node.js >= 14.17.0 (Vercel).
	return crypto.randomUUID()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "GET") {
		return errorJson(res, 405, "METHOD_NOT_ALLOWED", "Use GET")
	}

	const clientIp = ip.getClientIp(req)
	{
		const rl = await rateLimit.rateLimitFixedWindow({
			bucket: "run_start",
			ip: clientIp,
			limit: validation.LIMITS.submitPerMinute, // Re-using submit limit for now
			windowSec: 60,
		})
		if (rl.ok === false) {
			res.setHeader("Retry-After", String(rl.retryAfterSec))
			return errorJson(res, 429, "RATE_LIMITED", "Too many requests to start new runs")
		}
	}

	const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`)
	const seedParam = url.searchParams.get("seed")

	const runId = generateRandomUuid()
	const seed = seedParam ? Number(seedParam) : generateRandomUint32()

	if (!Number.isFinite(seed)) {
		return errorJson(res, 400, "VALIDATION_ERROR", "Seed must be a number")
	}

	// Generate a signed token that includes the runId and seed.
	// The client will use this token for score submission to prove
	// that the run was legitimately started.
	const runToken = await generateRunToken(runId, seed)

	return json(res, 200, { runId, runToken, seed })
}