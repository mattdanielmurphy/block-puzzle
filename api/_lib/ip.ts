import type { VercelRequest } from "@vercel/node"

export function getClientIp(req: VercelRequest): string {
	// Prioritize client-reported public IP (fetched via client-side ipify)
	// This helps ensure we get IPv6 consistently if available, which is better for network matching.
	const clientReportedIp = req.headers["x-client-public-ip"]
	if (clientReportedIp && typeof clientReportedIp === "string") {
		return clientReportedIp
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
