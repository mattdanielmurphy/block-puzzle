import { ReplayAction } from "./types.js"

export interface ReplayState {
	seed: number | string
	actions: ReplayAction[]
	finalScore: number
	version: string
}

export class ReplayManager {
	private actions: ReplayAction[] = []
	private seed: number | string
	private startTime: number

	constructor(seed: number | string) {
		this.seed = seed
		this.startTime = Date.now()
	}

	recordAction(action: Omit<ReplayAction, "timestamp">) {
		this.actions.push({
			...action,
			timestamp: Date.now() - this.startTime,
		})
	}

	getReplayState(finalScore: number, version: string): ReplayState {
		return {
			seed: this.seed,
			actions: [...this.actions],
			finalScore,
			version,
		}
	}

	getActions(): ReplayAction[] {
		return this.actions
	}

	clear(): void {
		this.actions = []
		this.startTime = Date.now()
	}

	getActionCount(): number {
		return this.actions.length
	}
}
