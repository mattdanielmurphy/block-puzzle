export type Grid = number[] // Flattened 9x9 array. 0 = empty, >0 = filled color ID
export const GRID_SIZE = 9

export interface Point {
	r: number
	c: number
}

export interface Shape {
	id: string
	cells: Point[] // Relative to 0,0 (top-left of the shape)
	colorId: number
}

export interface GameState {
	grid: Grid
	score: number
	bestScore: number
	currentShapes: (Shape | null)[] // 3 slots, null if used
	shapesInQueue: Shape[] // Shapes for the next refill (optional, or just generate on demand)
	isGameOver: boolean
	seed: number
	moves: number
}

export interface MoveResult {
	valid: boolean
	clearedRows: number[]
	clearedCols: number[]
	clearedBoxes: number[]
	clearedCells: Point[]
	pointsAdded: number
	comboMultiplier: number
	moveMultiplier?: number
	gameOver: boolean
}

export interface SavedPowerupState {
	powerups: any[] // Powerup[]
	lastSpawnTime: number
	lastUpdateTime: number
}

export interface SavedEngineState {
	grid: Grid
	score: number
	currentShapes: (Shape | null)[]
	isGameOver: boolean
	seed: number
	moves: number
	handGeneration: number
	handDealtAt: number
	powerupManagerState: SavedPowerupState
	rngState: number
	lastMoveTime: number
}

export interface SavedAppState {
	engine: SavedEngineState
	isPaused: boolean
	pauseStartedAt: number | null
	handDeadline: number | null
	lastHandGeneration: number
	timerPanic: boolean
	timestamp: number // Time of save
	priorBestScore?: number
	highScoreNotificationShown?: boolean
	runId: string // Add runId to saved state
}
