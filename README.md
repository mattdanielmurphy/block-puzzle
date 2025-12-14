# Block Sudoku PWA

A clean-room, offline-first Block Sudoku puzzle game built with TypeScript, HTML5 Canvas, and CSS.

## File Structure
```
/
├── index.html          # App Entry
├── styles.css          # Styling
├── manifest.json       # PWA Manifest
├── service-worker.js   # Service Worker (generated)
├── src/                # Source Code
│   ├── main.ts         # Game Loop & Setup
│   ├── sw.ts           # Service Worker Source
│   ├── engine/         # Pure Game Logic
│   └── ui/             # Rendering & Input
├── dist/               # Compiled Output
└── tests/              # Unit Tests
```

## Build & Run Instructions

### Prerequisites
- Node.js installed (for `npx` and `tsc`).
- A web server (e.g., `npx http-server`, `python3 -m http.server`, or VS Code Live Server).

### Local Development
1. **Compile TypeScript**:
   ```bash
   npx tsc -w
   ```
   (Watch mode for auto-recompilation)

2. **Serve**:
   Start a server at the project root.
   ```bash
   npx http-server . -c-1
   ```

3. **Open**:
   Navigate to `http://127.0.0.1:8080/index.html` (or port provided).

### Production Build
1. **Clean & Compile**:
   ```bash
   rm -rf dist
   npx tsc
   ```

2. **Move Service Worker**:
   The service worker must be in the root directory to control the app.
   ```bash
   cp dist/src/sw.js service-worker.js
   ```

3. **Deploy**:
   Upload `index.html`, `styles.css`, `manifest.json`, `service-worker.js`, and the `dist/` folder to your static host.

## Testing
Run the engine unit tests:
```bash
npx tsc --module CommonJS && node dist/tests/engine.test.js
```

## QA Checklist
- [ ] **Load**: Game loads instantly. Grid and Tray are visible.
- [ ] **Drag**:
    - [ ] Can drag shapes from tray.
    - [ ] Smooth movement (follows finger/mouse).
    - [ ] Ghost appears when over valid spot.
    - [ ] Red/No ghost or visual feedback when invalid (currently ghost only shows on valid).
    - [ ] Snap back to tray on invalid drop.
- [ ] **Gameplay**:
    - [ ] Place pieces -> Score goes up.
    - [ ] Lines verify row/column/box clearing.
    - [ ] Combo points for multi-line clears.
- [ ] **PWA (Mobile Safari/Chrome)**:
    - [ ] "Add to Home Screen" works.
    - [ ] Launches in standalone mode (no browser UI).
    - [ ] Works offline (turn off WiFi/Data after first load, reload page).
- [ ] **Resilience**:
    - [ ] Drag off screen and release -> piece returns to tray.
    - [ ] Multi-touch doesn't break drag.
- [ ] **State**:
    - [ ] Reload page -> High score persists.

## Design Notes
- **Engine**: Pure logic in `src/engine`. 9x9 Grid `Uint8Array`. Shapes defined as coordinate offsets.
- **RNG**: Mulberry32 based seeded RNG for deterministic pieces.
- **Input**: Unified `PointerEvents` for Mouse/Touch. Mapped to Canvas coordinates and Board cells.
- **Rendering**: HTML5 Canvas with `requestAnimationFrame` loop. Responsive scaling using `window.devicePixelRatio`.
