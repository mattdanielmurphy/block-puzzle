// Drag feel, kept free of DOM so it can be tested: where the ghost snaps, which haptic a
// drag step earns, and the subtle extra vertical reach near the top of the board.
//
// Haptic rule (Matt, 2026-11-26): while dragging, a haptic fires only when the piece sits on a
// spot it can actually be dropped on. No feedback at spots that only "fit" by hanging off the
// board, and none for sliding off a valid spot.

export type Cell = { r: number; c: number }
export type DragHaptic = { kind: "snap" } | { kind: "tick"; crossedBox: boolean } | { kind: "slam"; strength: number }

/**
 * Nearest valid placement to a floating board position (anchor in cells), searching the
 * 3×3 neighbourhood of the closest cell. `canPlace` must reject anything off the board.
 */
export function bestPlacement(canPlace: (r: number, c: number) => boolean, rFloat: number, cFloat: number, threshold = 3): Cell | null {
	const startR = Math.round(rFloat)
	const startC = Math.round(cFloat)
	let best: (Cell & { dist: number }) | null = null
	for (let r = startR - 1; r <= startR + 1; r++) {
		for (let c = startC - 1; c <= startC + 1; c++) {
			if (!canPlace(r, c)) continue
			const dist = Math.hypot(r - rFloat, c - cFloat)
			if (!best || dist < best.dist) best = { r, c, dist }
		}
	}
	return best && best.dist < threshold ? { r: best.r, c: best.c } : null
}

/**
 * Tracks one drag and decides its haptics. Call `reset()` on pick-up and `move()` on every
 * drag step with the snapped ghost (null when the piece can't be dropped here).
 */
export class DragHaptics {
	private prevGhost: Cell | null = null
	private vel = 0
	private last: { x: number; y: number; t: number } | null = null
	private inside = { h: true, top: true }

	reset() {
		this.prevGhost = null
		this.vel = 0
		this.last = null
		this.inside = { h: true, top: true }
	}

	/**
	 * @param ghost snapped valid placement, or null
	 * @param x,y piece centre in px (for drag speed)
	 * @param rowF,colF piece anchor in board cells (floating)
	 * @param h,w piece size in cells; pitch = px per cell; gridSize = cells per side
	 */
	move(ghost: Cell | null, x: number, y: number, rowF: number, colF: number, h: number, w: number, pitch: number, gridSize: number, now: number): DragHaptic[] {
		const out: DragHaptic[] = []
		const prev = this.prevGhost
		this.prevGhost = ghost

		if (ghost && !prev) out.push({ kind: "snap" })
		else if (ghost && prev && (ghost.r !== prev.r || ghost.c !== prev.c)) {
			// One tick per cell; harder when it crosses a 3×3 box line.
			const box = (n: number) => Math.floor(n / 3)
			out.push({ kind: "tick", crossedBox: box(ghost.r) !== box(prev.r) || box(ghost.c) !== box(prev.c) })
		}
		// Sliding off a valid spot onto one where the piece can't go: no haptic (was a soft "unsnap").

		// Edge thud: only while the piece still has a real, droppable spot (the ghost snapped
		// inside the board). Shoved off the board with nowhere to drop, it stays silent.
		if (this.last) {
			const dt = Math.max(1, now - this.last.t)
			const v = Math.hypot(x - this.last.x, y - this.last.y) / dt // px per ms
			this.vel = this.vel * 0.6 + v * 0.4
		}
		this.last = { x, y, t: now }
		const overBoardRows = rowF + h > 0.5 && rowF < gridSize - 0.5
		const insideH = colF >= -0.5 && colF + w <= gridSize + 0.5
		const insideTop = rowF >= -0.5
		// Speed in board-cells per 100ms, mapped to 0..1 strength (a quick shove ≈ 1).
		const strength = Math.min(1, (this.vel * 100) / pitch / 3)
		const hitSide = overBoardRows && this.inside.h && !insideH
		const hitTop = this.inside.top && !insideTop && insideH
		if (ghost && (hitSide || hitTop) && strength > 0.12) out.push({ kind: "slam", strength })
		this.inside = { h: insideH || !overBoardRows, top: insideTop }
		return out
	}
}

/**
 * Extra upward travel (px) for a dragged piece whose centre would sit at `y`, so reaching the
 * top rows takes a little less thumb movement. Gain rises linearly from 1 at the board's
 * bottom edge to 1 + boost at its top edge and stays there above it; below the board it's 1.
 * Integrated, so the mapping depends only on position (moving back down retraces exactly).
 * boost 0 = off.
 */
export function topBoostOffset(y: number, boardTop: number, boardBottom: number, boost: number): number {
	const H = boardBottom - boardTop
	if (boost <= 0 || H <= 0) return 0
	const u = boardBottom - y // distance above the board's bottom edge
	if (u <= 0) return 0
	if (u <= H) return (boost * u * u) / (2 * H)
	return boost * (H / 2 + (u - H))
}
