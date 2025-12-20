import { Bot } from "./bot"
import { GRID_SIZE } from "../engine/types"
import { GameEngine } from "../engine/logic"
import { GameRenderer } from "../ui/renderer"

export class Simulator {
	engine: GameEngine
	renderer: GameRenderer
	bot: Bot
	canvas: HTMLCanvasElement
	isRunning: boolean = false
	moveDelay: number = 200 // ms

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas
		this.engine = new GameEngine() // New random seed
		this.renderer = new GameRenderer(canvas)
		this.bot = new Bot(this.engine)

		// Setup simple UI overlay for controls
		this.setupControls()
	}

	setupControls() {
		const container = document.createElement("div")
		container.style.position = "absolute"
		container.style.top = "10px"
		container.style.left = "10px"
		container.style.background = "rgba(0, 0, 0, 0.8)"
		container.style.padding = "10px"
		container.style.borderRadius = "8px"
		container.style.color = "white"
		container.style.zIndex = "1000"

		const title = document.createElement("h2")
		title.textContent = "AI Simulator"
		title.style.margin = "0 0 10px 0"
		container.appendChild(title)

		const stats = document.createElement("div")
		stats.id = "sim-stats"
		stats.innerHTML = "Moves: 0<br>Score: 0"
		container.appendChild(stats)

		const btn = document.createElement("button")
		btn.textContent = "Start Simulation"
		btn.style.marginTop = "10px"
		btn.style.padding = "5px 10px"
		btn.style.cursor = "pointer"
		btn.onclick = () => {
			if (this.isRunning) {
				this.stop()
				btn.textContent = "Resume"
			} else {
				this.start()
				btn.textContent = "Pause"
			}
		}
		container.appendChild(btn)

		const restartBtn = document.createElement("button")
		restartBtn.textContent = "Restart"
		restartBtn.style.marginTop = "10px"
		restartBtn.style.marginLeft = "10px"
		restartBtn.style.padding = "5px 10px"
		restartBtn.style.cursor = "pointer"
		restartBtn.onclick = () => {
			this.restart()
			// Reset main button text
			btn.textContent = "Start Simulation"
		}
		container.appendChild(restartBtn)

		const speedLabel = document.createElement("div")
		speedLabel.style.marginTop = "10px"
		speedLabel.textContent = "Delay (ms):"
		container.appendChild(speedLabel)

		const speedInput = document.createElement("input")
		speedInput.type = "range"
		speedInput.min = "10"
		speedInput.max = "1000"
		speedInput.value = "200"
		speedInput.oninput = (e: any) => {
			this.moveDelay = parseInt(e.target.value)
			speedVal.textContent = this.moveDelay + "ms"
		}
		container.appendChild(speedInput)

		const speedVal = document.createElement("span")
		speedVal.textContent = "200ms"
		speedVal.style.marginLeft = "5px"
		container.appendChild(speedVal)

		document.body.appendChild(container)

		// Initial render
		this.render()
	}

	start() {
		if (this.isRunning) return
		this.isRunning = true
		this.loop()
	}

	stop() {
		this.isRunning = false
	}

	restart() {
		this.stop()
		this.engine = new GameEngine()
		this.bot.engine = this.engine
		this.updateStats()
		this.render()
	}

	async loop() {
		if (!this.isRunning) return

		if (this.engine.isGameOver) {
			this.isRunning = false
			alert(`Game Over! Score: ${this.engine.score}`)
			return
		}

		// Bot thinks
		const move = this.bot.findBestMove()

		// If no move found, it might mean game over (should have been caught by engine) or bot failure
		if (!move) {
			// Check if game really is over?
			if (!this.engine.canPlaceAny()) {
				this.engine.isGameOver = true
			}
			// Render one last time to show failure
			this.render()
			// loop again to catch game over block above
			requestAnimationFrame(() => this.loop())
			return
		}

		// Execute move
		this.engine.place(move.shapeIndex, move.r, move.c)

		this.updateStats()
		this.render()

		// Wait
		setTimeout(() => {
			requestAnimationFrame(() => this.loop())
		}, this.moveDelay)
	}

	updateStats() {
		const el = document.getElementById("sim-stats")
		if (el) {
			el.innerHTML = `Moves: ${this.engine.moves}<br>Score: ${this.engine.score}`
		}
	}

	render() {
		// Mocking some UI params that renderer expects
		const placeability = this.engine.currentShapes.map((s) => (s ? this.engine.canPlaceShape(s) : false))
		this.renderer.draw(
			this.engine,
			this.engine, // Using engine as 'lastState' for now, no lerp
			null, // dragShape
			null, // dragPos
			null, // ghostPos
			placeability,
			null, // hoveredShapeIndex
			Date.now(),
			null, // handTimerRatio
			false // timerPanic
		)
	}
}
