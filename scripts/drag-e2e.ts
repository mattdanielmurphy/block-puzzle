// Headless-Chrome drag check with real touch events: on a nearly full board, dragging a piece
// off every corner and edge earns no haptic; reaching the real hole snaps and the drop lands;
// and the top boost lifts the piece near the top of the board.
// Needs a test build served on :4790 (VITE_LIMIT_TEST exposes window.__app):
//   CAP=1 VITE_LIMIT_TEST="daily=86000,warn=10" bun x vite build --outDir tmp/drag-dist
//   bun x vite preview --outDir tmp/drag-dist --port 4790
// Then: bun scripts/drag-e2e.ts
const PORT = 9334
const proc = Bun.spawn(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.cwd()}/tmp/chrome-cdp-drag`, "--force-prefers-reduced-motion", "--window-size=430,900", "about:blank"], { stderr: "ignore", stdout: "ignore" })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let targets: any[] = []
for (let i = 0; i < 40; i++) { await sleep(500); try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break } catch {} }
const page = targets.find((t: any) => t.type === "page")
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map<number, (v: any) => void>()
ws.onmessage = (m) => { const d = JSON.parse(m.data as string); if (d.method === "Runtime.exceptionThrown") console.log("PAGE EXC", JSON.stringify(d.params.exceptionDetails).slice(0, 400)); if (d.id && pending.has(d.id)) { pending.get(d.id)!(d.result); pending.delete(d.id) } }
const send = (method: string, params: any = {}) => new Promise<any>((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr: string) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }); if (r?.exceptionDetails) console.log("EXC", r.exceptionDetails.exception?.description?.slice(0, 200)); return r?.result?.value }
const shot = async (name: string) => { const r = await send("Page.captureScreenshot"); await Bun.write(`tmp/drag-${name}.png`, Buffer.from(r.data, "base64")) }

await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 2, mobile: true })
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 })
const url = process.argv[2] || "http://localhost:4790/"
await send("Page.navigate", { url })
await sleep(1500)
await ev(`localStorage.clear(); localStorage.setItem('bp_tutorial_completed','true'); true`)
await send("Page.navigate", { url })
for (let i = 0; i < 60 && !(await ev("typeof __app !== 'undefined'")); i++) await sleep(500)
await sleep(800)

// Nearly full board: free 2×2 hole at rows/cols 4–5 and a lone free cell in each corner; slot 0 holds a 2×2.
await ev(`(() => { const a = __app, e = a.engine; e.grid.fill(1); for (const [r,c] of [[4,4],[4,5],[5,4],[5,5],[0,0],[0,8],[8,0],[8,8]]) e.grid[r*9+c] = 0
  e.currentShapes[0] = { id: 'sq2', colorId: 2, cells: [{r:0,c:0},{r:0,c:1},{r:1,c:0},{r:1,c:1}] }
  window.__hap = []; const f = a.dragFeel, m = f.move.bind(f); f.move = (...args) => { const out = m(...args); window.__hap.push(...out.map(h => h.kind)); return out }; return true })()`)
await sleep(300)
const L = await ev(`(() => { const c = document.querySelector('canvas').getBoundingClientRect(), l = __app.renderer.layout; return { ox: c.left, oy: c.top, b: l.boardRect, tray: l.trayRect.shapecenters[0], sens: __app.input.sensitivity } })()`)
const pitch = L.b.cellSize + 2 // approx; only used to aim
const touch = (type: string, x: number, y: number) => send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: L.ox + x, y: L.oy + y }] })
/** Finger position that puts the piece centre at (px, py), ignoring the top boost (good enough to aim). */
const start = { x: L.tray.x, y: L.tray.y }
const fingerFor = (px: number, py: number) => ({ x: start.x + (px - start.x) / L.sens, y: start.y + (py - start.y) / L.sens })
const cellCentre = (r: number, c: number) => ({ x: L.b.x + (c + 1) * pitch - 1, y: L.b.y + (r + 1) * pitch - 1 }) // centre of a 2×2 at (r,c)

async function dragTo(targets: { x: number; y: number }[], drop: boolean) {
	await ev(`window.__hap = []; true`)
	await touch("touchStart", start.x, start.y)
	let cur = start
	for (const t of targets) {
		const f = fingerFor(t.x, t.y)
		for (let i = 1; i <= 14; i++) { await touch("touchMove", cur.x + ((f.x - cur.x) * i) / 14, cur.y + ((f.y - cur.y) * i) / 14); await sleep(6) }
		cur = f
	}
	const hap = await ev(`window.__hap.slice()`)
	const pos = await ev(`JSON.stringify({ dragPos: __app.dragPos, ghost: __app.ghostPos })`)
	if (!drop) await touch("touchMove", start.x, start.y) // back to the tray = cancel
	await touch("touchEnd", 0, 0)
	await sleep(250)
	return { hap, pos }
}

const off = 1.1 * pitch
// Paths keep clear of the real hole (a snap there is correct, not a false haptic).
const corners: Record<string, { x: number; y: number }[]> = {
	"top-left": [cellCentre(1, 1), { x: L.b.x - off * 0.2, y: L.b.y - off * 0.2 }],
	"top-right": [cellCentre(7, 1), cellCentre(7, 7), cellCentre(1, 7), { x: L.b.x + L.b.w + off * 0.2, y: L.b.y - off * 0.2 }],
	"bottom-left": [cellCentre(6, 1), { x: L.b.x - off * 0.2, y: L.b.y + L.b.h + off * 0.2 }],
	"bottom-right": [cellCentre(7, 1), cellCentre(7, 7), { x: L.b.x + L.b.w + off * 0.2, y: L.b.y + L.b.h + off * 0.2 }],
	"top edge": [cellCentre(1, 1), { x: cellCentre(1, 1).x, y: L.b.y - off * 0.2 }],
	"left edge": [cellCentre(1, 1), { x: L.b.x - off * 0.2, y: cellCentre(1, 1).y }],
	"right edge": [cellCentre(7, 1), cellCentre(7, 7), cellCentre(1, 7), { x: L.b.x + L.b.w + off * 0.2, y: cellCentre(1, 7).y }],
}
let ok = true
for (const [name, path] of Object.entries(corners)) {
	const r = await dragTo(path, false)
	const pass = r.hap.length === 0
	ok &&= pass
	console.log(`${pass ? "PASS" : "FAIL"} ${name}: haptics ${JSON.stringify(r.hap)} ${r.pos}`)
}
const filledBefore = await ev(`__app.engine.grid.filter(v => v).length`)
await sleep(100)
const hole = await dragTo([cellCentre(6, 1), cellCentre(4, 4)], true)
await shot("hole")
const filledAfter = await ev(`__app.engine.grid.filter(v => v).length`)
const holePass = hole.hap.includes("snap") && filledAfter !== filledBefore
ok &&= holePass
console.log(`${holePass ? "PASS" : "FAIL"} hole: haptics ${JSON.stringify(hole.hap)} placed=${filledAfter !== filledBefore}`)

// Top boost: same finger travel, piece ends higher than plain sensitivity would put it.
await ev(`(() => { const e = __app.engine; e.grid.fill(0); e.currentShapes[0] = { id: 'sq2', colorId: 2, cells: [{r:0,c:0},{r:0,c:1},{r:1,c:0},{r:1,c:1}] }; return true })()`)
await sleep(200)
const L2 = await ev(`(() => { const t = __app.renderer.layout.trayRect.shapecenters[0]; return { x: t.x, y: t.y } })()`)
const fy = L.b.y + pitch // finger ~1 row below board top
await touch("touchStart", L2.x, L2.y)
for (let i = 1; i <= 20; i++) { await touch("touchMove", L2.x, L2.y + ((fy - L2.y) * i) / 20); await sleep(6) }
const d = await ev(`JSON.stringify({ y: __app.dragPos.y, ds: __app.input.dragState })`)
await shot("topboost")
await touch("touchMove", L2.x, L2.y)
await touch("touchEnd", 0, 0)
const dp = JSON.parse(d)
const baseY = dp.ds.startY + dp.ds.touchOffsetY + (dp.ds.currentY - dp.ds.startY) * L.sens
console.log(`top boost: piece at y=${dp.y.toFixed(1)}, without boost y=${baseY.toFixed(1)}, lift ${(baseY - dp.y).toFixed(1)} px (${((baseY - dp.y) / pitch).toFixed(2)} cells)`)
console.log(ok ? "ALL PASS" : "SOME FAILED")
ws.close(); proc.kill()
