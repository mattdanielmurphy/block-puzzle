# Block Puzzle Context

**Project**: Offline, browser-based block puzzle game using Vanilla TypeScript and HTML5 Canvas.
**Architecture**:
- **Engine** (`src/engine`): Pure game logic (state, rules, scoring). `GameEngine` class.
- **Renderer** (`src/ui`): Canvas drawing & effects. `GameRenderer` class.
- **App** (`src/main.ts`): Orchestrator (loop, inputs, DOM UI).
- **Build**: Custom build script (`build.js`) using Vite for frontend and `tsc` for API.
- **TypeScript Config**: 
  - `tsconfig.json`: Base config with shared rules.
  - `tsconfig.web.json`: Frontend-specific (DOM, vite/client types).
  - `tsconfig.api.json`: API/Node-specific (Node types, ESNext).

**Key Conventions**:
- **No Frameworks**: Use standard DOM/Canvas APIs. No React/Vue.
- **State**: `GameEngine` holds truth. `GameRenderer` is stateless visualization.
- **Types**: Defined in `src/engine/types.ts` (`Grid` is flattened 1D array).
- **Styling**: `public/styles.css` (linked in `index.html`). Managed manually with `build.js` for versioning.
- **PWA**: `vite-plugin-pwa` handles Service Worker for offline play. Uses `navigateFallback: "index.html"` for offline launch. Root `manifest.webmanifest`.
- **iOS Layout**: Uses `viewport-fit=cover` and handles safe areas. On mobile, layout is bottom-up: tray at very bottom (above safe area), grid above tray. Added `ResizeObserver` and launch timeouts in `GameRenderer` to ensure robust layout in PWA standalone mode. Added `ignoreURLParametersMatching` to Workbox to prevent version query params from breaking the offline cache.
- **Security**: `.env*` files are ignored in `.gitignore` and must never be committed.

**Key Files**:
- `src/main.ts`: Entry point. Game loop, DOM bindings.
- `src/engine/logic.ts`: Gameplay rules (placement validation, clearing, scoring).
- `src/ui/renderer.ts`: Main canvas drawing code.
- `src/ui/tutorial.ts`: Tutorial step logic.
- `src/engine/types.ts`: Core data structures (`Shape`, `Grid`, `GameState`, `SavedAppState`).
- `build.js`: Build configuration.

**Persistence**:
- Game state (engine + app state) is saved to `localStorage` (`bp_save_state`) on pause or move.
- Restored on reload if tutorial is complete.
- Time shift logic handles timestamps across sessions.

**Definition of Done**:
- `npm run build` completes successfully.
- Game loads without console errors.
- New features work on Mobile & Desktop (responsive canvas).

- **Hand Timer**: A per-hand countdown timer that resets when a new hand is dealt. It starts at 10 seconds and progressively quickens to a minimum of 8 seconds (100ms faster per hand). If the timer runs out, the game ends.
- **Powerups (Bombs)**: Bombs are time-based spawns managed by `PowerupManager`. They only spawn when the game is active (after the first piece is placed, the timer has started, and before game over/pause/tutorial).
- **Modal Component**: Reusable `Modal` class in `src/ui/modal.ts` handles overlays (Settings, Leaderboard, Game Over, Pause). Supports Esc key and outside-click dismissal.
- **Leaderboard Submission**: High scores are tracked per player. At game over, the system performs a conditional check (via `checkPBAndSubmit`) against the player's remote personal best. The submission UI is revealed if no name is set or if a new record is achieved. Improved feedback is provided if a player name is manually set but the score is not a new personal best.
- **Player Identity & Fingerprinting**: Uses a dedicated `player_identities` table to track multiple fingerprints (IP + User Agent) per `player_id`. 
  - **Home Network Identification**: Employs partial IP matching (64-bit IPv6 prefix / 24-bit IPv4 subnet) to recognize players across different devices on the same local network.
  - **Automatic Sync**: New identities are automatically registered/updated during sync or score submission.
- **Developer Controls**: Enabled during development (Vite dev mode). 
  - `1`, `2`, `3`, `4`: Spawn bombs of increasing size.
  - `K`: End current game (Kill).
  - **Visual Dev Indicators**: In dev mode, the background is dark red, a "DEV" text appears in the margin, and a help box list dev commands.
  - **IP Spoofing**: Dev mode fetches the actual public IP to test identification of remote devices.
## Sound, haptics, streaks, Mac window (2026-11-10)
- **Sound** (`src/audio.ts`): synthesized Web Audio (no sample files). Settings: sound on/off, volume (also `M` key and the header speaker button). Feel knobs live in `tweaks.json` (shared Tweaks format; shows in the ⌃⌥⌘T panel).
- **Haptics** (`src/haptics.ts`): `@capacitor/haptics` in the iPhone app (follows the phone's System Haptics), web-haptics in touch browsers; Settings toggle. Mac "Designed for iPad" apps can't use trackpad haptics, so none there.
- **Clear streaks**: back-to-back clears (within `streak.graceMoves` placements) climb a pentatonic scale, glow the board, show a STREAK badge under the face; longest streak at game over (`bp_best_streak`).
- **Mac window**: `SceneDelegate.swift` `MacWindow` starts a 470×820 portrait window, centred, then remembers the player's size (`macWindowSize`). `UIRequiresFullScreen` is NO.
- **Screenshot tour**: `VITE_SHOTS=1` build (or `?shots=1` in dev) plays a scripted tour (playing, line clear, pause, settings, game over) and restores localStorage after.
- **Mac test build**: `ios/macdev.sh [shots]` builds `ios/tmp/BlockdokuDev.app` (bundle `ca.mattmurphy.blockdoku.dev`, so the real save is untouched); launch it in the background with `open -g` on that path.
