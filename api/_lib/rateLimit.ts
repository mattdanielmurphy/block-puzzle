// This is a dummy rate limiter. In a real application, you would use a Redis
// store or similar to track and enforce rate limits across multiple instances.
// For now, it always allows.

type RateLimitConfig = {
	bucket: string // e.g., "submit", "verify", "leaderboard"
	ip: string
	limit: number // Max requests
	windowSec: number // Time window in seconds
}

type RateLimitResult = {
	ok: boolean
	retryAfterSec: number
}

// Always allows. In a real scenario, this would interact with a database/cache.
export async function rateLimitFixedWindow(_config: RateLimitConfig): Promise<RateLimitResult> {
	return { ok: true, retryAfterSec: 0 }
}

export async function rateLimitMultiple(_configs: RateLimitConfig[]): Promise<RateLimitResult> {
	return { ok: true, retryAfterSec: 0 }
}
