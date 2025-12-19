import { GameState, Shape } from "../engine/types"

import { GameRenderer } from "./renderer"
import { THEME } from "./theme"

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
		const slotW = trayRect.w / 3

		let index = this.events.getSnappedIndex ? this.events.getSnappedIndex() : null

		const trayBuffer = 20
		if (index === null && y >= trayRect.y - trayBuffer) {
			index = Math.max(0, Math.min(2, Math.floor(x / slotW)))
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

		if (this.events.onPointerMove) {
			this.events.onPointerMove(x, y)
		}

		if (!this.dragState) return
		e.preventDefault()

		this.canvas.style.cursor = "none"
		this.dragState.currentX = x
		this.dragState.currentY = y

		const deltaX = (x - this.dragState.startX) * this.sensitivity
		const deltaY = (y - this.dragState.startY) * this.sensitivity

		const visualX = this.dragState.startX + this.dragState.touchOffsetX + deltaX
		const visualY = this.dragState.startY + this.dragState.touchOffsetY + deltaY

		this.events.onDragMove(visualX, visualY)
	}

	private onPointerUp(e: PointerEvent) {
		if (!this.dragState) return
		e.preventDefault()
		this.canvas.releasePointerCapture(e.pointerId)
		this.canvas.style.cursor = ""

		const { boardRect } = this.renderer.layout
		const gap = THEME.metrics.cellGap
		const cellSize = boardRect.cellSize + gap

		const deltaX = (this.dragState.currentX - this.dragState.startX) * this.sensitivity
		const deltaY = (this.dragState.currentY - this.dragState.startY) * this.sensitivity

		const visualX = this.dragState.startX + this.dragState.touchOffsetX + deltaX
		const visualY = this.dragState.startY + this.dragState.touchOffsetY + deltaY

		const c = Math.round((visualX - boardRect.x) / cellSize)
		const r = Math.round((visualY - boardRect.y) / cellSize)

		this.events.onDragEnd(r, c)
		this.dragState = null
	}
}
