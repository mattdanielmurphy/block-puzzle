import { GameEngine } from "../engine/logic.js"
import { GameRenderer } from "./renderer.js"
import { GRID_SIZE, Shape, MoveResult } from "../engine/types.js"

export class TutorialManager {
	private engine: GameEngine
	private renderer: GameRenderer
	private step: number = 0
	isActive: boolean = false
	private onComplete: () => void

	// UI Elements
	private overlay: HTMLElement
	private titleEl: HTMLElement
	private textEl: HTMLElement
	private nextBtn: HTMLElement
	private skipBtn: HTMLElement

	constructor(engine: GameEngine, renderer: GameRenderer, onComplete: () => void) {
		this.engine = engine
		this.renderer = renderer
		this.onComplete = onComplete

		this.overlay = document.getElementById("tutorial-overlay")!
		this.titleEl = document.getElementById("tutorial-title")!
		this.textEl = document.getElementById("tutorial-text")!
		this.nextBtn = document.getElementById("tutorial-next-btn")!
		this.skipBtn = document.getElementById("tutorial-skip-btn")!

		// Next Button Logic
		this.nextBtn.addEventListener("click", () => {
			if (this.step === 0) {
				this.runStep(1)
			} else if (this.step === 4) {
				this.endTutorial()
			}
		})

		// Skip Button Logic - Always exit
		this.skipBtn.addEventListener("click", () => {
			this.endTutorial()
		})
	}

	start() {
		this.isActive = true
		this.overlay.classList.remove("hidden")
		this.step = 0
		this.runStep(0)
	}

	public endTutorial() {
		this.isActive = false
		this.overlay.classList.add("hidden")
		this.overlay.classList.remove("scenario-mode") // Reset
		document.querySelector("header")?.classList.remove("hidden") // Ensure header is back
		localStorage.setItem("bp_tutorial_completed", "true")
		this.engine.reset() // Establish fresh game state
		this.onComplete()
	}

	public skip() {
		this.endTutorial()
	}

	private updateButtons(stepIndex: number) {
		// Defaults
		this.nextBtn.classList.remove("hidden")
		this.skipBtn.classList.remove("hidden")

		if (stepIndex === 0) {
			this.nextBtn.textContent = "Start"
			this.skipBtn.textContent = "Skip"
		} else if (stepIndex >= 1 && stepIndex <= 3) {
			// In scenarios, user performs action to advance.
			// We only show "Skip" (Exit). "Next" is redundant/confusing unless it auto-completes.
			this.nextBtn.classList.add("hidden")
			this.skipBtn.textContent = "Skip Tutorial"
		} else if (stepIndex === 4) {
			this.nextBtn.textContent = "Start Game"
			this.skipBtn.classList.add("hidden") // Can't skip start game, just start.
		}
	}

	private runStep(stepIndex: number) {
		this.step = stepIndex
		this.updateButtons(stepIndex)

		// UI Mode Management
		const isScenario = stepIndex >= 1 && stepIndex <= 3
		if (isScenario) {
			this.overlay.classList.add("scenario-mode")
			document.querySelector("header")?.classList.add("hidden")
		} else {
			this.overlay.classList.remove("scenario-mode")
			document.querySelector("header")?.classList.remove("hidden")
		}

		switch (stepIndex) {
			case 0: // Intro
				this.updateText("How to Play", "Learn to clear blocks! It's easy.")
				// Don't modify grid yet, just default empty or whatever
				this.engine.reset() // Clear board
				break
			case 1: // Horizontal Line
				this.setupHorizontalLine()
				this.updateText("Horizontal Lines", "Drag the block from below to clear the horizontal line.")
				break
			case 2: // Vertical Line
				this.setupVerticalLine()
				this.updateText("Vertical Lines", "Great! Now clear the vertical line.")
				break
			case 3: // 3x3 Box
				this.setupSquare()
				this.updateText("3x3 Squares", "Clearing 3x3 squares works too!")
				break
			case 4: // Game Over
				this.setupGameOverStep()
				this.updateText("Last Thing", "The game ends when there are no valid moves.", "Tip: Increase sensitivity in settings to move faster.")
				this.engine.setShapes([null, null, null])
				break
		}
	}

	private updateText(title: string, text: string, text2?: string) {
		this.titleEl.textContent = title
		this.textEl.textContent = text + (text2 ? "\n" + text2 : "")
	}

	onMove(result: MoveResult) {
		if (!this.isActive) return

		let complete = false
		if (this.step === 1 && result.clearedRows.length > 0) complete = true
		else if (this.step === 2 && result.clearedCols.length > 0) complete = true
		else if (this.step === 3 && result.clearedBoxes.length > 0) complete = true

		if (complete) {
			// Remove remaining shapes to prevent user doing anything else
			this.engine.setShapes([null, null, null])
			// Wait for animation then next step
			setTimeout(() => this.runStep(this.step + 1), 1000)
		} else if (this.step >= 1 && this.step <= 3) {
			// Wrong move! Reset the scenario.
			setTimeout(() => this.runStep(this.step), 800)
		}
	}

	// Setups
	private setupHorizontalLine() {
		const grid = new Array(GRID_SIZE * GRID_SIZE).fill(0)
		// Fill row 4, except col 4
		for (let c = 0; c < GRID_SIZE; c++) {
			if (c !== 4) grid[4 * GRID_SIZE + c] = 2 // Color 2
		}
		this.engine.setGrid(grid)

		// Give a single 1x1 block
		const shape1x1: Shape = {
			id: "tut_1x1",
			colorId: 1,
			cells: [{ r: 0, c: 0 }],
		}
		this.engine.setShapes([shape1x1, null, null])
	}

	private setupVerticalLine() {
		const grid = new Array(GRID_SIZE * GRID_SIZE).fill(0)
		// Fill col 4, except row 4
		for (let r = 0; r < GRID_SIZE; r++) {
			if (r !== 4) grid[r * GRID_SIZE + 4] = 3 // Color 3
		}
		this.engine.setGrid(grid)

		const shape1x1: Shape = {
			id: "tut_1x1",
			colorId: 1,
			cells: [{ r: 0, c: 0 }],
		}
		this.engine.setShapes([null, shape1x1, null]) // Put in middle slot for variety
	}

	private setupSquare() {
		// Setup a 3x3 box almost full
		const grid = new Array(GRID_SIZE * GRID_SIZE).fill(0)
		// Box 4 (Center box) ranges r=3..5, c=3..5
		// Let's fill it except center (4,4)
		for (let r = 3; r <= 5; r++) {
			for (let c = 3; c <= 5; c++) {
				if (!(r === 4 && c === 4)) grid[r * GRID_SIZE + c] = 4 // Color 4
			}
		}
		this.engine.setGrid(grid)

		const shape1x1: Shape = {
			id: "tut_1x1",
			colorId: 1,
			cells: [{ r: 0, c: 0 }],
		}
		this.engine.setShapes([null, null, shape1x1]) // 3rd slot
	}

	private setupGameOverStep() {
		this.engine.reset()
	}
}
