import { sha256 } from "./crypto" // Assuming a crypto.ts in same _lib

const SECRET_KEY = process.env.RUN_TOKEN_SECRET || "super-secret-default-key-for-dev"
const TOKEN_EXPIRATION_MS = 1000 * 60 * 60 * 24 // 24 hours

export type RunTokenPayload = {
	runId: string
	seed: number
	exp: number // expiration timestamp
}

export async function generateRunToken(runId: string, seed: number): Promise<string> {
	const payload: RunTokenPayload = {
		runId,
		seed,
		exp: Date.now() + TOKEN_EXPIRATION_MS,
	}
	const payloadStr = JSON.stringify(payload)
	const signature = await sha256(payloadStr + SECRET_KEY)
	return `${btoa(payloadStr)}.${signature}`
}

export async function verifyRunToken(token: string): Promise<RunTokenPayload | null> {
	try {
		const parts = token.split(".")
		if (parts.length !== 2) return null

		const [encodedPayload, signature] = parts
		const payloadStr = atob(encodedPayload)
		const expectedSignature = await sha256(payloadStr + SECRET_KEY)

		if (signature !== expectedSignature) return null // Invalid signature

		const payload: RunTokenPayload = JSON.parse(payloadStr)

		if (payload.exp < Date.now()) return null // Token expired

		return payload
	} catch (e) {
		console.error("Error verifying run token:", e)
		return null
	}
}
