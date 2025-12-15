import { GRID_SIZE, Grid, Point } from "./types.js"

import { RNG } from "./rng.js"

export enum PowerupType {
	BOMB_SMALL = "bomb_small", // 3x3
	BOMB_MED = "bomb_med", // 4x4
	BOMB_LARGE = "bomb_large", // 5x5
	BOMB_MEGA = "bomb_mega", // 6x6
}

type PowerupSpec = {
	type: PowerupType
	size: number // side length of cleared square
	weight: number // relative spawn weight
	lifetime: number // how long it stays before fading out
}

const POWERUP_SPECS: PowerupSpec[] = [
	{ type: PowerupType.BOMB_SMALL, size: 3, weight: 10, lifetime: 7000 },
	{ type: PowerupType.BOMB_MED, size: 4, weight: 5, lifetime: 6000 },
	{ type: PowerupType.BOMB_LARGE, size: 5, weight: 2, lifetime: 4000 },
	{ type: PowerupType.BOMB_MEGA, size: 6, weight: 0.5, lifetime: 3500 }, // very rare & fast fade
]

export interface Powerup {
	type: PowerupType
	position: Point
	spawnTime: number
	lifetime: number // milliseconds until it disappears
}

export interface PowerupActivation {
	type: PowerupType
	position: Point
	affectedCells: Point[]
	pointsAwarded: number
}

export class PowerupManager {
	private powerups: Powerup[] = []
	private rng: RNG
	private readonly SPAWN_CHANCE_PER_PLACEMENT = 0.15 // 15% chance per placement

	constructor(rng: RNG) {
		this.rng = rng
	}

	update(currentTime: number, grid: Grid): void {
		// Remove expired powerups
		this.powerups = this.powerups.filter((p) => {
			const age = currentTime - p.spawnTime
			return age < p.lifetime
		})
	}

	// Explicitly spawn a powerup right now (useful for testing or tutorials)
	spawnImmediate(currentTime: number, grid: Grid): void {
		this.spawnPowerup(currentTime, grid)
	}

	// Called after a successful block placement. Rolls chance to spawn a powerup.
	onPlacement(currentTime: number, grid: Grid): void {
		if (this.rng.next() <= this.SPAWN_CHANCE_PER_PLACEMENT) {
			this.spawnPowerup(currentTime, grid)
		}
	}

	private spawnPowerup(currentTime: number, grid: Grid): void {
		// Find all empty cells
		const emptyCells: Point[] = []
		for (let r = 0; r < GRID_SIZE; r++) {
			for (let c = 0; c < GRID_SIZE; c++) {
				const idx = r * GRID_SIZE + c
				if (grid[idx] === 0) {
					emptyCells.push({ r, c })
				}
			}
		}

		// If no empty cells, don't spawn
		if (emptyCells.length === 0) return

		// Pick a random empty cell
		const randomIndex = Math.floor(this.rng.next() * emptyCells.length)
		const position = emptyCells[randomIndex]

		const chosen = this.pickSpec()

		const powerup: Powerup = {
			type: chosen.type,
			position,
			spawnTime: currentTime,
			lifetime: chosen.lifetime,
		}

		this.powerups.push(powerup)
	}

	private pickSpec(): PowerupSpec {
		const totalWeight = POWERUP_SPECS.reduce((sum, p) => sum + p.weight, 0)
		let roll = this.rng.next() * totalWeight
		let chosen = POWERUP_SPECS[0]
		for (const spec of POWERUP_SPECS) {
			if (roll < spec.weight) {
				chosen = spec
				break
			}
			roll -= spec.weight
		}
		return chosen
	}

	// Force spawn a specific type (debug/testing)
	spawnOfType(type: PowerupType, currentTime: number, grid: Grid): void {
		// Find a spec for the requested type
		const spec = POWERUP_SPECS.find((s) => s.type === type)
		if (!spec) return
		// Find all empty cells
		const emptyCells: Point[] = []
		for (let r = 0; r < GRID_SIZE; r++) {
			for (let c = 0; c < GRID_SIZE; c++) {
				const idx = r * GRID_SIZE + c
				if (grid[idx] === 0) {
					emptyCells.push({ r, c })
				}
			}
		}
		if (emptyCells.length === 0) return
		const randomIndex = Math.floor(this.rng.next() * emptyCells.length)
		const position = emptyCells[randomIndex]
		this.powerups.push({
			type: spec.type,
			position,
			spawnTime: currentTime,
			lifetime: spec.lifetime,
		})
	}

	// Check if a block placement collects a powerup
	checkCollection(placedCells: Point[]): Powerup | null {
		for (const powerup of this.powerups) {
			// Check if any placed cell matches the powerup position
			for (const cell of placedCells) {
				if (cell.r === powerup.position.r && cell.c === powerup.position.c) {
					// Remove the powerup from the list
					this.powerups = this.powerups.filter((p) => p !== powerup)
					return powerup
				}
			}
		}
		return null
	}

	// Activate a collected powerup
	activatePowerup(powerup: Powerup, grid: Grid): PowerupActivation {
		switch (powerup.type) {
			case PowerupType.BOMB_SMALL:
				return this.activateBomb(powerup.position, grid, 3, powerup.type)
			case PowerupType.BOMB_MED:
				return this.activateBomb(powerup.position, grid, 4, powerup.type)
			case PowerupType.BOMB_LARGE:
				return this.activateBomb(powerup.position, grid, 5, powerup.type)
			case PowerupType.BOMB_MEGA:
				return this.activateBomb(powerup.position, grid, 6, powerup.type)
			default:
				return {
					type: powerup.type,
					position: powerup.position,
					affectedCells: [],
					pointsAwarded: 0,
				}
		}
	}

	private activateBomb(position: Point, grid: Grid, size: number, powerupType: PowerupType): PowerupActivation {
		const affectedCells: Point[] = []
		// Clear a square of side length `size` centered on the bomb.
		const halfLower = Math.floor((size - 1) / 2) // rows/cols below/left
		const halfUpper = size - halfLower - 1 // rows/cols above/right

		for (let r = position.r - halfLower; r <= position.r + halfUpper; r++) {
			for (let c = position.c - halfLower; c <= position.c + halfUpper; c++) {
				if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
					const idx = r * GRID_SIZE + c
					if (grid[idx] !== 0) {
						affectedCells.push({ r, c })
					}
				}
			}
		}

		// Award points: 5 points per block cleared
		const pointsAwarded = affectedCells.length * 5

		return {
			type: powerupType,
			position,
			affectedCells,
			pointsAwarded,
		}
	}

	getPowerups(): Powerup[] {
		return [...this.powerups]
	}

	reset() {
		this.powerups = []
	}
}
