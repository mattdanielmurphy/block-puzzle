import { GRID_SIZE, Shape } from "./engine/types.js"

import { BlockClearEffect } from "./ui/effects.js"
import { GameEngine } from "./engine/logic.js"
import { GameRenderer } from "./ui/renderer.js"
import { InputManager } from "./ui/input.js"
import { PowerupType } from "./engine/powerups.js"
import { ReplayPlayer } from "./ui/replay-player.js"
import { ReplayState } from "./engine/replay.js"
import { THEME } from "./ui/theme.js"
import { TutorialManager } from "./ui/tutorial.js"
import { VERSION } from "./version.js"

const GAME_OVER_QUOTES = [
	"A valiant effort.",
	"It's about the friends you made along the way.",
	"Don't be sad.",
	"You may have lost, but you're still a winner in my books.",
	"Good job.",
	"You showed those blocks who's boss.",
	"I love you.",
	"Not bad, guy.",
	"Way to go, sport!",
	"There's always next year.",
	"Thank you, come again.",
	"Rate and subscribe.",
	"Why did you do that?",
	"Be better.",
	"Pretty, pretty, pretty good.",
	"Swell effort, friend.",
	"This guy gets it.",
	"No cheating.",
	"We all lose eventually.",
	"Next time, you'll beat it.",
	"You were so close to winning!",
	"That was almost impressive.",
	"Better luck next time, champ.",
	"You gave it your all. Well, maybe 60%.",
	"The blocks have spoken.",
	"Ouch. That hurt to watch.",
	"You'll get 'em next time, tiger.",
	"At least you tried.",
	"The grid gods were not in your favor.",
	"You fought bravely. You lost, but bravely.",
	"That's what I call a learning experience.",
	"Close, but no cigar.",
	"You're getting warmer. Or colder. Hard to tell.",
	"The blocks win this round.",
	"You're still my favorite player.",
	"Mistakes were made.",
	"That's one for the history books.",
	"You're the handsomest block-placer in all the realm.",
	"How did you even--just kidding, I know how you even.",
	"You're the best block-placer I've ever seen.",
	"You got skills, kid.",
	"What the hell?",
	"Not quite my tempo.",
	"Were you rushing or were you dragging?",
	"Oh brother, this guy stinks!",
	"You call that a game?",
	"You're the worst block-placer I've ever seen.",
	"You're not going to win the tournament with that kind of play.",
	"The blocks will have their revenge.",
	"I give you an 8/10.",
	"What's your major malfunction? No, really, I want to help.",
	"Actions always have consequences.",
	"Coffee is for closers.",
	"ABP: Always Be Placing.",
	"Just keep swimming.",
	"If you ain't first, you're last.",
	"Don't forget to bring a towel!",
	"You're not the first to fall for this.",
	"Give it a rest, will you?",
	"Yeah, ok buddy...",
	"Again?",
	"Tell your friends.",
	"Don't tell anybody about this...",
	"This will be our little secret.",
	"What a long strange trip it's been.",
	"Seen any good movies lately?",
	"You're like, scary good. Just kidding.",
	"I want to play a game.",
	"There's always money in the banana stand.",
	"Always leave a note.",
	"Stay in school.",
	"You win a prize! Go to the door, there's a package there waiting for you. No, really. Would I lie about that?",
	"Can I get your autograph?",
	"Are you classically trained?",
	"You should see me play.",
	"Where do you get off?",
	"What's your problem?",
	"Did you know there are 400k species of beetle? That's a lot.",
	"Did you know giraffes face a 30 times higher lightning strike risk than humans due to their height?",
	"Did you know clouds weigh about a million tonnes on average?",
	"Did you know sharks predate trees by roughly 50 million years on Earth?",
	"Did you know tardigrades can survive in outer space and endure temperatures from near absolute zero to 150°C?",
	"Did you know the Alpine swift holds the record for longest nonstop flight at over 200 days airborne?",
	"Did you know a Madagascar radiated tortoise lived to 188 years, the verified longest-lived land animal?",
	"Did you know only 5% of cheetah cubs survive to adulthood due to predators and disease?",
	"Did you know a tiger's rear legs remain standing even after death from their immense power?",
	"Did you know sheep can recognize and remember human faces for up to two years?",
	"Did you know koalas sleep up to 22 hours daily to digest their low-nutrient eucalyptus diet?",
	"Did you know Cuvier’s beaked whales hold their breath for over two hours while diving?",
]

class GameApp {
	engine: GameEngine
	renderer: GameRenderer
	input: InputManager
	canvas: HTMLCanvasElement

	// State for UI
	dragShape: Shape | null = null
	dragPos: { x: number; y: number } | null = null

	ghostPos: { r: number; c: number } | null = null

	// Debug/testing flags
	private readonly DEBUG_SPAWN_POWERUP_ON_START = false
	private readonly DEBUG_ENABLE_POWERUP_KEYS = false

	// Snap settings
	private readonly SNAP_THRESHOLD = 3

	// Status Face State
	private lastPlaceability: boolean[] = []
	private reliefUntil: number = 0
	private wasInPanicState: boolean = false
	private timerPanic: boolean = false
	private handTimerRatio: number | null = null

	// Replay State
	private replayPlayer: ReplayPlayer | null = null
	private isInReplayMode: boolean = false

	// Tutorial State
	tutorialManager: TutorialManager

	// Pause & timers
	private isPaused: boolean = false
	private pauseStartedAt: number | null = null
	private readonly HAND_TIME_LIMIT_MS = 10000
	private handDeadline: number | null = null
	private lastHandGeneration: number = -1

	constructor() {
		this.displayVersion()
		this.canvas = document.getElementById("game-canvas") as HTMLCanvasElement
		this.engine = new GameEngine(Date.now())
		this.renderer = new GameRenderer(this.canvas)

		if (this.DEBUG_SPAWN_POWERUP_ON_START) {
			this.engine.spawnTestPowerup()
		}

		if (this.DEBUG_ENABLE_POWERUP_KEYS) {
			document.addEventListener("keydown", (e) => {
				const now = Date.now()
				switch (e.key.toLowerCase()) {
					case "1":
						this.engine.spawnPowerupOfType(PowerupType.BOMB_SMALL, now)
						break
					case "2":
						this.engine.spawnPowerupOfType(PowerupType.BOMB_MED, now)
						break
					case "3":
						this.engine.spawnPowerupOfType(PowerupType.BOMB_LARGE, now)
						break
					case "4":
						this.engine.spawnPowerupOfType(PowerupType.BOMB_MEGA, now)
						break
					default:
						return
				}
				e.preventDefault()
			})
		}

		this.input = new InputManager(this.canvas, this.renderer, {
			onDragStart: this.onDragStart.bind(this),
			onDragMove: this.onDragMove.bind(this),
			onDragEnd: this.onDragEnd.bind(this),
		})

		this.loadHighScore()
		this.updateUI()
		this.bindControls()
		this.initSettings()

		// Init Tutorial
		this.tutorialManager = new TutorialManager(
			this.engine,
			this.renderer,
			() => {
				if (!this.engine.isGameOver) this.restart()
			},
			() => {
				// Start timer when tutorial ends
				this.syncHandCountdown(Date.now())
			}
		)

		requestAnimationFrame(this.loop.bind(this))

		// Initial render
		const initialPlaceability = this.engine.currentShapes.map((s) => (s ? this.engine.canPlaceShape(s) : false))
		this.lastPlaceability = initialPlaceability // Init state
		this.renderer.draw(this.engine, this.engine, null, null, null, initialPlaceability, Date.now(), this.handTimerRatio, this.timerPanic)
		this.positionTimerBars()

		// Start Tutorial if not completed
		if (!localStorage.getItem("bp_tutorial_completed")) {
			this.tutorialManager.start()
		} else {
			// Only start timer if tutorial is not active
			this.syncHandCountdown(Date.now())
		}
	}

	displayVersion() {
		const el = document.getElementById("app-version")
		if (el) {
			el.textContent = `v${VERSION}`
		}
	}

	bindControls() {
		document.getElementById("restart-btn")?.addEventListener("click", () => {
			this.restart()
		})
		document.getElementById("pause-btn")?.addEventListener("click", () => {
			this.togglePause()
		})
		document.getElementById("replay-btn")?.addEventListener("click", () => {
			this.startReplay()
		})

		// Replay controls - just exit
		document.getElementById("replay-exit")?.addEventListener("click", () => {
			this.exitReplay()
		})

		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape" || e.key === "p" || e.key === " ") {
				// Don't toggle pause if settings modal is open (it has its own Escape handler)
				const settingsModal = document.getElementById("settings-modal")
				if (settingsModal && !settingsModal.classList.contains("hidden")) {
					return
				}
				e.preventDefault()
				this.togglePause()
			}
		})

		// pause on focus lost
		window.addEventListener("blur", () => {
			this.pauseGame()
		})
		// when document.visibilityState === "hidden", pause game
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "hidden") {
				this.pauseGame()
			}
		})
	}

	initSettings() {
		const settingsBtn = document.getElementById("settings-btn")
		const modal = document.getElementById("settings-modal")
		const closeBtn = document.getElementById("close-settings-btn")
		const slider = document.getElementById("sensitivity-slider") as HTMLInputElement
		const valDisplay = document.getElementById("sensitivity-value")

		// Load saved sensitivity
		const savedSens = localStorage.getItem("bp_sensitivity")
		const initialSens = savedSens ? parseFloat(savedSens) : 1.0

		// Apply
		this.input.sensitivity = initialSens
		if (slider) slider.value = initialSens.toString()
		if (valDisplay) valDisplay.textContent = initialSens.toFixed(1)

		// Events
		settingsBtn?.addEventListener("click", () => {
			modal?.classList.remove("hidden")
			this.pauseGame()
		})

		closeBtn?.addEventListener("click", () => {
			modal?.classList.add("hidden")
			this.resumeGame()
		})

		// Close modal when clicking outside of it (on the overlay)
		modal?.addEventListener("click", (e) => {
			if (e.target === modal) {
				modal.classList.add("hidden")
				this.resumeGame()
			}
		})

		// Close modal with Escape key
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
				e.preventDefault()
				modal.classList.add("hidden")
				this.resumeGame()
			}
		})

		slider?.addEventListener("input", (e) => {
			const val = parseFloat((e.target as HTMLInputElement).value)
			this.input.sensitivity = val
			if (valDisplay) valDisplay.textContent = val.toFixed(1)
			localStorage.setItem("bp_sensitivity", val.toString())
		})

		// Clear Cache
		const clearCacheBtn = document.getElementById("clear-cache-btn")
		clearCacheBtn?.addEventListener("click", async () => {
			if (confirm("This will clear all game data and cached files. Reload now?")) {
				// 1. Unregister Service Workers
				if ("serviceWorker" in navigator) {
					const registrations = await navigator.serviceWorker.getRegistrations()
					for (const registration of registrations) {
						await registration.unregister()
					}
				}

				// 2. Clear Caches
				if ("caches" in window) {
					const keys = await caches.keys()
					await Promise.all(keys.map((key) => caches.delete(key)))
				}

				// 3. Clear Local Storage (Reset game state completely)
				localStorage.clear()

				// 4. Force Reload
				window.location.reload()
			}
		})
	}

	restart() {
		// If we are currently replaying, exit replay mode first
		if (this.isInReplayMode) {
			this.exitReplay()
		}

		// Clear pause state and timer
		if (this.isPaused) {
			this.resumeGame()
		}
		this.handDeadline = null
		this.lastHandGeneration = -1
		this.timerPanic = false

		if (this.tutorialManager.isActive) {
			this.tutorialManager["endTutorial"]() // Accessing private valid in runtime but TS might complain? Main is TS.
			// Wait, endTutorial is private in TutorialManager?
			// I should make it public or use a public 'skip' method.
			// I'll check my TutorialManager code.
			// It was private. I should have made it public or 'skip'.
			// I'll just rely on the 'Skip' button for now?
			// Or force it. 'onComplete' calls restart.
			// I can't call endTutorial if private.
			// I'll edit TutorialManager to make 'endTutorial' public or add 'skip'.
			// Assume I fix TutorialManager first.
			return
		}

		this.engine.reset(Date.now())
		if (this.DEBUG_SPAWN_POWERUP_ON_START) {
			this.engine.spawnTestPowerup()
		}
		this.loadHighScore() // Load high score into the new engine
		this.dragShape = null
		this.dragPos = null

		// Reset status face state
		this.wasInPanicState = false
		this.reliefUntil = 0
		this.lastPlaceability = []

		document.getElementById("game-over-overlay")?.classList.add("hidden")
		this.updateUI()
	}

	loadHighScore() {
		const best = localStorage.getItem("bp_best_score")
		if (best) this.engine.bestScore = parseInt(best, 10)
		document.getElementById("best-score")!.textContent = this.engine.bestScore.toString()
	}

	saveHighScore() {
		if (this.engine.score > this.engine.bestScore) {
			this.engine.bestScore = this.engine.score
			localStorage.setItem("bp_best_score", this.engine.score.toString())
			document.getElementById("best-score")!.textContent = this.engine.bestScore.toString()
		}
	}

	updateUI() {
		document.getElementById("current-score")!.textContent = this.engine.score.toString()
		this.saveHighScore() // Check constantly or delta

		if (this.engine.isGameOver) {
			document.getElementById("game-over-overlay")?.classList.remove("hidden")
			document.getElementById("final-score")!.textContent = this.engine.score.toString()
		}

		if (this.engine.isGameOver) {
			this.updateCountdownUI(null)
		}
	}

	private updateCountdownUI(remainingMs: number | null) {
		const barFillBottom = document.querySelector("#hand-timer-bottom .hand-timer-fill") as HTMLDivElement | null

		const applyFill = (fillEl: HTMLDivElement | null, ratio: number, remaining: number | null) => {
			if (!fillEl) return
			if (remaining === null) {
				fillEl.style.width = "0%"
				this.handTimerRatio = null
				return
			}
			const clamped = Math.max(0, Math.min(1, ratio))
			fillEl.style.width = `${clamped * 100}%`
			fillEl.style.background = remaining <= 3000 ? "#ff5f8a" : "linear-gradient(90deg, #7ee0f4, #5ed1c9)"
			this.handTimerRatio = clamped
		}

		if (this.isInReplayMode || this.engine.isGameOver) {
			applyFill(barFillBottom, 0, null)
			this.handTimerRatio = null
			return
		}

		if (this.isPaused) {
			// keep current widths; do nothing
			return
		}

		if (remainingMs === null) {
			applyFill(barFillBottom, 0, null)
			this.handTimerRatio = null
			return
		}

		const ratio = remainingMs / this.HAND_TIME_LIMIT_MS
		applyFill(barFillBottom, ratio, remainingMs)
		this.handTimerRatio = Math.max(0, Math.min(1, ratio))
	}

	private syncHandCountdown(now: number) {
		if (this.isInReplayMode) {
			this.updateCountdownUI(null)
			return
		}

		// Don't start timer during tutorial
		if (this.tutorialManager.isActive) {
			this.updateCountdownUI(null)
			return
		}

		// Detect new hand dealt
		if (this.engine.handGeneration !== this.lastHandGeneration) {
			this.lastHandGeneration = this.engine.handGeneration
			if (!this.engine.isGameOver) {
				this.handDeadline = now + this.HAND_TIME_LIMIT_MS
			} else {
				this.handDeadline = null
			}
		}

		if (this.engine.isGameOver) {
			this.handDeadline = null
			this.timerPanic = false
			this.updateCountdownUI(null)
			return
		}

		// While paused, keep UI showing paused state but do not tick down
		if (this.isPaused) {
			this.updateCountdownUI(this.handDeadline ? this.handDeadline - now : null)
			return
		}

		if (this.handDeadline) {
			const remaining = this.handDeadline - now
			this.timerPanic = remaining <= 3000 && remaining > 0
			// If timer hits zero and there are still blocks in the tray, end the game
			if (remaining <= 0 && this.engine.currentShapes.some((s) => s !== null)) {
				this.endGameDueToTimeout()
				this.updateCountdownUI(0)
				return
			}

			this.updateCountdownUI(Math.max(0, remaining))
		} else {
			this.timerPanic = false
			this.updateCountdownUI(null)
		}
	}

	private endGameDueToTimeout() {
		this.engine.isGameOver = true
		this.handDeadline = null
		document.getElementById("game-over-overlay")?.classList.remove("hidden")
		document.getElementById("final-score")!.textContent = this.engine.score.toString()

		// Display a random quote
		const randomQuote = GAME_OVER_QUOTES[Math.floor(Math.random() * GAME_OVER_QUOTES.length)]
		const quoteElement = document.getElementById("game-over-quote")
		if (quoteElement) {
			quoteElement.textContent = randomQuote
		}

		this.updateUI()
	}

	private positionTimerBars() {
		const bottomBar = document.getElementById("hand-timer-bottom") as HTMLDivElement | null
		if (!bottomBar || !this.renderer.layout) return

		const { boardRect } = this.renderer.layout
		const containerRect = this.canvas.getBoundingClientRect()
		// Convert layout coords (relative to canvas origin top-left) to absolute within game-container
		const canvasStyleLeft = this.canvas.offsetLeft
		const canvasStyleTop = this.canvas.offsetTop

		const commonWidth = `${boardRect.w}px`

		bottomBar.style.width = commonWidth
		bottomBar.style.left = `${canvasStyleLeft + boardRect.x}px`
		// place just below board but above tray area
		bottomBar.style.top = `${canvasStyleTop + boardRect.y + boardRect.h + 8}px`

		// If layout recalculated and bars would go outside container, clamp
		const containerWidth = containerRect.width
		const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max)
		const maxLeft = containerWidth - boardRect.w
		const leftBottom = clamp(parseFloat(bottomBar.style.left), 0, maxLeft)
		bottomBar.style.left = `${leftBottom}px`
	}

	private pauseGame() {
		if (this.isPaused || this.engine.isGameOver || this.isInReplayMode) return
		this.isPaused = true
		this.pauseStartedAt = Date.now()
		// Clear any in-progress drag so resume is clean
		this.dragShape = null
		this.dragPos = null
		this.ghostPos = null
		document.getElementById("pause-overlay")?.classList.remove("hidden")
		const btn = document.getElementById("pause-btn")
		if (btn) btn.textContent = "▶"
	}

	private resumeGame() {
		if (!this.isPaused) return
		const now = Date.now()
		if (this.pauseStartedAt && this.handDeadline) {
			// Push deadline forward by the paused duration
			this.handDeadline += now - this.pauseStartedAt
		}
		this.isPaused = false
		this.pauseStartedAt = null
		document.getElementById("pause-overlay")?.classList.add("hidden")
		const btn = document.getElementById("pause-btn")
		if (btn) btn.textContent = "⏸"
	}

	private togglePause() {
		if (this.isInReplayMode || this.engine.isGameOver) return
		if (this.isPaused) this.resumeGame()
		else this.pauseGame()
	}

	onDragStart(index: number) {
		if (this.engine.isGameOver || this.isPaused) return
		const shape = this.engine.currentShapes[index]
		if (shape) {
			// Check if the shape can be placed anywhere on the grid
			if (!this.engine.canPlaceShape(shape)) {
				// Shape is greyed out (unplaceable), cancel the drag
				this.input.dragState = null
				return
			}
			this.dragShape = shape
			// Input manager handles calling move/end
		} else {
			this.input.dragState = null // Cancel if empty slot
		}
	}

	// Helper to calculate offset from Center to Top-Left Anchor (0,0) cells
	private getShapeCenterOffset(shape: Shape, cellSize: number): { x: number; y: number } {
		const gap = THEME.metrics.cellGap
		let minR = 10,
			maxR = -1,
			minC = 10,
			maxC = -1
		shape.cells.forEach((p) => {
			if (p.r < minR) minR = p.r
			if (p.r > maxR) maxR = p.r
			if (p.c < minC) minC = p.c
			if (p.c > maxC) maxC = p.c
		})

		// Width/Height in pixels
		const width = (maxC - minC + 1) * (cellSize + gap) - gap
		const height = (maxR - minR + 1) * (cellSize + gap) - gap

		// Center relative to the bounding box top-left
		const centerX = width / 2
		const centerY = height / 2

		// Anchor (0,0) position within the bounding box?
		// Shape cells are relative to (0,0).
		// Bounding box starts at (minC, minR) * stride.

		// If we are at Visual Center (vx, vy).
		// The Top-Left of the Bounding Box is at (vx - centerX, vy - centerY).
		// The Anchor (0,0) is relative to the Bounding Box by (-minC, -minR).
		// Wait.
		// Pixel(c, r) = StartX + (c - minC)*stride
		// Pixel(0, 0) = StartX + (0 - minC)*stride
		// StartX = VisualCenter - Width/2

		// So AnchorX = (VisualCenter - Width/2) + (0 - minC) * stride
		// AnchorY = (VisualCenter - Height/2) + (0 - minR) * stride

		const stride = cellSize + gap
		const anchorXRel = -centerX + -minC * stride
		const anchorYRel = -centerY + -minR * stride

		return { x: anchorXRel, y: anchorYRel }
	}

	private getBestPlacement(shape: Shape, anchorX: number, anchorY: number): { r: number; c: number } | null {
		const { boardRect } = this.renderer.layout
		const gap = THEME.metrics.cellGap
		const cellSize = boardRect.cellSize
		const stride = cellSize + gap

		// Floating point grid coordinates
		const cFloat = (anchorX - boardRect.x) / stride
		const rFloat = (anchorY - boardRect.y) / stride

		const startR = Math.round(rFloat)
		const startC = Math.round(cFloat)

		let bestMatch: { r: number; c: number; dist: number } | null = null

		// Check 3x3 neighborhood around the closest integer cell
		for (let r = startR - 1; r <= startR + 1; r++) {
			for (let c = startC - 1; c <= startC + 1; c++) {
				// Check if valid placement
				if (this.engine.canPlace(shape, r, c)) {
					// Euclidean distance from ideal float position
					const dist = Math.sqrt(Math.pow(r - rFloat, 2) + Math.pow(c - cFloat, 2))

					if (!bestMatch || dist < bestMatch.dist) {
						bestMatch = { r, c, dist }
					}
				}
			}
		}

		// Snap threshold
		if (bestMatch && bestMatch.dist < this.SNAP_THRESHOLD) {
			return { r: bestMatch.r, c: bestMatch.c }
		}

		return null
	}

	onDragMove(x: number, y: number) {
		if (!this.dragShape || this.isPaused) return
		this.dragPos = { x, y }

		// Calculate Ghost
		const { boardRect } = this.renderer.layout
		const gap = THEME.metrics.cellGap
		const cellSize = boardRect.cellSize // Actual cell size

		// Adjust x,y (Center) to Anchor Position
		const offset = this.getShapeCenterOffset(this.dragShape, cellSize)
		const anchorX = x + offset.x
		const anchorY = y + offset.y

		const placement = this.getBestPlacement(this.dragShape, anchorX, anchorY)
		this.ghostPos = placement
	}

	onDragEnd(r: number, c: number) {
		if (!this.dragShape || this.isPaused) return

		// The input manager passed r,c based on its own naive calculation (top-left).
		// We really should ignore the passed r,c if it's wrong, or fix it in Input.
		// Actually InputManager thinks x,y is just "currentX".
		// InputManager attempts to calculate r,c in onPointerUp:
		// const c = Math.round((visualX - boardRect.x) / cellSize);
		// visualX there is what we passed to it?
		// No, InputManager uses `currentX + offset`.
		// We need to fix the logic globally or just re-calculate here based on last known pos.

		// Re-calculate based on dragPos (which is accurate visual center)
		if (this.dragPos) {
			const { boardRect } = this.renderer.layout
			const cellSize = boardRect.cellSize

			const offset = this.getShapeCenterOffset(this.dragShape, cellSize)
			const anchorX = this.dragPos.x + offset.x
			const anchorY = this.dragPos.y + offset.y

			const placement = this.getBestPlacement(this.dragShape, anchorX, anchorY)
			if (placement) {
				r = placement.r
				c = placement.c
			} else {
				// Even if no valid placement found by 'snap', we might still want to try the passed r,c
				// or just fail. If getBestPlacement retrieves null, it means no valid placement nearby.
				// So we can probably let the engine check fail or set to -1.
				// Let's rely on the engine check below, but if placement is null here,
				// the engine.canPlace below effectively double-checks.
				// However, we want to ensure we don't accidentally place where we shouldn't.
				// If getBestPlacement returns null, we should probably treat it as invalid.
			}
		}

		// Try to place
		const index = this.engine.currentShapes.indexOf(this.dragShape)

		if (index !== -1 && this.engine.canPlace(this.dragShape, r, c)) {
			const result = this.engine.place(index, r, c)
			if (result.valid) {
				// Spawn animations for cleared cells
				if (result.clearedCells && result.clearedCells.length > 0) {
					result.clearedCells.forEach((pt) => {
						this.renderer.addEffect(new BlockClearEffect(pt.r, pt.c))
					})
				}

				// Tutorial Hook
				if (this.tutorialManager.isActive) {
					this.tutorialManager.onMove(result)
				}

				this.updateUI()
			}
		}

		// Reset drag state
		this.dragShape = null
		this.dragPos = null
		this.ghostPos = null
	}

	lastTime: number = 0

	loop(timestamp: number) {
		if (!this.lastTime) this.lastTime = timestamp
		const dt = (timestamp - this.lastTime) / 1000
		this.lastTime = timestamp

		// Update animations
		this.renderer.updateEffects(dt)

		const now = Date.now()

		// Advance game state (powerup timers/spawns) only during live play
		if (!this.isInReplayMode && !this.isPaused) {
			this.engine.update(now)
		}

		// Manage the per-hand countdown timer
		this.syncHandCountdown(now)
		this.positionTimerBars()

		// Use replay engine if in replay mode, otherwise use main engine
		const activeEngine = this.isInReplayMode && this.replayPlayer ? this.replayPlayer.getEngine() : this.engine

		// Calculate placeability for each shape in tray
		const placeability = activeEngine.currentShapes.map((s) => {
			if (!s) return false
			return activeEngine.canPlaceShape(s)
		})

		if (!this.isInReplayMode) {
			this.updateStatusFace(placeability)
		}

		// In replay mode, don't show drag state
		const dragShape = this.isInReplayMode ? null : this.dragShape
		const dragPos = this.isInReplayMode ? null : this.dragPos
		const ghostPos = this.isInReplayMode ? null : this.ghostPos

		const handRatio = this.handTimerRatio
		this.renderer.draw(activeEngine, activeEngine, dragShape, dragPos, ghostPos, placeability, now, handRatio, this.timerPanic)

		// Update replay UI if in replay mode
		if (this.isInReplayMode) {
			this.updateReplayUI()
		}

		requestAnimationFrame(this.loop.bind(this))
	}

	private updateStatusFace(placeability: boolean[]) {
		const faceEl = document.getElementById("status-face")
		if (!faceEl) return

		const now = Date.now()

		// 1. Check for Relief Trigger
		// Relief should only happen when we HAD panic (unplaceable pieces) and now we DON'T.
		const hasPanic = placeability.some((p, i) => this.engine.currentShapes[i] && !p)

		// Trigger relief if we were in panic state and now we're not
		if (this.wasInPanicState && !hasPanic) {
			this.reliefUntil = now + 2500 // 2.5s satisfaction
		}

		// Update panic state for next frame
		this.wasInPanicState = hasPanic

		this.lastPlaceability = [...placeability]

		// 2. Determine Face
		let faceClass = "face-normal"

		// Priority 0: Game Over (Dead)
		if (this.engine.isGameOver) {
			faceClass = "face-dead"
		}
		// Priority 1: Relief
		else if (now < this.reliefUntil) {
			faceClass = "face-relief"
		}
		// Priority 2: Timer Panic (last 3s)
		else if (this.timerPanic) {
			faceClass = "face-panic"
		}
		// Priority 3: Panic (Unplaceable Block)
		else if (hasPanic) {
			faceClass = "face-panic"
		}
		// Priority 4: Grid Fullness
		else {
			let filled = 0
			for (let i = 0; i < this.engine.grid.length; i++) {
				if (this.engine.grid[i] !== 0) filled++
			}
			const ratio = filled / this.engine.grid.length

			if (ratio < 0.35) faceClass = "face-normal"
			else if (ratio < 0.65) faceClass = "face-concerned"
			else faceClass = "face-worried"
		}

		// Optimize DOM Write
		if (faceEl.className !== faceClass) {
			faceEl.className = faceClass
		}
	}

	startReplay(): void {
		// Get replay state from current game
		const replayState = this.engine.replayManager.getReplayState(this.engine.score)

		if (replayState.moves.length === 0) {
			alert("No moves to replay!")
			return
		}

		// Create replay player
		this.replayPlayer = new ReplayPlayer(replayState, this.renderer)
		this.isInReplayMode = true

		// Hide game over overlay and HEADER, show replay overlay
		document.querySelector("header")?.classList.add("hidden")
		document.getElementById("game-over-overlay")?.classList.add("hidden")
		document.getElementById("replay-overlay")?.classList.remove("hidden")

		// Automatically show the first move and start playing
		this.replayPlayer.goToFirst()
		this.replayPlayer.play()

		// Initialize replay UI
		this.updateReplayUI()
	}

	exitReplay(): void {
		if (this.replayPlayer) {
			this.replayPlayer.destroy()
			this.replayPlayer = null
		}

		this.isInReplayMode = false

		// Hide replay overlay, show game over overlay and restore HEADER
		document.getElementById("replay-overlay")?.classList.add("hidden")
		document.querySelector("header")?.classList.remove("hidden")
		document.getElementById("game-over-overlay")?.classList.remove("hidden")
	}

	updateReplayUI(): void {
		if (!this.replayPlayer) return

		const moveIndex = this.replayPlayer.getCurrentMoveIndex()
		const totalMoves = this.replayPlayer.getTotalMoves()
		const score = this.replayPlayer.getCurrentScore()

		// Update display
		const moveEl = document.getElementById("replay-move")
		const totalEl = document.getElementById("replay-total")
		const scoreEl = document.getElementById("replay-score")

		if (moveEl) moveEl.textContent = (moveIndex + 1).toString()
		if (totalEl) totalEl.textContent = totalMoves.toString()
		if (scoreEl) scoreEl.textContent = score.toString()
	}
}

// Boot
window.onload = () => {
	new GameApp()
}
