import type { ReplayAction } from "../../src/engine/types.js"
import { VERSION } from "../../src/version.js"

export const LIMITS = {
	nameMinLen: 1,
	nameMaxLen: 20,
	scoreMin: 0,
	scoreMax: 10_000_000,
	maxReplayActions: 8000,
	maxReplayDurationMs: 30 * 60 * 1000,
	// Rate limits per IP
	submitPerMinute: 10, // 10 per 60 seconds
	verifyPerMinute: 2, // 2 per 60 seconds
	verifyPerHour: 10, // 10 per 3600 seconds
	leaderboardPerMinute: 60, // 60 per 60 seconds
	// Allowed game versions for replay verification
	allowedVersions: [VERSION, "0.1.0", "0.1.1"], // Current version + historical versions
} as const

export function validateName(name: unknown): { ok: true; name: string } | { ok: false; message: string } {
	if (typeof name !== "string") return { ok: false, message: "name must be a string" }
	const trimmed = name.trim()
	if (trimmed.length < LIMITS.nameMinLen || trimmed.length > LIMITS.nameMaxLen) {
		return { ok: false, message: `name must be ${LIMITS.nameMinLen}-${LIMITS.nameMaxLen} chars` }
	}
	// Allow simple ascii to avoid unicode trickery in display.
	if (!/^[a-zA-Z0-9 _\-]+$/.test(trimmed)) {
		return { ok: false, message: "name contains invalid characters" }
	}
	return { ok: true, name: trimmed }
}

export function validateScore(score: unknown): { ok: true; score: number } | { ok: false; message: string } {
	if (typeof score !== "number" || !Number.isFinite(score)) return { ok: false, message: "score must be a number" }
	const s = Math.floor(score)
	if (s !== score) return { ok: false, message: "score must be an integer" }
	if (s < LIMITS.scoreMin || s > LIMITS.scoreMax) return { ok: false, message: `score must be ${LIMITS.scoreMin}-${LIMITS.scoreMax}` }
	return { ok: true, score: s }
}

export type ReplayInput = { seed: number | string; actions: ReplayAction[]; version?: string; finalScore?: number }

export function validateReplay(replay: unknown): { ok: true; replay: ReplayInput } | { ok: false; message: string } {
	if (replay == null) return { ok: false, message: "replay is required" }
	if (typeof replay !== "object") return { ok: false, message: "replay must be an object" }
	const r = replay as any
	if (!Array.isArray(r.actions)) return { ok: false, message: "replay.actions must be an array" }
	if (r.actions.length > LIMITS.maxReplayActions) return { ok: false, message: "replay has too many actions" }
	if (typeof r.seed !== "number" && typeof r.seed !== "string") return { ok: false, message: "replay.seed must be a number or string" }

	// Validate version if provided
	if (r.version !== undefined) {
		if (typeof r.version !== "string") return { ok: false, message: "replay.version must be a string" }
		if (!LIMITS.allowedVersions.includes(r.version)) {
			return { ok: false, message: `replay.version must be one of: ${LIMITS.allowedVersions.join(", ")}` }
		}
	}

	return {
		ok: true,
		replay: {
			seed: r.seed as number | string,
			actions: r.actions as ReplayAction[],
			version: typeof r.version === "string" ? r.version : undefined,
			finalScore: typeof r.finalScore === "number" ? r.finalScore : undefined,
		},
	}
}
