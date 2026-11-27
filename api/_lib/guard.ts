// Leaderboard guards: one-time schema setup, name ownership and used-run tracking.
import type { VercelRequest } from "@vercel/node"
import type { PoolClient } from "pg"
import { dbName, pool } from "./db"
import { sha256 } from "./crypto"

let schemaReady: Promise<void> | null = null
/** Adds the columns/tables the guards need (idempotent, once per server instance). */
export function ensureSchema(): Promise<void> {
	// Under a least-privilege login (see db/least-privilege.sql) these already exist and the DDL is
	// refused with insufficient_privilege (42501); that's fine.
	const ddl = (sql: string) => pool.query(sql).catch((e) => { if (e?.code !== "42501") throw e })
	schemaReady ??= (async () => {
		await ddl(`ALTER TABLE ${dbName("players")} ADD COLUMN IF NOT EXISTS owner_hash text`)
		await ddl(`CREATE TABLE IF NOT EXISTS ${dbName("used_runs")} (run_id text PRIMARY KEY, used_at timestamptz NOT NULL DEFAULT now())`)
		await ddl(`CREATE TABLE IF NOT EXISTS ${dbName("rate_limits")} (bucket text NOT NULL, key text NOT NULL, window_start bigint NOT NULL, count int NOT NULL DEFAULT 0, PRIMARY KEY (bucket, key, window_start))`)
	})().catch((e) => {
		schemaReady = null
		throw e
	})
	return schemaReady
}

/** The device key a client sends to prove it owns its name: random, 32–128 url-safe chars. */
export function parseDeviceKey(v: unknown): string | null {
	return typeof v === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(v) ? v : null
}

export type Ownership = { ok: true } | { ok: false; code: "NAME_TAKEN"; message: string }
export const NAME_TAKEN: Ownership = { ok: false, code: "NAME_TAKEN", message: "That name belongs to another player. Pick a different one." }

/**
 * Checks (and on first use, claims) a player's name for this device. A name nobody has claimed
 * yet goes to the first device that sends a key; after that only that device may use it.
 * Clients that send no key (old builds) can still use unclaimed names but can't claim them.
 */
export async function checkOwner(db: PoolClient | typeof pool, playerId: string, deviceKey: string | null): Promise<Ownership> {
	const row = (await db.query(`SELECT owner_hash FROM ${dbName("players")} WHERE id = $1`, [playerId])).rows[0]
	const owner: string | null = row?.owner_hash ?? null
	if (!deviceKey) return owner ? NAME_TAKEN : { ok: true }
	const hash = await sha256("blockdoku-owner:" + deviceKey)
	if (owner === hash) return { ok: true }
	if (owner) return NAME_TAKEN
	// Claim it, unless another device claimed it a moment ago.
	const claimed = await db.query(`UPDATE ${dbName("players")} SET owner_hash = $1 WHERE id = $2 AND owner_hash IS NULL`, [hash, playerId])
	return claimed.rowCount === 1 ? { ok: true } : NAME_TAKEN
}

/** Marks a run as submitted; false if it was already used (replayed token). */
export async function useRun(db: PoolClient, runId: string): Promise<boolean> {
	const r = await db.query(`INSERT INTO ${dbName("used_runs")} (run_id) VALUES ($1) ON CONFLICT DO NOTHING`, [runId])
	return r.rowCount === 1
}

/** The connection's real IP for rate limiting (ignores the client-reported header, which anyone can set). */
export function connectionIp(req: VercelRequest): string {
	const f = req.headers["x-forwarded-for"]
	const first = (Array.isArray(f) ? f[0] : f)?.split(",")[0].trim()
	return first || req.socket?.remoteAddress || "UNKNOWN"
}
