import { sha256 } from "./crypto"

const SECRET_KEY = process.env.RUN_TOKEN_SECRET || "super-secret-default-key-for-dev"
// Long enough for a saved game resumed days later; reuse is blocked by the used-runs table.
const TOKEN_EXPIRATION_MS = 1000 * 60 * 60 * 24 * 30

export type RunTokenPayload = {
	runId: string
	seed: number
	iat: number // issued at (server time), anchors the score plausibility check
	exp: number // expiration timestamp
}

export async function generateRunToken(runId: string, seed: number, now = Date.now()): Promise<string> {
	const payload: RunTokenPayload = { runId, seed, iat: now, exp: now + TOKEN_EXPIRATION_MS }
	const payloadStr = JSON.stringify(payload)
	const signature = await sha256(payloadStr + SECRET_KEY)
	return `${btoa(payloadStr)}.${signature}`
}

export async function verifyRunToken(token: string, now = Date.now()): Promise<RunTokenPayload | null> {
	try {
		const parts = token.split(".")
		if (parts.length !== 2) return null
		const [encodedPayload, signature] = parts
		const payloadStr = atob(encodedPayload)
		const expectedSignature = await sha256(payloadStr + SECRET_KEY)
		if (signature !== expectedSignature) return null
		const payload: RunTokenPayload = JSON.parse(payloadStr)
		if (typeof payload.iat !== "number" || typeof payload.runId !== "string") return null
		if (payload.exp < now) return null
		return payload
	} catch {
		return null
	}
}
