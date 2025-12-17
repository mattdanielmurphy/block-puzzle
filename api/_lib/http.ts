import type { VercelResponse } from "@vercel/node"

export function json(res: VercelResponse, status: number, body: any): void {
	res.status(status)
	res.setHeader("content-type", "application/json; charset=utf-8")
	res.end(JSON.stringify(body))
}

export function errorJson(res: VercelResponse, status: number, code: string, message: string, extra?: Record<string, unknown>): void {
	json(res, status, { ok: false, error: { code, message, ...extra } })
}
