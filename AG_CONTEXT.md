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
- **Leaderboard Submission**: The game keeps only the top score per player. At game over, it automatically checks if the score is a personal best. If so, it autosubmits the score. If no player name is set AND the score is a personal best, the user is prompted to choose a name. Manual submission is not available for non-personal best scores.
- **Player Fingerprinting**: Uses IP address and User Agent to identify returning players even if browser storage is cleared. The `players` table links to `scores` and `chill_scores` via `player_id`. Suggestions are shown at game over for unidentified users.
- **Developer Controls**: Enabled during development (Vite dev mode). 
  - `1`, `2`, `3`, `4`: Spawn bombs of increasing size.
  - `K`: End current game (Kill).