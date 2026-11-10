// Locked-pointer play for mouse and trackpad (browser desktop + Mac app).
//
// Click into the game and the pointer is locked and hidden. From then on mouse motion is relative:
// - Not carrying: sliding left/right moves the selection between tray pieces (the magnet glow).
// - Press: picks up the selected piece, which then moves by your hand's motion.
//   - Press-move-release (a drag) drops it on release.
//   - A quick click keeps carrying it; the next click drops it.
// - Space works like the button: tap to pick up / put down, or hold to move and let go to place.
// - Z / X / C select the left, centre or right piece.
// - After a drop the nearest remaining piece is selected at once, so you push up again
//   without bringing the pointer back down.
// Esc (or pausing, a modal, game over, leaving the window) frees the pointer.

import { Capacitor, type PluginListenerHandle } from "@capacitor/core"
import { MacBridge } from "../haptics"
import { tweak } from "../tweaks"
import { GameRenderer } from "./renderer"

export interface LockedPointerGame {
	/** True while play is possible (not paused, no modal, not game over). */
	canPlay(): boolean
	shapesPresent(): boolean[]
	setSelected(index: number | null): void
	onDragStart(index: number): void
	onDragMove(x: number, y: number): void
	onDragEnd(): void
	isDragging(): boolean
	/** If a normal drag is in progress, stop the normal handler from finishing it and return where the piece is. */
	takeOverDrag(): { index: number; x: number; y: number } | null
	sensitivity(): number
	/** Called when the pointer is freed by the system (Esc in the browser, app switch on Mac). */
	onLockLost(): void
}

interface MacMousePlugin {
	pointerLock(o: { locked: boolean }): Promise<{ locked: boolean; how: string }>
	addListener(ev: "lockMove", fn: (d: { dx: number; dy: number }) => void): Promise<PluginListenerHandle>
	addListener(ev: "lockButton", fn: (d: { down: boolean }) => void): Promise<PluginListenerHandle>
	addListener(ev: "lockLost", fn: () => void): Promise<PluginListenerHandle>
}

const native = Capacitor.isNativePlatform()
const Mac = MacBridge as unknown as MacMousePlugin

export class LockedPointer {
	enabled = true
	locked = false
	/** Set when the platform refuses to lock (stops asking on every click). */
	private unsupported = false
	private pending = false
	/** Virtual pointer x while not carrying (canvas px), used to pick the tray piece. */
	private vx = 0
	private selected: number | null = null
	private carry: { x: number; y: number; moved: number; downAt: number; clickMode: boolean } | null = null
	private buttonDown = false
	/** Physical left-button state, tracked even before the lock lands. */
	private physDown = false
	private macListening = false

	constructor(
		private canvas: HTMLCanvasElement,
		private renderer: GameRenderer,
		private game: LockedPointerGame,
	) {
		if ((import.meta as any).env?.DEV) (window as any).__lockedPointer = this
		// Browser: Pointer Lock API.
		document.addEventListener("pointerlockchange", () => {
			const on = document.pointerLockElement === this.canvas
			if (!on && this.locked && !native) this.lost()
		})
		// Pointer events, not mouse events: the canvas cancels pointerdown, which suppresses the
		// legacy mousedown/mouseup that would follow.
		document.addEventListener("pointermove", (e) => {
			if (this.locked && !native && e.pointerType === "mouse") this.move(e.movementX, e.movementY)
		})
		document.addEventListener("pointerdown", (e) => {
			if (!native && e.pointerType === "mouse" && e.button === 0) this.button(true)
		})
		document.addEventListener("pointerup", (e) => {
			if (!native && e.pointerType === "mouse" && e.button === 0) this.button(false)
		})
	}

	/**
	 * Ask for the lock on a mouse press in the game area. The press itself is handled normally
	 * (so nothing is lost if locking fails); once the lock lands, a piece being dragged is taken
	 * over and keeps moving with relative motion.
	 */
	engage(x: number, fromKey = false) {
		if (!this.waiting || !this.game.canPlay()) return
		this.vx = x
		this.physDown = !fromKey
		this.pending = true
		this.request()
			.then((ok) => {
				this.pending = false
				if (!ok) return
				this.locked = true
				this.canvas.style.cursor = "none"
				const drag = this.game.takeOverDrag()
				if (drag) {
					this.selected = drag.index
					this.vx = this.renderer.layout.trayRect.shapecenters[drag.index].x
					this.buttonDown = this.physDown
					// Button already up again: it was a click, so carry the piece until the next click.
					this.carry = { x: drag.x, y: drag.y, moved: 0, downAt: performance.now(), clickMode: !this.physDown }
				} else {
					this.selected = this.nearest(this.vx)
					this.buttonDown = this.physDown
				}
				this.game.setSelected(this.selected)
			})
			.catch(() => (this.pending = false))
	}

	/** True while the lock is on offer but not taken yet (show the "click to start" prompt). */
	get waiting(): boolean {
		return this.enabled && !this.unsupported && !this.locked && !this.pending
	}

	/** Space before the lock: take the lock and select the middle piece (Space never pauses). */
	engageFromKey() {
		const t = this.renderer.layout.trayRect
		this.engage(t.x + t.w / 2, true)
	}

	/**
	 * Space while locked, same as the mouse button: a quick tap picks up (carry until the next
	 * tap), a hold moves the piece and letting go puts it down. Returns true if Space was used.
	 */
	key(down: boolean): boolean {
		if (!this.locked || !this.game.canPlay()) return false
		this.press(down)
		return true
	}

	/** Z / X / C while locked: select the left, centre or right piece (when not carrying one). */
	selectSlot(i: number): boolean {
		if (!this.locked || !this.game.canPlay()) return false
		if (this.carry || !this.game.shapesPresent()[i]) return true
		this.selected = i
		this.vx = this.renderer.layout.trayRect.shapecenters[i].x
		this.game.setSelected(i)
		return true
	}

	/** Free the pointer (pause, modal, game over). Drops nothing: a carried piece goes back. */
	release() {
		if (!this.locked && !this.pending) return
		this.locked = false
		this.pending = false
		this.carry = null
		this.buttonDown = false
		this.canvas.style.cursor = ""
		if (native) Mac.pointerLock({ locked: false }).catch(() => {})
		else if (document.pointerLockElement) document.exitPointerLock()
	}

	/** Keep the selection valid as pieces come and go (call each frame). */
	sync() {
		if (!this.locked) return
		if (!this.game.canPlay()) {
			this.release()
			return
		}
		if (!this.carry) {
			const present = this.game.shapesPresent()
			if (this.selected === null || !present[this.selected]) {
				this.selected = this.nearest(this.vx)
				this.game.setSelected(this.selected)
			}
		}
	}

	private async request(): Promise<boolean> {
		if (native) {
			if (!this.macListening) {
				this.macListening = true
				await Mac.addListener("lockMove", (d) => this.move(d.dx * tweak("pointer.macSpeed", 1), d.dy * tweak("pointer.macSpeed", 1)))
				await Mac.addListener("lockButton", (d) => this.button(d.down))
				await Mac.addListener("lockLost", () => this.locked && this.lost())
			}
			const r = await Mac.pointerLock({ locked: true })
			if (r?.how === "none") this.unsupported = true
			return !!r?.locked
		}
		if (!this.canvas.requestPointerLock) return false
		try {
			await this.canvas.requestPointerLock()
		} catch (e) {
			if ((e as Error)?.name === "WrongDocumentError" || (e as Error)?.name === "NotSupportedError") this.unsupported = true
			return false
		}
		return document.pointerLockElement === this.canvas
	}

	private lost() {
		this.release()
		this.game.onLockLost()
	}

	private move(dx: number, dy: number) {
		if (!this.locked || !this.game.canPlay()) return
		const s = this.game.sensitivity() * tweak("pointer.speed", 1)
		const { trayRect } = this.renderer.layout
		if (this.carry) {
			const w = this.canvas.clientWidth
			const h = this.canvas.clientHeight
			this.carry.x = Math.max(0, Math.min(w, this.carry.x + dx * s))
			this.carry.y = Math.max(0, Math.min(h, this.carry.y + dy * s))
			this.carry.moved += Math.hypot(dx, dy)
			this.game.onDragMove(this.carry.x, this.carry.y)
			return
		}
		// Not carrying: only sideways motion matters, and it moves the tray selection.
		this.vx = Math.max(trayRect.x, Math.min(trayRect.x + trayRect.w, this.vx + dx * s))
		const next = this.nearest(this.vx)
		if (next !== this.selected) {
			this.selected = next
			this.game.setSelected(next)
		}
	}

	private button(down: boolean) {
		this.physDown = down
		if (!this.locked || !this.game.canPlay()) return
		if (down === this.buttonDown) return
		this.buttonDown = down
		this.press(down)
	}

	/** Shared press/release logic for the mouse button and Space. */
	private press(down: boolean) {
		const now = performance.now()
		if (down) {
			if (this.carry) {
				// Second click of click-to-carry: drop now.
				if (this.carry.clickMode) this.drop()
				return
			}
			this.pickUp(false)
			return
		}
		if (!this.carry || this.carry.clickMode) return
		const isClick = this.carry.moved < tweak("pointer.clickPx", 6) && now - this.carry.downAt < tweak("pointer.clickMs", 300)
		if (isClick) this.carry.clickMode = true
		else this.drop()
	}

	private pickUp(clickMode: boolean) {
		if (this.selected === null) return
		const c = this.renderer.layout.trayRect.shapecenters[this.selected]
		this.game.onDragStart(this.selected)
		if (!this.game.isDragging()) return // greyed-out piece
		this.carry = { x: c.x, y: c.y, moved: 0, downAt: performance.now(), clickMode }
		this.game.onDragMove(c.x, c.y)
	}

	private drop() {
		this.carry = null
		this.game.onDragEnd()
		// Next piece: the one nearest the slot we were on (vx is unchanged).
		this.selected = this.nearest(this.vx)
		this.game.setSelected(this.selected)
	}

	private nearest(x: number): number | null {
		const present = this.game.shapesPresent()
		const centers = this.renderer.layout.trayRect.shapecenters
		let best: number | null = null
		present.forEach((p, i) => {
			if (p && (best === null || Math.abs(centers[i].x - x) < Math.abs(centers[best].x - x))) best = i
		})
		return best
	}
}
