import { ALL_SHAPES, SHAPE_BASE_INDEX_MAP } from "../engine/shapes"
import { MoveResult, Shape } from "../engine/types"

import { BitwiseGameEngine } from "../engine/bitwise-logic"
import { GameEngine } from "../engine/logic"

export interface BotMove {
	shapeIndex: number
	r: number
	c: number
	score: number
}

export interface BotWeights {
	pointsMultiplier: number
	emptyBoardMultiplier: number // actually a penalty per occupied, or bonus per empty. Logic currently does `score -= occupied * X`
	adjacencyBonus: number
	holePenalty: number
	boxCompletionBonus: number
}

// Default "Hand-Tuned" Weights
export const DEFAULT_WEIGHTS: BotWeights = {
	pointsMultiplier: 1.5,
	emptyBoardMultiplier: 2.0,
	adjacencyBonus: 0.5,
	holePenalty: 20.0,
	boxCompletionBonus: 0.5,
}

// Naive "Clean Slate" weights for pure evolution testing
export const NAIVE_WEIGHTS: BotWeights = {
	pointsMultiplier: 1.0, // Only cares about points
	emptyBoardMultiplier: 0,
	adjacencyBonus: 0,
	holePenalty: 0,
	boxCompletionBonus: 0,
}

export class Bot {
	engine: GameEngine
	weights: BotWeights
	lookaheadDepth: number = 2

	constructor(engine: GameEngine, weights: BotWeights = DEFAULT_WEIGHTS) {
		this.engine = engine
		this.weights = weights
	}

	// Create a bitwise copy for simulation
	private createBitwise(engine: GameEngine): BitwiseGameEngine {
		const b = new BitwiseGameEngine()
		// Copy grid manualy
		for (let i = 0; i < 81; i++) {
			if (engine.grid[i] !== 0) {
				const r = Math.floor(i / 9)
				const c = i % 9
				const blockIdx = Math.floor(r / 3)
				const rowInBlock = r % 3
				const bitIndex = rowInBlock * 9 + c
				b.board[blockIdx] |= 1 << bitIndex
			}
		}
		b.score = engine.score
		return b
	}

	// Dynamic lookahead using FAST Bitwise Engine
	findBestMove(): BotMove | null {
		let bestMove: BotMove | null = null
		let bestTotalHeuristic = -Infinity

		// Convert current state ONCE
		const rootSim = this.createBitwise(this.engine)

		const availableIndices = this.engine.currentShapes.map((s, i) => (s ? i : -1)).filter((i) => i !== -1)

		for (const shapeIndex of availableIndices) {
			const shape = this.engine.currentShapes[shapeIndex]
			if (!shape) continue

			for (let r = 0; r < 9; r++) {
				for (let c = 0; c < 9; c++) {
					// Check fast place
					if (rootSim.canPlace(shape.cells, r, c)) {
						// 1. Simulate First Move
						const sim1 = rootSim.clone()
						const lines1 = sim1.place(shape.cells, r, c)

						// Heuristic 1
						const h1 = this.evaluateBitwise(sim1, lines1)

						// Pruning
						if (h1 < -5000) {
							if (h1 > bestTotalHeuristic) {
								bestTotalHeuristic = h1
								bestMove = { shapeIndex, r, c, score: h1 }
							}
							continue
						}

						// Optimization
						if (bestTotalHeuristic > -Infinity && h1 < bestTotalHeuristic - 40) {
							continue
						}

						// 2. Look ahead
						let bestH2 = -5000
						const available2 = availableIndices.filter((i) => i !== shapeIndex)

						if (available2.length === 0) {
							// No more shapes
							if (h1 > bestTotalHeuristic) {
								bestTotalHeuristic = h1
								bestMove = { shapeIndex, r, c, score: h1 }
							}
							continue
						}

						for (const idx2 of available2) {
							const s2 = this.engine.currentShapes[idx2]
							if (!s2) continue

							for (let r2 = 0; r2 < 9; r2++) {
								for (let c2 = 0; c2 < 9; c2++) {
									if (sim1.canPlace(s2.cells, r2, c2)) {
										const sim2 = sim1.clone()
										const lines2 = sim2.place(s2.cells, r2, c2)
										const h2 = this.evaluateBitwise(sim2, lines2)

										// 3-Move Lookahead Expansion
										if (this.lookaheadDepth >= 3) {
											let bestH3 = -5000
											const available3 = available2.filter((i) => i !== idx2)

											if (available3.length > 0) {
												for (const idx3 of available3) {
													const s3 = this.engine.currentShapes[idx3]
													if (!s3) continue

													for (let r3 = 0; r3 < 9; r3++) {
														for (let c3 = 0; c3 < 9; c3++) {
															if (sim2.canPlace(s3.cells, r3, c3)) {
																// Lightweight heuristic check for 3rd move (no full eval needed maybe?)
																// Actually just checking validity is essentially "can I survive".
																// But let's do a score check
																const sim3 = sim2.clone()
																const lines3 = sim3.place(s3.cells, r3, c3)
																const h3 = this.evaluateBitwise(sim3, lines3)
																if (h3 > bestH3) bestH3 = h3
															}
														}
													}
												}
											} else {
												bestH3 = 0 // No 3rd move needed
											}

											// Propagate bestH3 up
											if (bestH3 <= -4000) {
												// 2nd move leads to death/stuck on 3rd move
												// penalize h2?
												// For now, simple sum
											} else {
												// Accumulate
												if (bestH3 + h2 > bestH2) bestH2 = h2 + bestH3
											}
										} else {
											if (h2 > bestH2) bestH2 = h2
										}
									}
								}
							}
						}

						const totalHeuristic = h1 + (bestH2 > -4000 ? bestH2 : 0)

						if (totalHeuristic > bestTotalHeuristic) {
							bestTotalHeuristic = totalHeuristic
							bestMove = { shapeIndex, r, c, score: totalHeuristic }
						}
					}
				}
			}
		}

		return bestMove
	}

	private evaluateBitwise(engine: BitwiseGameEngine, linesCleared: number): number {
		let score = 0

		// 1. Clears
		score += linesCleared * 20 * this.weights.pointsMultiplier // simplified points

		// 2. Board Stats
		let occupiedCount = 0
		let adjacencyBonus = 0
		let holePenalty = 0
		let boxCompletionBonus = 0

		// Unpack bits to analyze
		// This is slightly slower but we do it fewer times thanks to cloning speed
		// Actually we can analyze bits directly?
		// For now let's iterate cells, optimization for later: bitwise counting

		const isOcc = (r: number, c: number) => {
			if (r < 0 || r > 8 || c < 0 || c > 8) return false // Walls are not occupied
			const blockIdx = Math.floor(r / 3)
			const rowInBlock = r % 3
			const bitIndex = rowInBlock * 9 + c
			return (engine.board[blockIdx] & (1 << bitIndex)) !== 0
		}

		for (let r = 0; r < 9; r++) {
			for (let c = 0; c < 9; c++) {
				if (isOcc(r, c)) {
					occupiedCount++
					// Adjacency
					if (isOcc(r + 1, c)) adjacencyBonus++
					if (isOcc(r, c + 1)) adjacencyBonus++
				} else {
					// Hole?
					let walls = 0
					if (r === 0 || isOcc(r - 1, c)) walls++
					if (r === 8 || isOcc(r + 1, c)) walls++
					if (c === 0 || isOcc(r, c - 1)) walls++
					if (c === 8 || isOcc(r, c + 1)) walls++
					if (walls === 4) holePenalty += 1
				}
			}
		}

		// 3. Box Focus (Simplified)
		// Just checking how full boxes are
		for (let b = 0; b < 3; b++) {
			// Accessing the 3 ints directly gives us rows 0-2, 3-5, 6-8
			// We can check columns in them
			// actually simpler to just stick to the loops above, bitwise box analysis is tricky
			// Actually, engine.board[0] is the top 3 rows.
			// Box 0 (Top-Left) is bits 0-2, 9-11, 18-20 of board[0]
			// We can implement bitwise counts later.
		}

		score -= occupiedCount * this.weights.emptyBoardMultiplier
		score += adjacencyBonus * this.weights.adjacencyBonus
		score -= holePenalty * this.weights.holePenalty

		return score
	}
}
