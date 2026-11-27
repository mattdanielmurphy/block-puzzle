// Live check of the leaderboard guards against a running API (default: local `vercel dev` on the dev_ tables).
//   bun scripts/leaderboard-guard-e2e.ts [baseUrl]
const BASE = process.argv[2] || "http://localhost:4801"
const name = "zzGuard" + Math.floor(Math.random() * 1e6)
const keyA = "A".repeat(40) + Math.random().toString(36).slice(2, 12)
const keyB = "B".repeat(40) + Math.random().toString(36).slice(2, 12)
let ok = true
const runId = () => "guardtest" + crypto.randomUUID().replace(/-/g, "")
async function token(id: string) {
	const r = await fetch(`${BASE}/api/run/start?runId=${id}`, { headers: { Connection: "close" } })
	return (await r.json()).runToken as string
}
async function post(path: string, body: any) {
	const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", Connection: "close" }, keepalive: false, body: JSON.stringify(body) })
	return { status: r.status, body: await r.json().catch(() => null) }
}
function expect(label: string, got: { status: number; body: any }, status: number, code?: string) {
	const pass = got.status === status && (!code || got.body?.error === code || got.body?.status === code)
	ok &&= pass
	console.log(`${pass ? "PASS" : "FAIL"} ${label}: ${got.status} ${got.body?.error ?? got.body?.status ?? ""} ${got.body?.message ?? ""}`)
}

expect("owner A claims the name", await post("/api/players/sync", { name, deviceKey: keyA }), 200, "SYNCED")
const r1 = runId()
expect("owner A posts a fair score", await post("/api/leaderboard/submit", { runId: r1, runToken: await token(r1), name, score: 120, mode: "normal", deviceKey: keyA }), 200, "ACCEPTED")
const r2 = runId()
expect("device B posting A's name is refused", await post("/api/leaderboard/submit", { runId: r2, runToken: await token(r2), name, score: 150, mode: "normal", deviceKey: keyB }), 403, "NAME_TAKEN")
expect("device B syncing A's name is refused", await post("/api/players/sync", { name, deviceKey: keyB }), 403, "NAME_TAKEN")
const r3 = runId()
expect("no key on an owned name is refused", await post("/api/leaderboard/submit", { runId: r3, runToken: await token(r3), name, score: 150, mode: "normal" }), 403, "NAME_TAKEN")
const r4 = runId()
expect("no run token is refused", await post("/api/leaderboard/submit", { runId: r4, name: name + "x", score: 50, mode: "normal", deviceKey: keyB }), 403, "RUN_NOT_VERIFIED")
expect("forged run token is refused", await post("/api/leaderboard/submit", { runId: r4, runToken: "eyJ4IjoxfQ==.deadbeef", name: name + "x", score: 50, mode: "normal", deviceKey: keyB }), 403, "RUN_NOT_VERIFIED")
const r5 = runId()
expect("impossible score (1,000,000) is refused", await post("/api/leaderboard/submit", { runId: r5, runToken: await token(r5), name, score: 1_000_000, mode: "normal", deviceKey: keyA }), 422, "SCORE_REJECTED")
const r6 = runId()
expect("too fast (5,000 points seconds after start) is refused", await post("/api/leaderboard/submit", { runId: r6, runToken: await token(r6), name, score: 5000, mode: "normal", deviceKey: keyA }), 422, "SCORE_REJECTED")
expect("replaying A's run under another name is refused", await post("/api/leaderboard/submit", { runId: r1, runToken: await token(r1), name: name + "y", score: 130, mode: "normal", deviceKey: keyB }), 409, "ALREADY_SUBMITTED")
const env = await fetch(`${BASE}/api/env`)
ok &&= env.status === 404
console.log(`${env.status === 404 ? "PASS" : "FAIL"} /api/env: ${env.status}`)
// Rate limit: hammer submit until refused.
let limited = 0
for (let i = 0; i < 14; i++) if ((await post("/api/leaderboard/submit", { runId: "x", name, score: 1 })).status === 429) limited++
ok &&= limited > 0
console.log(`${limited > 0 ? "PASS" : "FAIL"} submit rate limit: ${limited} of 14 rapid posts got 429`)
console.log(`test name: ${name}`)
console.log(ok ? "ALL PASS" : "SOME FAILED")
