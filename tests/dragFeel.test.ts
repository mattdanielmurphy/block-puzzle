// @vitest-environment node
import { describe, it, expect } from "vitest"
import { GameEngine } from "../src/engine/logic"
import { GRID_SIZE, Shape } from "../src/engine/types"
import { DragHaptics, DragHaptic, bestPlacement, topBoostOffset } from "../src/ui/dragFeel"

const PITCH = 40
const square: Shape = { id: "sq2", colorId: 1, cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }] }

/** Board full except a 2×2 hole at rows/cols 4–5, plus single free cells in every corner. */
function nearlyFullEngine() {
	const e = new GameEngine(1)
	e.grid.fill(1)
	const free = (r: number, c: number) => (e.grid[r * GRID_SIZE + c] = 0)
	free(4, 4), free(4, 5), free(5, 4), free(5, 5)
	free(0, 0), free(0, 8), free(8, 0), free(8, 8)
	return e
}

/** Fast drag of the square along a straight line in board-cell coords; returns every haptic it earned. */
function drag(e: GameEngine, from: [number, number], to: [number, number], steps = 12) {
	const feel = new DragHaptics()
	feel.reset()
	const out: DragHaptic[] = []
	let t = 0
	for (let i = 0; i <= steps; i++) {
		const rowF = from[0] + ((to[0] - from[0]) * i) / steps
		const colF = from[1] + ((to[1] - from[1]) * i) / steps
		const ghost = bestPlacement((r, c) => e.canPlace(square, r, c), rowF, colF, 3)
		out.push(...feel.move(ghost, colF * PITCH, rowF * PITCH, rowF, colF, 2, 2, PITCH, GRID_SIZE, (t += 8)))
	}
	return out
}

describe("drag haptics only on droppable spots", () => {
	// Each target hangs the 2×2 piece off the board; the only "fit" there would be off the board.
	const offBoard: Record<string, { from: [number, number]; to: [number, number] }> = {
		"top-left corner": { from: [1.2, 1.2], to: [-0.9, -0.9] },
		"top-right corner": { from: [1.2, 5.8], to: [-0.9, 7.9] },
		"bottom-left corner": { from: [5.8, 1.2], to: [7.9, -0.9] },
		"bottom-right corner": { from: [5.8, 5.8], to: [7.9, 7.9] },
		"top edge": { from: [1.2, 1.2], to: [-0.9, 1.2] },
		"left edge": { from: [1.2, 1.2], to: [1.2, -0.9] },
		"right edge": { from: [1.2, 6.0], to: [1.2, 7.9] },
		"bottom edge": { from: [6.2, 1.2], to: [7.9, 1.2] },
	}
	for (const [name, p] of Object.entries(offBoard)) {
		it(`no haptic at the ${name} when nothing fits`, () => {
			expect(drag(nearlyFullEngine(), p.from, p.to)).toEqual([])
		})
	}

	it("a real valid spot still snaps", () => {
		const hits = drag(nearlyFullEngine(), [7.5, 1.2], [4.1, 4.1])
		expect(hits.filter((h) => h.kind === "snap").length).toBe(1)
	})

	it("sliding off a valid spot is silent", () => {
		const hits = drag(nearlyFullEngine(), [4, 4], [1.2, 1.2])
		expect(hits).toEqual([{ kind: "snap" }])
	})

	it("edge thud still fires while the ghost has a real spot inside (empty board)", () => {
		const hits = drag(new GameEngine(1), [2, 2], [-0.9, 2])
		expect(hits.some((h) => h.kind === "slam")).toBe(true)
		expect(hits.some((h) => h.kind === "tick")).toBe(true)
	})
})

describe("top boost", () => {
	const top = 100,
		bottom = 460 // 360 px board
	it("0 is off", () => {
		for (const y of [0, 100, 250, 460, 600]) expect(topBoostOffset(y, top, bottom, 0)).toBe(0)
	})
	it("does nothing at or below the board's bottom edge", () => {
		expect(topBoostOffset(460, top, bottom, 0.15)).toBe(0)
		expect(topBoostOffset(700, top, bottom, 0.15)).toBe(0)
	})
	it("grows toward the top: gain 1 + boost at the top edge", () => {
		const H = bottom - top
		expect(topBoostOffset(top, top, bottom, 0.15)).toBeCloseTo((0.15 * H) / 2)
		// local gain = d(offset)/dy near the top ≈ boost, near the bottom ≈ 0
		const gainAt = (y: number) => topBoostOffset(y - 1, top, bottom, 0.15) - topBoostOffset(y, top, bottom, 0.15)
		expect(gainAt(top + 1)).toBeCloseTo(0.15, 2)
		expect(gainAt(bottom - 1)).toBeLessThan(0.01)
		expect(gainAt(top - 50)).toBeCloseTo(0.15, 5) // above the board it stays at 1 + boost
	})
	it("is monotonic (no jumps or reversals)", () => {
		let prev = -1
		for (let y = 700; y >= -100; y -= 5) {
			const o = topBoostOffset(y, top, bottom, 0.15)
			expect(o).toBeGreaterThanOrEqual(prev)
			prev = o
		}
	})
})
