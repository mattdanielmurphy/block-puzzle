import { Capacitor, registerPlugin } from "@capacitor/core"
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics"
import { WebHaptics } from "web-haptics"
import { tweak } from "./tweaks"

/**
 * Haptics, one set of named styles on every platform:
 * - Super App shell: `window.superapp.haptics(style)` (real Taptic Engine) when present;
 * - iPhone app: Capacitor Haptics (UIFeedbackGenerator, silent when System Haptics are off);
 * - Mac app: trackpad haptics through the MacHaptics bridge (SceneDelegate.swift);
 * - touch browsers: web-haptics.
 * The player can turn them off in Settings.
 */
type Style = "light" | "medium" | "heavy" | "soft" | "rigid" | "selection" | "success" | "warning" | "error"

const native = Capacitor.isNativePlatform()
const isTouch = typeof window !== "undefined" && "ontouchstart" in window
const superapp = (): { haptics: (s: Style) => void } | null => {
	const s = (window as any).superapp
	return s && typeof s.haptics === "function" ? s : null
}

/** Mac trackpad haptics. pattern: 0 generic, 1 alignment, 2 level change. */
interface MacHapticsPlugin {
	available(): Promise<{ value: boolean }>
	perform(o: { pattern: number; count?: number; gapMs?: number }): Promise<void>
	cursor(o: { hidden: boolean }): Promise<void>
}
const MacHaptics = registerPlugin<MacHapticsPlugin>("MacHaptics")

/**
 * The Mac app's web view ignores CSS `cursor: none`, which the tray's magnetic hover relies on
 * (the arrow vanishes and the glowing piece stands in for it). Mirror the canvas's cursor style
 * to the real Mac pointer. No-op everywhere else.
 */
export function mirrorCursorToMac(el: HTMLElement) {
	if (!native) return
	let hidden = false
	const set = (h: boolean) => {
		if (h === hidden) return
		hidden = h
		MacHaptics.cursor({ hidden: h }).catch(() => {})
	}
	new MutationObserver(() => set(el.style.cursor === "none")).observe(el, { attributes: true, attributeFilter: ["style"] })
	el.addEventListener("pointerleave", () => {
		el.style.cursor = ""
		set(false)
	})
	window.addEventListener("blur", () => set(false))
}
const MAC_PATTERN: Record<Style, number> = { light: 1, selection: 1, soft: 0, medium: 0, rigid: 2, heavy: 2, success: 2, warning: 2, error: 0 }

/** web-haptics fallback: one pulse per style. */
const WEB_PULSE: Record<Style, { duration: number; intensity: number }> = {
	selection: { duration: 8, intensity: 0.25 },
	light: { duration: 14, intensity: 0.4 },
	soft: { duration: 22, intensity: 0.45 },
	medium: { duration: 24, intensity: 0.65 },
	rigid: { duration: 16, intensity: 0.9 },
	heavy: { duration: 40, intensity: 1 },
	success: { duration: 40, intensity: 0.8 },
	warning: { duration: 40, intensity: 0.8 },
	error: { duration: 60, intensity: 1 },
}

class HapticsManager {
	private web: WebHaptics | null = null
	private _enabled = true
	/** True in the Mac app when the trackpad haptics bridge works. */
	private mac = false

	constructor() {
		try {
			this._enabled = localStorage.getItem("bp_haptics_enabled") !== "false"
		} catch {}
		if (native) {
			MacHaptics.available()
				.then((r) => {
					this.mac = !!r?.value
					if (this.mac) window.dispatchEvent(new Event("haptics-available"))
				})
				.catch(() => {})
		}
		if (!native && isTouch) {
			this.web = new WebHaptics({ debug: false })
			// web-haptics 0.0.6 hides its iOS switch with display:none, which kills iOS haptics.
			if (!WebHaptics.isSupported) {
				const h = this.web as any
				if (h.ensureDOM) {
					const orig = h.ensureDOM.bind(h)
					h.ensureDOM = () => {
						orig()
						if (h.hapticLabel && h.hapticLabel.style.display === "none") {
							const hidden = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;opacity:0;pointer-events:none;"
							h.hapticLabel.style.cssText = hidden
							const cb = h.hapticLabel.querySelector("input")
							if (cb) cb.style.cssText = hidden + "appearance:auto;-webkit-appearance:auto;"
						}
					}
				}
			}
		}
	}

	/** True where haptics can actually be felt (iPhone app, Mac trackpad, touch browsers, Super App). */
	get available() {
		return isTouch || this.mac || !!superapp()
	}

	get enabled() {
		return this._enabled
	}
	set enabled(v: boolean) {
		this._enabled = v
		try {
			localStorage.setItem("bp_haptics_enabled", String(v))
		} catch {}
	}

	/** Fire one haptic in a named style on whatever this platform has. */
	private fire(style: Style) {
		const sa = superapp()
		if (sa) {
			try {
				sa.haptics(style)
			} catch {}
			return
		}
		if (this.mac) {
			MacHaptics.perform({ pattern: MAC_PATTERN[style] }).catch(() => {})
			return
		}
		if (native) {
			const p =
				style === "selection"
					? Haptics.selectionChanged()
					: style === "success" || style === "warning" || style === "error"
						? Haptics.notification({ type: style === "success" ? NotificationType.Success : style === "warning" ? NotificationType.Warning : NotificationType.Error })
						: Haptics.impact({ style: style === "light" || style === "soft" ? ImpactStyle.Light : style === "medium" ? ImpactStyle.Medium : ImpactStyle.Heavy })
			p.catch(() => {})
			return
		}
		this.web?.trigger([WEB_PULSE[style]]).catch(() => {})
	}

	/** Several haptics in a row (combos, game over). */
	private seq(styles: Style[], gapMs: number) {
		styles.forEach((s, i) => (i === 0 ? this.fire(s) : setTimeout(() => this.fire(s), gapMs * i)))
	}

	/** Drag feel on a ladder; the haptics.dragStrength knob shifts every drag haptic up or down a step. */
	private dragStyle(base: number): Style {
		const ladder: Style[] = ["selection", "light", "medium", "rigid", "heavy"]
		const k = Math.round(tweak("haptics.dragStrength", 1))
		return ladder[Math.max(0, Math.min(ladder.length - 1, base + k))]
	}

	/** Picked a piece up from the tray. */
	pickUp() {
		if (this._enabled) this.fire(this.dragStyle(1))
	}

	/** Ghost appeared on a valid spot while dragging: it "locks in". */
	snap() {
		if (this._enabled) this.fire(this.dragStyle(1))
	}

	/** Ghost disappeared (piece moved over a spot where it can't go): a soft give. */
	unsnap() {
		if (this._enabled) this.fire("soft")
	}

	private lastTick = 0
	/** The dragged piece moved one cell; crossing into another 3×3 box ticks harder. */
	tick(crossedBox = false) {
		if (!this._enabled) return
		const now = performance.now()
		if (!crossedBox && now - this.lastTick < tweak("haptics.tickGapMs", 45)) return
		this.lastTick = now
		this.fire(this.dragStyle(crossedBox ? 2 : 1)) // medium per cell, rigid at a box line
	}

	private lastSlam = 0
	/** The dragged piece was shoved into a board edge; strength 0..1 from drag speed. */
	slam(strength: number) {
		if (!this._enabled) return
		const now = performance.now()
		if (now - this.lastSlam < 180) return
		this.lastSlam = now
		const s = Math.min(1, strength * tweak("haptics.slam", 1))
		if (s > 0.75) this.seq(["heavy", "rigid"], 45) // hard hit plus a little rebound
		else this.fire(s > 0.4 ? "rigid" : "medium")
	}

	/** Placed a piece; linesCleared = rows + cols + boxes. */
	place(linesCleared: number) {
		if (!this._enabled) return
		if (linesCleared === 0) this.fire("medium")
		else if (linesCleared === 1) this.fire("success")
		else this.seq(["success", ...Array<Style>(Math.min(linesCleared - 1, 3)).fill("heavy")], 90)
	}

	/** Dropped a piece where it can't go. */
	invalid() {
		if (this._enabled) this.fire("error")
	}

	bombExplode() {
		if (this._enabled) this.seq(["heavy", "medium", "light"], 90)
	}

	/** Hand timer entered its last 3 seconds. */
	timerPanic() {
		if (this._enabled) this.fire("warning")
	}

	gameOver() {
		if (this._enabled) this.seq(["error", "heavy", "medium"], 140)
	}
}

export const haptics = new HapticsManager()
