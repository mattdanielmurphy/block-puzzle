import { GRID_SIZE, GameState, Grid, Point, Shape } from "../engine/types"

import { Effect } from "./effects"
import { THEME } from "./theme"

export interface Layout {
	boardRect: { x: number; y: number; w: number; h: number; cellSize: number }
	trayRect: { x: number; y: number; w: number; h: number; shapecenters: { x: number; y: number }[] }
}

export class GameRenderer {
	canvas: HTMLCanvasElement
	ctx: CanvasRenderingContext2D
	width: number = 0
	height: number = 0
	layout!: Layout
	animations: Effect[] = []

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas
		const ctx = canvas.getContext("2d", { alpha: false })
		if (!ctx) throw new Error("Could not get 2d context")
		this.ctx = ctx
		this.resize()
		window.addEventListener("resize", () => this.resize())
	}

	addEffect(effect: Effect) {
		this.animations.push(effect)
	}

	updateEffects(dt: number) {
		// Update all effects
		this.animations.forEach((anim) => anim.update(dt))
		// Remove finished effects
		this.animations = this.animations.filter((anim) => !anim.isFinished)
	}

	drawEffects() {
		this.animations.forEach((anim) => anim.draw(this.ctx, this.layout))
	}

	resize = () => {
		const dpr = window.devicePixelRatio || 1
		const rect = this.canvas.getBoundingClientRect()
		if (rect.width === 0 || rect.height === 0) return

		this.width = rect.width
		this.height = rect.height

		this.canvas.width = Math.round(this.width * dpr)
		this.canvas.height = Math.round(this.height * dpr)

		// Reset transform so scale doesn't stack
		this.ctx.setTransform(1, 0, 0, 1, 0, 0)
		this.ctx.scale(dpr, dpr)

		this.recalcLayout()
	}

	recalcLayout() {
		const padding = this.height < 650 ? 5 : THEME.metrics.boardPadding
		const availableW = this.width - padding * 2
		// Board is square
		// We want board to be as big as possible but leave room for tray
		// Tray should be at bottom ~25-30%

		const trayHeight = this.height * THEME.metrics.trayHeightRatio
		const boardMaxH = this.height - trayHeight - padding * 2

		const boardSize = Math.min(availableW, boardMaxH)

		const boardX = (this.width - boardSize) / 2
		const boardY = padding // Top padding

		const cellSize = (boardSize - (GRID_SIZE - 1) * THEME.metrics.cellGap) / GRID_SIZE

		this.layout = {
			boardRect: { x: boardX, y: boardY, w: boardSize, h: boardSize, cellSize },
			trayRect: {
				x: 0,
				y: boardY + boardSize + padding,
				w: this.width,
				h: this.height - (boardY + boardSize + padding),
				shapecenters: [], // calculated below
			},
		}

		// Calculate 3 slots for shapes in tray
		const slotW = this.width / 3
		const cy = this.layout.trayRect.y + this.layout.trayRect.h / 2
		this.layout.trayRect.shapecenters = [
			{ x: slotW * 0.5, y: cy },
			{ x: slotW * 1.5, y: cy },
			{ x: slotW * 2.5, y: cy },
		]
	}

	draw(
		state: GameState,
		gameEngine: any,
		dragShape: Shape | null,
		dragPos: { x: number; y: number } | null,
		ghostPos: { r: number; c: number } | null,
		placeability: boolean[] | null,
		hoveredIndex: number | null = null,
		currentTime: number = Date.now(),
		handTimerRatio: number | null = null,
		handTimerPanic: boolean = false,
		isDesktop: boolean = false
	) {
		// Clear
		this.ctx.fillStyle = THEME.colors.background
		this.ctx.fillRect(0, 0, this.width, this.height)

		this.drawBoard(state.grid, ghostPos, dragShape)
		// Draw Powerups if provided
		if (gameEngine && typeof gameEngine.getPowerups === "function") {
			this.drawPowerups(gameEngine.getPowerups(), currentTime)
		}
		this.drawEffects()
		if (handTimerRatio !== null) {
			this.drawHandTimers(handTimerRatio, handTimerPanic)
		}
		this.drawTray(state.currentShapes, dragShape, state.currentShapes.indexOf(dragShape), placeability, hoveredIndex)

		if (dragShape && dragPos) {
			this.drawShapeAtPixels(dragShape, dragPos.x, dragPos.y, this.layout.boardRect.cellSize * 1.0)
		}
	}

	private drawHandTimers(ratio: number, panic: boolean) {
		const ctx = this.ctx
		const { boardRect } = this.layout
		const height = 8
		const bottomY = boardRect.y + boardRect.h + 8
		const width = boardRect.w
		const clamped = Math.max(0, Math.min(1, ratio))
		const fillWidth = width * clamped

		const drawBar = (x: number, y: number) => {
			ctx.save()
			ctx.fillStyle = "rgba(255, 255, 255, 0.05)"
			ctx.fillRect(x, y, width, height)
			ctx.strokeStyle = "rgba(126, 224, 244, 0.25)"
			ctx.lineWidth = 1
			ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)

			const gradient = ctx.createLinearGradient(x, y, x + width, y)
			gradient.addColorStop(0, "#7ee0f4")
			gradient.addColorStop(1, "#5ed1c9")

			ctx.fillStyle = panic ? "#ff5f8a" : gradient
			ctx.fillRect(x, y, fillWidth, height)
			ctx.restore()
		}

		drawBar(boardRect.x, bottomY)
	}

	drawBoard(grid: Grid, ghostPos: { r: number; c: number } | null, dragShape: Shape | null) {
		const { x, y, cellSize } = this.layout.boardRect
		const gap = THEME.metrics.cellGap
		const rad = THEME.metrics.borderRadius

		// Draw Background Slots
		for (let r = 0; r < GRID_SIZE; r++) {
			for (let c = 0; c < GRID_SIZE; c++) {
				const cx = x + c * (cellSize + gap)
				const cy = y + r * (cellSize + gap)
				// Draw Cell
				const cellVal = grid[r * GRID_SIZE + c]
				this.ctx.fillStyle = cellVal === 0 ? THEME.colors.emptyCell : THEME.colors.shapes[cellVal]
				this.roundRect(cx, cy, cellSize, cellSize, rad)
				this.ctx.fill()
			}
		}

		// Draw Subdivision Lines
		this.ctx.strokeStyle = THEME.colors.subgridLine
		this.ctx.lineWidth = 4
		this.ctx.beginPath()
		// Vertical lines (after col 2 and 5)
		for (let c = 3; c < GRID_SIZE; c += 3) {
			const cx = x + c * (cellSize + gap) - gap / 2
			this.ctx.moveTo(cx, y)
			this.ctx.lineTo(cx, y + GRID_SIZE * (cellSize + gap) - gap)
		}
		// Horizontal lines (after row 2 and 5)
		for (let r = 3; r < GRID_SIZE; r += 3) {
			const cy = y + r * (cellSize + gap) - gap / 2
			this.ctx.moveTo(x, cy)
			this.ctx.lineTo(x + GRID_SIZE * (cellSize + gap) - gap, cy)
		}
		this.ctx.stroke()
		// Draw Ghost
		if (ghostPos && dragShape) {
			this.ctx.fillStyle = THEME.colors.ghost
			for (const cell of dragShape.cells) {
				const r = ghostPos.r + cell.r
				const c = ghostPos.c + cell.c
				if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
					const cx = x + c * (cellSize + gap)
					const cy = y + r * (cellSize + gap)
					this.roundRect(cx, cy, cellSize, cellSize, rad)
					this.ctx.fill()
				}
			}
		}
	}

	drawPowerups(powerups: any[], currentTime: number) {
		// Draw each powerup as a bomb icon for now
		const { x, y, cellSize } = this.layout.boardRect
		const gap = THEME.metrics.cellGap
		const ctx = this.ctx
		const colorMap: Record<string, { bomb: string; fuse: string }> = {
			bomb_small: { bomb: "#2bd4ff", fuse: "#9ef5ff" },
			bomb_med: { bomb: "#5f8cff", fuse: "#c7d2ff" },
			bomb_large: { bomb: "#a05bff", fuse: "#e4c7ff" },
			bomb_mega: { bomb: "#1ce9c9", fuse: "#b7f7ff" }, // rare cosmic teal
		}
		powerups.forEach((powerup) => {
			const age = currentTime - powerup.spawnTime
			const t = Math.min(Math.max(age / powerup.lifetime, 0), 1)
			const alpha = 1 - t // fade out over lifetime

			const cx = x + powerup.position.c * (cellSize + gap)
			const cy = y + powerup.position.r * (cellSize + gap)

			const colors = colorMap[powerup.type] || colorMap["bomb_small"]

			// Draw a simple bomb shape
			ctx.save()
			ctx.globalAlpha = alpha
			ctx.beginPath()
			ctx.arc(cx + cellSize / 2, cy + cellSize / 2, cellSize * 0.35, 0, 2 * Math.PI)
			ctx.fillStyle = colors.bomb
			ctx.shadowColor = "#000"
			ctx.shadowBlur = 8
			ctx.fill()
			ctx.shadowBlur = 0

			// Draw fuse
			ctx.beginPath()
			ctx.moveTo(cx + cellSize / 2, cy + cellSize / 2 - cellSize * 0.35)
			ctx.lineTo(cx + cellSize / 2, cy + cellSize / 2 - cellSize * 0.55)
			ctx.strokeStyle = colors.fuse
			ctx.lineWidth = 2
			ctx.stroke()

			// Optionally, add a sparkle on fuse
			ctx.beginPath()
			ctx.arc(cx + cellSize / 2, cy + cellSize / 2 - cellSize * 0.58, cellSize * 0.06, 0, 2 * Math.PI)
			ctx.fillStyle = "white"
			ctx.fill()
			ctx.restore()
		})
	}

	drawTray(shapes: (Shape | null)[], draggingShape: Shape | null, draggingIndex: number, placeability: boolean[] | null, hoveredIndex: number | null = null) {
		const { shapecenters } = this.layout.trayRect
		const baseCellSize = this.layout.boardRect.cellSize * 0.6 // Smaller in tray

		shapes.forEach((shape, i) => {
			if (shape && shape !== draggingShape) {
				const center = shapecenters[i]

				// Opacity if not placeable
				const isPlaceable = placeability ? placeability[i] : true
				this.ctx.globalAlpha = isPlaceable ? 1.0 : 0.3

				let cellSize = baseCellSize
				const isHighlighted = i === hoveredIndex
				if (isHighlighted) {
					// Scale up on hover - more prominent for 'snapping' feel
					cellSize *= 1.2
					// Stronger glow
					this.ctx.shadowColor = isPlaceable ? "rgba(126, 224, 244, 0.6)" : "rgba(255, 255, 255, 0.3)"
					this.ctx.shadowBlur = 30
				}

				// Center the shape
				this.drawShapeCentered(shape, center.x, center.y, cellSize, isHighlighted)

				this.ctx.globalAlpha = 1.0
				this.ctx.shadowBlur = 0
				this.ctx.shadowColor = "transparent"
			}
		})
	}

	drawShapeCentered(shape: Shape, cx: number, cy: number, cellSize: number, highlight: boolean = false) {
		const gap = THEME.metrics.cellGap
		// Calculate bounds of shape to center it
		let minR = 10,
			maxR = -1,
			minC = 10,
			maxC = -1
		shape.cells.forEach((p) => {
			if (p.r < minR) minR = p.r
			if (p.r > maxR) maxR = p.r
			if (p.c < minC) minC = p.c
			if (p.c > maxC) maxC = p.c
		})

		const width = (maxC - minC + 1) * (cellSize + gap) - gap
		const height = (maxR - minR + 1) * (cellSize + gap) - gap

		const startX = cx - width / 2
		const startY = cy - height / 2

		this.ctx.save()
		this.ctx.fillStyle = THEME.colors.shapes[shape.colorId]
		if (highlight) {
			// Clean brightness boost using filter
			this.ctx.filter = "brightness(1.2) saturate(1.05)"
		}

		shape.cells.forEach((p) => {
			const px = startX + (p.c - minC) * (cellSize + gap)
			const py = startY + (p.r - minR) * (cellSize + gap)
			this.roundRect(px, py, cellSize, cellSize, THEME.metrics.borderRadius)
			this.ctx.fill()
		})
		this.ctx.restore()
	}

	drawShapeAtPixels(shape: Shape, x: number, y: number, cellSize: number) {
		const gap = THEME.metrics.cellGap
		this.ctx.fillStyle = THEME.colors.shapes[shape.colorId]

		// Draw with slight shadow/lift
		this.ctx.shadowColor = "rgba(0,0,0,0.5)"
		this.ctx.shadowBlur = 10
		this.ctx.shadowOffsetY = 5

		// Calculate shape bounds to center it
		let minR = 10,
			maxR = -1,
			minC = 10,
			maxC = -1
		shape.cells.forEach((p) => {
			if (p.r < minR) minR = p.r
			if (p.r > maxR) maxR = p.r
			if (p.c < minC) minC = p.c
			if (p.c > maxC) maxC = p.c
		})

		const width = (maxC - minC + 1) * (cellSize + gap) - gap
		const height = (maxR - minR + 1) * (cellSize + gap) - gap

		// x,y is the center position
		const startX = x - width / 2
		const startY = y - height / 2

		shape.cells.forEach((p) => {
			// We need to draw relative to the bounding box start
			const px = startX + (p.c - minC) * (cellSize + gap)
			const py = startY + (p.r - minR) * (cellSize + gap)
			this.roundRect(px, py, cellSize, cellSize, THEME.metrics.borderRadius)
			this.ctx.fill()
		})

		this.ctx.shadowBlur = 0
		this.ctx.shadowOffsetY = 0
	}

	private roundRect(x: number, y: number, w: number, h: number, r: number) {
		if (w < 2 * r) r = w / 2
		if (h < 2 * r) r = h / 2
		this.ctx.beginPath()
		this.ctx.moveTo(x + r, y)
		this.ctx.arcTo(x + w, y, x + w, y + h, r)
		this.ctx.arcTo(x + w, y + h, x, y + h, r)
		this.ctx.arcTo(x, y + h, x, y, r)
		this.ctx.arcTo(x, y, x + w, y, r)
		this.ctx.closePath()
	}
}
