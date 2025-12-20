import { BlockClearEffect, FloatingTextEffect } from "./ui/effects"
import { GRID_SIZE, SavedAppState, Shape } from "./engine/types"

import { GameEngine } from "./engine/logic"
import { GameRenderer } from "./ui/renderer"
import { InputManager } from "./ui/input"
import { Modal } from "./ui/modal"
import { PowerupType } from "./engine/powerups"
import { THEME } from "./ui/theme"
import { TutorialManager } from "./ui/tutorial"
import { VERSION } from "./version"
import { inject } from "@vercel/analytics"

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
	"Did you get the yogurt effect™?",
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
	hoveredShapeIndex: number | null = null

	// Debug/testing flags
	private readonly DEBUG_SPAWN_POWERUP_ON_START = false
	private readonly DEBUG_ENABLE_POWERUP_KEYS = import.meta.env.DEV

	// Snap settings
	private readonly SNAP_THRESHOLD = 3

	// Status Face State
	private lastPlaceability: boolean[] = []
	private reliefUntil: number = 0
	private wasInPanicState: boolean = false
	private timerPanic: boolean = false
	private handTimerRatio: number | null = null
	private firstBlockPlaced: boolean = false
	private chillMode: boolean = false

	// Tutorial State
	tutorialManager: TutorialManager

	// Pause & timers
	private isPaused: boolean = false
	private pauseStartedAt: number | null = null
	private lastPlacementX: number | null = null
	private lastPlacementY: number | null = null
	private isAutoSelecting: boolean = false
	private viewCursorPos: { x: number; y: number } = { x: 0, y: 0 }
	private getHandTimeLimit(): number {
		// Start at 12s, decrease by 100ms per hand, min 8s
		return Math.max(8000, 12000 - (this.engine.handGeneration - 1) * 100)
	}
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
	private gameSeed: number | null = null
	private runId: string | null = null
	private scoreSubmitted: boolean = false // Flag to prevent duplicate submissions
	private runInitialized: boolean = false // Prevent timer/start logic before the real run begins

	// Player Name UI elements
	private playerNameInput: HTMLInputElement | null = null
	private playerNameSubmissionContainer: HTMLDivElement | null = null
	private playerNameMissingContainer: HTMLDivElement | null = null
	private seeLeaderboardLink: HTMLAnchorElement | null = null
	private playerNameDisplay: HTMLDivElement | null = null
	private displayPlayerNameSpan: HTMLSpanElement | null = null
	private submitNameBtn: HTMLButtonElement | null = null
	private playerSuggestionsContainer: HTMLDivElement | null = null
	private playerSuggestionsList: HTMLDivElement | null = null

	// Leaderboard State
	private lastSubmittedEntry: { name: string; score: number } | null = null
	private contextualLeaderboardData: any = null

	// Public IP for consistent identification (especially IPv6)
	private clientPublicIp: string | null = null

	// Player suggestions cache
	private cachedPlayerSuggestions: Array<{ id: string; name: string; best_score: number; chill_best_score: number }> | null = null
	private remoteBestScore: number = 0
	private remoteChillBestScore: number = 0

	// Modals
	private settingsModal!: Modal
	private leaderboardModal!: Modal
	private gameOverModal!: Modal
	private pauseModal!: Modal
	private gameOverRevealRequested: boolean = false

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

		// Get references to player name UI elements
		this.playerNameInput = document.getElementById("player-name-input") as HTMLInputElement
		this.playerNameSubmissionContainer = document.getElementById("player-name-submission-container") as HTMLDivElement
		this.playerNameMissingContainer = document.getElementById("player-name-missing-container") as HTMLDivElement
		this.seeLeaderboardLink = document.getElementById("see-leaderboard-link") as HTMLAnchorElement
		this.playerNameDisplay = document.getElementById("player-name-display") as HTMLDivElement
		this.displayPlayerNameSpan = document.getElementById("display-player-name") as HTMLSpanElement
		this.submitNameBtn = document.getElementById("submit-name-btn") as HTMLButtonElement
		this.playerSuggestionsContainer = document.getElementById("player-suggestions-container") as HTMLDivElement
		this.playerSuggestionsList = document.getElementById("player-suggestions-list") as HTMLDivElement

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
				// make sure not in a text input field
				const activeElement = document.activeElement
				if (activeElement && activeElement.tagName.toLowerCase() === "input") {
					return
				}
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
					case "k":
						this.endGame()
						break
					default:
						return
				}
				e.preventDefault()
			})
		}

		// Fetch public IP for robust identification (preferring IPv6)
		const fetchIp = async () => {
			try {
				// Try IPv6 specifically first
				let resp = await fetch("https://api6.ipify.org?format=json").catch(() => null)
				// Fallback to dual-stack
				if (!resp || !resp.ok) {
					resp = await fetch("https://api64.ipify.org?format=json")
				}
				const data = await resp.json()
				this.clientPublicIp = data.ip
				console.log("Public IP identified:", this.clientPublicIp)

				// NOW that we have the IP, perform the initial identity sync/check
				const name = localStorage.getItem("bp_player_name")
				if (name) {
					this.syncExistingPlayer()
				} else {
					this.fetchAndShowPlayerSuggestions(true) // true = fetchOnly
				}
			} catch (e) {
				console.warn("Failed to fetch public IP for identification fallback", e)
				// Production fallback: Try ID immediately if no name, even without public IP
				if (!localStorage.getItem("bp_player_name")) {
					this.fetchAndShowPlayerSuggestions(true) // true = fetchOnly
				}
			}
		}
		fetchIp()

		this.input = new InputManager(this.canvas, this.renderer, {
			onDragStart: this.onDragStart.bind(this),
			onDragMove: this.onDragMove.bind(this),
			onDragEnd: this.onDragEnd.bind(this),
			onPointerMove: this.onPointerMove.bind(this),
			getSnappedIndex: () => this.hoveredShapeIndex,
		})
		this.input.isMobile = this.isMobile

		this.loadHighScore()

		this.leaderboardModal = new Modal("leaderboard-modal", {
			onShow: () => this.pauseGame(),
			onClose: () => this.resumeGame(),
		})
		this.gameOverModal = new Modal("game-over-overlay", {
			closeOnOutsideClick: false,
			closeOnEsc: false,
		})
		this.pauseModal = new Modal("pause-overlay", {
			onShow: () => {
				this.isPaused = true
				this.pauseStartedAt = Date.now()
				// Clear any in-progress drag so resume is clean
				this.dragShape = null
				this.dragPos = null
				this.ghostPos = null
				const btn = document.getElementById("pause-btn")
				if (btn) btn.textContent = "▶"
				this.saveGameState()
			},
			onClose: () => {
				const now = Date.now()
				if (this.pauseStartedAt && this.handDeadline) {
					// Push deadline forward by the paused duration
					this.handDeadline += now - this.pauseStartedAt
				}
				this.isPaused = false
				this.pauseStartedAt = null
				const btn = document.getElementById("pause-btn")
				if (btn) btn.textContent = "⏸"
			},
		})

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
		this.renderer.draw(this.engine, this.engine, null, null, null, initialPlaceability, this.hoveredShapeIndex, Date.now(), this.handTimerRatio, this.timerPanic)
		this.positionTimerBars()

		// Start Tutorial if not completed
		if (!localStorage.getItem("bp_tutorial_completed")) {
			this.tutorialManager.start()
		} else if (!this.loadGameState()) {
			// No saved state and tutorial already completed: start a fresh run
			this.startNewRun()
		} else {
			// If a game state was loaded, sync the countdown (it was stopped on save/pause)
			this.runInitialized = true
			this.firstBlockPlaced = true
			// Check submission status for the loaded game state's runId
			if (this.runId && localStorage.getItem(`bp_submitted_run_${this.runId}`)) {
				this.scoreSubmitted = true
			}
			this.syncHandCountdown(Date.now())
		}

		this.updateUI()
		this.updatePlayerNameUI()
		// Initial sync is now handled inside the fetchIp() async block above to ensure IP is available first
	}

	private async syncExistingPlayer() {
		const playerName = localStorage.getItem("bp_player_name")
		if (!playerName || playerName.trim() === "") return

		try {
			// Use apiFetch to ensure dev IP is sent
			const resp = await this.apiFetch("/api/players/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: playerName.trim() }),
			})
			if (resp.ok) {
				const data = await resp.json()
				if (data.ok) {
					this.remoteBestScore = data.best_score || 0
					this.remoteChillBestScore = data.chill_best_score || 0
					console.log(`[syncExistingPlayer] Player successfully synced. Best: ${this.remoteBestScore}, Chill Best: ${this.remoteChillBestScore}`)
				}
			}
		} catch (e) {
			console.error("[syncExistingPlayer] Failed to sync player:", e)
		}
	}

	/**
	 * Wrapper for fetch that injects dev headers if needed
	 */
	private async apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		if (this.clientPublicIp) {
			init = init || {}
			const headers = new Headers(init.headers || {})
			headers.set("x-client-public-ip", this.clientPublicIp)
			init.headers = headers
			console.log(`[apiFetch] Request to ${input.toString()} with client IP: ${this.clientPublicIp}`)
		}
		return fetch(input, init)
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
		const statusEl = document.getElementById("submission-status-message")
		const rankingEl = document.getElementById("leaderboard-ranking")

		if (this.submitNameBtn) {
			this.submitNameBtn.disabled = state === "submitting"
		}

		const submissionContainer = document.getElementById("player-name-submission-container")

		switch (state) {
			case "idle":
				if (submissionContainer) submissionContainer.classList.remove("hidden")
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
				if (submissionContainer) submissionContainer.classList.add("hidden")
				if (statusEl) {
					statusEl.textContent = "Submitting score..."
					statusEl.classList.remove("hidden")
				}
				if (rankingEl) {
					rankingEl.textContent = ""
					rankingEl.classList.add("hidden")
				}
				break
			case "success":
				if (submissionContainer) submissionContainer.classList.add("hidden")
				if (statusEl) {
					statusEl.textContent = "Score submitted!"
					statusEl.classList.remove("hidden")
				}
				// ranking is populated asynchronously once leaderboard is fetched
				break
			case "error":
				if (submissionContainer) submissionContainer.classList.remove("hidden")
				if (statusEl) {
					statusEl.textContent = message || "Failed to submit score. You can try submitting again."
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

		this.seeLeaderboardLink?.addEventListener("click", (e) => {
			e.preventDefault()
			this.openLeaderboard()
		})

		// New event listener for player name input
		this.playerNameInput?.addEventListener("input", () => {
			if (this.playerNameInput) {
				const playerName = this.playerNameInput.value.trim()
				// Save player name to localStorage immediately
				localStorage.setItem("bp_player_name", playerName)
			}
		})

		const handleNameSubmission = () => {
			if (this.playerNameInput) {
				const playerName = this.playerNameInput.value.trim()
				if (playerName !== "" && this.engine.isGameOver && !this.scoreSubmitted) {
					this.playerNameMissingContainer?.classList.add("hidden")
					// Re-check PB and submit
					const contextPromise = this.fetchContextualLeaderboard(this.engine.score)
					this.checkPBAndSubmit(this.engine.score, playerName, contextPromise, true)
				}
			}
		}

		this.submitNameBtn?.addEventListener("click", () => {
			handleNameSubmission()
		})

		this.playerNameInput?.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				handleNameSubmission()
			}
		})

		document.getElementById("leaderboard-header-btn")?.addEventListener("click", () => {
			this.openLeaderboard()
		})

		document.getElementById("leaderboard-gameover-btn")?.addEventListener("click", () => {
			this.openLeaderboard()
		})

		document.getElementById("show-full-leaderboard-btn")?.addEventListener("click", () => {
			this.openLeaderboard()
		})

		document.getElementById("pause-overlay")?.addEventListener("click", () => {
			this.resumeGame()
		})

		document.getElementById("leaderboard-close-btn")?.addEventListener("click", () => {
			this.closeLeaderboard()
		})
		document.addEventListener("keydown", (e) => {
			// make sure not in a text input field
			const activeElement = document.activeElement
			if (activeElement && activeElement.tagName.toLowerCase() === "input") {
				return
			}
			if (e.key === "r" && !e.metaKey && !e.ctrlKey && !e.altKey) {
				this.restart()
				e.preventDefault()
				return
			}
			if (e.key === "Escape" || e.key === "p" || e.key === " ") {
				// Don't toggle pause if any modal is open
				if (this.settingsModal.isVisible() || this.leaderboardModal.isVisible() || this.gameOverModal.isVisible() || this.pauseModal.isVisible()) {
					return
				}
				e.preventDefault()
				this.togglePause()
			}
		})

		// pause on focus lost
		window.addEventListener("blur", () => {
			console.log("blur")
			if (!this.tutorialManager.isActive) {
				if (this.engine.isGameOver) {
					this.saveGameState()
				} else {
					this.pauseGame()
				}
			}
		})

		// when document.visibilityState === "hidden", pause game
		document.addEventListener("visibilitychange", () => {
			console.log("visibilitychange")
			if (document.visibilityState === "hidden" && !this.tutorialManager.isActive) {
				this.pauseGame()
			}
		})
	}

	initSettings() {
		const settingsBtn = document.getElementById("settings-btn")
		const closeBtn = document.getElementById("close-settings-btn")
		const slider = document.getElementById("sensitivity-slider") as HTMLInputElement
		const valDisplay = document.getElementById("sensitivity-value")
		const chillToggle = document.getElementById("chill-mode-toggle") as HTMLInputElement

		this.settingsModal = new Modal("settings-modal", {
			onShow: () => this.pauseGame(),
			onClose: () => this.resumeGame(),
		})

		// Load saved sensitivity
		const savedSens = localStorage.getItem("bp_sensitivity")
		const initialSens = savedSens ? parseFloat(savedSens) : 1.0

		// Apply
		this.input.sensitivity = initialSens
		if (slider) slider.value = initialSens.toString()
		if (valDisplay) valDisplay.textContent = initialSens.toFixed(1)

		// Load chill mode
		this.chillMode = localStorage.getItem("bp_chill_mode") === "true"
		if (chillToggle) {
			chillToggle.checked = this.chillMode
			chillToggle.addEventListener("change", (e) => {
				this.chillMode = (e.target as HTMLInputElement).checked
				localStorage.setItem("bp_chill_mode", this.chillMode.toString())
				this.engine.chillMode = this.chillMode
				this.restart()
			})
		}

		// Events
		settingsBtn?.addEventListener("click", () => {
			this.settingsModal.show()
		})

		closeBtn?.addEventListener("click", () => {
			this.settingsModal.hide()
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
		// Clear previous run's submission status from localStorage
		if (this.runId) {
			localStorage.removeItem(`bp_submitted_run_${this.runId}`)
		}
		this.scoreSubmitted = false // Reset submission state
		this.loadHighScore() // Load high score into the new engine
		this.dragShape = null
		this.dragPos = null

		// Reset status face state
		this.wasInPanicState = false
		this.reliefUntil = 0
		this.lastPlaceability = []

		this.gameOverModal.hide()
		document.getElementById("mini-leaderboard-container")?.classList.add("hidden")
		document.getElementById("highscore-notification")?.classList.add("hidden")
		document.getElementById("game-over-highscore-label")?.classList.add("hidden")
		document.getElementById("submission-status-message")?.classList.add("hidden")
		this.playerNameMissingContainer?.classList.add("hidden")

		// Set prior best score to current best for the new session
		this.priorBestScore = this.engine.bestScore
		this.highScoreNotificationShown = false

		// Start a fresh run (resets engine.isGameOver) before updating the UI.
		// Note: startNewRun is async; don't immediately call updateUI() here because
		// the engine may still be in a game-over state synchronously, which would
		// cause updateUI() to re-show the game-over overlay. The render loop and
		// subsequent state changes will naturally drive the UI.
		this.startNewRun()
		this.updatePlayerNameUI() // Ensure player name UI is updated on restart
	}

	loadHighScore() {
		const key = this.chillMode ? "bp_best_score_chill" : "bp_best_score"
		const best = localStorage.getItem(key)
		if (best) this.engine.bestScore = parseInt(best, 10)
		else this.engine.bestScore = 0
		document.getElementById("best-score")!.textContent = this.engine.bestScore.toString()
	}

	saveHighScore() {
		if (this.engine.score > this.engine.bestScore) {
			this.engine.bestScore = this.engine.score
			const key = this.chillMode ? "bp_best_score_chill" : "bp_best_score"
			localStorage.setItem(key, this.engine.score.toString())
			document.getElementById("best-score")!.textContent = this.engine.bestScore.toString()
		}
	}

	saveGameState() {
		// Don't save if in tutorial (saving game over state is allowed)
		if (this.tutorialManager.isActive) {
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
			runId: this.runId!, // Save the current runId (assert non-null)
			scoreSubmitted: this.scoreSubmitted,
			chillMode: this.chillMode,
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
			this.runId = state.runId // Restore runId from saved state

			// Restore scoreSubmitted from state OR check localStorage for redundancy
			this.scoreSubmitted = state.scoreSubmitted ?? false
			if (!this.scoreSubmitted && this.runId && localStorage.getItem(`bp_submitted_run_${this.runId}`)) {
				this.scoreSubmitted = true
			}

			console.log(`[loadGameState] runId: ${this.runId}, scoreSubmitted: ${this.scoreSubmitted}`)

			this.chillMode = state.chillMode ?? false
			this.engine.chillMode = this.chillMode

			// If checking paused state, ensure UI reflects it
			if (this.isPaused) {
				this.pauseModal.show()
			}

			// Ensure used quotes are synced if engine changed seed?
			// No, used quotes are separate.

			// Update UI
			this.updateUI()
			this.updatePlayerNameUI() // Also update player name UI on load

			return true
		} catch (e) {
			console.error("Failed to load game state", e)
			return false
		}
	}

	private async attemptScoreSubmission(): Promise<void> {
		console.log(`[attemptScoreSubmission] scoreSubmitted: ${this.scoreSubmitted}`)
		if (this.scoreSubmitted) {
			this.updateSubmissionUI("success")
			return
		}
		if (this.engine.score <= 0) {
			return
		}

		// Ensure we have a player name before proceeding.
		const playerName = localStorage.getItem("bp_player_name")
		if (!playerName || playerName.trim() === "") {
			console.error("No player name found. Aborting score submission.")
			this.updateSubmissionUI("idle", "Please enter a player name before submitting.")
			return
		}

		// Update UI immediately to provide feedback
		this.updateSubmissionUI("submitting")

		this.submitScoreToLeaderboard(playerName.trim(), true)
	}

	// --- LEADERBOARD INTEGRATION ---
	// Note: No longer fetching runToken from server. runId and seed are generated client-side.

	private openLeaderboard() {
		this.leaderboardModal.show()
		this.fetchAndRenderLeaderboard()
	}

	private closeLeaderboard() {
		this.leaderboardModal.hide()
	}

	private async fetchLeaderboardScores(): Promise<Array<{ name: string; score: number }>> {
		try {
			const mode = this.chillMode ? "chill" : "normal"
			const resp = await fetch(`/api/leaderboard?limit=100&mode=${mode}`)
			if (!resp.ok) {
				throw new Error(`Leaderboard request failed with status ${resp.status}`)
			}
			const data: any = await resp.json()
			const verified = Array.isArray(data?.verified) ? data.verified : []
			return verified
		} catch (e) {
			console.error("Failed to fetch leaderboard scores:", e)
			return []
		}
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
			const mode = this.chillMode ? "chill" : "normal"
			const titleEl = document.querySelector("#leaderboard-modal h2")
			if (titleEl) {
				titleEl.textContent = `Leaderboard (${this.chillMode ? "Chill" : "Normal"})`
			}

			const resp = await fetch(`/api/leaderboard?limit=100&mode=${mode}`)
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

			// Scroll to self-submitted entry if found
			const selfEntryEl = verifiedList.querySelector(".leaderboard-self")
			if (selfEntryEl) {
				selfEntryEl.scrollIntoView({ behavior: "smooth", block: "center" })
			}
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

	private async submitScoreToLeaderboard(name: string, showImmediately: boolean = true): Promise<void> {
		if (!this.runId || this.gameSeed === null || this.scoreSubmitted) {
			console.warn("Cannot submit score: runId or seed is missing, or score already submitted. Aborting.")
			return
		}

		this.scoreSubmitted = true

		const runId = this.runId
		const seed = this.gameSeed
		// Do NOT clear scoreSubmitted.

		try {
			const payload = {
				runId: runId,
				name: name,
				score: this.engine.score,
				mode: this.chillMode ? "chill" : "normal",
			}

			const response = await this.apiFetch("/api/leaderboard/submit", {
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
				// Mark as submitted in localStorage immediately for redundancy
				localStorage.setItem(`bp_submitted_run_${runId}`, "true")
				this.scoreSubmitted = true
				this.saveGameState() // Save state with scoreSubmitted: true

				if (data && typeof data === "object") {
					if (data.status === "NOT_PERSONAL_BEST") {
						this.updateSubmissionUI("idle", "Not a personal best.")
						const submissionContainer = document.getElementById("player-name-submission-container")
						if (submissionContainer) submissionContainer.classList.add("hidden")
						return
					}

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
					this.lastSubmittedEntry = {
						name,
						score: this.engine.score,
					}
				}
				this.updateSubmissionUI("success")

				// Update local remote best score record
				if (this.chillMode) {
					this.remoteChillBestScore = Math.max(this.remoteChillBestScore, name === String((data as any).entry?.name ?? name) ? Number((data as any).entry?.score ?? this.engine.score) : 0)
				} else {
					this.remoteBestScore = Math.max(this.remoteBestScore, name === String((data as any).entry?.name ?? name) ? Number((data as any).entry?.score ?? this.engine.score) : 0)
				}

				if (showImmediately) {
					// Hide submission UI
					const submissionContainer = document.getElementById("player-name-submission-container")
					const submissionActions = document.getElementById("game-over-submission-actions")
					const statusContainer = document.getElementById("leaderboard-status-container")
					if (submissionContainer) submissionContainer.classList.add("hidden")
					if (submissionActions) submissionActions.classList.add("hidden")
					if (statusContainer) statusContainer.classList.add("hidden")

					// If we already have context data, it might be slightly stale now that we've submitted.
					// However, for the mini-leaderboard, we can usually just re-render with the 'isSelf' match.
					// To be perfectly accurate, we re-fetch context if it was a manual submission.
					// Clear cached context to force re-fetch with new rank if needed
					this.contextualLeaderboardData = null

					// Show mini leaderboard
					this.fetchAndRenderMiniLeaderboard()
				}
			} else {
				this.scoreSubmitted = false // Allow retry on failure
				console.error("[Score Submit] Submission failed.", {
					status,
					url,
					contentType,
					payload,
					jsonBody: data,
					rawBodySnippet: rawBody ? rawBody.slice(0, 200) : null,
				})
				const errorMessage = data && typeof data === "object" && (data as any).error ? `Failed to submit score: ${(data as any).error}` : "Failed to submit score. You can try submitting again."
				this.updateSubmissionUI("error", errorMessage)
			}
		} catch (e) {
			this.scoreSubmitted = false // Allow retry on failure
			console.error("Error submitting score (network or unexpected):", e)
			this.updateSubmissionUI("error", "Network error while submitting score. You can try submitting again.")
		}
	}
	// -----------------------------------------------
	private updatePlayerNameUI() {
		console.log("[updatePlayerNameUI] Function called.")
		const playerName = localStorage.getItem("bp_player_name")

		// Syncing the input and display text. Visibility is handled conditionally during game over.

		if (playerName && playerName.trim() !== "") {
			// Name is set: show display, hide input, pre-fill input
			this.playerNameDisplay?.classList.remove("hidden")
			if (this.displayPlayerNameSpan) {
				this.displayPlayerNameSpan.textContent = playerName
			}
			if (this.playerNameInput) {
				this.playerNameInput.classList.add("hidden") // Hide input when name is set
				this.playerNameInput.value = playerName
			}
			this.playerNameMissingContainer?.classList.add("hidden")
			this.playerSuggestionsContainer?.classList.add("hidden")
		} else {
			// No name: show input, clear input
			this.playerNameDisplay?.classList.add("hidden")
			if (this.playerNameInput) {
				this.playerNameInput.classList.remove("hidden")
				this.playerNameInput.value = ""
			}
			this.playerNameMissingContainer?.classList.remove("hidden")
			// We don't automatically show suggestions here; it's handled in updateUI at game over
		}
	}

	private async fetchAndShowPlayerSuggestions(fetchOnly: boolean = false) {
		console.log(`[fetchAndShowPlayerSuggestions] Triggered. fetchOnly: ${fetchOnly}`)

		// If we already have cached suggestions, use them immediately
		if (!fetchOnly && this.cachedPlayerSuggestions && this.cachedPlayerSuggestions.length > 0) {
			console.log("[fetchAndShowPlayerSuggestions] Using cached suggestions.")
			this.renderPlayerSuggestions(this.cachedPlayerSuggestions)
			return
		}

		if (!this.playerSuggestionsContainer || !this.playerSuggestionsList) {
			console.warn("[fetchAndShowPlayerSuggestions] Containers missing required elements.")
			return
		}

		try {
			const resp = await this.apiFetch("/api/players/identify")
			console.log("[fetchAndShowPlayerSuggestions] Response status:", resp.status)
			if (!resp.ok) return
			const data = await resp.json()

			if (data.ok && data.players && data.players.length > 0) {
				console.log(
					`[fetchAndShowPlayerSuggestions] Identified ${data.players.length} players. Scores:`,
					data.players.map((p: any) => `${p.name}: ${p.best_score}`)
				)
				this.cachedPlayerSuggestions = data.players
				if (!fetchOnly) {
					this.renderPlayerSuggestions(data.players)
				} else {
					console.log("[fetchAndShowPlayerSuggestions] Suggestions cached for later.")
				}
			} else {
				this.cachedPlayerSuggestions = []
				if (!fetchOnly) this.playerSuggestionsContainer.classList.add("hidden")
			}
		} catch (e) {
			console.error("[fetchAndShowPlayerSuggestions] Error:", e)
		}
	}

	private renderPlayerSuggestions(players: Array<{ id: string; name: string; best_score: number; chill_best_score: number }>) {
		if (!this.playerSuggestionsContainer || !this.playerSuggestionsList) return

		this.playerSuggestionsList.innerHTML = ""
		players.forEach((player) => {
			const btn = document.createElement("button")
			btn.className = "suggestion-btn"
			btn.textContent = player.name
			btn.addEventListener("click", () => {
				if (this.playerNameInput) {
					this.playerNameInput.value = player.name
					localStorage.setItem("bp_player_name", player.name)

					// Update cached best scores for this identified player
					this.remoteBestScore = player.best_score || 0
					this.remoteChillBestScore = player.chill_best_score || 0

					// Hide suggestion UI and submission container immediately
					this.playerNameMissingContainer?.classList.add("hidden")
					this.playerSuggestionsContainer?.classList.add("hidden")
					if (this.playerNameSubmissionContainer) {
						this.playerNameSubmissionContainer.classList.add("hidden")
					}

					this.updatePlayerNameUI()
					this.syncExistingPlayer()

					// If game over loop is waiting, submit immediately ONLY IF it's a PB
					if (this.engine.isGameOver && !this.scoreSubmitted) {
						const currentBest = this.chillMode ? this.remoteChillBestScore : this.remoteBestScore
						if (this.engine.score > currentBest) {
							this.attemptScoreSubmission()
						} else {
							// If not a PB for this player, don't submit and don't show the leaderboard
							// We also don't call updateSubmissionUI("idle") because that would re-show the container
							console.log(`[renderPlayerSuggestions] Score ${this.engine.score} is not a PB for ${player.name}. Keeping UI hidden.`)
						}
					}
				}
			})
			this.playerSuggestionsList?.appendChild(btn)
		})
		this.playerSuggestionsContainer?.classList.remove("hidden")
	}

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
			// Only run transition logic if overlay was effectively hidden (or we are initializing)
			if (!this.gameOverModal.isVisible()) {
				this.gameOverModal.show()

				// Check if this run was already submitted on a previous session/refresh
				if (!this.scoreSubmitted && this.runId && localStorage.getItem(`bp_submitted_run_${this.runId}`)) {
					this.scoreSubmitted = true
				}

				console.log(`[updateUI] Game Over. scoreSubmitted: ${this.scoreSubmitted}`)

				// Reset submission UI each time the game over screen is first shown
				if (this.scoreSubmitted) {
					this.updateSubmissionUI("success")
				} else {
					this.updateSubmissionUI("idle")
				}
				document.getElementById("final-score")!.textContent = this.engine.score.toString()

				// Start fetching contextual leaderboard in parallel
				this.contextualLeaderboardData = null
				const contextPromise = this.fetchContextualLeaderboard(this.engine.score)

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

				// Initial state: hide everything except header, score, and quote
				const gameOverActions = document.getElementById("game-over-actions")
				const submissionContainer = document.getElementById("player-name-submission-container")
				const miniLeaderboard = document.getElementById("mini-leaderboard-container")
				const statusContainer = document.getElementById("leaderboard-status-container")
				const nameMissingContainer = this.playerNameMissingContainer

				if (gameOverActions) gameOverActions.classList.add("hidden")
				if (submissionContainer) submissionContainer.classList.add("hidden")
				if (miniLeaderboard) miniLeaderboard.classList.add("hidden")
				if (statusContainer) statusContainer.classList.add("hidden")
				if (nameMissingContainer) nameMissingContainer.classList.add("hidden")
				if (this.playerSuggestionsContainer) this.playerSuggestionsContainer.classList.add("hidden")

				if (this.gameOverActionsTimeout) clearTimeout(this.gameOverActionsTimeout)

				// Delay based on reading time: .5s base + 10ms per character
				const delay = Math.min(2000, 500 + quoteLength * 10)

				// Handle leaderboard and submission logic in parallel
				const playerName = localStorage.getItem("bp_player_name")
				const currentScore = this.engine.score

				this.gameOverRevealRequested = false
				// Reveal actions exactly after delay
				this.gameOverActionsTimeout = setTimeout(() => {
					this.gameOverRevealRequested = true
					if (gameOverActions) gameOverActions.classList.remove("hidden")
					this.tryShowNameSubmissionUI()
				}, delay)

				if (currentScore > 0 && !this.scoreSubmitted) {
					this.checkPBAndSubmit(currentScore, playerName, contextPromise)
				}
			}
		}
		if (this.engine.isGameOver) {
			this.updateCountdownUI(null)
		}
	}

	private async checkPBAndSubmit(score: number, playerName: string | null, contextPromise: Promise<any>, isManual: boolean = false) {
		if (this.scoreSubmitted) return

		const miniStatusText = document.getElementById("mini-leaderboard-status")

		try {
			// Fast check using locally known remote best if available
			const currentRemoteBest = this.chillMode ? this.remoteChillBestScore : this.remoteBestScore
			if (currentRemoteBest > 0 && score <= currentRemoteBest) {
				console.log(`[checkPBAndSubmit] Fast-path: Score ${score} <= Remote Best ${currentRemoteBest}. Not a PB.`)
				return
			}

			// Wait for the contextual data (already fetching in parallel)
			const context = await contextPromise
			const isPB = context && context.isPersonalBest

			if (isPB) {
				if (playerName && playerName.trim() !== "") {
					if (miniStatusText) {
						miniStatusText.textContent = isManual ? "New personal best!" : "New personal best! Score was auto-submitted."
					}
					// Autosubmit and show the mini-leaderboard when done
					this.attemptScoreSubmission()
				} else {
					// PB but no name - try to show input
					this.tryShowNameSubmissionUI()
				}
			} else {
				// Not a personal best - try to show mini-leaderboard
				this.tryShowNameSubmissionUI()
			}
		} catch (e) {
			console.error("Failed to check personal best status:", e)
		}
	}

	private tryShowNameSubmissionUI() {
		const playerName = localStorage.getItem("bp_player_name")
		const currentScore = this.engine.score
		const isPB = this.contextualLeaderboardData?.isPersonalBest

		console.log(`[tryShowNameSubmissionUI] Thinking... revealRequested: ${this.gameOverRevealRequested}, score: ${currentScore}, isPB: ${isPB}, scoreSubmitted: ${this.scoreSubmitted}`)

		// Only show anything if the initial quote delay has passed
		if (!this.gameOverRevealRequested) return

		if (currentScore > 0 && this.scoreSubmitted) {
			this.fetchAndRenderMiniLeaderboard()
		} else if (currentScore > 0 && !this.scoreSubmitted) {
			// We only proceed if we definitely KNOW if it is a PB or not (isPB is boolean, not null/undefined)
			if (isPB === true && (!playerName || playerName.trim() === "")) {
				console.log("[tryShowNameSubmissionUI] Personal Best + No Name. Showing submission UI.")
				if (this.playerNameSubmissionContainer) this.playerNameSubmissionContainer.classList.remove("hidden")
				if (this.playerNameMissingContainer) this.playerNameMissingContainer.classList.remove("hidden")
				this.fetchAndShowPlayerSuggestions()
			} else if (isPB === false) {
				console.log("[tryShowNameSubmissionUI] Not a Personal Best. Skipping leaderboard.")
			}
		}
	}

	private async fetchContextualLeaderboard(score: number): Promise<any> {
		try {
			const playerName = localStorage.getItem("bp_player_name")
			const data = await this.fetchContextualLeaderboardScores(score, playerName)
			this.contextualLeaderboardData = data
			return data
		} catch (e) {
			console.error("Failed to prefetch contextual leaderboard:", e)
			return null
		}
	}

	private async fetchContextualLeaderboardScores(score: number, name: string | null): Promise<any> {
		const mode = this.chillMode ? "chill" : "normal"
		let url = `/api/leaderboard/context?score=${score}&mode=${mode}`
		if (name) {
			url += `&name=${encodeURIComponent(name)}`
		}
		const resp = await this.apiFetch(url)
		if (!resp.ok) throw new Error("Failed to fetch contextual leaderboard")
		return await resp.json()
	}

	private async fetchAndRenderMiniLeaderboard() {
		const miniLeaderboard = document.getElementById("mini-leaderboard-container")
		if (!miniLeaderboard) return

		try {
			const context = this.contextualLeaderboardData || (await this.fetchContextualLeaderboardScores(this.engine.score, null)) // Pass null for name if not available or already cleared
			this.renderMiniLeaderboardFromContext(context)
		} catch (e) {
			console.error("Failed to fetch mini leaderboard:", e)
		}
	}

	private renderMiniLeaderboardFromContext(context: any) {
		const miniLeaderboard = document.getElementById("mini-leaderboard-container")
		const miniList = document.getElementById("mini-leaderboard-list")
		if (!miniLeaderboard || !miniList) return

		miniList.innerHTML = ""
		miniLeaderboard.classList.remove("hidden")

		const playerName = localStorage.getItem("bp_player_name") || "You"
		const playerScore = this.engine.score

		const entries: any[] = []

		// 1. Top Score (always rank 1)
		if (context.topScore) {
			entries.push({ ...context.topScore, isSelf: context.playerRank === 1 })
		}

		// 2. Surrounding + Self
		const playerEntry = { name: playerName, score: playerScore, rank: context.playerRank, isSelf: true }

		// Add neighbors and self, ensuring they are sorted by rank
		const others = [...(context.surrounding || [])]
		if (context.playerRank > 1) {
			others.push(playerEntry)
		}
		others.sort((a, b) => a.rank - b.rank)

		others.forEach((entry) => {
			// Don't duplicate top score if player is rank 1 or neighbors are rank 1
			if (entry.rank > 1) {
				entries.push(entry)
			}
		})

		// Render with ellipses where gaps exist
		entries.forEach((entry, i) => {
			if (i > 0 && entry.rank > entries[i - 1].rank + 1) {
				const liEllipsis = document.createElement("li")
				liEllipsis.className = "leaderboard-ellipsis"
				liEllipsis.style.justifyContent = "center"
				liEllipsis.textContent = "..."
				miniList.appendChild(liEllipsis)
			}

			const li = document.createElement("li")
			if (entry.isSelf) li.classList.add("leaderboard-self")

			const rankSpan = document.createElement("span")
			rankSpan.className = "leaderboard-rank"
			rankSpan.textContent = String(entry.rank)

			const nameSpan = document.createElement("span")
			nameSpan.className = "leaderboard-name"
			nameSpan.textContent = entry.name ?? "???"

			const scoreSpan = document.createElement("span")
			scoreSpan.className = "leaderboard-score"
			scoreSpan.textContent = String(entry.score ?? 0)

			li.appendChild(rankSpan)
			li.appendChild(nameSpan)
			li.appendChild(scoreSpan)
			miniList.appendChild(li)
		})
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

		if (this.engine.isGameOver) {
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

		const ratio = remainingMs / this.getHandTimeLimit()
		applyFill(barFillBottom, ratio, remainingMs)
		this.handTimerRatio = Math.max(0, Math.min(1, ratio))
	}

	private syncHandCountdown(now: number) {
		// Don't run countdown logic until a real run has been initialized.
		if (!this.runInitialized || !this.firstBlockPlaced) {
			this.updateCountdownUI(null)
			return
		}

		// Don't start timer during tutorial or if chill mode is active
		if (this.tutorialManager.isActive || this.chillMode) {
			this.updateCountdownUI(null)
			return
		}

		// Detect new hand dealt
		if (this.engine.handGeneration !== this.lastHandGeneration) {
			this.lastHandGeneration = this.engine.handGeneration
			if (!this.engine.isGameOver) {
				this.handDeadline = now + this.getHandTimeLimit()
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
				this.endGame()
				this.updateCountdownUI(0)
				return
			}

			this.updateCountdownUI(Math.max(0, remaining))
		} else {
			this.timerPanic = false
			this.updateCountdownUI(null)
		}
	}

	private endGame() {
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
		bottomBar.style.top = `${canvasStyleTop + boardRect.y + boardRect.h + 8}px`

		// If layout recalculated and bars would go outside container, clamp
		const containerWidth = containerRect.width
		const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max)
		const maxLeft = containerWidth - boardRect.w
		const leftBottom = clamp(parseFloat(bottomBar.style.left), 0, maxLeft)
		bottomBar.style.left = `${leftBottom}px`
	}

	private pauseGame() {
		if (this.isPaused || this.engine.isGameOver) return
		this.pauseModal.show()
	}

	private resumeGame() {
		if (!this.isPaused) return
		this.pauseModal.hide()
	}

	private togglePause() {
		if (this.engine.isGameOver) return
		if (this.isPaused) this.resumeGame()
		else this.pauseGame()
	}
	onPointerMove(x: number, y: number) {
		if (this.engine.isGameOver || this.isPaused) {
			this.canvas.style.cursor = ""
			this.hoveredShapeIndex = null
			return
		}

		if (this.dragShape) {
			this.canvas.style.cursor = "none"
			return
		}

		// Tray area detection - Magnetic Snapping
		const { trayRect, boardRect } = this.renderer.layout
		const slotW = trayRect.w / 3

		// SNAP CONDITION: Only snap if in the tray area
		const snapThresholdY = boardRect.y + boardRect.h
		if (y < snapThresholdY) {
			this.canvas.style.cursor = ""
			this.hoveredShapeIndex = null
			return
		}

		const shapes = this.engine.currentShapes
		const availableIndices = shapes.map((s, i) => (s !== null ? i : -1)).filter((i) => i !== -1)

		if (availableIndices.length > 0) {
			// Hide native cursor as we are 'snapping' to pieces
			this.canvas.style.cursor = "none"

			let index = Math.floor(x / slotW)
			index = Math.max(0, Math.min(2, index))

			// If the direct slot is empty, snap to the nearest available one by pixel distance
			if (!shapes[index]) {
				const { shapecenters } = trayRect
				index = availableIndices.reduce((prev, curr) => {
					const distPrev = Math.abs(shapecenters[prev].x - x)
					const distCurr = Math.abs(shapecenters[curr].x - x)
					return distCurr < distPrev ? curr : prev
				})
			}

			this.hoveredShapeIndex = index
			return
		}

		this.canvas.style.cursor = ""
		this.hoveredShapeIndex = null
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
				if (!this.firstBlockPlaced) {
					this.firstBlockPlaced = true
					this.runInitialized = true
				}
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
		if (!this.isPaused) {
			const isGameActive = this.firstBlockPlaced && !this.engine.isGameOver && !this.tutorialManager.isActive
			this.engine.update(now, isGameActive)
		}

		// Manage the per-hand countdown timer
		this.syncHandCountdown(now)
		this.positionTimerBars()

		// Use main engine
		const activeEngine = this.engine

		// Calculate placeability for each shape in tray
		const placeability = activeEngine.currentShapes.map((s) => {
			if (!s) return false
			return activeEngine.canPlaceShape(s)
		})

		this.updateStatusFace(placeability)

		// Show drag state
		const dragShape = this.dragShape
		const dragPos = this.dragPos
		const ghostPos = this.ghostPos

		const handRatio = this.handTimerRatio
		this.renderer.draw(activeEngine, activeEngine, dragShape, dragPos, ghostPos, placeability, this.hoveredShapeIndex, now, handRatio, this.timerPanic, !this.isMobile)

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
		// Clear previous run's submission status from localStorage
		if (this.runId) {
			localStorage.removeItem(`bp_submitted_run_${this.runId}`)
		}

		// Reset submission state and generate new runId/seed for the new run.
		this.scoreSubmitted = false
		this.runId = this.generateRunId()
		this.gameSeed = this.generateSeed()

		// Start the new run immediately with the generated seed.
		const seed = this.gameSeed
		this.engine.reset(seed)
		this.engine.chillMode = this.chillMode
		if (this.DEBUG_SPAWN_POWERUP_ON_START) {
			this.engine.spawnTestPowerup()
		}

		// The runInitialized state will now be handled by the first block placement
		this.firstBlockPlaced = false
		this.updateCountdownUI(null)
		this.syncHandCountdown(Date.now())
		this.updateUI() // Explicitly update UI after starting new run
	}
}

// Boot
window.onload = () => {
	inject()
	new GameApp()
}
