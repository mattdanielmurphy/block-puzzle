// Re-export specific classes if needed, but we'll focus on replacing the main entry point logic
import { Bot, BotWeights, DEFAULT_WEIGHTS, NAIVE_WEIGHTS } from "./bot"

import { GameEngine } from "../engine/logic"
import { GameRenderer } from "../ui/renderer"

// Single Simulation Instance (Headless-ish, but has renderer)
class SimInstance {
	id: number
	engine: GameEngine
	bot: Bot
	renderer: GameRenderer
	canvas: HTMLCanvasElement
	container: HTMLDivElement
	statsOverlay: HTMLDivElement
	isRunning: boolean = false
	moveDelay: number = 50
	generation: number = 1
	parentScore: number | null = null
	onMove?: () => void
	worker: Worker
	isThinking: boolean = false
	currentLoopId: number = 0
	lookaheadDepth: number = 2

	constructor(id: number, parent: HTMLElement, weights: BotWeights) {
		this.id = id

		this.container = document.createElement("div")
		this.container.style.position = "relative"
		this.container.style.width = "100%"
		this.container.style.height = "100%"
		this.container.style.aspectRatio = "1/1" // Ensure square aspect ratio
		this.container.style.border = "1px solid #333"
		parent.appendChild(this.container)

		this.canvas = document.createElement("canvas")
		this.canvas.style.width = "100%"
		this.canvas.style.height = "100%"
		this.container.appendChild(this.canvas)

		this.statsOverlay = document.createElement("div")
		this.statsOverlay.style.position = "absolute"
		this.statsOverlay.style.top = "5px"
		this.statsOverlay.style.left = "5px"
		this.statsOverlay.style.color = "white"
		this.statsOverlay.style.background = "rgba(0,0,0,0.5)"
		this.statsOverlay.style.padding = "2px 5px"
		this.statsOverlay.style.fontSize = "10px"
		this.statsOverlay.style.pointerEvents = "none"
		this.container.appendChild(this.statsOverlay)

		this.engine = new GameEngine(Date.now() + id * 1000)
		this.engine.chillMode = true // Enable bomb spawning based on moves
		this.renderer = new GameRenderer(this.canvas, false) // Disable auto-resize loop, we handle it manully via Simulator
		this.bot = new Bot(this.engine, weights)

		// Create Worker
		this.worker = new Worker(new URL("./bot-worker.ts", import.meta.url), { type: "module" })
		this.worker.onmessage = (e) => this.onWorkerMoveFound(e.data)

		this.updateStats()
		this.render()
		this.start()
	}

	private resolveMove?: (move: any) => void
	private async requestMoveFromWorker(): Promise<any> {
		return new Promise((resolve) => {
			this.resolveMove = resolve
			this.worker.postMessage({
				id: this.id,
				serializedEngine: this.engine.serialize(),
				weights: this.bot.weights,
				lookaheadDepth: this.lookaheadDepth,
			})
		})
	}

	private onWorkerMoveFound(data: any) {
		if (this.resolveMove) {
			this.resolveMove(data.bestMove)
			this.resolveMove = undefined
		}
	}

	setWeights(weights: BotWeights, generation: number, parentScore: number | null = null) {
		this.bot.weights = weights
		this.generation = generation
		this.parentScore = parentScore
		this.restart()
	}

	restart() {
		this.currentLoopId++ // Invalidate any previous loops
		this.engine = new GameEngine(Date.now() + this.id * 1234)
		this.engine.chillMode = true // Enable bomb spawning
		this.bot.engine = this.engine
		this.isRunning = true
		this.loop(this.currentLoopId)
	}

	async loop(loopId: number) {
		if (loopId !== this.currentLoopId) return // Old loop, die
		if (!this.isRunning) return

		if (this.engine.isGameOver) {
			this.isRunning = false
			this.container.style.opacity = "0.5"
			return
		}

		this.container.style.opacity = "1.0"
		this.isThinking = true
		const move = await this.requestMoveFromWorker()
		this.isThinking = false

		if (!this.isRunning) return // Check if we were stopped while thinking

		if (!move) {
			if (!this.engine.canPlaceAny()) {
				this.engine.isGameOver = true
			}
			this.render()
			requestAnimationFrame(() => this.loop(loopId))
			return
		}

		this.engine.place(move.shapeIndex, move.r, move.c)
		this.updateStats()
		this.render()
		if (this.onMove) this.onMove()

		setTimeout(() => {
			if (this.isRunning && loopId === this.currentLoopId) {
				requestAnimationFrame(() => this.loop(loopId))
			}
		}, this.moveDelay)
	}

	updateStats() {
		this.statsOverlay.innerHTML = `S:${this.engine.score}`
	}

	resize() {
		this.renderer.resize()
		this.render()
	}

	render() {
		const placeability = this.engine.currentShapes.map((s) => (s ? this.engine.canPlaceShape(s) : false))
		this.renderer.draw(this.engine, this.engine, null, null, null, placeability, null, Date.now(), null, false)
	}

	start() {
		if (this.isRunning) return // Already running
		this.isRunning = true
		this.loop(this.currentLoopId)
	}

	stop() {
		this.isRunning = false
	}
}

export class Simulator {
	instances: SimInstance[] = []
	container: HTMLElement
	infoPanel!: HTMLElement
	isRunning: boolean = false
	generation: number = 1
	history: {
		gen: number
		score: { avg: number; top: number; worst: number; median: number }
		moves: { avg: number; top: number; worst: number; median: number }
	}[] = []
	moveDelay: number = 50 // Default, but will be overwritten by load
	instanceCount: number = 12 // Default number of simultaneous games
	lookaheadDepth: number = 2
	autoEvolve: boolean = false
	totalMoves: number = 0
	movesLastSecond: number = 0
	perfStatsEl!: HTMLDivElement
	evolutionPending: boolean = false
	globalBest: { score: number; weights: BotWeights } | null = null

	chartCanvas!: HTMLCanvasElement

	constructor(canvas: HTMLCanvasElement) {
		// Hide the main app header if present (since we're in simulation mode)
		const header = document.querySelector("header")
		if (header) header.style.display = "none"

		// The main.ts passes a canvas, but we want a div mostly. We'll replace it.
		// We ignore the passed canvas/parent and just create a full screen overlay
		// This avoids layout issues with the main app structure
		this.container = document.createElement("div")
		this.container.style.position = "fixed"
		this.container.style.top = "0"
		this.container.style.left = "50%"
		this.container.style.transform = "translateX(-50%)"
		this.container.style.width = "95vw"
		this.container.style.maxWidth = "1000px" // Centered and constrained
		this.container.style.height = "100vh"
		this.container.style.display = "grid"
		document.body.appendChild(this.container)

		const savedState = this.loadFromStorage()

		// Update grid columns based on instance count
		const cols = Math.ceil(Math.sqrt(this.instanceCount))
		this.container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`

		window.addEventListener("resize", () => {
			this.instances.forEach((inst) => inst.resize())
		})

		// Create instances
		for (let i = 0; i < this.instanceCount; i++) {
			let weights: BotWeights | null = null
			let gen = 1
			let parentScore: number | null = null

			if (savedState) {
				this.generation = savedState.generation || 1
				// Handle migration of old history format
				this.history = (savedState.history || []).map((h: any) => {
					if (h.avgScore !== undefined && h.score === undefined) {
						return {
							gen: h.gen,
							score: { avg: h.avgScore, top: h.avgScore, worst: h.avgScore, median: h.avgScore },
							moves: { avg: h.avgMoves, top: h.avgMoves, worst: h.avgMoves, median: h.avgMoves },
						}
					}
					return h
				})
				if (savedState.instances && savedState.instances[i]) {
					weights = savedState.instances[i].weights
					gen = savedState.instances[i].generation
					parentScore = savedState.instances[i].parentScore
				}
			}

			if (!weights) {
				const startNaive = savedState?.startNaive || false
				weights = startNaive ? { ...NAIVE_WEIGHTS } : { ...DEFAULT_WEIGHTS }

				// Slight variance in weights to start
				if (i > 0) {
					// Randomize slightly so they aren't identical clones
					weights.pointsMultiplier += (Math.random() - 0.5) * 0.2
					weights.adjacencyBonus += (Math.random() - 0.5) * 0.5
					weights.holePenalty += (Math.random() - 0.5) * 5
					weights.boxCompletionBonus += (Math.random() - 0.5) * 0.5
				}
			}

			const inst = new SimInstance(i, this.container, weights)
			inst.moveDelay = this.moveDelay // Apply saved speed
			inst.lookaheadDepth = this.lookaheadDepth
			inst.generation = gen
			inst.parentScore = parentScore
			inst.onMove = () => {
				this.totalMoves++
				this.movesLastSecond++
				this.updateInfoPanel()

				// Auto-Evolve Check
				if (this.autoEvolve && this.isRunning && this.instances.every((i) => i.engine.isGameOver)) {
					// We need a slight delay or debouce to prevent double evolution
					// But since onMove is serial per main thread, just checking a flag is safer
					if (!this.evolutionPending) {
						this.evolutionPending = true
						setTimeout(() => {
							this.evolve()
							this.evolutionPending = false
						}, 1000)
					}
				}
			}
			this.instances.push(inst)
		}

		// Force a resize after DOM has settled to ensure uniform rendering
		requestAnimationFrame(() => {
			this.instances.forEach((inst) => inst.resize())
		})

		setInterval(() => {
			this.updatePerfStats()
			this.movesLastSecond = 0
		}, 1000)

		this.setupOverlay()
		this.updateInfoPanel()
		this.saveToStorage() // Save initial state
	}

	saveToStorage() {
		const state = {
			generation: this.generation,
			history: this.history,
			moveDelay: this.moveDelay,
			instanceCount: this.instanceCount,
			history: this.history,
			moveDelay: this.moveDelay,
			instanceCount: this.instanceCount,
			lookaheadDepth: this.lookaheadDepth,
			autoEvolve: this.autoEvolve,
			globalBest: this.globalBest,
			instances: this.instances.map((inst) => ({
				weights: inst.bot.weights,
				generation: inst.generation,
				parentScore: inst.parentScore,
			})),
		}
		localStorage.setItem("bp_simulation_state", JSON.stringify(state))
	}

	loadFromStorage() {
		const saved = localStorage.getItem("bp_simulation_state")
		if (!saved) return null
		try {
			const parsed = JSON.parse(saved)
			// Restore move delay if saved
			if (parsed.moveDelay !== undefined) {
				this.moveDelay = parsed.moveDelay
			}
			if (parsed.instanceCount !== undefined) {
				this.instanceCount = parsed.instanceCount
			}
			if (parsed.lookaheadDepth !== undefined) {
				this.lookaheadDepth = parsed.lookaheadDepth
			}
			if (parsed.autoEvolve !== undefined) {
				this.autoEvolve = parsed.autoEvolve
			}
			if (parsed.globalBest) {
				this.globalBest = parsed.globalBest
			}
			return parsed
		} catch (e) {
			console.error("Failed to parse saved simulation state", e)
			return null
		}
	}

	setupOverlay() {
		const controlPanel = document.createElement("div")
		controlPanel.style.position = "fixed"
		controlPanel.style.top = "20px"
		controlPanel.style.right = "20px"
		controlPanel.style.width = "180px"
		controlPanel.style.background = "rgba(0,0,0,0.85)"
		controlPanel.style.color = "white"
		controlPanel.style.padding = "15px"
		controlPanel.style.borderRadius = "8px"
		controlPanel.style.zIndex = "20000"
		controlPanel.style.display = "flex"
		controlPanel.style.flexDirection = "column"
		controlPanel.style.gap = "10px"

		const btn = document.createElement("button")
		btn.textContent = this.isRunning ? "Pause Simulation" : "Start Simulation"
		btn.style.padding = "8px"
		btn.style.cursor = "pointer"
		btn.onclick = () => this.toggleAll(btn)
		controlPanel.appendChild(btn)

		const evolveBtn = document.createElement("button")
		evolveBtn.textContent = "Force Breed/Evolve"
		evolveBtn.style.padding = "8px"
		evolveBtn.style.cursor = "pointer"
		evolveBtn.onclick = () => {
			this.evolve()
			this.isRunning = true
			btn.textContent = "Pause Simulation"
		}
		controlPanel.appendChild(evolveBtn)

		const resetBtn = document.createElement("button")
		resetBtn.textContent = "Reset All Progress"
		resetBtn.style.padding = "8px"
		resetBtn.style.cursor = "pointer"
		resetBtn.style.color = "#ff4444"
		resetBtn.style.border = "1px solid #ff4444"
		resetBtn.style.marginTop = "10px"
		resetBtn.onclick = () => {
			if (confirm("Reset to Hand-Tuned Defaults?")) {
				// Preserve settings
				const settings = {
					instanceCount: this.instanceCount,
					moveDelay: this.moveDelay,
					lookaheadDepth: this.lookaheadDepth,
					autoEvolve: this.autoEvolve,
					startNaive: false, // Default
				}
				localStorage.removeItem("bp_simulation_state")

				// Re-save just the settings
				localStorage.setItem("bp_simulation_state", JSON.stringify(settings))

				window.location.reload()
			}
		}
		controlPanel.appendChild(resetBtn)

		const resetNaiveBtn = document.createElement("button")
		resetNaiveBtn.textContent = "Reset (Naive Start)"
		resetNaiveBtn.style.padding = "8px"
		resetNaiveBtn.style.cursor = "pointer"
		resetNaiveBtn.style.color = "#ff8844"
		resetNaiveBtn.style.border = "1px solid #ff8844"
		resetNaiveBtn.style.marginTop = "5px"
		resetNaiveBtn.onclick = () => {
			if (confirm("Reset to Naive (Blank Slate) Bots? They will be very stupid at first.")) {
				const settings = {
					instanceCount: this.instanceCount,
					moveDelay: this.moveDelay,
					lookaheadDepth: this.lookaheadDepth,
					autoEvolve: this.autoEvolve,
					startNaive: true, // Naive Flag
				}
				localStorage.removeItem("bp_simulation_state")
				localStorage.setItem("bp_simulation_state", JSON.stringify(settings))
				window.location.reload()
			}
		}
		controlPanel.appendChild(resetNaiveBtn)

		// Speed Control
		const speedContainer = document.createElement("div")
		speedContainer.style.marginTop = "10px"
		speedContainer.style.borderTop = "1px solid #444"
		speedContainer.style.paddingTop = "10px"
		speedContainer.style.display = "flex"
		speedContainer.style.flexDirection = "column"
		speedContainer.style.gap = "5px"

		const speedLabel = document.createElement("div")
		speedLabel.style.display = "flex"
		speedLabel.style.justifyContent = "space-between"
		speedLabel.style.fontSize = "10px"
		speedLabel.style.color = "#aaa"

		const speedLabelText = document.createElement("span")
		speedLabelText.textContent = "Move Delay:"
		speedLabel.appendChild(speedLabelText)

		const speedValueDisplay = document.createElement("span")
		speedValueDisplay.textContent = "50ms"
		speedLabel.appendChild(speedValueDisplay)

		speedContainer.appendChild(speedLabel)

		const speedSlider = document.createElement("input")
		speedSlider.type = "range"
		speedSlider.min = "0"
		speedSlider.max = "2000"
		speedSlider.value = this.moveDelay.toString() // Set initial value from saved state
		speedSlider.style.width = "100%"
		speedSlider.style.cursor = "pointer"

		// Update label immediately
		speedValueDisplay.textContent = this.moveDelay + "ms"

		speedSlider.oninput = (e: any) => {
			const val = parseInt(e.target.value)
			speedValueDisplay.textContent = val + "ms"
			this.moveDelay = val
			this.instances.forEach((inst) => (inst.moveDelay = val))
			this.saveToStorage() // Save whenever slider changes
		}
		speedContainer.appendChild(speedSlider)

		speedContainer.appendChild(speedSlider)

		controlPanel.appendChild(speedContainer)

		// Instance Count Control
		const countContainer = document.createElement("div")
		countContainer.style.marginTop = "5px"
		countContainer.style.borderTop = "1px solid #444"
		countContainer.style.paddingTop = "10px"
		countContainer.style.display = "flex"
		countContainer.style.flexDirection = "column"
		countContainer.style.gap = "5px"

		const countLabel = document.createElement("div")
		countLabel.style.display = "flex"
		countLabel.style.justifyContent = "space-between"
		countLabel.style.fontSize = "10px"
		countLabel.style.color = "#aaa"
		countLabel.innerHTML = `<span>Parallel Games:</span><span>${this.instanceCount}</span>`
		countContainer.appendChild(countLabel)

		const countInput = document.createElement("input")
		countInput.type = "number"
		countInput.min = "1"
		countInput.max = "50"
		countInput.value = this.instanceCount.toString()
		countInput.style.flex = "1"
		countInput.style.background = "#222"
		countInput.style.color = "white"
		countInput.style.border = "1px solid #444"
		countInput.style.padding = "4px"

		const applyBtn = document.createElement("button")
		applyBtn.textContent = "Apply"
		applyBtn.style.padding = "4px 8px"
		applyBtn.style.cursor = "pointer"
		applyBtn.style.background = "#333"
		applyBtn.style.color = "#fff"
		applyBtn.style.border = "1px solid #555"
		applyBtn.style.fontSize = "10px"

		applyBtn.onclick = () => {
			const val = parseInt(countInput.value)
			if (val > 0 && val <= 256) {
				this.instanceCount = val
				this.saveToStorage()
				window.location.reload()
			}
		}

		const inputGroup = document.createElement("div")
		inputGroup.style.display = "flex"
		inputGroup.style.gap = "5px"
		inputGroup.appendChild(countInput)
		inputGroup.appendChild(applyBtn)

		countContainer.appendChild(inputGroup)
		countContainer.appendChild(inputGroup)

		// Lookahead & Auto-Evolve Controls
		const extraControls = document.createElement("div")
		extraControls.style.display = "flex"
		extraControls.style.flexDirection = "column"
		extraControls.style.gap = "8px"
		extraControls.style.marginTop = "10px"
		extraControls.style.borderTop = "1px solid #444"
		extraControls.style.paddingTop = "10px"

		// Lookahead Toggle
		const lookaheadRow = document.createElement("div")
		lookaheadRow.style.display = "flex"
		lookaheadRow.style.justifyContent = "space-between"
		lookaheadRow.style.alignItems = "center"
		lookaheadRow.style.fontSize = "10px"
		lookaheadRow.style.color = "#aaa"
		lookaheadRow.textContent = "Tree Depth:"

		const depthSelect = document.createElement("select")
		depthSelect.style.background = "#222"
		depthSelect.style.color = "white"
		depthSelect.style.border = "1px solid #444"
		depthSelect.style.fontSize = "10px"

		const opt1 = document.createElement("option")
		opt1.value = "1"
		opt1.text = "1 Move"
		const opt2 = document.createElement("option")
		opt2.value = "2"
		opt2.text = "2 Moves"
		const opt3 = document.createElement("option")
		opt3.value = "3"
		opt3.text = "3 Moves (Exp)"

		if (this.lookaheadDepth === 1) opt1.selected = true
		if (this.lookaheadDepth === 2) opt2.selected = true
		if (this.lookaheadDepth === 3) opt3.selected = true

		depthSelect.add(opt1)
		depthSelect.add(opt2)
		depthSelect.add(opt3)

		depthSelect.onchange = () => {
			this.lookaheadDepth = parseInt(depthSelect.value)
			this.instances.forEach((i) => (i.lookaheadDepth = this.lookaheadDepth))
			this.saveToStorage()
		}

		lookaheadRow.appendChild(depthSelect)
		extraControls.appendChild(lookaheadRow)

		// Auto-Evolve Toggle
		const autoRow = document.createElement("div")
		autoRow.style.display = "flex"
		autoRow.style.justifyContent = "space-between"
		autoRow.style.alignItems = "center"
		autoRow.style.fontSize = "10px"
		autoRow.style.color = "#aaa"

		const autoLabel = document.createElement("label")
		autoLabel.textContent = "Auto-Evolve:"

		const autoCheck = document.createElement("input")
		autoCheck.type = "checkbox"
		autoCheck.checked = this.autoEvolve
		autoCheck.onchange = (e: any) => {
			this.autoEvolve = e.target.checked
			this.saveToStorage()
		}

		autoRow.appendChild(autoLabel)
		autoRow.appendChild(autoCheck)
		extraControls.appendChild(autoRow)

		controlPanel.appendChild(extraControls)
		controlPanel.appendChild(countContainer)

		// Performance Stats (Move from Info Panel)
		this.perfStatsEl = document.createElement("div")
		this.perfStatsEl.style.marginTop = "10px"
		this.perfStatsEl.style.borderTop = "1px solid #444"
		this.perfStatsEl.style.paddingTop = "10px"
		controlPanel.appendChild(this.perfStatsEl)

		document.body.appendChild(controlPanel)

		// Strategy Info Panel (Left Sidebar)
		this.infoPanel = document.createElement("div")
		this.infoPanel.style.position = "fixed"
		this.infoPanel.style.top = "0"
		this.infoPanel.style.left = "0"
		this.infoPanel.style.width = "320px"
		this.infoPanel.style.height = "100vh"
		this.infoPanel.style.overflowY = "auto"
		this.infoPanel.style.background = "#0a0c14" // Solid dark sidebar
		this.infoPanel.style.borderRight = "1px solid #333"
		this.infoPanel.style.color = "white"
		this.infoPanel.style.padding = "20px"
		this.infoPanel.style.zIndex = "20000"
		this.infoPanel.style.fontSize = "11px"
		this.infoPanel.style.fontFamily = "monospace"
		this.infoPanel.style.boxSizing = "border-box"

		document.body.appendChild(this.infoPanel)
	}

	updatePerfStats() {
		const active = this.instances.filter((i) => i.isRunning).length
		const thinking = this.instances.filter((i) => i.isThinking).length
		const thinkingPct = active > 0 ? Math.round((thinking / active) * 100) : 0

		this.perfStatsEl.innerHTML = `
			<div style="color: #66ff66; font-size: 14px; font-weight: bold; margin-bottom: 5px">
				${this.movesLastSecond} Moves/sec
			</div>
			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; color: #888">
				<div>Sims Running: <span style="color: #fff">${active}</span></div>
				<div>Workers Busy: <span style="color: #fff">${thinking}</span></div>
				<div>Est. CPU Load: <span style="color: ${thinkingPct > 90 ? "#ff4444" : "#fff"}">${thinkingPct}%</span></div>
			</div>
		`
	}

	lastInfoUpdate: number = 0
	updateInfoPanel() {
		const now = Date.now()
		if (now - this.lastInfoUpdate < 500) return // Throttle to 2fps for UI
		this.lastInfoUpdate = now

		let html = ``

		// 1. History & Graph (Top)
		if (this.history.length > 0) {
			html += `<h3 style="margin: 0 0 10px 0; color: #7ee0f4; border-bottom: 1px solid #333; padding-bottom: 5px">Evolution History</h3>`

			// Sparkline
			const medians = this.history.map((h) => h.score.median)
			const max = Math.max(...medians, 100)
			const min = Math.min(...medians, 0)
			const width = 280
			const height = 60

			let points = ""
			medians.forEach((val, i) => {
				const x = (i / (medians.length - 1 || 1)) * width
				const y = height - ((val - min) / (max - min || 1)) * height
				points += `${x},${y} `
			})

			html += `<div style="margin-bottom: 15px; border: 1px solid #333; padding: 5px; background: #111">
				<div style="font-size: 9px; color: #666; display: flex; justify-content: space-between">
					<span>Median Score Trend</span>
					<span>Max: ${Math.round(max)}</span>
				</div>
				<svg width="${width}" height="${height}" style="overflow: visible">
					<polyline points="${points}" fill="none" stroke="#7ee0f4" stroke-width="2" />
				</svg>
			</div>`

			html += `<div style="overflow-x: auto; max-height: 200px; margin-bottom: 20px">
				<table style="width: 100%; border-collapse: collapse; font-size: 10px">
					<tr style="position: sticky; top: 0; background: #0a0c14; z-index: 10; color: #666; border-bottom: 1px solid #333; text-align: left">
						<th style="padding-bottom: 5px">GEN</th>
						<th style="padding-bottom: 5px">SCORE (Top/Med)</th>
					</tr>`

			// Show last 20 generations in reverse
			const limitedHistory = [...this.history].reverse().slice(0, 20)
			limitedHistory.forEach((h) => {
				html += `<tr style="border-bottom: 1px solid #222">
					<td style="color: #7ee0f4; font-weight: bold; padding: 3px 0">${h.gen}</td>
					<td style="color: #fff">
						<span style="color: #6f6">${Math.round(h.score.top)}</span> / 
						<span style="color: #ff0">${Math.round(h.score.median)}</span>
					</td>
				</tr>`
			})
			html += `</table></div>`
		}

		// 2. Current Generation Strategies
		html += `<h3 style="margin: 0 0 10px 0; color: #fff; border-bottom: 1px solid #333; padding-bottom: 5px">Gen ${this.generation} Active</h3>`
		html += `<div style="display: grid; grid-template-columns: 30px 1fr; gap: 5px">`
		const sorted = [...this.instances].sort((a, b) => b.engine.score - a.engine.score)

		sorted.forEach((inst, i) => {
			const w = inst.bot.weights
			const isParent = i < 3 && inst.engine.score > 0
			const border = isParent ? "border: 1px solid #7ee0f4" : "border: 1px solid #333"
			const bg = isParent ? "background: rgba(126, 224, 244, 0.1)" : ""

			html += `<div style="font-weight: bold; color: #aaa; text-align: center">${inst.id}</div>`
			html += `<div style="${border}; ${bg}; padding: 5px; border-radius: 4px; margin-bottom: 5px">
				<div style="display: flex; justify-content: space-between">
					<span style="color: #fff">Score: ${inst.engine.score}</span>
					<span style="color: #666">Gen: ${inst.generation}</span>
				</div>
				<div style="color: #88bdff; margin-top: 3px">
					P: ${w.pointsMultiplier.toFixed(1)} | E: ${w.emptyBoardMultiplier.toFixed(1)} | A: ${w.adjacencyBonus.toFixed(1)}
				</div>
				<div style="color: #ff88a0">
					H: ${w.holePenalty.toFixed(1)} | B: ${w.boxCompletionBonus.toFixed(1)}
				</div>
				${inst.parentScore ? `<div style="color: #6c6; font-size: 9px; margin-top: 2px">Parent Score: ${inst.parentScore}</div>` : ""}
			</div>`
		})

		html += `</div>`
		// History removed from bottom, moved to top
		this.infoPanel.innerHTML = html
	}

	toggleAll(btn: HTMLButtonElement) {
		const allDead = this.instances.every((i) => i.engine.isGameOver)

		if (allDead && !this.isRunning) {
			// If everyone is dead, clicking "Start" should perform the evolution
			this.evolve()
			this.isRunning = true
			btn.textContent = "Pause Simulation"
			return
		}

		this.isRunning = !this.isRunning
		btn.textContent = this.isRunning ? "Pause Simulation" : "Resume Simulation"

		this.instances.forEach((i) => {
			if (this.isRunning) i.start()
			else i.stop()
		})
	}

	// Simple Genetic Algorithm with Crossover and Elitism
	evolve() {
		// 0. Record history
		const scores = this.instances.map((i) => i.engine.score).sort((a, b) => a - b)
		const moves = this.instances.map((i) => i.engine.moves).sort((a, b) => a - b)

		const getMedian = (arr: number[]) => {
			const mid = Math.floor(arr.length / 2)
			return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2
		}

		this.history.push({
			gen: this.generation,
			score: {
				avg: scores.reduce((a, b) => a + b, 0) / scores.length,
				top: scores[scores.length - 1],
				worst: scores[0],
				median: getMedian(scores),
			},
			moves: {
				avg: moves.reduce((a, b) => a + b, 0) / moves.length,
				top: moves[moves.length - 1],
				worst: moves[0],
				median: getMedian(moves),
			},
		})

		this.generation++

		// 1. Selection: Top 25% are candidates for breeding
		const sorted = [...this.instances].sort((a, b) => b.engine.score - a.engine.score)
		const survivorCount = Math.max(2, Math.floor(this.instanceCount * 0.25)) // Top 25%
		const candidates = sorted.slice(0, survivorCount)

		// 2. Elite: The #1 performer survives exactly as they are
		let elite = candidates[0]

		// 2b. Global Best Logic
		// If the current elite performs worse than our all-time best,
		// we inject the all-time best into the candidate pool to restore lost knowledge.
		if (!this.globalBest || elite.engine.score > this.globalBest.score) {
			this.globalBest = { score: elite.engine.score, weights: { ...elite.bot.weights } }
		} else if (this.globalBest && elite.engine.score < this.globalBest.score) {
			// Current generation is weak. Inject the ancestor!
			// We create a mock candidate for tournament selection
			const ancestor = { engine: { score: this.globalBest.score }, bot: { weights: this.globalBest.weights } } as any
			candidates.push(ancestor)
		}

		// Helper: Tournament Selection (pick 2 random candidates, best wins)
		const selectParent = () => {
			const c1 = candidates[Math.floor(Math.random() * candidates.length)]
			const c2 = candidates[Math.floor(Math.random() * candidates.length)]
			return c1.engine.score > c2.engine.score ? c1 : c2
		}

		// 3. Breed the rest
		this.instances.forEach((inst, idx) => {
			// Skip the elite instance (index of elite in original array)
			if (inst.id === elite.id) {
				inst.restart() // Just restart their game
				return
			}

			// Also keep top 3 unchanged to preserve good genes? No, just elite.
			// Actually, let's keep the top 10% exactly as is (elitism for top 10%)
			// to prevent regression
			/*
			const isTop10pct = sorted.indexOf(inst) < this.instanceCount * 0.1
			if (isTop10pct) {
				inst.restart()
				return
			}
			*/

			// Crossover: Pick TWO parents via Tournament
			const p1 = selectParent()
			const p2 = selectParent()

			const newWeights: BotWeights = {
				pointsMultiplier: Math.random() > 0.5 ? p1.bot.weights.pointsMultiplier : p2.bot.weights.pointsMultiplier,
				emptyBoardMultiplier: Math.random() > 0.5 ? p1.bot.weights.emptyBoardMultiplier : p2.bot.weights.emptyBoardMultiplier,
				adjacencyBonus: Math.random() > 0.5 ? p1.bot.weights.adjacencyBonus : p2.bot.weights.adjacencyBonus,
				holePenalty: Math.random() > 0.5 ? p1.bot.weights.holePenalty : p2.bot.weights.holePenalty,
				boxCompletionBonus: Math.random() > 0.5 ? p1.bot.weights.boxCompletionBonus : p2.bot.weights.boxCompletionBonus,
			}

			// Mutation: Smaller, more stable shifts (proportional to current value)
			const mutate = (val: number, range: number) => {
				if (Math.random() < 0.2) return val // 20% chance no mutation
				return val + (Math.random() - 0.5) * range
			}

			newWeights.pointsMultiplier = mutate(newWeights.pointsMultiplier, 0.4)
			newWeights.emptyBoardMultiplier = mutate(newWeights.emptyBoardMultiplier, 0.4)
			newWeights.adjacencyBonus = mutate(newWeights.adjacencyBonus, 0.2)
			newWeights.holePenalty = mutate(newWeights.holePenalty, 2.0)
			newWeights.boxCompletionBonus = mutate(newWeights.boxCompletionBonus, 0.2)

			inst.setWeights(newWeights, this.generation, Math.max(p1.engine.score, p2.engine.score))
			inst.container.style.border = "2px solid green"
		})

		// Reset borders for non-newly-bred
		elite.container.style.border = "3px solid gold" // Highlight the king

		this.updateInfoPanel()
		this.saveToStorage()
	}
}
