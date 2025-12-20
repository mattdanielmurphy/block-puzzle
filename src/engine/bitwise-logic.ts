export class BitwiseGameEngine {
	// Board State: 3 32-bit integers, representing rows 0-2, 3-5, 6-8
	// Each row is 9 bits. Total 27 bits used per integer.
	// r0: bits 0-8, r1: bits 9-17, r2: bits 18-26
	// We use 3 integers because JS bitwise ops are 32-bit safe.
	// 81 bits total fits easily in 3 ints.
	board: Int32Array

	// Score
	score: number = 0

	constructor(loadedBoard?: Int32Array, score?: number) {
		if (loadedBoard) {
			this.board = new Int32Array(loadedBoard)
			this.score = score || 0
		} else {
			this.board = new Int32Array(3) // [rows 0-2, rows 3-5, rows 6-8]
			this.score = 0
		}
	}

	clone(): BitwiseGameEngine {
		return new BitwiseGameEngine(this.board, this.score)
	}

	// Constants for checking completion
	// 9 bits set: 111111111 = 511
	static ROW_MASK = 511

	// Check if a shape can be placed at (r, c)
	// shapeMasks: array of 3 integers representing the shape's bits at this specific position
	// Since generating masks on the fly is slow, we should precompute them?
	// Or simplistic check:
	canPlace(shapeCells: { r: number; c: number }[], rOffset: number, cOffset: number): boolean {
		// Boundary check
		// We assumes shapeCells are relative to 0,0.
		for (let i = 0; i < shapeCells.length; i++) {
			const cell = shapeCells[i]
			const r = cell.r + rOffset
			const c = cell.c + cOffset

			if (r < 0 || r >= 9 || c < 0 || c >= 9) return false

			// Get relevant block
			const blockIdx = Math.floor(r / 3)
			const rowInBlock = r % 3
			const bitIndex = rowInBlock * 9 + c

			if ((this.board[blockIdx] & (1 << bitIndex)) !== 0) return false
		}
		return true
	}

	// This is the optimized 'place' which returns lines cleared
	place(shapeCells: { r: number; c: number }[], rOffset: number, cOffset: number): number {
		let clearedLines = 0
		let points = 0

		// 1. Place the pieces
		for (let i = 0; i < shapeCells.length; i++) {
			const cell = shapeCells[i]
			const r = cell.r + rOffset
			const c = cell.c + cOffset

			const blockIdx = Math.floor(r / 3)
			const rowInBlock = r % 3
			const bitIndex = rowInBlock * 9 + c

			this.board[blockIdx] |= 1 << bitIndex
		}

		points += shapeCells.length

		// 2. Check Lines (Rows)
		// We need to check all 9 rows.
		let linesCleared = 0

		// Rows
		for (let r = 0; r < 9; r++) {
			const blockIdx = Math.floor(r / 3)
			const rowInBlock = r % 3
			// Extract 9 bits for this row
			const shift = rowInBlock * 9
			const rowBits = (this.board[blockIdx] >> shift) & 511

			if (rowBits === 511) {
				// Line clear!
				this.board[blockIdx] &= ~(511 << shift) // Clear bits
				linesCleared++
			}
		}

		// Columns
		for (let c = 0; c < 9; c++) {
			let full = true
			for (let r = 0; r < 9; r++) {
				const blockIdx = Math.floor(r / 3)
				const rowInBlock = r % 3
				const bitIndex = rowInBlock * 9 + c
				if ((this.board[blockIdx] & (1 << bitIndex)) === 0) {
					full = false
					break
				}
			}

			if (full) {
				// Clear column
				for (let r = 0; r < 9; r++) {
					const blockIdx = Math.floor(r / 3)
					const rowInBlock = r % 3
					const bitIndex = rowInBlock * 9 + c
					this.board[blockIdx] &= ~(1 << bitIndex)
				}
				linesCleared++
			}
		}

		// Boxes
		for (let tr = 0; tr < 3; tr++) {
			for (let tc = 0; tc < 3; tc++) {
				// Check 3x3 box
				// Optimized: A box is fully contained in ONE block int?
				// No, block 0 is rows 0-2 (top 3 rows), so yes!
				// A box [tr, tc] corresponds to:
				//   Rows: tr*3 to tr*3+2
				//   Cols: tc*3 to tc*3+2
				const blockIdx = tr // 0, 1, 2

				// Bits needed:
				// Row 0: cols tc*3..+2
				// Row 1: cols ..
				// Row 2: cols ..

				let full = true
				const startC = tc * 3

				// We can construct a mask for the box
				// bit pattern: 111 at c, 111 at c+9, 111 at c+18
				const rowMask = 7 << startC // 7 is 111
				const boxMask = rowMask | (rowMask << 9) | (rowMask << 18)

				if ((this.board[blockIdx] & boxMask) === boxMask) {
					this.board[blockIdx] &= ~boxMask
					linesCleared++
				}
			}
		}

		this.score += points + (linesCleared > 0 ? 10 * linesCleared : 0) // Simplified score
		return linesCleared
	}
}
