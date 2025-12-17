import type { VercelRequest } from "@vercel/node"

export function getClientIp(req: VercelRequest): string {
	const forwardedFor = req.headers["x-forwarded-for"]
	if (forwardedFor) {
		if (Array.isArray(forwardedFor)) {
			return forwardedFor[0].split(",")[0].trim()
		}
		return forwardedFor.split(",")[0].trim()
	}
	// Fallback for requests not behind a proxy
	return req.socket?.remoteAddress || "UNKNOWN"
}