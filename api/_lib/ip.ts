import type { VercelRequest } from "@vercel/node"

export function getClientIp(req: VercelRequest): string {
	// Prioritize client-reported public IP (fetched via client-side ipify)
	// This helps ensure we get IPv6 consistently if available, which is better for network matching.
	const clientReportedIp = req.headers["x-client-public-ip"]
	if (clientReportedIp && typeof clientReportedIp === "string") {
		return clientReportedIp
	}

	let connectionIp = "UNKNOWN"
	const forwardedFor = req.headers["x-forwarded-for"]
	if (forwardedFor) {
		if (Array.isArray(forwardedFor)) {
			connectionIp = forwardedFor[0].split(",")[0].trim()
		} else {
			connectionIp = forwardedFor.split(",")[0].trim()
		}
	} else {
		connectionIp = req.socket?.remoteAddress || "UNKNOWN"
	}

	// Normalize connection IP
	if (connectionIp === "::1") connectionIp = "127.0.0.1"
	if (connectionIp.startsWith("::ffff:")) connectionIp = connectionIp.substring(7)

	// LOGIC: Prefer IPv6.
	// If the connection is IPv6 but the reported IP is IPv4, the connection IP is more likely the correct network marker.
	const isIpv6 = (addr: string) => addr.includes(":")

	if (clientReportedIp && typeof clientReportedIp === "string") {
		// If we have a reported IP, use it... UNLESS the connection is IPv6 and the reported one is not.
		if (!isIpv6(clientReportedIp) && isIpv6(connectionIp)) {
			return connectionIp
		}
		return clientReportedIp
	}

	return connectionIp
}
