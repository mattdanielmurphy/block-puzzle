import type { VercelRequest } from "@vercel/node"

export function getClientIp(req: VercelRequest): string {
	// ALLOW DEV OVERRIDE
	// This header is set by the frontend in dev mode to simulate the real public IP
	// instead of localhost (127.0.0.1)
	const devIp = req.headers["x-dev-public-ip"]
	if (devIp && typeof devIp === "string") {
		return devIp
	}

	const forwardedFor = req.headers["x-forwarded-for"]
	if (forwardedFor) {
		if (Array.isArray(forwardedFor)) {
			return forwardedFor[0].split(",")[0].trim()
		}
		return forwardedFor.split(",")[0].trim()
	}
	// Fallback for requests not behind a proxy
	let ip = req.socket?.remoteAddress || "UNKNOWN"

	// Normalize localhost IPv6
	if (ip === "::1") {
		ip = "127.0.0.1"
	}

	// Normalize IPv4-mapped IPv6
	if (ip.startsWith("::ffff:")) {
		ip = ip.substring(7)
	}

	return ip
}
