// Daily play limit + night cutoff (2026-11-23).
// On for every player by default (Matt, 2026-11-23: "let's make these global limits");
// Settings can still switch it off on one device.
// Counts time the game is on screen and not paused / over. A "play day" starts when the
// night cutoff ends (5 AM by default), so the daily allowance refills at the same moment
// the night lock lifts. Knobs live in tweaks.json (limit.*).
import { tweak } from "./tweaks"

const K_ON = "bp_limit_on"
const K_DAY = "bp_limit_day"
const K_MS = "bp_limit_ms"
const K_WARNED = "bp_limit_warned_day"

export type LimitState =
	| { locked: false; remainingMs: number }
	| { locked: true; reason: "night" | "limit"; reopenAt: Date }

const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600

function store(key: string, value?: string): string | null {
	try {
		if (value === undefined) return localStorage.getItem(key)
		localStorage.setItem(key, value)
	} catch {}
	return null
}

export class PlayLimit {
	dailyMs: number
	cutStart: number // hour of day, fractional
	cutEnd: number
	warnMs: number
	private last = 0

	constructor(now = new Date()) {
		this.dailyMs = tweak("limit.dailyMinutes", 120) * 60_000
		this.cutStart = tweak("limit.cutoffStartHour", 0)
		this.cutEnd = tweak("limit.cutoffEndHour", 5)
		this.warnMs = tweak("limit.warnMinutes", 5) * 60_000
		// Test builds: VITE_LIMIT_TEST="daily=40,cutIn=90,cutFor=60" (seconds) shortens everything and turns it on.
		const test = import.meta.env.VITE_LIMIT_TEST as string | undefined
		if (test) {
			const p = Object.fromEntries(test.split(",").map((kv) => kv.split("=").map((s) => s.trim())))
			if (p.daily) this.dailyMs = Number(p.daily) * 1000
			if (p.warn) this.warnMs = Number(p.warn) * 1000
			if (p.cutIn) {
				const h = hourOf(now) + Number(p.cutIn) / 3600
				this.cutStart = h % 24
				this.cutEnd = (h + Number(p.cutFor || 60) / 3600) % 24
			}
			this.enabled = true
		}
	}

	get enabled() {
		// App Shack's public build: off unless switched on in Settings (a stranger or Apple's reviewer playing at night
		// or for a while would think the game is broken).
		const v = store(K_ON)
		if ((globalThis as any).superapp?.public === true) return v === "true"
		return v !== "false"
	}
	set enabled(v: boolean) {
		store(K_ON, String(v))
	}

	private get hasCutoff() {
		return this.cutStart !== this.cutEnd
	}

	inCutoff(now: Date) {
		if (!this.hasCutoff) return false
		const h = hourOf(now)
		return this.cutStart < this.cutEnd ? h >= this.cutStart && h < this.cutEnd : h >= this.cutStart || h < this.cutEnd
	}

	/** Next moment the clock reads `hour` (today or tomorrow). */
	private nextAt(hour: number, now: Date) {
		const d = new Date(now)
		d.setHours(0, 0, 0, 0)
		d.setTime(d.getTime() + hour * 3_600_000)
		if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1)
		return d
	}

	private dayKey(now: Date) {
		const dayStart = this.hasCutoff ? this.cutEnd : 0
		const d = new Date(now.getTime() - dayStart * 3_600_000)
		return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
	}

	playedMs(now = new Date()) {
		if (store(K_DAY) !== this.dayKey(now)) return 0
		return Number(store(K_MS)) || 0
	}

	/** Call about once a second. `active` = game on screen, not paused, not over. */
	tick(active: boolean, now = new Date()) {
		const t = now.getTime()
		const delta = this.last ? Math.min(Math.max(t - this.last, 0), 2000) : 0
		this.last = t
		if (!this.enabled || !active) return
		const day = this.dayKey(now)
		const played = store(K_DAY) === day ? Number(store(K_MS)) || 0 : 0
		store(K_DAY, day)
		store(K_MS, String(played + delta))
	}

	state(now = new Date()): LimitState {
		if (!this.enabled) return { locked: false, remainingMs: Infinity }
		if (this.inCutoff(now)) return { locked: true, reason: "night", reopenAt: this.nextAt(this.cutEnd, now) }
		const remainingMs = this.dailyMs - this.playedMs(now)
		if (remainingMs <= 0) return { locked: true, reason: "limit", reopenAt: this.nextAt(this.hasCutoff ? this.cutEnd : 0, now) }
		return { locked: false, remainingMs }
	}

	/** True once per play day, when the warning threshold is first crossed. */
	shouldWarn(now = new Date()) {
		const s = this.state(now)
		if (s.locked || s.remainingMs > this.warnMs) return false
		const day = this.dayKey(now)
		if (store(K_WARNED) === day) return false
		store(K_WARNED, day)
		return true
	}

	/** Also warn before the night cutoff starts, if it lands before the daily limit. */
	msUntilCutoff(now = new Date()) {
		if (!this.hasCutoff || this.inCutoff(now)) return Infinity
		return this.nextAt(this.cutStart, now).getTime() - now.getTime()
	}

	describe() {
		const fmt = (h: number) => formatClock(new Date(2000, 0, 1, 0, 0, 0, h * 3_600_000))
		const daily = formatDuration(this.dailyMs)
		return this.hasCutoff ? `${daily} a day, closed ${fmt(this.cutStart)} – ${fmt(this.cutEnd)}` : `${daily} a day`
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
