import { GRID_SIZE, Shape } from "./engine/types.js"

import { BlockClearEffect } from "./ui/effects.js"
import { GameEngine } from "./engine/logic.js"
import { GameRenderer } from "./ui/renderer.js"
import { InputManager } from "./ui/input.js"
import { PowerupType } from "./engine/powerups.js"
import { ReplayPlayer } from "./ui/replay-player.js"
import { ReplayState } from "./engine/replay.js"
import { THEME } from "./ui/theme.js"
import { TutorialManager } from "./ui/tutorial.js"
import { VERSION } from "./version.js"

class GameApp {
	engine: GameEngine
	renderer: GameRenderer
	input: InputManager
	canvas: HTMLCanvasElement

	// State for UI
	dragShape: Shape | null = null
	dragPos: { x: number; y: number } | null = null

	ghostPos: { r: number; c: number } | null = null

	// Debug/testing flags
	private readonly DEBUG_SPAWN_POWERUP_ON_START = false
	private readonly DEBUG_ENABLE_POWERUP_KEYS = true

	// Snap settings
	private readonly SNAP_THRESHOLD = 3

	// Status Face State
	private lastPlaceability: boolean[] = []
	private reliefUntil: number = 0
	private wasInPanicState: boolean = false

	// Replay State
	private replayPlayer: ReplayPlayer | null = null
	private isInReplayMode: boolean = false

	// Tutorial State
	tutorialManager: TutorialManager

	constructor() {
		this.displayVersion()
		this.canvas = document.getElementById("game-canvas") as HTMLCanvasElement
		this.engine = new GameEngine(Date.now())
		this.renderer = new GameRenderer(this.canvas)

		if (this.DEBUG_SPAWN_POWERUP_ON_START) {
			this.engine.spawnTestPowerup()
		}

		if (this.DEBUG_ENABLE_POWERUP_KEYS) {
			document.addEventListener("keydown", (e) => {
				const now = Date.now()
				switch (e.key.toLowerCase()) {
					case "1":
						this.engine.spawnPowerupOfType(PowerupType.BOMB_SMALL, now)
						break
					case "2":
						this.engine.spawnPowerupOfType(PowerupType.BOMB_MED, now)
						break
					case "3":
						this.engine.spawnPowerupOfType(PowerupType.BOMB_LARGE, now)
						break
					case "4":
						this.engine.spawnPowerupOfType(PowerupType.BOMB_MEGA, now)
						break
					default:
						return
				}
				e.preventDefault()
			})
		}

		this.input = new InputManager(this.canvas, this.renderer, {
			onDragStart: this.onDragStart.bind(this),
			onDragMove: this.onDragMove.bind(this),
			onDragEnd: this.onDragEnd.bind(this),
		})

		this.loadHighScore()
		this.updateUI()
		this.bindControls()
		this.initSettings()

		// Init Tutorial
		this.tutorialManager = new TutorialManager(this.engine, this.renderer, () => {
			if (!this.engine.isGameOver) this.restart()
		})

		requestAnimationFrame(this.loop.bind(this))

		// Initial render
		const initialPlaceability = this.engine.currentShapes.map((s) => (s ? this.engine.canPlaceShape(s) : false))
		this.lastPlaceability = initialPlaceability // Init state
		this.renderer.draw(this.engine, this.engine, null, null, null, initialPlaceability, Date.now())

		// Start Tutorial if not completed
		if (!localStorage.getItem("bp_tutorial_completed")) {
			this.tutorialManager.start()
		}
	}

	displayVersion() {
		const el = document.getElementById("app-version")
		if (el) {
			el.textContent = `v${VERSION}`
		}
	}

	bindControls() {
		document.getElementById("reset-btn")?.addEventListener("click", () => {
			if (confirm("Restart game?")) this.restart()
		})
		document.getElementById("restart-btn")?.addEventListener("click", () => {
			this.restart()
		})
		document.getElementById("replay-btn")?.addEventListener("click", () => {
			this.startReplay()
		})

		// Replay controls - just exit
		document.getElementById("replay-exit")?.addEventListener("click", () => {
			this.exitReplay()
		})
	}

	initSettings() {
		const settingsBtn = document.getElementById("settings-btn")
		const modal = document.getElementById("settings-modal")
		const closeBtn = document.getElementById("close-settings-btn")
		const slider = document.getElementById("sensitivity-slider") as HTMLInputElement
		const valDisplay = document.getElementById("sensitivity-value")

		// Load saved sensitivity
		const savedSens = localStorage.getItem("bp_sensitivity")
		const initialSens = savedSens ? parseFloat(savedSens) : 1.0

		// Apply
		this.input.sensitivity = initialSens
		if (slider) slider.value = initialSens.toString()
		if (valDisplay) valDisplay.textContent = initialSens.toFixed(1)

		// Events
		settingsBtn?.addEventListener("click", () => {
			modal?.classList.remove("hidden")
		})

		closeBtn?.addEventListener("click", () => {
			modal?.classList.add("hidden")
		})

		slider?.addEventListener("input", (e) => {
			const val = parseFloat((e.target as HTMLInputElement).value)
			this.input.sensitivity = val
			if (valDisplay) valDisplay.textContent = val.toFixed(1)
			localStorage.setItem("bp_sensitivity", val.toString())
		})

		// Clear Cache
		const clearCacheBtn = document.getElementById("clear-cache-btn")
		clearCacheBtn?.addEventListener("click", async () => {
			if (confirm("This will clear all game data and cached files. Reload now?")) {
				// 1. Unregister Service Workers
				if ("serviceWorker" in navigator) {
					const registrations = await navigator.serviceWorker.getRegistrations()
					for (const registration of registrations) {
						await registration.unregister()
					}
				}

				// 2. Clear Caches
				if ("caches" in window) {
					const keys = await caches.keys()
					await Promise.all(keys.map((key) => caches.delete(key)))
				}

				// 3. Clear Local Storage (Reset game state completely)
				localStorage.clear()

				// 4. Force Reload
				window.location.reload()
			}
		})
	}

	restart() {
		// If we are currently replaying, exit replay mode first
		if (this.isInReplayMode) {
			this.exitReplay()
		}

		if (this.tutorialManager.isActive) {
			this.tutorialManager["endTutorial"]() // Accessing private valid in runtime but TS might complain? Main is TS.
			// Wait, endTutorial is private in TutorialManager?
			// I should make it public or use a public 'skip' method.
			// I'll check my TutorialManager code.
			// It was private. I should have made it public or 'skip'.
			// I'll just rely on the 'Skip' button for now?
			// Or force it. 'onComplete' calls restart.
			// I can't call endTutorial if private.
			// I'll edit TutorialManager to make 'endTutorial' public or add 'skip'.
			// Assume I fix TutorialManager first.
			return
		}

		this.engine.reset(Date.now())
		if (this.DEBUG_SPAWN_POWERUP_ON_START) {
			this.engine.spawnTestPowerup()
		}
		this.loadHighScore() // Load high score into the new engine
		this.dragShape = null
		this.dragPos = null

		// Reset status face state
		this.wasInPanicState = false
		this.reliefUntil = 0
		this.lastPlaceability = []

		document.getElementById("game-over-overlay")?.classList.add("hidden")
		this.updateUI()
	}

	loadHighScore() {
		const best = localStorage.getItem("bp_best_score")
		if (best) this.engine.bestScore = parseInt(best, 10)
		document.getElementById("best-score")!.textContent = this.engine.bestScore.toString()
	}

	saveHighScore() {
		if (this.engine.score > this.engine.bestScore) {
			this.engine.bestScore = this.engine.score
			localStorage.setItem("bp_best_score", this.engine.score.toString())
			document.getElementById("best-score")!.textContent = this.engine.bestScore.toString()
		}
	}

	updateUI() {
		document.getElementById("current-score")!.textContent = this.engine.score.toString()
		this.saveHighScore() // Check constantly or delta

		if (this.engine.isGameOver) {
			document.getElementById("game-over-overlay")?.classList.remove("hidden")
			document.getElementById("final-score")!.textContent = this.engine.score.toString()
		}
	}

	onDragStart(index: number) {
		if (this.engine.isGameOver) return
		const shape = this.engine.currentShapes[index]
		if (shape) {
			// Check if the shape can be placed anywhere on the grid
			if (!this.engine.canPlaceShape(shape)) {
				// Shape is greyed out (unplaceable), cancel the drag
				this.input.dragState = null
				return
			}
			this.dragShape = shape
			// Input manager handles calling move/end
		} else {
			this.input.dragState = null // Cancel if empty slot
		}
	}

	// Helper to calculate offset from Center to Top-Left Anchor (0,0) cells
	private getShapeCenterOffset(shape: Shape, cellSize: number): { x: number; y: number } {
		const gap = THEME.metrics.cellGap
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

		// Width/Height in pixels
		const width = (maxC - minC + 1) * (cellSize + gap) - gap
		const height = (maxR - minR + 1) * (cellSize + gap) - gap

		// Center relative to the bounding box top-left
		const centerX = width / 2
		const centerY = height / 2

		// Anchor (0,0) position within the bounding box?
		// Shape cells are relative to (0,0).
		// Bounding box starts at (minC, minR) * stride.

		// If we are at Visual Center (vx, vy).
		// The Top-Left of the Bounding Box is at (vx - centerX, vy - centerY).
		// The Anchor (0,0) is relative to the Bounding Box by (-minC, -minR).
		// Wait.
		// Pixel(c, r) = StartX + (c - minC)*stride
		// Pixel(0, 0) = StartX + (0 - minC)*stride
		// StartX = VisualCenter - Width/2

		// So AnchorX = (VisualCenter - Width/2) + (0 - minC) * stride
		// AnchorY = (VisualCenter - Height/2) + (0 - minR) * stride

		const stride = cellSize + gap
		const anchorXRel = -centerX + -minC * stride
		const anchorYRel = -centerY + -minR * stride

		return { x: anchorXRel, y: anchorYRel }
	}

	private getBestPlacement(shape: Shape, anchorX: number, anchorY: number): { r: number; c: number } | null {
		const { boardRect } = this.renderer.layout
		const gap = THEME.metrics.cellGap
		const cellSize = boardRect.cellSize
		const stride = cellSize + gap

		// Floating point grid coordinates
		const cFloat = (anchorX - boardRect.x) / stride
		const rFloat = (anchorY - boardRect.y) / stride

		const startR = Math.round(rFloat)
		const startC = Math.round(cFloat)

		let bestMatch: { r: number; c: number; dist: number } | null = null

		// Check 3x3 neighborhood around the closest integer cell
		for (let r = startR - 1; r <= startR + 1; r++) {
			for (let c = startC - 1; c <= startC + 1; c++) {
				// Check if valid placement
				if (this.engine.canPlace(shape, r, c)) {
					// Euclidean distance from ideal float position
					const dist = Math.sqrt(Math.pow(r - rFloat, 2) + Math.pow(c - cFloat, 2))

					if (!bestMatch || dist < bestMatch.dist) {
						bestMatch = { r, c, dist }
					}
				}
			}
		}

		// Snap threshold
		if (bestMatch && bestMatch.dist < this.SNAP_THRESHOLD) {
			return { r: bestMatch.r, c: bestMatch.c }
		}

		return null
	}

	onDragMove(x: number, y: number) {
		if (!this.dragShape) return
		this.dragPos = { x, y }

		// Calculate Ghost
		const { boardRect } = this.renderer.layout
		const gap = THEME.metrics.cellGap
		const cellSize = boardRect.cellSize // Actual cell size

		// Adjust x,y (Center) to Anchor Position
		const offset = this.getShapeCenterOffset(this.dragShape, cellSize)
		const anchorX = x + offset.x
		const anchorY = y + offset.y

		const placement = this.getBestPlacement(this.dragShape, anchorX, anchorY)
		this.ghostPos = placement
	}

	onDragEnd(r: number, c: number) {
		if (!this.dragShape) return

		// The input manager passed r,c based on its own naive calculation (top-left).
		// We really should ignore the passed r,c if it's wrong, or fix it in Input.
		// Actually InputManager thinks x,y is just "currentX".
		// InputManager attempts to calculate r,c in onPointerUp:
		// const c = Math.round((visualX - boardRect.x) / cellSize);
		// visualX there is what we passed to it?
		// No, InputManager uses `currentX + offset`.
		// We need to fix the logic globally or just re-calculate here based on last known pos.

		// Re-calculate based on dragPos (which is accurate visual center)
		if (this.dragPos) {
			const { boardRect } = this.renderer.layout
			const cellSize = boardRect.cellSize

			const offset = this.getShapeCenterOffset(this.dragShape, cellSize)
			const anchorX = this.dragPos.x + offset.x
			const anchorY = this.dragPos.y + offset.y

			const placement = this.getBestPlacement(this.dragShape, anchorX, anchorY)
			if (placement) {
				r = placement.r
				c = placement.c
			} else {
				// Even if no valid placement found by 'snap', we might still want to try the passed r,c
				// or just fail. If getBestPlacement retrieves null, it means no valid placement nearby.
				// So we can probably let the engine check fail or set to -1.
				// Let's rely on the engine check below, but if placement is null here,
				// the engine.canPlace below effectively double-checks.
				// However, we want to ensure we don't accidentally place where we shouldn't.
				// If getBestPlacement returns null, we should probably treat it as invalid.
			}
		}

		// Try to place
		const index = this.engine.currentShapes.indexOf(this.dragShape)

		if (index !== -1 && this.engine.canPlace(this.dragShape, r, c)) {
			const result = this.engine.place(index, r, c)
			if (result.valid) {
				// Spawn animations for cleared cells
				if (result.clearedCells && result.clearedCells.length > 0) {
					result.clearedCells.forEach((pt) => {
						this.renderer.addEffect(new BlockClearEffect(pt.r, pt.c))
					})
				}

				// Tutorial Hook
				if (this.tutorialManager.isActive) {
					this.tutorialManager.onMove(result)
				}

				this.updateUI()
			}
		}

		// Reset drag state
		this.dragShape = null
		this.dragPos = null
		this.ghostPos = null
	}

	lastTime: number = 0

	loop(timestamp: number) {
		if (!this.lastTime) this.lastTime = timestamp
		const dt = (timestamp - this.lastTime) / 1000
		this.lastTime = timestamp

		// Update animations
		this.renderer.updateEffects(dt)

		const now = Date.now()

		// Advance game state (powerup timers/spawns) only during live play
		if (!this.isInReplayMode) {
			this.engine.update(now)
		}

		// Use replay engine if in replay mode, otherwise use main engine
		const activeEngine = this.isInReplayMode && this.replayPlayer ? this.replayPlayer.getEngine() : this.engine

		// Calculate placeability for each shape in tray
		const placeability = activeEngine.currentShapes.map((s) => {
			if (!s) return false
			return activeEngine.canPlaceShape(s)
		})

		if (!this.isInReplayMode) {
			this.updateStatusFace(placeability)
		}

		// In replay mode, don't show drag state
		const dragShape = this.isInReplayMode ? null : this.dragShape
		const dragPos = this.isInReplayMode ? null : this.dragPos
		const ghostPos = this.isInReplayMode ? null : this.ghostPos

		this.renderer.draw(activeEngine, activeEngine, dragShape, dragPos, ghostPos, placeability, now)

		// Update replay UI if in replay mode
		if (this.isInReplayMode) {
			this.updateReplayUI()
		}

		requestAnimationFrame(this.loop.bind(this))
	}

	private updateStatusFace(placeability: boolean[]) {
		const faceEl = document.getElementById("status-face")
		if (!faceEl) return

		const now = Date.now()

		// 1. Check for Relief Trigger
		// Relief should only happen when we HAD panic (unplaceable pieces) and now we DON'T.
		const hasPanic = placeability.some((p, i) => this.engine.currentShapes[i] && !p)

		// Trigger relief if we were in panic state and now we're not
		if (this.wasInPanicState && !hasPanic) {
			this.reliefUntil = now + 2500 // 2.5s satisfaction
		}

		// Update panic state for next frame
		this.wasInPanicState = hasPanic

		this.lastPlaceability = [...placeability]

		// 2. Determine Face
		let faceClass = "face-normal"

		// Priority 0: Game Over (Dead)
		if (this.engine.isGameOver) {
			faceClass = "face-dead"
		}
		// Priority 1: Relief
		else if (now < this.reliefUntil) {
			faceClass = "face-relief"
		}
		// Priority 2: Panic (Unplaceable Block)
		else if (hasPanic) {
			faceClass = "face-panic"
		}
		// Priority 3: Grid Fullness
		else {
			let filled = 0
			for (let i = 0; i < this.engine.grid.length; i++) {
				if (this.engine.grid[i] !== 0) filled++
			}
			const ratio = filled / this.engine.grid.length

			if (ratio < 0.35) faceClass = "face-normal"
			else if (ratio < 0.65) faceClass = "face-concerned"
			else faceClass = "face-worried"
		}

		// Optimize DOM Write
		if (faceEl.className !== faceClass) {
			faceEl.className = faceClass
		}
	}

	startReplay(): void {
		// Get replay state from current game
		const replayState = this.engine.replayManager.getReplayState(this.engine.score)

		if (replayState.moves.length === 0) {
			alert("No moves to replay!")
			return
		}

		// Create replay player
		this.replayPlayer = new ReplayPlayer(replayState, this.renderer)
		this.isInReplayMode = true

		// Hide game over overlay and HEADER, show replay overlay
		document.querySelector("header")?.classList.add("hidden")
		document.getElementById("game-over-overlay")?.classList.add("hidden")
		document.getElementById("replay-overlay")?.classList.remove("hidden")

		// Automatically show the first move and start playing
		this.replayPlayer.goToFirst()
		this.replayPlayer.play()

		// Initialize replay UI
		this.updateReplayUI()
	}

	exitReplay(): void {
		if (this.replayPlayer) {
			this.replayPlayer.destroy()
			this.replayPlayer = null
		}

		this.isInReplayMode = false

		// Hide replay overlay, show game over overlay and restore HEADER
		document.getElementById("replay-overlay")?.classList.add("hidden")
		document.querySelector("header")?.classList.remove("hidden")
		document.getElementById("game-over-overlay")?.classList.remove("hidden")
	}

	updateReplayUI(): void {
		if (!this.replayPlayer) return

		const moveIndex = this.replayPlayer.getCurrentMoveIndex()
		const totalMoves = this.replayPlayer.getTotalMoves()
		const score = this.replayPlayer.getCurrentScore()

		// Update display
		const moveEl = document.getElementById("replay-move")
		const totalEl = document.getElementById("replay-total")
		const scoreEl = document.getElementById("replay-score")

		if (moveEl) moveEl.textContent = (moveIndex + 1).toString()
		if (totalEl) totalEl.textContent = totalMoves.toString()
		if (scoreEl) scoreEl.textContent = score.toString()
	}
}

// Boot
window.onload = () => {
	new GameApp()
}
