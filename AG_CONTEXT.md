# Block Puzzle Context

**Project**: Offline, browser-based block puzzle game using Vanilla TypeScript and HTML5 Canvas.
**Architecture**:
- **Engine** (`src/engine`): Pure game logic (state, rules, scoring). `GameEngine` class.
- **Renderer** (`src/ui`): Canvas drawing & effects. `GameRenderer` class.
- **App** (`src/main.ts`): Orchestrator (loop, inputs, DOM UI).
- **Build**: Custom ESBuild-based script (`build.js`). Output to `dist/`.

**Key Conventions**:
- **No Frameworks**: Use standard DOM/Canvas APIs. No React/Vue.
- **State**: `GameEngine` holds truth. `GameRenderer` is stateless visualization.
- **Types**: Defined in `src/engine/types.ts` (`Grid` is flattened 1D array).
- **Styling**: `styles.css` (variables + utility classes).
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
  - **IP Spoofing**: Dev mode fetches the actual public IP to test identification of remote devices.