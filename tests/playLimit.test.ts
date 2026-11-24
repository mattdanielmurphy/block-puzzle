// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest"

const mem: Record<string, string> = {}
;(globalThis as any).localStorage = {
	getItem: (k: string) => (k in mem ? mem[k] : null),
	setItem: (k: string, v: string) => (mem[k] = String(v)),
	removeItem: (k: string) => delete mem[k],
}
const { PlayLimit } = await import("../src/playLimit")

const at = (h: number, m = 0, day = 23) => new Date(2026, 10, day, h, m, 0)

describe("PlayLimit", () => {
	beforeEach(() => Object.keys(mem).forEach((k) => delete mem[k]))

	it("is on by default, and switching it off unlocks", () => {
		const l = new PlayLimit()
		expect(l.enabled).toBe(true)
		expect(l.state(at(2)).locked).toBe(true)
		l.enabled = false
		expect(l.state(at(2)).locked).toBe(false)
	})

	it("locks midnight to 5 AM and reopens at 5", () => {
		const l = new PlayLimit()
		l.enabled = true
		const s = l.state(at(0, 30))
		expect(s.locked && s.reason).toBe("night")
		if (s.locked) expect(s.reopenAt.getHours()).toBe(5)
		expect(l.state(at(5, 0)).locked).toBe(false)
		expect(l.state(at(23, 59)).locked).toBe(false)
	})

	it("counts active time only and locks after 2 h until 5 AM", () => {
		const l = new PlayLimit()
		l.enabled = true
		const start = at(20).getTime()
		for (let s = 0; s <= 2 * 3600; s++) l.tick(true, new Date(start + s * 1000))
		const st = l.state(new Date(start + 2 * 3600 * 1000))
		expect(st.locked && st.reason).toBe("limit")
		if (st.locked) {
			expect(st.reopenAt.getHours()).toBe(5)
			expect(st.reopenAt.getDate()).toBe(24)
		}
	})

	it("ignores paused time and sleep gaps", () => {
		const l = new PlayLimit()
		l.enabled = true
		const t = at(10).getTime()
		l.tick(true, new Date(t))
		l.tick(true, new Date(t + 1000))
		l.tick(false, new Date(t + 60_000))
		l.tick(true, new Date(t + 3_600_000)) // app was asleep for an hour: counts at most 2 s
		expect(l.playedMs(new Date(t + 3_600_000))).toBeLessThanOrEqual(3000)
	})

	it("refills at 5 AM, not at midnight", () => {
		const l = new PlayLimit()
		l.enabled = true
		const t = at(22).getTime()
		for (let s = 0; s <= 600; s++) l.tick(true, new Date(t + s * 1000))
		expect(l.playedMs(at(23, 30))).toBeGreaterThan(590_000)
		expect(l.playedMs(at(5, 1, 24))).toBe(0)
	})

})
