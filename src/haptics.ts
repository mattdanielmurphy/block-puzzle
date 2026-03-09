import { WebHaptics } from "web-haptics"

/**
 * HapticsManager — thin singleton wrapper around WebHaptics.
 *
 * On Android/desktop: uses navigator.vibrate (WebHaptics.isSupported = true).
 * On iOS: navigator.vibrate is unsupported, but WebHaptics internally clicks a
 * hidden <input type="checkbox" switch> DOM element, which triggers the iOS
 * haptic engine. This path runs automatically when isSupported is false —
 * just don't gate on isSupported, let the library decide.
 *
 * debug: false on touch devices (matches the web-haptics site behaviour).
 * debug: true on desktop only for audio feedback during development.
 */
const isTouch = "ontouchstart" in window

class HapticsManager {
	private haptics: WebHaptics
	private _enabled: boolean = true

	constructor() {
		const debug = !isTouch
		console.log(`[haptics] init — isTouch=${isTouch}, debug=${debug}, isSupported=${WebHaptics.isSupported}`)
		this.haptics = new WebHaptics({ debug })

		// --- DEBUG: add a visible test button so we can verify web-haptics works ---
		if (typeof document !== "undefined") {
			const btn = document.createElement("button")
			btn.textContent = "🫨 Test Haptic"
			btn.style.cssText =
				"position:fixed;top:10px;right:10px;z-index:99999;padding:12px 18px;" +
				"background:#222;color:#fff;border:2px solid #5fc9df;border-radius:8px;" +
				"font-size:16px;cursor:pointer;-webkit-tap-highlight-color:rgba(0,0,0,0);"
			btn.addEventListener("click", () => {
				console.log("[haptics] TEST button tapped")
				this.haptics
					.trigger("success")
					.then(() => {
						console.log("[haptics] TEST trigger resolved")
					})
					.catch((e) => {
						console.error("[haptics] TEST trigger error:", e)
					})
			})
			// Wait for body to exist
			const attach = () => {
				if (document.body) {
					document.body.appendChild(btn)
					console.log("[haptics] TEST button added to DOM")
				} else {
					requestAnimationFrame(attach)
				}
			}
			attach()
		}
	}

	get enabled() {
		return this._enabled
	}

	set enabled(val: boolean) {
		this._enabled = val
	}

	/** Pick up a piece from the tray — very light tap */
	pickUp() {
		if (!this.enabled) return
		console.log("[haptics] pickUp")
		this.haptics.trigger([{ duration: 20, intensity: 0.4 }]).catch((e) => console.error("[haptics] trigger error:", e))
	}

	/** Ghost snapped to a valid position while dragging */
	snap() {
		if (!this.enabled) return
		console.log("[haptics] snap")
		this.haptics.trigger([{ duration: 15, intensity: 0.3 }]).catch((e) => console.error("[haptics] trigger error:", e))
	}

	/**
	 * Placed a piece successfully.
	 * @param linesCleared total number of rows + cols + boxes cleared
	 */
	place(linesCleared: number) {
		if (!this.enabled) return
		console.log(`[haptics] place — linesCleared=${linesCleared}`)
		if (linesCleared === 0) {
			this.haptics.trigger("nudge").catch((e) => console.error("[haptics] trigger error:", e))
		} else if (linesCleared === 1) {
			this.haptics.trigger("success").catch((e) => console.error("[haptics] trigger error:", e))
		} else {
			this.haptics
				.trigger([
					{ duration: 60, intensity: 1 },
					{ delay: 60, duration: 60, intensity: 0.6 },
					{ delay: 60, duration: 80, intensity: 1 },
				])
				.catch((e) => console.error("[haptics] trigger error:", e))
		}
	}

	/** Bomb exploded */
	bombExplode() {
		if (!this.enabled) return
		this.haptics
			.trigger([
				{ duration: 80, intensity: 1 },
				{ delay: 40, duration: 120, intensity: 0.7 },
				{ delay: 60, duration: 40, intensity: 0.4 },
			])
			.catch((e) => console.error("[haptics] trigger error:", e))
	}

	/** Timer entered panic zone (≤ 3 s remaining) */
	timerPanic() {
		if (!this.enabled) return
		this.haptics.trigger([{ duration: 30, intensity: 0.6 }]).catch((e) => console.error("[haptics] trigger error:", e))
	}

	/** Game over */
	gameOver() {
		if (!this.enabled) return
		this.haptics.trigger("error").catch((e) => console.error("[haptics] trigger error:", e))
	}
}

export const haptics = new HapticsManager()
