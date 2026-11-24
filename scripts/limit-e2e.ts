// Drives headless Chrome through the "never interrupt mid-game" play-limit scenario.
// Needs a test build served on :4789: CAP=1 VITE_LIMIT_TEST="daily=6,warn=2,cutIn=7200,cutFor=60" bun x vite build && bun x vite preview --port 4789
// Then: CLAUDE_NO_FOCUS=1 bun scripts/limit-e2e.ts
const PORT = 9333
const proc = Bun.spawn(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.cwd()}/tmp/chrome-cdp`, "--force-prefers-reduced-motion", "--window-size=500,900", "about:blank"], { stderr: "ignore", stdout: "ignore" })
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
const shot = async (name: string) => { const r = await send("Page.captureScreenshot"); await Bun.write(`tmp/cdp-${name}.png`, Buffer.from(r.data, "base64")) }
const state = () => ev(`JSON.stringify({overlay: !document.getElementById('limit-overlay').classList.contains('hidden'), toast: document.getElementById('limit-toast').classList.contains('hidden') ? '' : document.getElementById('limit-toast').textContent, over: __app.engine.isGameOver, placed: __app.firstBlockPlaced, paused: __app.isPaused})`)
await send("Runtime.enable")
const url = process.argv[2] || "http://localhost:4789/"
await send("Page.navigate", { url })
await sleep(1500)
await ev(`localStorage.setItem('bp_tutorial_completed','true'); localStorage.setItem('bp_chill_mode','true'); true`)
await send("Page.navigate", { url })
for (let i = 0; i < 60 && !(await ev("typeof __app !== 'undefined'")); i++) await sleep(500)
// It's past midnight for real: shift the test cutoff off by skipping the night lock check only via a fresh state
console.log("ready:", await ev("document.readyState + ' ' + [...document.scripts].map(s=>s.src).join(',') + ' overlay:' + !!document.getElementById('limit-overlay') + ' sw:' + !!navigator.serviceWorker?.controller + ' keys:' + Object.keys(window).filter(k=>k.startsWith('__')).join('|')")); await shot("0-start")
console.log("start:", await state())
const placed = await ev(`(() => { const a = __app; for (let i = 0; i < 3; i++) for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) { if (a.firstBlockPlaced) return true; const s = a.engine.currentShapes[i]; if (!s) continue; a.dragShape = s; a.dragPos = null; a.onDragEnd(r, c) } return a.firstBlockPlaced })()`)
console.log("placed a block:", placed, await state())
await sleep(9000)
console.log("after limit, mid-game:", await state()); await shot("1-midgame")
await ev(`__app.endGame(); true`)
await sleep(2500)
console.log("game over screen:", await state()); await shot("2-gameover")
await ev(`__app.restart(); true`)
await sleep(2000)
console.log("after restart:", await state()); await shot("3-restart")
ws.close(); proc.kill()
