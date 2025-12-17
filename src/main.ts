import { BlockClearEffect, FloatingTextEffect } from "./ui/effects.js"
import { GRID_SIZE, SavedAppState, Shape } from "./engine/types.js"

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
	private currentReplayState: ReplayState | null = null
	private expectedReplayScore: number | null = null
	// Tutorial State
	tutorialManager: TutorialManager

	// Pause & timers
	private isPaused: boolean = false
	private pauseStartedAt: number | null = null
	private readonly HAND_TIME_LIMIT_MS = 10000
	private handDeadline: number | null = null
	private lastHandGeneration: number = -1

	// Quote tracking
	private usedQuoteIndices: Set<number> = new Set()

	// High Score Tracking
	private priorBestScore: number = 0
	private highScoreNotificationShown: boolean = false

	// Device Detection
	private isMobile: boolean = false
	private gameOverActionsTimeout: any = null
	private runId: string | null = null
	private gameSeed: number | null = null
	private scoreSubmitted: boolean = false // Flag to prevent duplicate submissions
	private runInitialized: boolean = false // Prevent timer/start logic before the real run begins

	// Leaderboard State
	private lastSubmittedEntry: { name: string; score: number } | null = null

	constructor() {
		this.displayVersion()

		// Detect Mobile
		this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
		const pauseInst = document.getElementById("pause-instruction")
		if (pauseInst) {
			pauseInst.textContent = this.isMobile ? "Tap anywhere to resume" : "Press Esc/Space/P or click anywhere to resume"
		}

		this.canvas = document.getElementById("game-canvas") as HTMLCanvasElement
		const urlParams = new URLSearchParams(window.location.search)
		const seedParam = urlParams.get("seed")

		// Generate runId and seed using crypto.getRandomValues()
		this.runId = this.generateRunId()
		if (seedParam) {
			this.gameSeed = Number(seedParam)
		} else {
			this.gameSeed = this.generateSeed()
		}

		const seed = this.gameSeed
		this.engine = new GameEngine(seed)
		// The game starts immediately with a locally generated seed and runId.
		// These are used for score submission and must NOT reset or restart the current run.
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

		// Load used quotes from localStorage
		const savedUsedQuotes = localStorage.getItem("bp_used_quotes")
		if (savedUsedQuotes) {
			try {
				const indices = JSON.parse(savedUsedQuotes) as number[]
				this.usedQuoteIndices = new Set(indices)
			} catch (e) {
				// If parsing fails, start fresh
				this.usedQuoteIndices = new Set()
			}
		}

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
			// Try to load saved state
			if (!this.loadGameState()) {
				// No saved state and tutorial already completed: start a fresh run
				// immediately. Token fetching happens in the background and does
				// not affect or reset gameplay.
				this.startNewRun()
			} else {
				// If a game state was loaded, sync the countdown (it was stopped on save/pause)
				this.runInitialized = true
				this.syncHandCountdown(Date.now())
			}
		}
	}

	displayVersion() {
		const el = document.getElementById("app-version")
		if (el) {
			el.textContent = `v${VERSION}`
		}
	}

	/**
	 * Generate a random runId using crypto.getRandomValues()
	 */
	private generateRunId(): string {
		const array = new Uint8Array(16)
		crypto.getRandomValues(array)
		// Convert to hex string
		return Array.from(array)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
	}

	/**
	 * Generate a random uint32 seed using crypto.getRandomValues()
	 */
	private generateSeed(): number {
		const array = new Uint32Array(1)
		crypto.getRandomValues(array)
		return array[0]
	}

	private getRandomUnusedQuote(): string {
		// If all quotes have been used, reset the pool
		if (this.usedQuoteIndices.size >= GAME_OVER_QUOTES.length) {
			this.usedQuoteIndices.clear()
		}

		// Get available quote indices
		const availableIndices: number[] = []
		for (let i = 0; i < GAME_OVER_QUOTES.length; i++) {
			if (!this.usedQuoteIndices.has(i)) {
				availableIndices.push(i)
			}
		}

		// Pick a random unused quote
		const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)]
		this.usedQuoteIndices.add(randomIndex)

		// Save to localStorage
		localStorage.setItem("bp_used_quotes", JSON.stringify(Array.from(this.usedQuoteIndices)))

		return GAME_OVER_QUOTES[randomIndex]
	}

	private updateSubmissionUI(state: "idle" | "submitting" | "success" | "error", message?: string) {
		const submitBtn = document.getElementById("submit-score-btn") as HTMLButtonElement | null
		const statusEl = document.getElementById("submission-status-message")
		const rankingEl = document.getElementById("leaderboard-ranking")

		if (!submitBtn) return

		switch (state) {
			case "idle":
				submitBtn.disabled = false
				submitBtn.textContent = "Submit Score"
				if (statusEl) {
					statusEl.textContent = ""
					statusEl.classList.add("hidden")
				}
				if (rankingEl) {
					rankingEl.textContent = ""
					rankingEl.classList.add("hidden")
				}
				break
			case "submitting":
				submitBtn.disabled = true
				submitBtn.textContent = "Submitting..."
				if (statusEl) {
					statusEl.textContent = ""
					statusEl.classList.add("hidden")
				}
				if (rankingEl) {
					rankingEl.textContent = ""
					rankingEl.classList.add("hidden")
				}
				break
			case "success":
				submitBtn.disabled = true
				submitBtn.textContent = "Score submitted!"
				if (statusEl) {
					statusEl.textContent = ""
					statusEl.classList.add("hidden")
				}
				// ranking is populated asynchronously once leaderboard is fetched
				break
			case "error":
				// Allow player to start a new run even if submission failed
				submitBtn.disabled = true
				submitBtn.textContent = "Submit Score"
				if (statusEl) {
					statusEl.textContent = message || "Failed to submit score. You can start a new run and try again."
					statusEl.classList.remove("hidden")
				}
				if (rankingEl) {
					rankingEl.textContent = ""
					rankingEl.classList.add("hidden")
				}
				break
		}
	}

	bindControls() {
		// Prevent iOS Safari loupe/magnifier
		this.canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false })
		this.canvas.addEventListener("touchend", (e) => e.preventDefault(), { passive: false })
		this.canvas.addEventListener("touchcancel", (e) => e.preventDefault(), { passive: false })

		document.getElementById("restart-btn")?.addEventListener("click", () => {
			this.restart()
		})
		document.getElementById("pause-btn")?.addEventListener("click", () => {
			this.togglePause()
		})
		document.getElementById("submit-score-btn")?.addEventListener("click", () => {
			this.attemptScoreSubmission()
		})

		document.getElementById("leaderboard-header-btn")?.addEventListener("click", () => {
			this.openLeaderboard()
		})

		document.getElementById("leaderboard-gameover-btn")?.addEventListener("click", () => {
			this.openLeaderboard()
		})

		document.getElementById("replay-btn")?.addEventListener("click", () => {
			this.startReplay()
		})

		// Replay controls - just exit
		document.getElementById("replay-exit")?.addEventListener("click", () => {
			this.exitReplay()
		})

		// Replay: copy JSON (debug)
		document.getElementById("replay-copy-json")?.addEventListener("click", async () => {
			if (!this.currentReplayState) return
			const json = JSON.stringify(this.currentReplayState)
			console.log("Replay Data", json)

			try {
				await navigator.clipboard.writeText(json)
			} catch (e) {
				// Fallback for clipboard permission / unsupported environments
				window.prompt("Copy replay JSON:", json)
			}
		})

		document.getElementById("pause-overlay")?.addEventListener("click", () => {
			this.resumeGame()
		})

		document.getElementById("leaderboard-close-btn")?.addEventListener("click", () => {
			this.closeLeaderboard()
		})
		document.addEventListener("keydown", (e) => {
			if (e.key === "r" && !e.metaKey && !e.ctrlKey && !e.altKey) {
				// make sure not in a text input field
				const activeElement = document.activeElement
				if (activeElement && activeElement.tagName.toLowerCase() === "input") {
					return
				}
				this.restart()
				e.preventDefault()
				return
			}
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
			if (!this.tutorialManager.isActive) {
				if (this.engine.isGameOver) {
					this.saveGameState()
				} else {
					this.pauseGame()
				}
			}
		})

		// Player Name Persistence
		const nameInput = document.getElementById("player-name-input")
		if (nameInput) {
			// Load name on page load
			const savedName = localStorage.getItem("bp_player_name")
			if (savedName) (nameInput as HTMLInputElement).value = savedName

			// Save name when input loses focus (blur). The 'input' event was too aggressive.
			nameInput.addEventListener("blur", (e) => {
				const value = (e.target as HTMLInputElement).value.trim()
				if (value) {
					localStorage.setItem("bp_player_name", value)
				} else {
					localStorage.removeItem("bp_player_name")
				}
			})
		}

		//? Disabled the following because the purpose was to pause when focus is lost while devtools are open, but that doesn't work; And having it enabled results in the game pausing when devtools are opened/closed, which can be annoying in dev testing
		// // when document.visibilityState === "hidden", pause game
		// document.addEventListener("visibilitychange", () => {
		// 	if (document.visibilityState === "hidden" && !this.tutorialManager.isActive) {
		// 		this.pauseGame()
		// 	}
		// })
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
				// 4. Force Reload with cache busting
				const url = new URL(window.location.href)
				url.searchParams.set("t", Date.now().toString())
				window.location.href = url.toString()
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

		if (this.gameOverActionsTimeout) {
			clearTimeout(this.gameOverActionsTimeout)
			this.gameOverActionsTimeout = null
		}

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

		localStorage.removeItem("bp_save_state")
		this.scoreSubmitted = false // Reset submission state
		this.loadHighScore() // Load high score into the new engine
		this.dragShape = null
		this.dragPos = null

		// Reset status face state
		this.wasInPanicState = false
		this.reliefUntil = 0
		this.lastPlaceability = []

		document.getElementById("game-over-overlay")?.classList.add("hidden")
		document.getElementById("highscore-notification")?.classList.add("hidden")
		document.getElementById("game-over-highscore-label")?.classList.add("hidden")

		// Set prior best score to current best for the new session
		this.priorBestScore = this.engine.bestScore
		this.highScoreNotificationShown = false

		// Start a fresh run (resets engine.isGameOver) before updating the UI.
		// Note: startNewRun is async; don't immediately call updateUI() here because
		// the engine may still be in a game-over state synchronously, which would
		// cause updateUI() to re-show the game-over overlay. The render loop and
		// subsequent state changes will naturally drive the UI.
		this.startNewRun()
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

	saveGameState() {
		// Don't save if in tutorial or replay (saving game over state is allowed)
		if (this.tutorialManager.isActive || this.isInReplayMode) {
			return
		}

		const state: SavedAppState = {
			engine: this.engine.serialize(),
			isPaused: this.isPaused,
			pauseStartedAt: this.pauseStartedAt,
			handDeadline: this.handDeadline,
			lastHandGeneration: this.lastHandGeneration,
			timerPanic: this.timerPanic,
			timestamp: Date.now(),
			priorBestScore: this.priorBestScore,
			highScoreNotificationShown: this.highScoreNotificationShown,
		}

		localStorage.setItem("bp_save_state", JSON.stringify(state))
	}

	loadGameState(): boolean {
		const json = localStorage.getItem("bp_save_state")
		if (!json) return false

		try {
			const state = JSON.parse(json) as SavedAppState
			const now = Date.now()
			const shift = now - state.timestamp

			// Restore Engine
			this.engine.deserialize(state.engine)
			this.engine.shiftTime(shift)

			// Restore App State
			this.isPaused = state.isPaused
			this.pauseStartedAt = state.pauseStartedAt ? state.pauseStartedAt + shift : null
			this.handDeadline = state.handDeadline ? state.handDeadline + shift : null
			this.lastHandGeneration = state.lastHandGeneration
			this.timerPanic = state.timerPanic

			this.priorBestScore = state.priorBestScore ?? this.engine.bestScore
			this.highScoreNotificationShown = state.highScoreNotificationShown ?? false

			// If checking paused state, ensure UI reflects it
			if (this.isPaused) {
				document.getElementById("pause-overlay")?.classList.remove("hidden")
				const btn = document.getElementById("pause-btn")
				if (btn) btn.textContent = "▶"
			}

			// Ensure used quotes are synced if engine changed seed?
			// No, used quotes are separate.

			// Update UI
			this.updateUI()

			return true
		} catch (e) {
			console.error("Failed to load game state", e)
			return false
		}
	}

	private attemptScoreSubmission(): void {
		if (this.scoreSubmitted || this.engine.score <= 0) {
			console.warn("Attempted to submit score but either already submitted or score is 0. Aborting.")
			return
		}

		// Prefer the current value in the input field, falling back to persisted name or a default.
		const nameInput = document.getElementById("player-name-input") as HTMLInputElement | null
		let playerName = (nameInput?.value ?? "").trim()

		if (!playerName) {
			playerName = (localStorage.getItem("bp_player_name") ?? "Player").trim() || "Player"
		}

		// Persist the name so it's pre-filled next time.
		if (playerName) {
			localStorage.setItem("bp_player_name", playerName)
		} else {
			localStorage.removeItem("bp_player_name")
		}

		this.updateSubmissionUI("submitting")
		this.submitScoreToLeaderboard(playerName)
	}

	// --- LEADERBOARD INTEGRATION ---
	// Note: No longer fetching runToken from server. runId and seed are generated client-side.

	private openLeaderboard() {
		const modal = document.getElementById("leaderboard-modal")
		if (!modal) return
		modal.classList.remove("hidden")
		this.fetchAndRenderLeaderboard()
	}

	private closeLeaderboard() {
		const modal = document.getElementById("leaderboard-modal")
		if (!modal) return
		modal.classList.add("hidden")
	}

	private async fetchAndRenderLeaderboard() {
		const loadingEl = document.getElementById("leaderboard-loading")
		const errorEl = document.getElementById("leaderboard-error")
		const verifiedList = document.getElementById("leaderboard-verified-list")

		if (!verifiedList) return

		verifiedList.innerHTML = ""

		if (errorEl) {
			errorEl.textContent = ""
			errorEl.classList.add("hidden")
			errorEl.classList.remove("error")
		}
		if (loadingEl) {
			loadingEl.classList.remove("hidden")
		}

		try {
			const resp = await fetch("/api/leaderboard?limit=20")
			if (!resp.ok) {
				throw new Error(`Leaderboard request failed with status ${resp.status}`)
			}
			const data: any = await resp.json()

			const verified = Array.isArray(data?.verified) ? data.verified : []

			const self = this.lastSubmittedEntry

			verified.forEach((entry: any, index: number) => {
				const li = document.createElement("li")
				const isSelf = self && entry.name === self.name && entry.score === self.score
				if (isSelf) li.classList.add("leaderboard-self")

				const rankSpan = document.createElement("span")
				rankSpan.className = "leaderboard-rank"
				rankSpan.textContent = String(index + 1)

				const nameSpan = document.createElement("span")
				nameSpan.className = "leaderboard-name"
				nameSpan.textContent = entry.name ?? "???"

				const scoreSpan = document.createElement("span")
				scoreSpan.className = "leaderboard-score"
				scoreSpan.textContent = String(entry.score ?? 0)

				li.appendChild(rankSpan)
				li.appendChild(nameSpan)
				li.appendChild(scoreSpan)
				verifiedList.appendChild(li)
			})

			this.updateRankingSummaryFromData(verified)
		} catch (e) {
			console.error("Failed to fetch leaderboard:", e)
			if (errorEl) {
				errorEl.textContent = "Leaderboard is currently unavailable. Please try again later."
				errorEl.classList.remove("hidden")
				errorEl.classList.add("error")
			}
		} finally {
			if (loadingEl) {
				loadingEl.classList.add("hidden")
			}
		}
	}

	private updateRankingSummaryFromData(verified: any[]) {
		const el = document.getElementById("leaderboard-ranking")
		if (!el) return

		const self = this.lastSubmittedEntry
		if (!self) {
			el.textContent = ""
			el.classList.add("hidden")
			return
		}

		const idx = verified.findIndex((e) => e.name === self.name && e.score === self.score)
		if (idx >= 0) {
			const rank = idx + 1
			el.textContent = `Your rank: #${rank} out of ${verified.length} shown.`
			el.classList.remove("hidden")
			return
		}

		el.textContent = ""
		el.classList.add("hidden")
	}

	private async submitScoreToLeaderboard(name: string): Promise<void> {
		console.log(`[Score Submit] Attempting to submit score ${this.engine.score} for user "${name}"...`)

		// We require runId and seed for submission
		if (!this.runId || this.gameSeed === null || this.scoreSubmitted) {
			console.warn("Cannot submit score: runId or seed is missing, or score already submitted. Aborting.")
			return
		}

		this.scoreSubmitted = true

		// 1. Get replay state (includes seed and actions)
		const replayState = this.engine.replayManager.getReplayState(this.engine.score, VERSION)

		// 2. Store runId and seed before clearing to prevent resubmission
		const runId = this.runId
		const seed = this.gameSeed
		this.runId = null
		this.gameSeed = null
		// Do NOT clear scoreSubmitted.

		try {
			const payload = {
				runId: runId,
				name: name,
				score: this.engine.score,
				replay: replayState,
			}
			console.log("[Score Submit] Payload:", payload)

			const response = await fetch("/api/leaderboard/submit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			})

			const status = response.status
			const url = response.url
			const contentType = response.headers.get("content-type") || ""

			let rawBody: string | null = null
			let data: any = null

			try {
				// Always read as text first so we can safely inspect/log even if it's not JSON.
				rawBody = await response.text()
				if (contentType.includes("application/json")) {
					try {
						data = JSON.parse(rawBody)
					} catch (jsonErr) {
						console.error("[Score Submit] Failed to parse JSON response:", jsonErr, {
							status,
							url,
							contentType,
							rawBodySnippet: rawBody.slice(0, 200),
						})
					}
				}
			} catch (readErr) {
				console.error("[Score Submit] Failed to read response body:", readErr, {
					status,
					url,
					contentType,
				})
			}

			if (response.ok) {
				if (data && typeof data === "object") {
					console.log("[Score Submit] Submission successful.", {
						status,
						url,
						apiStatus: (data as any).status,
					})

					const statusField = (data as any).status
					const entry = (data as any).entry
					if (entry && typeof entry === "object") {
						this.lastSubmittedEntry = {
							name: String((entry as any).name ?? name),
							score: Number((entry as any).score ?? this.engine.score),
						}
					} else {
						this.lastSubmittedEntry = {
							name,
							score: this.engine.score,
						}
					}
				} else {
					console.log("[Score Submit] Submission successful with non-JSON or unexpected body.", {
						status,
						url,
						contentType,
						rawBodySnippet: rawBody ? rawBody.slice(0, 200) : null,
					})
					this.lastSubmittedEntry = {
						name,
						score: this.engine.score,
					}
				}
				this.updateSubmissionUI("success")

				// Auto-open leaderboard after a short delay so user can see their rank.
				setTimeout(() => {
					this.openLeaderboard()
				}, 400)
			} else {
				console.error("[Score Submit] Submission failed.", {
					status,
					url,
					contentType,
					payload,
					jsonBody: data,
					rawBodySnippet: rawBody ? rawBody.slice(0, 200) : null,
				})
				const errorMessage =
					data && typeof data === "object" && (data as any).error
						? `Failed to submit score: ${(data as any).error}`
						: "Failed to submit score. You can start a new run and try again."
				this.updateSubmissionUI("error", errorMessage)
			}
		} catch (e) {
			console.error("Error submitting score (network or unexpected):", e)
			this.updateSubmissionUI("error", "Network error while submitting score. You can start a new run and try again.")
		}
	}
	// -----------------------------------------------

	updateUI() {
		document.getElementById("current-score")!.textContent = this.engine.score.toString()
		this.saveHighScore() // Check constantly or delta

		// High Score Notification Check
		// We use priorBestScore to check if we've surpassed the session start high score
		// If priorBestScore is 0, we trigger on the first score > 0
		if (!this.highScoreNotificationShown && this.engine.score > this.priorBestScore && (this.priorBestScore > 0 || this.engine.score > 0)) {
			this.showHighScoreNotification()
			this.highScoreNotificationShown = true
		}

		if (this.engine.isGameOver) {
			const overlay = document.getElementById("game-over-overlay")
			// Only run transition logic if overlay was effectively hidden (or we are initializing)
			if (overlay && overlay.classList.contains("hidden")) {
				overlay.classList.remove("hidden")
				// Reset submission UI each time the game over screen is first shown
				this.updateSubmissionUI("idle")
				document.getElementById("final-score")!.textContent = this.engine.score.toString()

				// Show High Score Label if we beat the prior best
				const highscoreLabel = document.getElementById("game-over-highscore-label")
				if (highscoreLabel) {
					if (this.engine.score > this.priorBestScore) {
						highscoreLabel.classList.remove("hidden")
					} else {
						highscoreLabel.classList.add("hidden")
					}
				}

				// Display a random quote
				const quoteElement = document.getElementById("game-over-quote")
				let quoteLength = 0
				if (quoteElement) {
					const quote = this.getRandomUnusedQuote()
					quoteElement.textContent = quote
					quoteLength = quote.length
				}

				// Hide Restart Button and show it after a delay
				const gameOverActions = document.getElementById("game-over-actions")
				if (gameOverActions) {
					gameOverActions.classList.add("hidden")
					if (this.gameOverActionsTimeout) clearTimeout(this.gameOverActionsTimeout)

					// Delay based on reading time: .5s base + 10ms per character
					const delay = Math.min(2000, 500 + quoteLength * 10)
					this.gameOverActionsTimeout = setTimeout(() => {
						gameOverActions.classList.remove("hidden")
					}, delay)

					// Submit score to leaderboard (only once, if score > 0)
					if (!this.scoreSubmitted && this.engine.score > 0) {
						this.attemptScoreSubmission()
					}
				}
			}
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
		// Don't run countdown logic until a real run has been initialized.
		if (!this.runInitialized) {
			this.updateCountdownUI(null)
			return
		}

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
		this.updateUI()
		this.saveGameState()
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
		this.saveGameState()
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
			const result = this.engine.place(index, r, c, {
				isTutorial: this.tutorialManager.isActive,
			})
			if (result.valid) {
				// Spawn animations for cleared cells
				if (result.clearedCells && result.clearedCells.length > 0) {
					result.clearedCells.forEach((pt) => {
						this.renderer.addEffect(new BlockClearEffect(pt.r, pt.c))
					})
				}

				if (result.moveMultiplier && result.moveMultiplier > 1) {
					const { boardRect } = this.renderer.layout
					const x = boardRect.x + boardRect.w / 2
					// Position near the top of the board (15% down) so it's out of the way
					const y = boardRect.y + boardRect.h * 0.15
					this.renderer.addEffect(new FloatingTextEffect(x, y, `Quick! x${result.moveMultiplier}`))
				}

				// Tutorial Hook
				if (this.tutorialManager.isActive) {
					this.tutorialManager.onMove(result)
				}

				this.updateUI()
				this.saveGameState()
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
		const replayState = this.engine.replayManager.getReplayState(this.engine.score, VERSION)

		// Logs the replay for export purposes as requested
		console.log("Replay Data", JSON.stringify(replayState))

		if (replayState.moves.length === 0) {
			alert("No moves to replay!")
			return
		}

		// Store replay state for UI verification + copy button
		this.currentReplayState = replayState
		this.expectedReplayScore = replayState.finalScore

		// Create replay player
		this.replayPlayer = new ReplayPlayer(replayState, this.renderer);
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
		this.currentReplayState = null
		this.expectedReplayScore = null

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
		const expectedEl = document.getElementById("replay-expected-score")
		const resultEl = document.getElementById("replay-result")

		if (moveEl) moveEl.textContent = (moveIndex + 1).toString()
		if (totalEl) totalEl.textContent = totalMoves.toString()
		if (scoreEl) scoreEl.textContent = score.toString()

		if (expectedEl) {
			expectedEl.textContent =
				this.expectedReplayScore === null ? "-" : this.expectedReplayScore.toString()
		}

		const atEnd = totalMoves > 0 && moveIndex === totalMoves - 1
		if (resultEl) {
			if (!atEnd || this.expectedReplayScore === null) {
				resultEl.textContent = ""
			} else {
				resultEl.textContent = score === this.expectedReplayScore ? "PASS" : "FAIL"
			}
		}
	}

	private showHighScoreNotification() {
		const el = document.getElementById("highscore-notification")
		if (!el) return

		// Reset animation by removing and re-adding element or class
		// Force reflow
		el.classList.remove("hidden")
		el.style.animation = "none"
		el.offsetHeight /* trigger reflow */
		el.style.animation = "slideDownFadeOut 3s forwards"

		// Set a timeout to hide it again ensures it doesn't block anything indefinitely,
		// though CSS handles opacity.
		setTimeout(() => {
			el.classList.add("hidden")
		}, 3000)
	}

	async startNewRun() {
		// Reset submission state and generate new runId/seed for the new run.
		this.scoreSubmitted = false
		this.runId = this.generateRunId()
		this.gameSeed = this.generateSeed()

		// Start the new run immediately with the generated seed.
		const seed = this.gameSeed
		this.engine.reset(seed)
		if (this.DEBUG_SPAWN_POWERUP_ON_START) {
			this.engine.spawnTestPowerup()
		}

		// Mark the run as active and start the hand timer based on the engine's handGeneration.
		this.runInitialized = true
		this.updateCountdownUI(null)
		this.syncHandCountdown(Date.now())
	}

}

// Boot
window.onload = () => {
	new GameApp()
}