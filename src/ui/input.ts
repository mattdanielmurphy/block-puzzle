import { GameState, Shape } from "../engine/types"

import { GameRenderer } from "./renderer"
import { THEME } from "./theme"
import type { LockedPointer } from "./lockedPointer"
import { topBoostOffset } from "./dragFeel"
import { tweak } from "../tweaks"

export interface DragState {
	shapeIndex: number
	shape: Shape
	startX: number
	startY: number
	currentX: number
	currentY: number
	touchOffsetX: number // Offset from finger to shape anchor
	touchOffsetY: number
}

export type InputEvents = {
	onDragStart: (shapeIndex: number) => void
	onDragMove: (x: number, y: number) => void
	onDragEnd: (r: number, c: number) => void // r,c is board coord or -1,-1
	onPointerMove?: (x: number, y: number) => void
	getSnappedIndex?: () => number | null
}

export class InputManager {
	canvas: HTMLCanvasElement
	renderer: GameRenderer
	events: InputEvents
	dragState: DragState | null = null

	public sensitivity: number = 1.0
	public isMobile: boolean = false
	/** Locked-pointer play (mouse/trackpad). While locked it owns all input. */
	public lock: LockedPointer | null = null

	constructor(canvas: HTMLCanvasElement, renderer: GameRenderer, events: InputEvents) {
		this.canvas = canvas
		this.renderer = renderer
		this.events = events

		this.canvas.addEventListener("pointerdown", this.onPointerDown.bind(this))
		this.canvas.addEventListener("pointermove", this.onPointerMove.bind(this))
		this.canvas.addEventListener("pointerup", this.onPointerUp.bind(this))
		this.canvas.addEventListener("pointercancel", this.onPointerUp.bind(this))
	}

	private onPointerDown(e: PointerEvent) {
		e.preventDefault()

		const { left, top } = this.canvas.getBoundingClientRect()
		const x = e.clientX - left
		const y = e.clientY - top

		const { trayRect } = this.renderer.layout

		// Magnet snapping is a mouse-hover feature only. On touch, a stale hover index from a
		// previous finger position would hijack the drag (grab left block -> right block moves).
		const isMouse = e.pointerType === "mouse"
		let index = isMouse && this.events.getSnappedIndex ? this.events.getSnappedIndex() : null

		if (isMouse && this.lock && !this.isMobile && e.button === 0) {
			if (this.lock.locked) return
			// Ask for locked-pointer play; this press still works normally until the lock lands.
			if (y >= this.renderer.layout.boardRect.y) this.lock.engage(x)
		}

		const trayBuffer = 20
		if (index === null && y >= trayRect.y - trayBuffer) {
			index = this.renderer.traySlotAt(x)
		}

		if (index !== null && index >= 0 && index < 3) {
			const center = trayRect.shapecenters[index]

			this.canvas.setPointerCapture(e.pointerId)
			this.dragState = {
				shapeIndex: index,
				shape: null as any,
				startX: x,
				startY: y,
				currentX: x,
				currentY: y,
				touchOffsetX: center.x - x,
				touchOffsetY: center.y - y,
			}

			this.events.onDragStart(index)
			this.events.onDragMove(center.x, center.y)
		}
	}

	private onPointerMove(e: PointerEvent) {
		const { left, top } = this.canvas.getBoundingClientRect()
		const x = e.clientX - left
		const y = e.clientY - top

		if (this.lock?.locked) return
		if (this.events.onPointerMove && e.pointerType === "mouse") {
			this.events.onPointerMove(x, y)
		}

		if (!this.dragState) return
		e.preventDefault()

		this.canvas.style.cursor = "none"
		this.dragState.currentX = x
		this.dragState.currentY = y

		const { x: visualX, y: visualY } = this.visualPos(x, y)
		this.events.onDragMove(visualX, visualY)
	}

	/**
	 * Where the dragged piece's centre sits for a finger at (x, y): finger travel × the player's
	 * sensitivity, plus a subtle extra lift that grows toward the top of the board, since the top
	 * rows take the most thumb travel (tweak drag.topBoost; 0 = off).
	 */
	private visualPos(x: number, y: number) {
		const d = this.dragState!
		const visualX = d.startX + d.touchOffsetX + (x - d.startX) * this.sensitivity
		const baseY = d.startY + d.touchOffsetY + (y - d.startY) * this.sensitivity
		const { boardRect } = this.renderer.layout
		const lift = topBoostOffset(baseY, boardRect.y, boardRect.y + boardRect.h, tweak("drag.topBoost", 0.15))
		return { x: visualX, y: baseY - lift }
	}

	/** Locked-pointer play took this drag over: forget it without dropping. */
	cancelDrag() {
		this.dragState = null
	}

	private onPointerUp(e: PointerEvent) {
		if (!this.dragState) return
		e.preventDefault()
		this.canvas.releasePointerCapture(e.pointerId)
		this.canvas.style.cursor = ""

		const { boardRect } = this.renderer.layout
		const gap = THEME.metrics.cellGap
		const cellSize = boardRect.cellSize + gap

		const { x: visualX, y: visualY } = this.visualPos(this.dragState.currentX, this.dragState.currentY)

		const c = Math.round((visualX - boardRect.x) / cellSize)
		const r = Math.round((visualY - boardRect.y) / cellSize)

		this.events.onDragEnd(r, c)
		this.dragState = null
	}
}
