// @vitest-environment node
import { describe, it, expect } from "vitest"
import { validateName, displayName } from "../api/_lib/validation"

describe("leaderboard name filter", () => {
	it("refuses offensive names, including leetspeak", () => {
		for (const n of ["fuck you", "sh1t head", "n1gger"]) expect(validateName(n).ok).toBe(false)
	})
	it("keeps ordinary names (no Scunthorpe problem)", () => {
		for (const n of ["Matt", "Tyler", "Scunthorpe", "assassin", "Blockhead"]) expect(validateName(n)).toEqual({ ok: true, value: n })
	})
	it("masks old offensive names on the board", () => {
		expect(displayName("sh1t")).toBe("Player")
		expect(displayName("Kristy")).toBe("Kristy")
	})
})
