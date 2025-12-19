import { ALL_SHAPES, SHAPE_BASE_INDEX_MAP, SHAPE_CATEGORIES, SHAPE_VARIATION_COUNTS, SHAPE_WEIGHTS } from "./shapes"
import { GRID_SIZE, GameState, Grid, MoveResult, Point, SavedEngineState, SavedPowerupState, Shape } from "./types"
import { Powerup, PowerupActivation, PowerupManager } from "./powerups"

import { RNG } from "./rng"

export class GameEngine {
	// Persistence
	serialize(): SavedEngineState {
		return {
			grid: [...this.grid],
			score: this.score,
			currentShapes: [...this.currentShapes], // Shallow copy of shapes array (shapes are objects but effectively immutable)
			isGameOver: this.isGameOver,
			seed: this.seed,
			moves: this.moves,
			handGeneration: this.handGeneration,
			handDealtAt: this.handDealtAt,
			powerupManagerState: this.powerupManager.serialize(),
			rngState: this.rng.getState(),
			lastMoveTime: this.lastMoveTime,
		}
	}

	deserialize(state: SavedEngineState) {
		this.grid = state.grid
		this.score = state.score
		this.currentShapes = state.currentShapes
		this.isGameOver = state.isGameOver
		this.seed = state.seed
		this.moves = state.moves
		this.handGeneration = state.handGeneration
		this.handDealtAt = state.handDealtAt
		this.powerupManager.deserialize(state.powerupManagerState)
		if (state.rngState !== undefined) {
			this.rng.setState(state.rngState)
		}
		this.lastMoveTime = state.lastMoveTime || Date.now()
	}

	shiftTime(deltaMs: number) {
		if (this.handDealtAt > 0) this.handDealtAt += deltaMs
		if (this.lastMoveTime > 0) this.lastMoveTime += deltaMs
		this.powerupManager.shiftTime(deltaMs)
	}

	getPowerups() {
		return this.powerupManager.getPowerups()
	}

	// Tracks each time a new hand of blocks is dealt so the UI can run timers.
	handGeneration: number = 0
	handDealtAt: number = Date.now()

	grid: Grid
	score: number
	bestScore: number = 0
	currentShapes: (Shape | null)[]
	shapesInQueue: Shape[] = []
	isGameOver: boolean = false
	seed: number
	moves: number = 0
	rng: RNG
	powerupManager: PowerupManager
	lastUpdateTime: number = Date.now()
	lastMoveTime: number = Date.now()

	constructor(seed: number = Date.now()) {
		this.grid = new Array(GRID_SIZE * GRID_SIZE).fill(0)
		this.score = 0
		this.seed = seed // Store seed
		this.rng = new RNG(seed)
		this.powerupManager = new PowerupManager(this.rng)
		this.currentShapes = []
		this.refillShapes()
	}

	private getIndex(r: number, c: number): number {
		return r * GRID_SIZE + c
	}

	private isValid(r: number, c: number): boolean {
		return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE
	}

	// Refill logic: Get 3 random shapes with weighted selection
	// Weights are defined in SHAPE_WEIGHTS array (from shapes.ts)
	// Only one diagonal shape allowed per hand
	refillShapes(timestamp: number = Date.now()) {
		if (this.currentShapes.every((s) => s === null)) {
			const selectedIndices: number[] = []
			const selectedShapes: Shape[] = []
			const selectedCategories = new Set<string>()

			// Pick 3 unique shapes with weighted selection
			while (selectedShapes.length < 3) {
				// Create weighted pool excluding already selected shapes
				const weightedPool: number[] = []
				for (let i = 0; i < ALL_SHAPES.length; i++) {
					if (selectedIndices.includes(i)) continue // Skip already selected

					// Get the base shape index for this variation
					const baseIdx = SHAPE_BASE_INDEX_MAP[i]

					// Skip if this shape's category has already been selected
					const category = SHAPE_CATEGORIES[baseIdx]
					if (category && selectedCategories.has(category)) continue

					// Use weight from SHAPE_WEIGHTS array (indexed by base shape)
					// Divide by variation count so total weight for base shape is correct
					const baseWeight = SHAPE_WEIGHTS[baseIdx] || 1
					const variationCount = SHAPE_VARIATION_COUNTS[baseIdx] || 1
					const weight = baseWeight / variationCount

					// Convert fractional weights to integer pool entries
					const poolEntries = Math.max(1, Math.round(weight * 10))
					for (let w = 0; w < poolEntries; w++) {
						weightedPool.push(i)
					}
				}

				// Pick a random shape from the weighted pool
				if (weightedPool.length > 0) {
					const shapeIdx = weightedPool[this.rng.range(0, weightedPool.length)]
					selectedIndices.push(shapeIdx)
					selectedShapes.push(ALL_SHAPES[shapeIdx])

					// Track category if present (using base index)
					const baseIdx = SHAPE_BASE_INDEX_MAP[shapeIdx]
					const category = SHAPE_CATEGORIES[baseIdx]
					if (category) selectedCategories.add(category)
				} else {
					break // Safety: no more shapes available
				}
			}

			this.currentShapes = selectedShapes
			this.handGeneration++
			this.handDealtAt = timestamp
		}
	}

	canPlace(shape: Shape, boardRow: number, boardCol: number): boolean {
		for (const cell of shape.cells) {
			const r = boardRow + cell.r
			const c = boardCol + cell.c

			// Check bounds
			if (!this.isValid(r, c)) return false

			// Check overlap
			if (this.grid[this.getIndex(r, c)] !== 0) return false
		}
		return true
	}

	place(shapeIndex: number, boardRow: number, boardCol: number, options?: { isTutorial?: boolean }, timestamp: number = Date.now()): MoveResult {
		const shape = this.currentShapes[shapeIndex]
		if (!shape) throw new Error("Shape index empty")

		if (!this.canPlace(shape, boardRow, boardCol)) {
			return { valid: false, clearedRows: [], clearedCols: [], clearedBoxes: [], clearedCells: [], pointsAdded: 0, comboMultiplier: 0, gameOver: false }
		}

		// 1. Commit placement
		const placedCells: Point[] = []
		for (const cell of shape.cells) {
			const r = boardRow + cell.r
			const c = boardCol + cell.c
			this.grid[this.getIndex(r, c)] = shape.colorId
			placedCells.push({ r, c })
		}

		this.currentShapes[shapeIndex] = null

		// 2. Calculate placement points
		// Special case: 3x3 block gets fewer points (it's a "lucky" block)
		let points = shape.cells.length
		if (shape.cells.length === 9) {
			// Check if it's actually a 3x3 block (not just 9 cells in some other shape)
			const minR = Math.min(...shape.cells.map((c) => c.r))
			const maxR = Math.max(...shape.cells.map((c) => c.r))
			const minC = Math.min(...shape.cells.map((c) => c.c))
			const maxC = Math.max(...shape.cells.map((c) => c.c))
			const is3x3Block = maxR - minR === 2 && maxC - minC === 2
			if (is3x3Block) {
				points = 5 // Reduced from 9 for the lucky 3x3 block
			}
		}

		// 3. Clear Detection
		const rowsToClear: number[] = []
		const colsToClear: number[] = []
		const boxesToClear: number[] = []

		// Check Rows
		for (let r = 0; r < GRID_SIZE; r++) {
			let full = true
			for (let c = 0; c < GRID_SIZE; c++) {
				if (this.grid[this.getIndex(r, c)] === 0) {
					full = false
					break
				}
			}
			if (full) rowsToClear.push(r)
		}

		// Check Cols
		for (let c = 0; c < GRID_SIZE; c++) {
			let full = true
			for (let r = 0; r < GRID_SIZE; r++) {
				if (this.grid[this.getIndex(r, c)] === 0) {
					full = false
					break
				}
			}
			if (full) colsToClear.push(c)
		}

		// Check Boxes (3x3)
		// Box indices: 0..8
		// Top-left of box b: r = Math.floor(b/3)*3, c = (b%3)*3
		for (let b = 0; b < 9; b++) {
			const startR = Math.floor(b / 3) * 3
			const startC = (b % 3) * 3
			let full = true
			for (let r = startR; r < startR + 3; r++) {
				for (let c = startC; c < startC + 3; c++) {
					if (this.grid[this.getIndex(r, c)] === 0) {
						full = false
						break
					}
				}
				if (!full) break
			}
			if (full) boxesToClear.push(b)
		}

		// 4. Score Bonues (Simple but satisfying rules)
		const totalClears = rowsToClear.length + colsToClear.length + boxesToClear.length
		if (totalClears > 0) {
			points += totalClears * 10 // 10 points per line/box
			if (totalClears > 1) {
				points += (totalClears - 1) * 20 // Combo bonus
			}
		}

		// 5. Apply Clears
		const cellsToClear = new Set<number>()

		rowsToClear.forEach((r) => {
			for (let c = 0; c < GRID_SIZE; c++) cellsToClear.add(this.getIndex(r, c))
		})
		colsToClear.forEach((c) => {
			for (let r = 0; r < GRID_SIZE; r++) cellsToClear.add(this.getIndex(r, c))
		})
		boxesToClear.forEach((b) => {
			const startR = Math.floor(b / 3) * 3
			const startC = (b % 3) * 3
			for (let r = startR; r < startR + 3; r++) {
				for (let c = startC; c < startC + 3; c++) {
					cellsToClear.add(this.getIndex(r, c))
				}
			}
		})

		cellsToClear.forEach((idx) => {
			this.grid[idx] = 0
		})

		// 5.5 Check for powerup collection (MOVED after line clears)
		const collectedPowerup = this.powerupManager.checkCollection(placedCells)
		let powerupActivation: PowerupActivation | null = null
		if (collectedPowerup) {
			powerupActivation = this.powerupManager.activatePowerup(collectedPowerup, this.grid)
			// Clear cells affected by powerup
			for (const cell of powerupActivation.affectedCells) {
				this.grid[this.getIndex(cell.r, cell.c)] = 0
			}
		}

		// Fast Move Multiplier
		const now = timestamp
		const timeSinceLastMove = now - this.lastMoveTime
		let moveMultiplier = 1
		if (timeSinceLastMove < 1500 && this.moves > 0) {
			// 1.5 seconds threshold, skip first move
			moveMultiplier = 1.5
			points = Math.floor(points * moveMultiplier)
		}

		// Add powerup points if any
		if (powerupActivation) {
			points += powerupActivation.pointsAwarded
		}

		if (!options?.isTutorial) {
			this.score += points
		}

		// Chance to spawn a powerup after a successful placement (post-clear so it lands on empty cells)
		this.powerupManager.onPlacement(timestamp, this.grid)

		// 6. Refill if empty
		if (this.currentShapes.every((s) => s === null)) {
			this.refillShapes(timestamp)
		}

		// 7. Check Game Over
		const gameOver = !this.canPlaceAny()
		this.isGameOver = gameOver // Update state

		this.moves++ // Increment moves
		this.lastMoveTime = now

		// Combine cleared cells from lines/boxes and powerup
		const allClearedCells = Array.from(cellsToClear).map((idx) => ({
			r: Math.floor(idx / GRID_SIZE),
			c: idx % GRID_SIZE,
		}))
		if (powerupActivation) {
			allClearedCells.push(...powerupActivation.affectedCells)
		}

		return {
			valid: true,
			clearedRows: rowsToClear,
			clearedCols: colsToClear,
			clearedBoxes: boxesToClear,
			clearedCells: allClearedCells,
			pointsAdded: points,
			comboMultiplier: totalClears,
			moveMultiplier, // Pass back to UI if needed
			gameOver,
		}
	}

	canPlaceAny(): boolean {
		// Brute force check: try every shape in every position
		// Optimization: early exit
		for (const shape of this.currentShapes) {
			if (!shape) continue
			if (this.canPlaceShape(shape)) return true
		}
		return false
	}

	canPlaceShape(shape: Shape): boolean {
		for (let r = 0; r < GRID_SIZE; r++) {
			for (let c = 0; c < GRID_SIZE; c++) {
				if (this.canPlace(shape, r, c)) return true
			}
		}
		return false
	}
	setGrid(newGrid: Grid) {
		this.grid = [...newGrid]
	}

	setShapes(newShapes: (Shape | null)[]) {
		this.currentShapes = [...newShapes]
	}

	reset(seed: number = Date.now()) {
		this.seed = seed
		this.rng = new RNG(seed)
		this.powerupManager = new PowerupManager(this.rng)
		this.grid = new Array(GRID_SIZE * GRID_SIZE).fill(0)
		this.score = 0
		this.currentShapes = []
		this.refillShapes()
		this.isGameOver = false
		this.moves = 0
		this.lastUpdateTime = Date.now()
		this.handGeneration = 0

		this.handDealtAt = Date.now()
		this.lastMoveTime = Date.now()
	}

	// Update powerups (call this from the game loop)
	update(currentTime: number = Date.now(), isActive: boolean = true) {
		this.lastUpdateTime = currentTime
		if (isActive) {
			this.powerupManager.update(currentTime, this.grid)
		}
	}

	// Testing helper: force spawn a powerup immediately
	spawnTestPowerup(currentTime: number = Date.now()) {
		this.powerupManager.spawnImmediate(currentTime, this.grid)
	}

	// Testing helper: force spawn a specific powerup type
	spawnPowerupOfType(type: Powerup["type"], currentTime: number = Date.now()) {
		this.powerupManager.spawnOfType(type, currentTime, this.grid)
	}
}
