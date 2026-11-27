// Headless-Chrome check of the play limits (2026-11-27): no night lock at 3 AM, a session lock
// that waits for the game in progress and lifts after the break, and a rolling daily lock that
// reopens when old play leaves the window. Saves screenshots of both lock screens, light and dark.
// Needs a test build served on :4789 (times in seconds):
//   CAP=1 VITE_LIMIT_TEST="daily=40,window=60,session=6,break=5,reopen=5,warn=2" bun x vite build --outDir tmp/limit-dist
//   bun x vite preview --outDir tmp/limit-dist --port 4789
// Then: bun scripts/limit-e2e.ts
const PORT = 9333
const proc = Bun.spawn(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.cwd()}/tmp/chrome-cdp`, "--force-prefers-reduced-motion", "--window-size=430,900", "about:blank"], { stderr: "ignore", stdout: "ignore" })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let targets: any[] = []
for (let i = 0; i < 40; i++) { await sleep(500); try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break } catch {} }
const page = targets.find((t: any) => t.type === "page")
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map<number, (v: any) => void>()
ws.onmessage = (m) => { const d = JSON.parse(m.data as string); if (d.method === "Runtime.exceptionThrown") console.log("PAGE EXC", JSON.stringify(d.params.exceptionDetails).slice(0, 600)); if (d.id && pending.has(d.id)) { pending.get(d.id)!(d.result); pending.delete(d.id) } }
const send = (method: string, params: any = {}) => new Promise<any>((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr: string) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }); if (r?.exceptionDetails) console.log("EXC", r.exceptionDetails.exception?.description?.slice(0, 200)); return r?.result?.value }
const shot = async (name: string) => { const r = await send("Page.captureScreenshot"); await Bun.write(`tmp/limit-${name}.png`, Buffer.from(r.data, "base64")) }
const state = async () => JSON.parse(await ev(`JSON.stringify({ hour: new Date().getHours(), locked: !document.getElementById('limit-overlay').classList.contains('hidden'), title: document.getElementById('limit-title').textContent, toast: document.getElementById('limit-toast').textContent, over: __app.engine.isGameOver, placed: __app.firstBlockPlaced })`))
let ok = true
const check = (name: string, pass: boolean, detail: any) => { ok &&= pass; console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(detail)}`) }
const shotsBothModes = async (name: string) => {
	for (const mode of ["light", "dark"]) {
		await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: mode }] })
		await sleep(300)
		await shot(`${name}-${mode}`)
	}
	await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] })
}

await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 2, mobile: true })
// Pretend it's 3 AM: pick the fixed-offset time zone where the local hour is 3 right now.
const utcH = new Date().getUTCHours()
let off = (3 - utcH + 24) % 24
if (off > 14) off -= 24
await send("Emulation.setTimezoneOverride", { timezoneId: off === 0 ? "Etc/GMT" : `Etc/GMT${off > 0 ? "-" : "+"}${Math.abs(off)}` })
const url = process.argv[2] || "http://localhost:4789/"
const fresh = async (extra = "") => {
	// Leave the page first: the running app saves its state on unload, which would undo the clear.
	await send("Page.navigate", { url: "about:blank" })
	await sleep(300)
	await send("Storage.clearDataForOrigin", { origin: new URL(url).origin, storageTypes: "all" })
	await send("Page.navigate", { url })
	await sleep(1200)
	await ev(`localStorage.clear(); localStorage.setItem('bp_tutorial_completed','true'); localStorage.setItem('bp_chill_mode','true'); ${extra}; true`)
	await send("Page.navigate", { url })
	for (let i = 0; i < 60 && !(await ev("typeof __app !== 'undefined'")); i++) await sleep(500)
	await sleep(800)
}
const placeBlock = () => ev(`(() => { const a = __app; for (let i = 0; i < 3; i++) for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) { if (a.firstBlockPlaced) return true; const s = a.engine.currentShapes[i]; if (!s) continue; a.dragShape = s; a.dragPos = null; a.onDragEnd(r, c) } return a.firstBlockPlaced })()`)

// 1. No night lock: it's 3 AM local and the game is open.
await fresh()
const s0 = await state()
check("no night lock at 3 AM", s0.hour === 3 && !s0.locked, s0)

// 2. Session limit (6 s) waits for the game in progress, then locks at the next game.
check("placed a block", await placeBlock(), "")
await ev(`document.getElementById('limit-toast').textContent = ''; true`)
await sleep(8500) // the toast shows ~4.7 s; its last text stays in the element
const s1 = await state()
check("session lock waits mid-game", !s1.locked && !s1.over && /Last game for now/.test(s1.toast), s1)
await ev(`__app.endGame(); true`)
await sleep(2000)
const s2 = await state()
check("game-over screen not interrupted", !s2.locked && s2.over, s2)
await ev(`document.getElementById('limit-toast').textContent = ''; __app.restart(); true`)
await sleep(1500)
const s3 = await state()
check("session lock lands at the next game", s3.locked && s3.title === "Take a breather", s3)
await shotsBothModes("session")
// 3. The break (5 s) ends the session and lifts the lock while the app is open.
await sleep(6000)
const s4 = await state()
check("session lock lifts after the break", !s4.locked, s4)

// 4. Rolling daily window (40 s in any 60 s): seed play spread over the last minute.
//    Session play is only the newest 10 s chunk (6 s+ breaks between), so only the daily limit is hit.
await fresh(`const n = Date.now(); localStorage.setItem('bp_limit_log', JSON.stringify([[n-58000,n-43000],[n-37000,n-22000],[n-16000,n-6000]]))`)
const s5 = await state()
check("daily lock on launch", s5.locked && s5.title === "That's plenty for today", s5)
await shotsBothModes("daily")
// 40 s played; reopen once 5 s have left the window: (n-58 s + 5 s) + 60 s = n + 7 s. Not a fixed-hour reset.
const reopenIn = await ev(`document.getElementById('limit-reopen-in').textContent`)
await sleep(9000)
const s6 = await state()
check("daily lock reopens when old play leaves the window", !s6.locked, { ...s6, reopenIn })

console.log(ok ? "ALL PASS" : "SOME FAILED")
ws.close(); proc.kill()
process.exit(ok ? 0 : 1)
