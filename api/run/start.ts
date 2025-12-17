import type { VercelRequest, VercelResponse } from "@vercel/node"
import * as crypto from "crypto"
import * as http from "../_lib/http.js"
import { supabase } from "../_lib/supabase.js"
import * as runTokenModule from "../_lib/runToken.js"

// Database schema assumed for this endpoint:
//
// CREATE TABLE runs (
//   id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
//   run_id TEXT UNIQUE NOT NULL,
//   seed INTEGER NOT NULL,
//   exp BIGINT NOT NULL,
//   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//   used BOOLEAN NOT NULL DEFAULT FALSE
// );

// Polyfill randomUUID for environments where it may not exist (e.g. older Node versions)
const randomUUID = typeof crypto.randomUUID === "function" ? crypto.randomUUID : () => crypto.randomBytes(16).toString("hex")

type StartRunResponse = {
	ok: true
	runId: string
	seed: number
	exp: number
	runToken: string
}

export async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		if (req.method !== "POST") return http.errorJson(res, 405, "METHOD_NOT_ALLOWED", "Use POST")

		let secret = process.env.RUN_TOKEN_SECRET
		if (!secret) {
			if (process.env.NODE_ENV === "production") {
				return http.errorJson(res, 500, "SERVER_MISCONFIG", "Missing RUN_TOKEN_SECRET")
			}
			// Fallback secret for local development/testing. DO NOT USE IN PRODUCTION.
			secret = "dev-fallback-secret-for-local-runs-only-do-not-use-in-prod"
		}

		const runId = randomUUID()
		const seed = crypto.randomBytes(4).readUInt32BE(0)
		const exp = Date.now() + 30 * 60 * 1000

		const runTokenStr = runTokenModule.signRunToken(secret, { runId, seed, exp })

		// Persist the run record (used only to enforce that /run/start happened)
		if (supabase) {
			const { error } = await supabase.from("runs").insert({
				run_id: runId,
				seed,
				exp,
			})
			if (error) {
				console.error("--- ERROR IN /api/run/start ---")
				console.error("Could not insert run record:", error)
				// Don't fail the request, but log the error.
			}
		}

		const body: StartRunResponse = { ok: true, runId, seed, exp, runToken: runTokenStr }
		return http.json(res, 200, body)
	} catch (e: any) {
		console.error("--- UNCAUGHT ERROR IN /api/run/start ---")
		console.error(e)
		console.error("------------------------------------------")
		const message = e && e.message ? e.message : "An unknown error occurred"
		return http.errorJson(res, 500, "UNCAUGHT_EXCEPTION", message, { stack: e && e.stack ? e.stack : null })
	}
}

export default handler
