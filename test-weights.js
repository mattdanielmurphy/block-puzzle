// Test script to verify shape weighting
import { ALL_SHAPES, SHAPE_WEIGHTS, SHAPE_CATEGORIES } from "./dist/src/engine/shapes.js"
import { GameEngine } from "./dist/src/engine/logic.js"

console.log("=== Shape Analysis ===")
console.log("Number of base shape definitions:", SHAPE_WEIGHTS.length)
console.log("Number of total shapes (with variations):", ALL_SHAPES.length)
console.log("\nBase shape weights:", SHAPE_WEIGHTS)
console.log("\nBase shape categories:", SHAPE_CATEGORIES)

console.log("\n=== Shape Details ===")
ALL_SHAPES.forEach((shape, idx) => {
	console.log(`Shape ${idx}: id=${shape.id}, cells=${shape.cells.length}, colorId=${shape.colorId}`)
})

console.log("\n=== Testing Distribution (10000 hands) ===")
const counts = new Array(SHAPE_WEIGHTS.length).fill(0)
const iterations = 10000

for (let i = 0; i < iterations; i++) {
	const engine = new GameEngine(i)

	// Count which base shapes appear
	engine.currentShapes.forEach((shape) => {
		if (shape) {
			// Extract base index from shape.id (format: shape_X_vY)
			const match = shape.id.match(/shape_(\d+)_/)
			if (match) {
				const baseIdx = parseInt(match[1])
				counts[baseIdx]++
			}
		}
	})
}

console.log("\nBase shape appearance counts (out of", iterations * 3, "total picks):")
counts.forEach((count, idx) => {
	const percentage = ((count / (iterations * 3)) * 100).toFixed(2)
	const weight = SHAPE_WEIGHTS[idx]
	const category = SHAPE_CATEGORIES[idx] || "none"
	console.log(`  Base ${idx}: ${count} times (${percentage}%) - weight: ${weight}, category: ${category}`)
})

console.log("\n=== Expected vs Actual ===")
const totalWeight = SHAPE_WEIGHTS.reduce((sum, w) => sum + w, 0)
counts.forEach((count, idx) => {
	const actualPercent = ((count / (iterations * 3)) * 100).toFixed(2)
	const expectedPercent = ((SHAPE_WEIGHTS[idx] / totalWeight) * 100).toFixed(2)
	const diff = (parseFloat(actualPercent) - parseFloat(expectedPercent)).toFixed(2)
	console.log(`  Base ${idx}: Expected ${expectedPercent}%, Got ${actualPercent}%, Diff: ${diff}%`)
})
