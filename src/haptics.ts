import { Capacitor } from "@capacitor/core"
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics"
import { WebHaptics } from "web-haptics"

/**
 * Haptics: native Taptic Engine in the iPhone app (Capacitor Haptics → UIFeedbackGenerator,
 * which stays silent when the phone's System Haptics are off), web-haptics in the browser.
 * The player can turn them off in Settings.
 */
const native = Capacitor.isNativePlatform()
const isTouch = typeof window !== "undefined" && "ontouchstart" in window

class HapticsManager {
	private web: WebHaptics | null = null
	private _enabled = true

	constructor() {
		try {
			this._enabled = localStorage.getItem("bp_haptics_enabled") !== "false"
		} catch {}
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
		return native || isTouch
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
		if (native) this.impact(ImpactStyle.Light)
		else this.webTrigger([{ duration: 20, intensity: 0.4 }])
	}

	/** Ghost snapped onto a valid spot while dragging. */
	snap() {
		if (!this._enabled) return
		if (native) Haptics.selectionChanged().catch(() => {})
		else this.webTrigger([{ duration: 12, intensity: 0.25 }])
	}

	/** Placed a piece; linesCleared = rows + cols + boxes. */
	place(linesCleared: number) {
		if (!this._enabled) return
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
		if (native) this.notify(NotificationType.Error)
		else this.webTrigger("error")
	}

	bombExplode() {
		if (!this._enabled) return
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
		if (native) Haptics.notification({ type: NotificationType.Warning }).catch(() => {})
		else this.webTrigger([{ duration: 30, intensity: 0.6 }])
	}

	gameOver() {
		if (!this._enabled) return
		if (native) this.notify(NotificationType.Error)
		else this.webTrigger("error")
	}
}

export const haptics = new HapticsManager()
