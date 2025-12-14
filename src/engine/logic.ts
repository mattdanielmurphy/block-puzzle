import { Grid, Shape, Point, MoveResult, GRID_SIZE, GameState } from './types.js';
import { ALL_SHAPES } from './shapes.js';
import { RNG } from './rng.js';
import { ReplayManager } from './replay.js';

export class GameEngine {
    grid: Grid;
    score: number;
    bestScore: number = 0;
    currentShapes: (Shape | null)[];
    shapesInQueue: Shape[] = [];
    isGameOver: boolean = false;
    seed: number;
    moves: number = 0;
    rng: RNG;
    replayManager: ReplayManager;

    constructor(seed: number = Date.now()) {
        this.grid = new Array(GRID_SIZE * GRID_SIZE).fill(0);
        this.score = 0;
        this.seed = seed; // Store seed
        this.rng = new RNG(seed);
        this.replayManager = new ReplayManager(seed);
        this.currentShapes = [];
        this.refillShapes();
    }

    private getIndex(r: number, c: number): number {
        return r * GRID_SIZE + c;
    }

    private isValid(r: number, c: number): boolean {
        return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
    }

    // Refill logic: Get 3 random shapes
    refillShapes() {
        if (this.currentShapes.every(s => s === null)) {
            // Pick 3 unique random shapes
            // Create a pool of indices 0..N-1
            const indices = Array.from({length: ALL_SHAPES.length}, (_, i) => i);
            
            // Shuffle (Fisher-Yates)
            for (let i = indices.length - 1; i > 0; i--) {
                const j = this.rng.range(0, i + 1);
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            
            // Take first 3
            this.currentShapes = [
                ALL_SHAPES[indices[0]],
                ALL_SHAPES[indices[1]],
                ALL_SHAPES[indices[2]]
            ];
        }
    }

    canPlace(shape: Shape, boardRow: number, boardCol: number): boolean {
        for (const cell of shape.cells) {
            const r = boardRow + cell.r;
            const c = boardCol + cell.c;

            // Check bounds
            if (!this.isValid(r, c)) return false;

            // Check overlap
            if (this.grid[this.getIndex(r, c)] !== 0) return false;
        }
        return true;
    }

    place(shapeIndex: number, boardRow: number, boardCol: number): MoveResult {
        const shape = this.currentShapes[shapeIndex];
        if (!shape) throw new Error("Shape index empty");
        
        if (!this.canPlace(shape, boardRow, boardCol)) {
             return { valid: false, clearedRows: [], clearedCols: [], clearedBoxes: [], clearedCells: [], pointsAdded: 0, comboMultiplier: 0, gameOver: false }; 
        }

        // 1. Commit placement
        for (const cell of shape.cells) {
            const r = boardRow + cell.r;
            const c = boardCol + cell.c;
            this.grid[this.getIndex(r, c)] = shape.colorId;
        }

        this.currentShapes[shapeIndex] = null;
        
        // 2. Calculate placement points
        let points = shape.cells.length;

        // 3. Clear Detection
        const rowsToClear: number[] = [];
        const colsToClear: number[] = [];
        const boxesToClear: number[] = [];

        // Check Rows
        for (let r = 0; r < GRID_SIZE; r++) {
            let full = true;
            for (let c = 0; c < GRID_SIZE; c++) {
                if (this.grid[this.getIndex(r, c)] === 0) { full = false; break; }
            }
            if (full) rowsToClear.push(r);
        }

        // Check Cols
        for (let c = 0; c < GRID_SIZE; c++) {
            let full = true;
            for (let r = 0; r < GRID_SIZE; r++) {
                if (this.grid[this.getIndex(r, c)] === 0) { full = false; break; }
            }
            if (full) colsToClear.push(c);
        }

        // Check Boxes (3x3)
        // Box indices: 0..8
        // Top-left of box b: r = Math.floor(b/3)*3, c = (b%3)*3
        for (let b = 0; b < 9; b++) {
             const startR = Math.floor(b / 3) * 3;
             const startC = (b % 3) * 3;
             let full = true;
             for (let r = startR; r < startR + 3; r++) {
                 for (let c = startC; c < startC + 3; c++) {
                     if (this.grid[this.getIndex(r, c)] === 0) { full = false; break; }
                 }
                 if (!full) break;
             }
             if (full) boxesToClear.push(b);
        }

        // 4. Score Bonues (Simple but satisfying rules)
        const totalClears = rowsToClear.length + colsToClear.length + boxesToClear.length;
        if (totalClears > 0) {
            points += totalClears * 10; // 10 points per line/box
            if (totalClears > 1) {
                points += (totalClears - 1) * 20; // Combo bonus
            }
        }
        
        this.score += points;

        // 5. Apply Clears
        const cellsToClear = new Set<number>();
        
        rowsToClear.forEach(r => {
            for(let c=0; c<GRID_SIZE; c++) cellsToClear.add(this.getIndex(r, c));
        });
        colsToClear.forEach(c => {
             for(let r=0; r<GRID_SIZE; r++) cellsToClear.add(this.getIndex(r, c));
        });
        boxesToClear.forEach(b => {
             const startR = Math.floor(b / 3) * 3;
             const startC = (b % 3) * 3;
             for(let r=startR; r<startR+3; r++) {
                 for(let c=startC; c<startC+3; c++) {
                     cellsToClear.add(this.getIndex(r, c));
                 }
             }
        });

        cellsToClear.forEach(idx => {
            this.grid[idx] = 0;
        });

        // 6. Refill if empty
        if (this.currentShapes.every(s => s === null)) {
            this.refillShapes();
        }

        // 7. Check Game Over
        const gameOver = !this.canPlaceAny();
        this.isGameOver = gameOver; // Update state

        this.moves++; // Increment moves
        
        // Record move for replay
        this.replayManager.recordMove(
            shape,
            boardRow,
            boardCol,
            this.score,
            rowsToClear,
            colsToClear,
            boxesToClear
        );

        return {
            valid: true,
            clearedRows: rowsToClear,
            clearedCols: colsToClear,
            clearedBoxes: boxesToClear,
            clearedCells: Array.from(cellsToClear).map(idx => ({
                r: Math.floor(idx / GRID_SIZE),
                c: idx % GRID_SIZE
            })),
            pointsAdded: points,
            comboMultiplier: totalClears,
            gameOver
        };
    }

    canPlaceAny(): boolean {
        // Brute force check: try every shape in every position
        // Optimization: early exit
        for (const shape of this.currentShapes) {
            if (!shape) continue;
            if (this.canPlaceShape(shape)) return true;
        }
        return false;
    }

    canPlaceShape(shape: Shape): boolean {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (this.canPlace(shape, r, c)) return true;
            }
        }
        return false;
    }
    setGrid(newGrid: Grid) {
        this.grid = [...newGrid];
    }

    setShapes(newShapes: (Shape | null)[]) {
        this.currentShapes = [...newShapes];
    }

    reset(seed: number = Date.now()) {
        this.seed = seed;
        this.rng = new RNG(seed);
        this.replayManager = new ReplayManager(seed);
        this.grid = new Array(GRID_SIZE * GRID_SIZE).fill(0);
        this.score = 0;
        this.currentShapes = [];
        this.refillShapes();
        this.isGameOver = false;
        this.moves = 0;
    }
}
