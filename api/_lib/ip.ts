import type { VercelRequest } from "@vercel/node"

export function getClientIp(req: VercelRequest): string {
	const xff = req.headers["x-forwarded-for"]
	if (typeof xff === "string" && xff.trim()) {
		// First IP in the list is the original client in most proxies
		return xff.split(",")[0].trim()
	}
	const xrip = req.headers["x-real-ip"]
	if (typeof xrip === "string" && xrip.trim()) return xrip.trim()

	// Node adapter
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const anyReq = req as any
	const ra = anyReq.socket?.remoteAddress || anyReq.connection?.remoteAddress
	return typeof ra === "string" && ra.trim() ? ra : "0.0.0.0"
}
