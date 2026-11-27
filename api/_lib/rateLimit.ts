// Fixed-window rate limiter backed by Postgres (works across serverless instances).
// Fails open if the database hiccups, so a DB blip never blocks real players.
import { dbName, pool } from "./db"
import { ensureSchema } from "./guard"

type RateLimitConfig = {
	bucket: string // e.g., "submit", "run_start"
	ip: string // the key being limited (usually an IP)
	limit: number // Max requests per window
	windowSec: number
}

type RateLimitResult = { ok: boolean; retryAfterSec: number }

export async function rateLimitFixedWindow(cfg: RateLimitConfig): Promise<RateLimitResult> {
	const now = Math.floor(Date.now() / 1000)
	const windowStart = now - (now % cfg.windowSec)
	try {
		await ensureSchema()
		const r = await pool.query(
			`INSERT INTO ${dbName("rate_limits")} (bucket, key, window_start, count) VALUES ($1, $2, $3, 1)
			 ON CONFLICT (bucket, key, window_start) DO UPDATE SET count = ${dbName("rate_limits")}.count + 1 RETURNING count`,
			[cfg.bucket, cfg.ip, windowStart],
		)
		// Occasionally sweep old windows.
		if (Math.random() < 0.02) pool.query(`DELETE FROM ${dbName("rate_limits")} WHERE window_start < $1`, [now - 86400]).catch(() => {})
		if (r.rows[0].count > cfg.limit) return { ok: false, retryAfterSec: windowStart + cfg.windowSec - now }
		return { ok: true, retryAfterSec: 0 }
	} catch (e) {
		console.error("rateLimit: failing open:", e)
		return { ok: true, retryAfterSec: 0 }
	}
}

export async function rateLimitMultiple(configs: RateLimitConfig[]): Promise<RateLimitResult> {
	for (const c of configs) {
		const r = await rateLimitFixedWindow(c)
		if (!r.ok) return r
	}
	return { ok: true, retryAfterSec: 0 }
}
