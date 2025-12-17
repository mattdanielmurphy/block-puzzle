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

**Replay System**:
- **Deterministic Replay Timing**: `GameEngine.place()` calls are driven by `ReplayAction.timestamp`, ensuring consistent replay logic independent of wall-clock time.
- **Fixed Epoch**: The replay engine's clock fields (`lastMoveTime`, `lastUpdateTime`, `handDealtAt`) are initialized to a fixed epoch (0) to ensure determinism.
- **UI Enhancements**:
  - Displays expected score (`replayState.finalScore`) and compares it to the replayed score, showing "PASS" or "FAIL".
  - A "Copy JSON" button (`#replay-copy-json`) allows copying the current `replayState` to the clipboard, with a `window.prompt` fallback.