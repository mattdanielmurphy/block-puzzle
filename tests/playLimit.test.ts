// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest"

const mem: Record<string, string> = {}
;(globalThis as any).localStorage = {
	getItem: (k: string) => (k in mem ? mem[k] : null),
	setItem: (k: string, v: string) => (mem[k] = String(v)),
	removeItem: (k: string) => delete mem[k],
}
const { PlayLimit, lockLandsNow } = await import("../src/playLimit")

const MIN = 60_000
const HOUR = 60 * MIN
const at = (h: number, m = 0, day = 23) => new Date(2026, 10, day, h, m, 0)

/** Play for `ms`, ticking every second from `start`; returns the end time. */
function play(l: InstanceType<typeof PlayLimit>, start: number, ms: number) {
	for (let t = start; t <= start + ms; t += 1000) l.tick(true, new Date(t))
	l.tick(false, new Date(start + ms + 1000))
	return start + ms
}

/** A limit with the session limit out of the way, to test the daily one alone. */
function dailyOnly() {
	const l = new PlayLimit()
	l.sessionMs = 99 * HOUR
	return l
}

describe("PlayLimit", () => {
	beforeEach(() => Object.keys(mem).forEach((k) => delete mem[k]))

	it("is on by default with 2 h / 24 h and 30 min sessions, and switching it off unlocks", () => {
		const l = new PlayLimit()
		expect(l.enabled).toBe(true)
		expect(l.dailyMs).toBe(2 * HOUR)
		expect(l.windowMs).toBe(24 * HOUR)
		expect(l.sessionMs).toBe(30 * MIN)
		expect(l.breakMs).toBe(15 * MIN)
		const end = play(l, at(20).getTime(), 30 * MIN)
		expect(l.state(new Date(end)).locked).toBe(true)
		l.enabled = false
		expect(l.state(new Date(end)).locked).toBe(false)
	})

	it("off by default on App Shack's public build", () => {
		;(globalThis as any).superapp = { public: true }
		try {
			const l = new PlayLimit()
			expect(l.enabled).toBe(false)
			l.enabled = true
			expect(l.enabled).toBe(true)
		} finally {
			delete (globalThis as any).superapp
		}
	})

	it("no night lock: 3 AM is open", () => {
		const l = new PlayLimit()
		for (const h of [0, 1, 3, 4, 23]) expect(l.state(at(h)).locked).toBe(false)
		play(l, at(3).getTime(), 10 * MIN)
		expect(l.state(at(3, 11)).locked).toBe(false)
	})

	it("session: locks after 30 min in a row, lifts once the 15 min break is done", () => {
		const l = new PlayLimit()
		const end = play(l, at(14).getTime(), 30 * MIN)
		const s = l.state(new Date(end))
		expect(s.locked && s.reason).toBe("session")
		if (s.locked) expect(s.reopenAt.getTime()).toBe(end + 15 * MIN)
		expect(l.state(new Date(end + 14 * MIN)).locked).toBe(true)
		const after = l.state(new Date(end + 15 * MIN))
		expect(after.locked).toBe(false)
		if (!after.locked) expect(after.remainingMs).toBe(30 * MIN)
	})

	it("session: a short pause doesn't reset it, a 15 min break does", () => {
		const l = new PlayLimit()
		let t = play(l, at(14).getTime(), 20 * MIN)
		t = play(l, t + 5 * MIN, 10 * MIN) // 5 min pause, then 10 more: 30 in this session
		expect(l.state(new Date(t)).locked).toBe(true)
		const l2 = new PlayLimit()
		Object.keys(mem).forEach((k) => delete mem[k])
		let u = play(l2, at(14).getTime(), 20 * MIN)
		u = play(l2, u + 16 * MIN, 10 * MIN) // 16 min break: a new session with 10 min played
		expect(l2.sessionPlayedMs(new Date(u))).toBeLessThan(11 * MIN)
		expect(l2.state(new Date(u)).locked).toBe(false)
	})

	it("daily: 2 h in any 24 h, reopens when old play drops out of the window", () => {
		const l = dailyOnly()
		// 1 h in the morning, 1 h in the evening.
		play(l, at(8).getTime(), HOUR)
		const end = play(l, at(20).getTime(), HOUR)
		const s = l.state(new Date(end))
		expect(s.locked && s.reason).toBe("daily")
		// Reopens with 10 min to spare: once 8:00–8:10 the next day has left the window.
		if (s.locked) expect(Math.abs(s.reopenAt.getTime() - at(8, 10, 24).getTime())).toBeLessThanOrEqual(5000) // ±tick rounding
		expect(l.state(at(23, 59)).locked).toBe(true)
		expect(l.state(at(5, 0, 24)).locked).toBe(true) // no reset at 5 AM or midnight
		const open = l.state(at(8, 11, 24))
		expect(open.locked).toBe(false)
		if (!open.locked) expect(Math.abs(open.remainingMs - 11 * MIN)).toBeLessThanOrEqual(5000)
		expect(Math.abs(l.playedMs(at(9, 1, 24)) - HOUR)).toBeLessThanOrEqual(5000)
	})

	it("daily: the lock holds across a relaunch", () => {
		const l = dailyOnly()
		const end = play(l, at(10).getTime(), 2 * HOUR)
		expect(l.state(new Date(end)).locked).toBe(true)
		const again = dailyOnly()
		expect(again.state(new Date(end + 2 * MIN)).locked).toBe(true)
	})

	it("daily: play while a game finishes pushes the reopen time back", () => {
		const l = dailyOnly()
		const end = play(l, at(10).getTime(), 2 * HOUR)
		const first = l.state(new Date(end))
		const later = play(l, end + 1000, 5 * MIN) // the game in progress plays on
		const second = l.state(new Date(later))
		expect(first.locked && second.locked).toBe(true)
		if (first.locked && second.locked) expect(second.reopenAt.getTime() - first.reopenAt.getTime()).toBeGreaterThanOrEqual(5 * MIN)
	})

	it("ignores paused time and sleep gaps", () => {
		const l = new PlayLimit()
		const t = at(10).getTime()
		l.tick(true, new Date(t))
		l.tick(true, new Date(t + 1000))
		l.tick(false, new Date(t + 60_000))
		l.tick(true, new Date(t + 3_600_000)) // app was asleep for an hour: counts at most 2 s
		expect(l.playedMs(new Date(t + 3_600_000))).toBeLessThanOrEqual(3000)
	})

	it("warns once when 5 min are left", () => {
		const l = new PlayLimit()
		const start = at(14).getTime()
		play(l, start, 24 * MIN)
		expect(l.shouldWarn(new Date(start + 24 * MIN + 1000))).toBe(false)
		const t = play(l, start + 24 * MIN + 2000, MIN + 30_000)
		expect(l.shouldWarn(new Date(t))).toBe(true)
		expect(l.shouldWarn(new Date(t + 500))).toBe(false)
	})

	it("a due lock waits for the game in progress", () => {
		const base = { firstCheck: false, nextGameStarting: false, alreadyLocked: false }
		expect(lockLandsNow({ ...base, midGame: true })).toBe(false) // never mid-game
		expect(lockLandsNow({ ...base, midGame: true, nextGameStarting: true })).toBe(true) // lands at the next game
		expect(lockLandsNow({ ...base, midGame: false })).toBe(true) // fresh board, no move yet
		expect(lockLandsNow({ ...base, midGame: true, firstCheck: true })).toBe(true) // on launch
	})
})
