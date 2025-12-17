import { ReplayState } from "../../src/engine/replay"

export const LIMITS = {
	nameMinLength: 1,
	nameMaxLength: 20,
	scoreMinValue: 0,
	scoreMaxValue: 1_000_000_000,
	maxReplayActions: 2000,
	maxReplayDurationMs: 10 * 60 * 1000, // 10 minutes
	submitPerMinute: 10,
	verifyPerMinute: 2,
	verifyPerHour: 10,
	leaderboardPerMinute: 60,
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string }

export function validateName(name: unknown): ValidationResult<string> {
	if (typeof name !== "string") {
		return { ok: false, message: "Name must be a string." }
	}
	const trimmed = name.trim()
	if (trimmed.length < LIMITS.nameMinLength || trimmed.length > LIMITS.nameMaxLength) {
		return { ok: false, message: `Name must be between ${LIMITS.nameMinLength} and ${LIMITS.nameMaxLength} characters.` }
	}
	return { ok: true, value: trimmed }
}

export function validateScore(score: unknown): ValidationResult<number> {
	if (typeof score !== "number") {
		return { ok: false, message: "Score must be a number." }
	}
	if (!Number.isInteger(score) || score < LIMITS.scoreMinValue || score > LIMITS.scoreMaxValue) {
		return { ok: false, message: `Score must be an integer between ${LIMITS.scoreMinValue} and ${LIMITS.scoreMaxValue}.` }
	}
	return { ok: true, value: score }
}

export function validateReplay(replay: unknown): ValidationResult<ReplayState> {
	// Basic structural validation for replay object
	if (typeof replay !== "object" || replay === null) {
		return { ok: false, message: "Replay must be an object." }
	}
	const rs = replay as ReplayState

	if (typeof rs.seed !== "number" || !Number.isInteger(rs.seed)) {
		return { ok: false, message: "Replay seed must be an integer." }
	}
	if (!Array.isArray(rs.moves)) {
		return { ok: false, message: "Replay moves must be an array." }
	}
	// Further deep validation of actions can be done in runReplay to avoid
	// sending too much data over the network if it's already invalid.

	return { ok: true, value: rs }
}