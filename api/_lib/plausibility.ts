// Server-side sanity check for a submitted score, anchored to when the server issued the
// run's token (the client can't fake that time). Real play scores a few points a second
// (best real run so far: ~3,400 points over many minutes), so these bounds are generous.
export const PLAUSIBILITY = {
	maxScore: 100_000, // hard ceiling, ~30× the best real score
	pointsPerSecond: 25, // ~5× a fast real pace
	headStart: 300, // a quick lucky opening
}

export function checkScorePlausible(score: number, issuedAtMs: number, nowMs: number): { ok: true } | { ok: false; message: string } {
	if (score > PLAUSIBILITY.maxScore) return { ok: false, message: "Score is too high to be real." }
	const elapsedSec = Math.max(0, (nowMs - issuedAtMs) / 1000)
	const allowed = PLAUSIBILITY.headStart + elapsedSec * PLAUSIBILITY.pointsPerSecond
	if (score > allowed) return { ok: false, message: "Score came in faster than the game can be played." }
	return { ok: true }
}
