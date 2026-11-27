import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity"

// Leaderboard names are public, so offensive ones are refused on submit and masked on display
// (App Review guideline 1.2: user-generated content needs filtering).
const profanity = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })
export function isOffensive(name: string): boolean {
	return profanity.hasMatch(name)
}
/** Name safe to show on a public board: offensive names (e.g. from before the filter) become "Player". */
export function displayName(name: string): string {
	return isOffensive(name) ? "Player" : name
}

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
	if (isOffensive(trimmed)) {
		return { ok: false, message: "Please pick a different name." }
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
