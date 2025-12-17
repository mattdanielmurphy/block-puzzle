import * as crypto from "crypto"

export type RunTokenPayload = {
	runId: string
	seed: number
	exp: number // epoch ms
}

/**
 * A constant-time string comparison that is safe against timing attacks.
 * This is a fallback for Node.js versions where timingSafeEqual is not available.
 * @param a The first buffer.
 * @param b The second buffer.
 * @returns `true` if the buffers are equal, `false` otherwise.
 */
function constantTimeEqual(a: Buffer, b: Buffer): boolean {
	if (a.length !== b.length) {
		return false
	}
	let d = 0
	for (let i = 0; i < a.length; i++) {
		d |= a[i] ^ b[i]
	}
	return d === 0
}

export function signRunToken(secret: string, payload: RunTokenPayload): string {
	const payloadJson = JSON.stringify(payload)
	const payloadB64 = Buffer.from(payloadJson).toString("base64url")

	const hmac = crypto.createHmac("sha256", secret)
	hmac.update(payloadB64)
	const sig = hmac.digest()
	const sigB64 = sig.toString("base64url")

	return `${payloadB64}.${sigB64}`
}

export function verifyRunToken(secret: string, token: string): { ok: true; payload: RunTokenPayload } | { ok: false; reason: "MALFORMED" | "BAD_SIGNATURE" | "BAD_PAYLOAD" } {
	const parts = token.split(".")
	if (parts.length !== 2) return { ok: false, reason: "MALFORMED" }
	const [payloadB64, sigB64] = parts

	let payload: RunTokenPayload
	try {
		const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8")
		payload = JSON.parse(payloadJson)
	} catch {
		return { ok: false, reason: "BAD_PAYLOAD" }
	}

	if (!payload || typeof payload.runId !== "string" || typeof payload.seed !== "number" || typeof payload.exp !== "number") {
		return { ok: false, reason: "BAD_PAYLOAD" }
	}

	const hmac = crypto.createHmac("sha256", secret)
	hmac.update(payloadB64)
	const expectedSig = hmac.digest()

	let providedSig: Buffer
	try {
		providedSig = Buffer.from(sigB64, "base64url")
	} catch {
		return { ok: false, reason: "BAD_SIGNATURE" }
	}

	if (expectedSig.length !== providedSig.length) {
		return { ok: false, reason: "BAD_SIGNATURE" }
	}

	// Use native timingSafeEqual if available, otherwise use our polyfill
	const isEqual = typeof crypto.timingSafeEqual === "function" 
		? crypto.timingSafeEqual(expectedSig, providedSig)
		: constantTimeEqual(expectedSig, providedSig)

	if (!isEqual) {
		return { ok: false, reason: "BAD_SIGNATURE" }
	}

	return { ok: true, payload }
}
