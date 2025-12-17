import { BlockClearEffect } from "./effects.js"
import { GameEngine } from "../engine/logic.js"
import { GameRenderer } from "./renderer.js"
import { ReplayAction } from "../engine/types.js"
import { ReplayState } from "../engine/replay.js"

export class ReplayPlayer {
	private replayState: ReplayState
	private currentMoveIndex: number = -1
	private engine: GameEngine
	private renderer: GameRenderer
	private isPlaying: boolean = false
	private playbackSpeed: number = 7
	private playbackTimer: number | null = null
	private readonly replayEpoch: number = 0

	constructor(replayState: ReplayState, renderer: GameRenderer) {
		this.replayState = replayState
		this.renderer = renderer

		// Create a new engine with the same seed to replay the game
		this.engine = new GameEngine(replayState.seed)
		this.initDeterministicClock()
	}

	private initDeterministicClock(): void {
		// Ensure replay math never depends on wall clock.
		this.engine.lastMoveTime = this.replayEpoch
		this.engine.lastUpdateTime = this.replayEpoch
		this.engine.handDealtAt = this.replayEpoch
	}

	private getNowForAction(action: ReplayAction): number {
		return this.replayEpoch + action.timestamp
	}

	getCurrentMoveIndex(): number {
		return this.currentMoveIndex
	}

	getTotalMoves(): number {
		return this.replayState.actions.length
	}

	getCurrentScore(): number {
		return this.engine.score
	}

	getEngine(): GameEngine {
		return this.engine
	}

	setSpeed(speed: number): void {
		this.playbackSpeed = speed
	}

	isCurrentlyPlaying(): boolean {
		return this.isPlaying
	}

	// Reset to beginning
	reset(): void {
		this.stop()
		this.currentMoveIndex = -1
		this.engine = new GameEngine(this.replayState.seed)
		this.initDeterministicClock()
	}

	// Go to first move
	goToFirst(): void {
		this.reset()
		this.nextMove()
	}

	// Go to last move
	goToLast(): void {
		this.reset()
		for (let i = 0; i < this.replayState.actions.length; i++) {
			this.nextMove()
		}
	}

	// Step to next move
	nextMove(): boolean {
		if (this.currentMoveIndex >= this.replayState.actions.length - 1) {
			this.stop()
			return false
		}

		this.currentMoveIndex++
		const action = this.replayState.actions[this.currentMoveIndex]
		this.applyAction(action)
		return true
	}

	// Step to previous move
	previousMove(): boolean {
		if (this.currentMoveIndex <= 0) {
			this.reset()
			return false
		}

		// Save the target index before resetting
		const targetIndex = this.currentMoveIndex - 1

		// Rebuild state from scratch up to the previous move
		this.engine = new GameEngine(this.replayState.seed)
		this.currentMoveIndex = -1

		for (let i = 0; i <= targetIndex; i++) {
			this.currentMoveIndex++
			const action = this.replayState.actions[this.currentMoveIndex]
			this.applyActionQuiet(action)
		}

		return true
	}

	// Apply a move with visual effects
	private applyAction(action: ReplayAction): void {
		if (action.type !== "place") return

		const { shapeIndex, r, c } = action.payload
		const now = this.getNowForAction(action)

		// Advance deterministic time-dependent systems (e.g., powerup expiry) before placing.
		this.engine.update(now)

		// Assuming valid because replay
		const result = this.engine.place(shapeIndex, r, c, { now })

		// Add visual effects for cleared cells
		if (result.valid && result.clearedCells && result.clearedCells.length > 0) {
			result.clearedCells.forEach((pt) => {
				this.renderer.addEffect(new BlockClearEffect(pt.r, pt.c))
			})
		}
	}

	// Apply a move without visual effects (for rebuilding state)
	private applyActionQuiet(action: ReplayAction): void {
		if (action.type !== "place") return

		const { shapeIndex, r, c } = action.payload
		const now = this.getNowForAction(action)
		this.engine.update(now)
		this.engine.place(shapeIndex, r, c, { now })
	}

	// Start automatic playback
	play(): void {
		if (this.isPlaying) return

		this.isPlaying = true
		this.scheduleNextMove()
	}

	// Stop automatic playback
	stop(): void {
		this.isPlaying = false
		if (this.playbackTimer !== null) {
			clearTimeout(this.playbackTimer)
			this.playbackTimer = null
		}
	}

	// Toggle play/pause
	togglePlayPause(): void {
		if (this.isPlaying) {
			this.stop()
		} else {
			this.play()
		}
	}

	private scheduleNextMove(): void {
		if (!this.isPlaying) return

		const delay = 1000 / this.playbackSpeed // Base delay

		this.playbackTimer = window.setTimeout(() => {
			const hasNext = this.nextMove()
			if (hasNext) {
				this.scheduleNextMove()
			} else {
				this.stop()
			}
		}, delay)
	}

	// Clean up
	destroy(): void {
		this.stop()
	}
}
