import { GameEngine } from './engine/logic.js';
import { GameRenderer } from './ui/renderer.js';
import { InputManager } from './ui/input.js';
import { Shape, GRID_SIZE } from './engine/types.js';
import { THEME } from './ui/theme.js';
import { VERSION } from './version.js';

class GameApp {
    engine: GameEngine;
    renderer: GameRenderer;
    input: InputManager;
    canvas: HTMLCanvasElement;
    
    // State for UI
    dragShape: Shape | null = null;
    dragPos: {x:number, y:number} | null = null;
    dragPos: {x:number, y:number} | null = null;
    ghostPos: {r:number, c:number} | null = null;
    
    // Snap settings
    private readonly SNAP_THRESHOLD = 3;

    constructor() {

        this.displayVersion();
        this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
        this.engine = new GameEngine(Date.now());
        this.renderer = new GameRenderer(this.canvas);
        
        this.input = new InputManager(this.canvas, this.renderer, {
            onDragStart: this.onDragStart.bind(this),
            onDragMove: this.onDragMove.bind(this),
            onDragEnd: this.onDragEnd.bind(this)
        });

        this.loadHighScore();
        this.updateUI();
        this.bindControls();
        
        requestAnimationFrame(this.loop.bind(this));
        
        // Initial render
        this.renderer.draw(this.engine, null, null, null);
    }

    displayVersion() {
        const el = document.getElementById('app-version');
        if (el) {
            el.textContent = `v${VERSION}`;
        }
    }

    bindControls() {
        document.getElementById('reset-btn')?.addEventListener('click', () => {
            if(confirm('Restart game?')) this.restart();
        });
        document.getElementById('restart-btn')?.addEventListener('click', () => {
            this.restart();
        });
    }
    
    restart() {
        this.engine = new GameEngine(Date.now());
        this.dragShape = null;
        this.dragPos = null;
        document.getElementById('game-over-overlay')?.classList.add('hidden');
        this.updateUI();
    }

    loadHighScore() {
        const best = localStorage.getItem('bp_best_score');
        if (best) this.engine.bestScore = parseInt(best, 10);
        document.getElementById('best-score')!.textContent = this.engine.bestScore.toString();
    }
    
    saveHighScore() {
        if (this.engine.score > this.engine.bestScore) {
            this.engine.bestScore = this.engine.score;
            localStorage.setItem('bp_best_score', this.engine.score.toString());
            document.getElementById('best-score')!.textContent = this.engine.bestScore.toString();
        }
    }

    updateUI() {
        document.getElementById('current-score')!.textContent = this.engine.score.toString();
        this.saveHighScore(); // Check constantly or delta
        
        if (this.engine.isGameOver) {
            document.getElementById('game-over-overlay')?.classList.remove('hidden');
            document.getElementById('final-score')!.textContent = this.engine.score.toString();
        }
    }

    onDragStart(index: number) {
        if (this.engine.isGameOver) return;
        const shape = this.engine.currentShapes[index];
        if (shape) {
            this.dragShape = shape;
            // Input manager handles calling move/end
        } else {
            this.input.dragState = null; // Cancel if empty slot
        }
    }

    // Helper to calculate offset from Center to Top-Left Anchor (0,0) cells
    private getShapeCenterOffset(shape: Shape, cellSize: number): {x: number, y: number} {
        const gap = THEME.metrics.cellGap;
        let minR=10, maxR=-1, minC=10, maxC=-1;
        shape.cells.forEach(p => {
            if(p.r < minR) minR = p.r;
            if(p.r > maxR) maxR = p.r;
            if(p.c < minC) minC = p.c;
            if(p.c > maxC) maxC = p.c;
        });

        // Width/Height in pixels
        const width = (maxC - minC + 1) * (cellSize + gap) - gap;
        const height = (maxR - minR + 1) * (cellSize + gap) - gap;

        // Center relative to the bounding box top-left
        const centerX = width / 2;
        const centerY = height / 2;

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
        
        const stride = cellSize + gap;
        const anchorXRel = -centerX + (-minC * stride);
        const anchorYRel = -centerY + (-minR * stride);
        
        return { x: anchorXRel, y: anchorYRel };
    }

    private getBestPlacement(shape: Shape, anchorX: number, anchorY: number): {r: number, c: number} | null {
        const { boardRect } = this.renderer.layout;
        const gap = THEME.metrics.cellGap;
        const cellSize = boardRect.cellSize;
        const stride = cellSize + gap;

        // Floating point grid coordinates
        const cFloat = (anchorX - boardRect.x) / stride;
        const rFloat = (anchorY - boardRect.y) / stride;

        const startR = Math.round(rFloat);
        const startC = Math.round(cFloat);

        let bestMatch: {r: number, c: number, dist: number} | null = null;
        
        // Check 3x3 neighborhood around the closest integer cell
        for (let r = startR - 1; r <= startR + 1; r++) {
            for (let c = startC - 1; c <= startC + 1; c++) {
                 // Check if valid placement
                 if (this.engine.canPlace(shape, r, c)) {
                     // Euclidean distance from ideal float position
                     const dist = Math.sqrt(Math.pow(r - rFloat, 2) + Math.pow(c - cFloat, 2));
                     
                     if (!bestMatch || dist < bestMatch.dist) {
                         bestMatch = { r, c, dist };
                     }
                 }
            }
        }

        // Snap threshold
        if (bestMatch && bestMatch.dist < this.SNAP_THRESHOLD) {
             return { r: bestMatch.r, c: bestMatch.c };
        }

        return null;
    }

    onDragMove(x: number, y: number) {
        if (!this.dragShape) return;
        this.dragPos = { x, y };

        // Calculate Ghost
        const { boardRect } = this.renderer.layout;
        const gap = THEME.metrics.cellGap;
        const cellSize = boardRect.cellSize; // Actual cell size
        
        // Adjust x,y (Center) to Anchor Position
        const offset = this.getShapeCenterOffset(this.dragShape, cellSize);
        const anchorX = x + offset.x;
        const anchorY = y + offset.y;
        
        const placement = this.getBestPlacement(this.dragShape, anchorX, anchorY);
        this.ghostPos = placement;
    }

    onDragEnd(r: number, c: number) {
        if (!this.dragShape) return;

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
             const { boardRect } = this.renderer.layout;
             const cellSize = boardRect.cellSize;
             
             const offset = this.getShapeCenterOffset(this.dragShape, cellSize);
             const anchorX = this.dragPos.x + offset.x; 
             const anchorY = this.dragPos.y + offset.y;
             
             const placement = this.getBestPlacement(this.dragShape, anchorX, anchorY);
             if (placement) {
                 r = placement.r;
                 c = placement.c;
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
        const index = this.engine.currentShapes.indexOf(this.dragShape);
        
        if (index !== -1 && this.engine.canPlace(this.dragShape, r, c)) {
            const result = this.engine.place(index, r, c);
            if (result.valid) {
                this.updateUI();
            }
        }
        
        // Reset drag state
        this.dragShape = null;
        this.dragPos = null;
        this.ghostPos = null;
    }

    loop() {
        // Redraw every frame or on dirty?
        // simple PWA: redraw every frame is fine for 60fps
        this.renderer.draw(this.engine, this.dragShape, this.dragPos, this.ghostPos);
        requestAnimationFrame(this.loop.bind(this));
    }
}

// Boot
window.onload = () => {
    new GameApp();
};
