export class RNG {
	private state: number

	constructor(seed: number | string) {
		if (typeof seed === "string") {
			this.state = RNG.hashString(seed)
		} else {
			this.state = seed
		}
	}

	// Simple string hash (cyrb53-like or FNV) to get a 32-bit integer
	private static hashString(str: string): number {
		let h = 0x811c9dc5
		for (let i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i)
			h = Math.imul(h, 0x01000193)
		}
		return h >>> 0
	}

	// Mulberry32: returns 0..0xFFFFFFFF
	nextU32(): number {
		this.state = (this.state + 0x6d2b79f5) | 0
		let t = this.state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return (t ^ (t >>> 14)) >>> 0
	}

	// Returns float [0, 1)
	nextFloat(): number {
		return this.nextU32() / 4294967296
	}

	// Alias for nextFloat to maintain compatibility if needed, or replace usages
	next(): number {
		return this.nextFloat()
	}

	// Min (inclusive) to Max (exclusive)
	range(min: number, max: number): number {
		return min + this.nextInt(max - min)
	}

	// Returns int [0, maxExclusive)
	nextInt(maxExclusive: number): number {
		return Math.floor(this.nextFloat() * maxExclusive)
	}

	shuffle<T>(array: T[]): T[] {
		for (let i = array.length - 1; i > 0; i--) {
			const j = this.nextInt(i + 1)
			;[array[i], array[j]] = [array[j], array[i]]
		}
		return array
	}

	getState(): number {
		return this.state
	}

	setState(state: number) {
		this.state = state
	}
}
