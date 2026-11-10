// Screenshot mode: a scripted tour of every game state, so layouts can be captured on Mac and
// iPhone without anyone touching the game. Only active in builds made with VITE_SHOTS=1
// (or the dev server with ?shots=1). Never in TestFlight builds.
import { GRID_SIZE, Shape } from "./engine/types"

export const SHOTS = import.meta.env.VITE_SHOTS === "1" || (import.meta.env.DEV && new URLSearchParams(location.search).has("shots"))

const shape = (id: string, colorId: number, cells: [number, number][]): Shape => ({ id, colorId, cells: cells.map(([r, c]) => ({ r, c })) })

export function runDemo(app: any) {
	// Leave the player's real save, best score and settings exactly as they were.
	const saved: Record<string, string> = {}
	for (let k = 0; k < localStorage.length; k++) {
		const key = localStorage.key(k)!
		saved[key] = localStorage.getItem(key)!
	}
	const restoreStorage = () => {
		localStorage.clear()
		for (const [k, v] of Object.entries(saved)) localStorage.setItem(k, v)
	}
	window.addEventListener("pagehide", restoreStorage)
	const step = Number(import.meta.env.VITE_SHOTS_STEP || 6) * 1000
	const say = (s: string) => console.log(`[shots] ${s} @${Date.now()}`)
	const e = app.engine
	const fill = (cells: [number, number][], color = 3) => cells.forEach(([r, c]) => (e.grid[r * GRID_SIZE + c] = color))
	const clearGrid = () => {
		for (let i = 0; i < e.grid.length; i++) e.grid[i] = 0
	}
	const hand = () => {
		e.currentShapes = [shape("I3", 2, [[0, 0], [0, 1], [0, 2]]), shape("L", 6, [[0, 0], [1, 0], [2, 0], [2, 1]]), shape("I5", 12, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]])]
	}
	const place = (index: number, r: number, c: number) => {
		app.dragShape = e.currentShapes[index]
		app.dragPos = null
		app.onDragEnd(r, c)
	}

	const steps: [string, () => void][] = [
		[
			"playing",
			() => {
				app.restart?.()
				clearGrid()
				// A mid-game board: some scattered pieces, row 4 nearly full.
				fill([[0, 0], [0, 1], [1, 0], [2, 6], [2, 7], [3, 3], [3, 4], [5, 1], [6, 1], [7, 1], [7, 2], [8, 5], [8, 6], [8, 7], [6, 7]], 5)
				fill([[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5]], 9)
				e.score = 1240
				hand()
				app.updateUI()
			},
		],
		[
			"line-clear",
			() => {
				// First clear, then a second one: a 2-streak with the glow and badge showing.
				place(0, 4, 6)
				setTimeout(() => {
					// Second clear: the I5 piece finishes column 8.
					fill([[5, 8], [6, 8], [7, 8], [8, 8]], 9)
					place(2, 0, 8)
				}, 900)
			},
		],
		["pause", () => app.pauseModal.show()],
		[
			"settings",
			() => {
				app.pauseModal.hide()
				app.settingsModal.show()
			},
		],
		[
			"game-over",
			() => {
				app.settingsModal.hide()
				for (let i = 0; i < e.grid.length; i++) e.grid[i] = i % 4 === 0 ? 0 : 3 + (i % 5)
				e.score = 4180
				app.endGame()
			},
		],
		[
			"done",
			() => {
				app.restart()
				restoreStorage()
				app.loadHighScore()
				app.updateBestScoreDisplay()
			},
		],
	]

	let i = 0
	const next = () => {
		const [name, fn] = steps[i++]
		try {
			fn()
		} catch (err) {
			console.error("[shots] step failed", name, err)
		}
		say(name)
		;(window as any).__shotsStep = name
		if (i < steps.length) setTimeout(next, step)
	}
	setTimeout(next, 2500)
}
