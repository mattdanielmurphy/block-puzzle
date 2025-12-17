export class RNG {
	private state: number

	constructor(seed: number) {
		this.state = seed
	}

	// Mulberry32
	next(): number {
		this.state = (this.state + 0x6d2b79f5) | 0
		let t = this.state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}

	// Min (inclusive) to Max (exclusive)
	range(min: number, max: number): number {
		return Math.floor(this.next() * (max - min)) + min
	}

	shuffle<T>(array: T[]): T[] {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(this.next() * (i + 1))
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
