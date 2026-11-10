import { Capacitor, registerPlugin } from "@capacitor/core"
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics"
import { WebHaptics } from "web-haptics"
import { tweak } from "./tweaks"

/**
 * Haptics: native Taptic Engine in the iPhone app (Capacitor Haptics → UIFeedbackGenerator,
 * which stays silent when the phone's System Haptics are off), web-haptics in the browser.
 * The player can turn them off in Settings.
 */
const native = Capacitor.isNativePlatform()

/** Mac trackpad haptics (native bridge in SceneDelegate.swift). pattern: 0 generic, 1 alignment, 2 level change. */
interface MacHapticsPlugin {
	available(): Promise<{ value: boolean }>
	perform(o: { pattern: number; count?: number; gapMs?: number }): Promise<void>
}
const MacHaptics = registerPlugin<MacHapticsPlugin>("MacHaptics")
enum Pad {
	Generic = 0,
	Alignment = 1,
	Level = 2,
}
const isTouch = typeof window !== "undefined" && "ontouchstart" in window

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

	/** True where haptics can actually be felt (iPhone app, touch browsers). */
	get available() {
		return (native && (this.mac || isTouch)) || isTouch
	}

	private pad(pattern: Pad, count = 1, gapMs = 80) {
		MacHaptics.perform({ pattern, count, gapMs }).catch(() => {})
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

	private impact(style: ImpactStyle) {
		Haptics.impact({ style }).catch(() => {})
	}
	private notify(type: NotificationType) {
		Haptics.notification({ type }).catch(() => {})
	}
	private webTrigger(p: any) {
		this.web?.trigger(p).catch(() => {})
	}

	/** Picked a piece up from the tray. */
	pickUp() {
		if (!this._enabled) return
		if (this.mac) return this.pad(Pad.Alignment)
		if (native) this.impact(ImpactStyle.Light)
		else this.webTrigger([{ duration: 20, intensity: 0.4 }])
	}

	/** Ghost snapped onto a valid spot while dragging. */
	snap() {
		if (!this._enabled) return
		if (this.mac) return this.pad(Pad.Alignment)
		if (native) Haptics.selectionChanged().catch(() => {})
		else this.webTrigger([{ duration: 12, intensity: 0.25 }])
	}

	private lastTick = 0
	/** The dragged piece moved one cell on the board: the faintest possible tick. */
	tick() {
		if (!this._enabled) return
		const now = performance.now()
		if (now - this.lastTick < tweak("haptics.tickGapMs", 45)) return
		this.lastTick = now
		if (this.mac) return this.pad(Pad.Alignment)
		if (native) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
		else this.webTrigger([{ duration: 8, intensity: 0.2 }])
	}

	private lastSlam = 0
	/** The dragged piece was shoved into a board edge; strength 0..1 from drag speed. */
	slam(strength: number) {
		if (!this._enabled) return
		const now = performance.now()
		if (now - this.lastSlam < 180) return
		this.lastSlam = now
		const s = Math.min(1, strength * tweak("haptics.slam", 1))
		if (this.mac) return this.pad(s > 0.6 ? Pad.Level : Pad.Generic)
		if (native) this.impact(s > 0.7 ? ImpactStyle.Heavy : s > 0.35 ? ImpactStyle.Medium : ImpactStyle.Light)
		else this.webTrigger([{ duration: Math.round(15 + 35 * s), intensity: 0.3 + 0.7 * s }])
	}

	/** Placed a piece; linesCleared = rows + cols + boxes. */
	place(linesCleared: number) {
		if (!this._enabled) return
		if (this.mac) {
			if (linesCleared === 0) this.pad(Pad.Generic)
			else this.pad(Pad.Level, Math.min(linesCleared + 1, 4), 90)
			return
		}
		if (native) {
			if (linesCleared === 0) this.impact(ImpactStyle.Medium)
			else if (linesCleared === 1) this.notify(NotificationType.Success)
			else {
				// Combo: success, then a heavy thump per extra line (max 3).
				this.notify(NotificationType.Success)
				for (let i = 1; i < Math.min(linesCleared, 4); i++) setTimeout(() => this.impact(ImpactStyle.Heavy), 90 * i)
			}
			return
		}
		if (linesCleared === 0) this.webTrigger("nudge")
		else if (linesCleared === 1) this.webTrigger("success")
		else
			this.webTrigger([
				{ duration: 60, intensity: 1 },
				{ delay: 60, duration: 60, intensity: 0.6 },
				{ delay: 60, duration: 80, intensity: 1 },
			])
	}

	/** Dropped a piece where it can't go. */
	invalid() {
		if (!this._enabled) return
		if (this.mac) return this.pad(Pad.Generic, 2, 70)
		if (native) this.notify(NotificationType.Error)
		else this.webTrigger("error")
	}

	bombExplode() {
		if (!this._enabled) return
		if (this.mac) return this.pad(Pad.Level, 3, 60)
		if (native) {
			this.impact(ImpactStyle.Heavy)
			setTimeout(() => this.impact(ImpactStyle.Medium), 110)
		} else
			this.webTrigger([
				{ duration: 80, intensity: 1 },
				{ delay: 40, duration: 120, intensity: 0.7 },
			])
	}

	/** Hand timer entered its last 3 seconds. */
	timerPanic() {
		if (!this._enabled) return
		if (this.mac) return this.pad(Pad.Alignment)
		if (native) Haptics.notification({ type: NotificationType.Warning }).catch(() => {})
		else this.webTrigger([{ duration: 30, intensity: 0.6 }])
	}

	gameOver() {
		if (!this._enabled) return
		if (this.mac) return this.pad(Pad.Level, 3, 140)
		if (native) this.notify(NotificationType.Error)
		else this.webTrigger("error")
	}
}

export const haptics = new HapticsManager()
