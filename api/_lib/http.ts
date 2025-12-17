import type { VercelResponse } from "@vercel/node"

export function json<T>(res: VercelResponse, status: number, data: T) {
	res.setHeader("Content-Type", "application/json")
	res.status(status).send(JSON.stringify(data))
}

export function errorJson(
	res: VercelResponse,
	status: number,
	code: string,
	message: string,
	metadata?: Record<string, any>,
) {
	res.setHeader("Content-Type", "application/json")
	res.status(status).send(JSON.stringify({ ok: false, error: code, message, ...metadata }))
}