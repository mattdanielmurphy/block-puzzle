import { Grid, Shape } from './types.js'

import { GameEngine } from './logic.js'
import { GameMove } from './replay.js'

// A shape in the hand may not have an ID, but the shapes in a replay do.
// This is a bit of a hack to make them compatible.
function getShapeId(shape: Shape): string {
	return shape.id
}

export function runReplay(args: {
	seed: number
	actions: GameMove[]
	options?: { maxActions?: number; maxDurationMs?: number }
}): { isValid: boolean; finalScore: number; finalGrid: Grid; gameOver: boolean; reason?: string } {
	const { seed, actions, options } = args
	const engine = new GameEngine(seed)
	const maxActions = options?.maxActions ?? 1000
	const maxDuration = options?.maxDurationMs ?? 10 * 60 * 1000 // 10 minutes

	if (actions.length > maxActions) {
		return { isValid: false, finalScore: 0, finalGrid: engine.grid, gameOver: engine.isGameOver, reason: "Too many actions" }
	}

	const startTime = Date.now()

	for (const action of actions) {
		if (Date.now() - startTime > maxDuration) {
			return { isValid: false, finalScore: 0, finalGrid: engine.grid, gameOver: engine.isGameOver, reason: "Replay took too long" }
		}
		// Find the shape in the current hand
		const shapeIndex = engine.currentShapes.findIndex((s) => s && getShapeId(s) === action.shapeId)
		if (shapeIndex === -1) {
			return { isValid: false, finalScore: engine.score, finalGrid: engine.grid, gameOver: engine.isGameOver, reason: "Shape not in hand" }
		}

		const result = engine.place(shapeIndex, action.boardRow, action.boardCol, undefined, action.timestamp)
		if (!result.valid) {
			return { isValid: false, finalScore: engine.score, finalGrid: engine.grid, gameOver: engine.isGameOver, reason: "Invalid placement" }
		}
	}
	return { isValid: true, finalScore: engine.score, finalGrid: engine.grid, gameOver: engine.isGameOver }
}
