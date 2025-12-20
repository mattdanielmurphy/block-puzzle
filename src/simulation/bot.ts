import { ALL_SHAPES, SHAPE_BASE_INDEX_MAP } from "../engine/shapes"
import { MoveResult, Shape } from "../engine/types"

import { GameEngine } from "../engine/logic"

export interface BotMove {
	shapeIndex: number
	r: number
	c: number
	score: number
}

export class Bot {
	engine: GameEngine

	constructor(engine: GameEngine) {
		this.engine = engine
	}

	// Clone engine state to simulate a move without affecting real game
	private cloneEngine(engine: GameEngine): GameEngine {
		const saved = engine.serialize()
		const newEngine = new GameEngine(saved.seed)
		newEngine.deserialize(saved)
		return newEngine
	}

	// Basic greedy strategy: Find the move that results in the best immediate heuristic score
	findBestMove(): BotMove | null {
		let bestMove: BotMove | null = null
		let bestHeuristic = -Infinity

		const availableIndices = this.engine.currentShapes.map((s, i) => (s ? i : -1)).filter((i) => i !== -1)

		// Sort available shapes to try larger ones first (simple heuristic to prioritize hard-to-place pieces)
		// Actually, exhaustive search over "pick one shape and place it" is better?
		// We are just picking the NEXT move.

		for (const shapeIndex of availableIndices) {
			const shape = this.engine.currentShapes[shapeIndex]
			if (!shape) continue

			for (let r = 0; r < 9; r++) {
				for (let c = 0; c < 9; c++) {
					if (this.engine.canPlace(shape, r, c)) {
						// Simulate!
						const simEngine = this.cloneEngine(this.engine)
						const result = simEngine.place(shapeIndex, r, c)

						const heuristic = this.evaluate(simEngine, result)

						if (heuristic > bestHeuristic) {
							bestHeuristic = heuristic
							bestMove = { shapeIndex, r, c, score: heuristic }
						}
					}
				}
			}
		}

		return bestMove
	}

	private evaluate(engine: GameEngine, lastMove: MoveResult): number {
		let score = 0

		// --- 1. Survival (Highest Check) ---
		// If placing this piece makes me unable to place the others, huge penalty!
		const remainingShapes = engine.currentShapes.filter((s) => s !== null)
		if (remainingShapes.length > 0) {
			let unplaceableCount = 0
			for (const s of remainingShapes) {
				if (s && !engine.canPlaceShape(s)) {
					unplaceableCount++
				}
			}
			if (unplaceableCount > 0) {
				return -10000 * unplaceableCount // Immediate fail state for this branch
			}
		}

		// --- 2. Base Points (Clears) ---
		// We want to clear lines, but we want to prioritize surviving over greedy points
		// unless the points come from clearing a LOT.
		// lastMove.pointsAdded includes cells placed + clear bonuses.
		score += lastMove.pointsAdded * 1.5

		// --- 3. Board "Quality" Heuristics ---
		// Analyze the grid AFTER the move (and clears)

		let occupiedCount = 0
		let adjacencyBonus = 0
		let holePenalty = 0
		let boxCompletionBonus = 0

		const grid = engine.grid
		const size = 9

		// Helper to check bounds
		const isOcc = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size && grid[r * size + c] !== 0

		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				const idx = r * size + c
				if (grid[idx] !== 0) {
					occupiedCount++

					// Adjacency: Good to be next to other blocks (clumping)
					// We only check right and down to avoid double counting
					// actually double counting is fine if consistent, but let's check all 4 neighbors
					// to seeing how "surrounded" this block is.
					let neighbors = 0
					if (isOcc(r - 1, c)) neighbors++
					if (isOcc(r + 1, c)) neighbors++
					if (isOcc(r, c - 1)) neighbors++
					if (isOcc(r, c + 1)) neighbors++

					// Reward having neighbors (contributing to a cluster)
					adjacencyBonus += neighbors * 1.0
				} else {
					// It's empty. Is it a 1x1 hole?
					// A hole is empty surrounded by occupied (or walls)
					let walls = 0
					if (r === 0 || isOcc(r - 1, c)) walls++
					if (r === size - 1 || isOcc(r + 1, c)) walls++
					if (c === 0 || isOcc(r, c - 1)) walls++
					if (c === size - 1 || isOcc(r, c + 1)) walls++

					if (walls === 4) {
						holePenalty += 20 // 1x1 holes are very bad
					}
				}
			}
		}

		// Penalize total fullness (we want empty board)
		// But clearing lines (in step 2) naturally reduces this.
		// We add a small penalty per occupied block to act as a tie breaker
		// favoring moves that clear or keep board empty.
		score -= occupiedCount * 2.0

		// Add Adjacency Score
		// We want to encourage filling HOLES/GAPS, effectively "repairing" the board.
		score += adjacencyBonus * 0.5

		// --- 4. 3x3 Box Focus ---
		// Users said: "Better to contribute to the filling up of a 3x3 box"
		// Let's reward boxes that are > 50% full but not full (since full would have cleared)
		// Wait, if they cleared, they are now empty.
		// If they are NOT cleared, we want them to be neat.
		for (let b = 0; b < 9; b++) {
			const startR = Math.floor(b / 3) * 3
			const startC = (b % 3) * 3
			let filledInBox = 0
			for (let r = startR; r < startR + 3; r++) {
				for (let c = startC; c < startC + 3; c++) {
					if (grid[r * size + c] !== 0) filledInBox++
				}
			}

			// If box is very full (but not cleared), it's a "danger zone" or "opportunity"
			// If we just placed a block there and didn't clear, it might be risky.
			// But the user WANTS to fill boxes.
			// Let's reward filling a box cleanly?
			// Actually, maybe we just assume adjacency covers this.
			// Let's reward high density in boxes to encourage finishing them.
			if (filledInBox > 0) {
				boxCompletionBonus += Math.pow(filledInBox, 1.5) // Non-linear reward for concentrating blocks
			}
		}
		score += boxCompletionBonus * 0.5

		score -= holePenalty

		// --- 5. Fuzz / Tie Breaker ---
		// Add tiny random amount to prevent "always top-left" deterministic boredom
		// and to explore slightly different equal-value paths over time
		score += Math.random() * 0.5

		return score
	}
}
