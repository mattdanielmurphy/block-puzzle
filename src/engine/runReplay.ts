import { Grid, Shape } from "./types"

import { GameEngine } from "./logic"
import { GameMove } from "./replay"

// A shape in the hand may not have an ID, but the shapes in a replay do.
// This is a bit of a hack to make them compatible.
function getShapeId(shape: Shape): string {
	return shape.id
}

export function runReplay(args: { seed: number; actions: GameMove[]; options?: { maxActions?: number; maxDurationMs?: number } }): {
	isValid: boolean
	finalScore: number
	finalGrid: Grid
	gameOver: boolean
	reason?: string
} {
	const { seed, actions, options } = args
	const engine = new GameEngine(seed)
	const maxActions = options?.maxActions ?? 1000
	const maxDuration = options?.maxDurationMs ?? 10 * 60 * 1000 // 10 minutes

	if (actions.length > maxActions) {
		return { isValid: false, finalScore: 0, finalGrid: engine.grid, gameOver: engine.isGameOver, reason: "Too many actions" }
	}

	const startTime = Date.now()

	for (const action of actions) {
		console.log(`\n=== REPLAY MOVE ${actions.indexOf(action) + 1}/${actions.length} ===`)
		console.log("Looking for shape:", action.shapeId)
		console.log(
			"Current hand:",
			engine.currentShapes.map((s) => (s ? s.id : "null"))
		)

		if (Date.now() - startTime > maxDuration) {
			return { isValid: false, finalScore: 0, finalGrid: engine.grid, gameOver: engine.isGameOver, reason: "Replay took too long" }
		}
		// Find the shape in the current hand
		const shapeIndex = engine.currentShapes.findIndex((s) => s && getShapeId(s) === action.shapeId)
		if (shapeIndex === -1) {
			console.error("❌ SHAPE NOT FOUND")
			const currentShapeIds = engine.currentShapes.map((s) => (s ? s.id : "null"))
			console.error("Replay validation failed at move", actions.indexOf(action))
			console.error("Looking for shape:", action.shapeId)
			console.error("Current hand:", currentShapeIds)
			console.error("RNG state:", engine.rng.getState())
			return {
				isValid: false,
				finalScore: engine.score,
				finalGrid: engine.grid,
				gameOver: engine.isGameOver,
				reason: `Shape not in hand at move ${actions.indexOf(action) + 1} Expected: ${action.shapeId}, Found: [${currentShapeIds.join(", ")}]`,
			}
		}

		const result = engine.place(shapeIndex, action.boardRow, action.boardCol, undefined, action.timestamp)
		if (!result.valid) {
			return { isValid: false, finalScore: engine.score, finalGrid: engine.grid, gameOver: engine.isGameOver, reason: "Invalid placement" }
		}
	}
	return { isValid: true, finalScore: engine.score, finalGrid: engine.grid, gameOver: engine.isGameOver }
}
