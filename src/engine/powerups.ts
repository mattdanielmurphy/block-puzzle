import { GRID_SIZE, Grid, Point, SavedPowerupState } from "./types"

import { RNG } from "./rng"

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

	// Time-based spawning constants
	private readonly COOLDOWN_DURATION = 20000 // 20 seconds to restore full probability
	private readonly BASE_SPAWN_RATE = 0.1 // 10% chance per second after cooldown

	private lastSpawnTime: number = 0
	private lastUpdateTime: number = 0

	constructor(rng: RNG) {
		this.rng = rng
	}

	update(currentTime: number, grid: Grid): void {
		// Initialize lastUpdateTime if strictly 0 (first frame)
		if (this.lastUpdateTime === 0) {
			this.lastUpdateTime = currentTime
		}

		const dt = currentTime - this.lastUpdateTime
		this.lastUpdateTime = currentTime

		// 1. Remove expired powerups
		this.powerups = this.powerups.filter((p) => {
			const age = currentTime - p.spawnTime
			return age < p.lifetime
		})

		// 2. Try to spawn new powerup based on time
		this.checkSpawn(currentTime, dt, grid)
	}

	private checkSpawn(currentTime: number, dt: number, grid: Grid) {
		// Calculate time since last spawn
		// If lastSpawnTime is 0, we treat it as "long ago" so full probability applies
		const timeSinceLast = this.lastSpawnTime === 0 ? this.COOLDOWN_DURATION : currentTime - this.lastSpawnTime

		// Logic:
		// "when a bomb is spawned, for the next 20s or so, the probability ... should be extremely low
		// and grow as more time passes until it's restored"

		// 0 to 1 progress factor over 20s
		const progress = Math.min(1, Math.max(0, timeSinceLast / this.COOLDOWN_DURATION))

		// Use a curve that stays low then grows (convex). Squared or Cubed.
		const probabilityFactor = progress * progress * progress

		// Calculate probability for this frame
		// Rate is "events per second". Prob ~ Rate * (dt / 1000)
		const currentRatePerSecond = this.BASE_SPAWN_RATE * probabilityFactor
		const spawnChance = currentRatePerSecond * (dt / 1000)

		if (this.rng.next() < spawnChance) {
			this.spawnPowerup(currentTime, grid)
		}
	}

	// Explicitly spawn a powerup right now (useful for testing or tutorials)
	spawnImmediate(currentTime: number, grid: Grid): void {
		this.spawnPowerup(currentTime, grid)
	}

	// Called after a successful block placement.
	// DEPRECATED regarding spawning logic, but kept for interface compatibility if needed.
	// We no longer spawn here directly.
	onPlacement(currentTime: number, grid: Grid): void {
		// No-op for spawning.
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

		// Record the spawn time to fully reset the probability cooldown
		this.lastSpawnTime = currentTime
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

	// Persistence
	serialize(): SavedPowerupState {
		return {
			powerups: [...this.powerups],
			lastSpawnTime: this.lastSpawnTime,
			lastUpdateTime: this.lastUpdateTime,
		}
	}

	deserialize(state: SavedPowerupState) {
		this.powerups = state.powerups
		this.lastSpawnTime = state.lastSpawnTime
		this.lastUpdateTime = state.lastUpdateTime
	}

	shiftTime(deltaMs: number) {
		if (this.lastSpawnTime > 0) this.lastSpawnTime += deltaMs
		if (this.lastUpdateTime > 0) this.lastUpdateTime += deltaMs
		this.powerups.forEach((p) => {
			p.spawnTime += deltaMs
		})
	}

	reset() {
		this.powerups = []
	}
}
