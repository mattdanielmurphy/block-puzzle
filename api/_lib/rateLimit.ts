// TODO: Re-implement rate limiting using Supabase/Postgres instead of Redis.
// The previous implementation was removed to allow the project to build after
// the Redis client was deleted.

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSec: number }

/**
 * Fixed-window rate limiting.
 * This is a stub implementation that always returns success.
 */
export async function rateLimitFixedWindow(params: {
	bucket: string
	ip: string
	limit: number
	windowSec: number
}): Promise<RateLimitResult> {
	// Rate limiting is currently disabled.
	return { ok: true, remaining: params.limit }
}

/**
 * Check multiple rate limits. Returns the first failure, or success if all pass.
 * This is a stub implementation that always returns success.
 */
export async function rateLimitMultiple(
	limits: Array<{ bucket: string; ip: string; limit: number; windowSec: number }>
): Promise<RateLimitResult> {
	for (const limit of limits) {
		const result = await rateLimitFixedWindow(limit)
		if (result.ok === false) {
			return result
		}
	}
	return { ok: true, remaining: Math.min(...limits.map((l) => l.limit)) }
}
