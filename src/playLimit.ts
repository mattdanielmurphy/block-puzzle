// Play limits (2026-11-23, reworked 2026-11-27).
// On for every player by default (Matt, 2026-11-23: "let's make these global limits");
// Settings can still switch it off on one device.
//
// Two limits, no night lock (Matt, 2026-11-27: "Remove the nighttime block… a revolving 24 hr
// limit as well as single session limit (30 mins?) but we never interrupt the player mid game"):
// - Daily: at most `dailyMs` of play in any rolling `windowMs` (2 h in 24 h). Once hit, it
//   reopens when enough old play has dropped out of the window to give back `minGameMs`.
// - Session: at most `sessionMs` of play in a row (30 min). A break of `breakMs` (15 min)
//   ends the session; the lock lifts when that break is done.
// The caller (main.ts) only applies a lock between games.
//
// Counts time the game is on screen and not paused / over; gaps over 2 s don't count.
// Play is kept as merged [start, end] segments (ms) in localStorage, pruned to the window.
// Knobs live in tweaks.json (limit.*).
import { tweak } from "./tweaks"

const K_ON = "bp_limit_on"
const K_LOG = "bp_limit_log"
const K_REOPEN = "bp_limit_reopen"
const K_WARNED = "bp_limit_warned"
const OLD_KEYS = ["bp_limit_day", "bp_limit_ms", "bp_limit_warned_day"]

/** Max gap between two ticks that still counts as play (and joins two segments). */
const TICK_CAP = 2000

export type LimitReason = "daily" | "session"
export type LimitState =
	| { locked: false; remainingMs: number; reason: LimitReason }
	| { locked: true; reason: LimitReason; reopenAt: Date }

type Seg = [number, number]

function store(key: string, value?: string | null): string | null {
	try {
		if (value === undefined) return localStorage.getItem(key)
		if (value === null) localStorage.removeItem(key)
		else localStorage.setItem(key, value)
	} catch {}
	return null
}

export class PlayLimit {
	dailyMs: number
	windowMs: number
	sessionMs: number
	breakMs: number
	minGameMs: number
	warnMs: number
	private last = 0

	constructor() {
		this.dailyMs = tweak("limit.dailyMinutes", 120) * 60_000
		this.windowMs = tweak("limit.windowHours", 24) * 3_600_000
		this.sessionMs = tweak("limit.sessionMinutes", 30) * 60_000
		this.breakMs = tweak("limit.breakMinutes", 15) * 60_000
		this.minGameMs = tweak("limit.reopenMinutes", 10) * 60_000
		this.warnMs = tweak("limit.warnMinutes", 5) * 60_000
		// Test builds: VITE_LIMIT_TEST="daily=40,window=300,session=20,break=10,reopen=5,warn=5" (seconds)
		// shortens everything and turns it on.
		const test = import.meta.env.VITE_LIMIT_TEST as string | undefined
		if (test) {
			const p = Object.fromEntries(test.split(",").map((kv) => kv.split("=").map((s) => s.trim())))
			if (p.daily) this.dailyMs = Number(p.daily) * 1000
			if (p.window) this.windowMs = Number(p.window) * 1000
			if (p.session) this.sessionMs = Number(p.session) * 1000
			if (p.break) this.breakMs = Number(p.break) * 1000
			if (p.reopen) this.minGameMs = Number(p.reopen) * 1000
			if (p.warn) this.warnMs = Number(p.warn) * 1000
			this.enabled = true
		}
		this.minGameMs = Math.min(this.minGameMs, this.dailyMs)
		for (const k of OLD_KEYS) store(k, null)
	}

	get enabled() {
		// App Shack's public build: off unless switched on in Settings (a stranger or Apple's reviewer
		// playing for a while would think the game is broken).
		const v = store(K_ON)
		if ((globalThis as any).superapp?.public === true) return v === "true"
		return v !== "false"
	}
	set enabled(v: boolean) {
		store(K_ON, String(v))
	}

	private log(): Seg[] {
		try {
			const v = JSON.parse(store(K_LOG) || "[]")
			return Array.isArray(v) ? v.filter((s) => Array.isArray(s) && s.length === 2 && s[1] >= s[0]) : []
		} catch {
			return []
		}
	}
	private saveLog(segs: Seg[]) {
		store(K_LOG, JSON.stringify(segs))
	}

	/** Play inside the rolling window ending at `now`. */
	playedMs(now = new Date()) {
		const t = now.getTime()
		const from = t - this.windowMs
		let sum = 0
		for (const [a, b] of this.log()) sum += Math.max(0, Math.min(b, t) - Math.max(a, from))
		return sum
	}

	/** Play since the last break of at least `breakMs` (0 if that break is happening now). */
	sessionPlayedMs(now = new Date()) {
		const t = now.getTime()
		const segs = this.log()
		if (!segs.length || t - segs[segs.length - 1][1] >= this.breakMs) return 0
		let sum = 0
		for (let i = segs.length - 1; i >= 0; i--) {
			sum += segs[i][1] - segs[i][0]
			if (i > 0 && segs[i][0] - segs[i - 1][1] >= this.breakMs) break
		}
		return sum
	}

	/** Call about once a second. `active` = game on screen, not paused, not over. */
	tick(active: boolean, now = new Date()) {
		const t = now.getTime()
		const delta = this.last ? Math.min(Math.max(t - this.last, 0), TICK_CAP) : 0
		this.last = t
		if (!this.enabled || !active || delta <= 0) return
		const segs = this.log().filter(([, b]) => b > t - this.windowMs)
		const lastSeg = segs[segs.length - 1]
		const start = t - delta
		if (lastSeg && start - lastSeg[1] <= TICK_CAP / 2) lastSeg[1] = Math.max(lastSeg[1], t)
		else segs.push([start, t])
		this.saveLog(segs)
	}

	/** Earliest moment the rolling total falls to `dailyMs - minGameMs` (no new play assumed). */
	private dailyReopen(now: Date) {
		const t = now.getTime()
		const from = t - this.windowMs
		let need = this.playedMs(now) - (this.dailyMs - this.minGameMs)
		for (const [a0, b] of this.log()) {
			const a = Math.max(a0, from)
			if (b <= a) continue
			if (b - a >= need) return new Date(a + need + this.windowMs)
			need -= b - a
		}
		return new Date(t)
	}

	state(now = new Date()): LimitState {
		if (!this.enabled) return { locked: false, remainingMs: Infinity, reason: "daily" }
		const t = now.getTime()
		// Daily: once hit, stays shut until enough comes back for a game (stored, so it holds across launches).
		let dailyAt = Number(store(K_REOPEN)) || 0
		if (dailyAt && dailyAt <= t) {
			store(K_REOPEN, null)
			dailyAt = 0
		}
		const dailyLeft = this.dailyMs - this.playedMs(now)
		if (dailyLeft <= 0) {
			// Recomputed while a finishing game keeps adding play, so the reopen time moves with it.
			const at = this.dailyReopen(now).getTime()
			if (at > dailyAt) dailyAt = at
			if (dailyAt > t) store(K_REOPEN, String(dailyAt))
		}
		const sessionLeft = this.sessionMs - this.sessionPlayedMs(now)
		const segs = this.log()
		const sessionAt = sessionLeft <= 0 && segs.length ? segs[segs.length - 1][1] + this.breakMs : 0
		if (dailyAt > t || sessionAt > t) {
			// Both hit: show the one that reopens later.
			return dailyAt >= sessionAt
				? { locked: true, reason: "daily", reopenAt: new Date(dailyAt) }
				: { locked: true, reason: "session", reopenAt: new Date(sessionAt) }
		}
		return dailyLeft <= sessionLeft
			? { locked: false, remainingMs: dailyLeft, reason: "daily" }
			: { locked: false, remainingMs: sessionLeft, reason: "session" }
	}

	/** True once each time play gets within `warnMs` of a limit. */
	shouldWarn(now = new Date()) {
		const s = this.state(now)
		if (s.locked || s.remainingMs > this.warnMs * 2) {
			store(K_WARNED, null)
			return false
		}
		if (s.remainingMs > this.warnMs || store(K_WARNED)) return false
		store(K_WARNED, "1")
		return true
	}

	/** The rolling window in words: "24 h", or "24 hours" with `long`. */
	windowText(long = false) {
		const h = this.windowMs / 3_600_000
		if (Number.isInteger(h)) return long ? `${h} hour${h === 1 ? "" : "s"}` : `${h} h`
		return formatDuration(this.windowMs)
	}

	describe() {
		return `${formatDuration(this.sessionMs)} at a time, ${formatDuration(this.dailyMs)} in any ${this.windowText()}`
	}
}

export function formatClock(d: Date) {
	return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

export function formatDuration(ms: number) {
	const totalMin = Math.max(0, Math.ceil(ms / 60_000))
	const h = Math.floor(totalMin / 60)
	const m = totalMin % 60
	if (h && m) return `${h} h ${m} min`
	if (h) return `${h} h`
	if (totalMin === 0) return "0 min"
	return `${m} min`
}

/**
 * Whether a lock that is due should land now. A game in progress (a block placed, or its
 * game-over screen showing) always finishes first (Matt, 2026-11-27: "we never interrupt the
 * player mid game"); the lock then lands when the next game would start, or on launch.
 */
export function lockLandsNow(o: { firstCheck: boolean; nextGameStarting: boolean; alreadyLocked: boolean; midGame: boolean }) {
	return o.firstCheck || o.nextGameStarting || o.alreadyLocked || !o.midGame
}
