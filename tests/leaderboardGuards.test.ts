// @vitest-environment node
import { describe, it, expect } from "vitest"
import { checkScorePlausible } from "../api/_lib/plausibility"
import { generateRunToken, verifyRunToken } from "../api/_lib/runToken"
import { parseDeviceKey } from "../api/_lib/guard"

describe("score plausibility", () => {
	const t0 = 1_000_000
	it("accepts a real-looking score", () => expect(checkScorePlausible(3436, t0, t0 + 15 * 60_000).ok).toBe(true))
	it("rejects a score faster than the game can be played", () => expect(checkScorePlausible(5000, t0, t0 + 10_000).ok).toBe(false))
	it("rejects anything over the hard ceiling, however long the run", () => expect(checkScorePlausible(1_000_000, t0, t0 + 30 * 86_400_000).ok).toBe(false))
})

describe("run token", () => {
	it("round-trips and carries the issue time", async () => {
		const tok = await generateRunToken("abc123abc123abc123", 7, 5000)
		expect((await verifyRunToken(tok, 6000))?.iat).toBe(5000)
	})
	it("rejects a tampered payload (moved issue time)", async () => {
		const [p, sig] = (await generateRunToken("abc123abc123abc123", 7, 5000)).split(".")
		const forged = btoa(atob(p).replace('"iat":5000', '"iat":1')) + "." + sig
		expect(await verifyRunToken(forged, 6000)).toBeNull()
	})
})

describe("device key", () => {
	it("needs 32+ url-safe chars", () => {
		expect(parseDeviceKey("a".repeat(64))).toBe("a".repeat(64))
		expect(parseDeviceKey("short")).toBeNull()
		expect(parseDeviceKey(42)).toBeNull()
	})
})
