import { Shape, Point } from './types.js';

export interface GameMove {
    shapeId: string;
    shapeCells: Point[];
    colorId: number;
    boardRow: number;
    boardCol: number;
    timestamp: number;
    scoreAfter: number;
    clearedRows: number[];
    clearedCols: number[];
    clearedBoxes: number[];
}

export interface ReplayState {
    seed: number;
    moves: GameMove[];
    finalScore: number;
}

const LOCAL_STORAGE_KEY = "block-puzzle-replay-state";

export class ReplayManager {
    private moves: GameMove[] = [];
    private seed: number;
    
    constructor(seed: number) {
        this.seed = seed;
    }
    
    recordMove(
        shape: Shape,
        boardRow: number,
        boardCol: number,
        scoreAfter: number,
        clearedRows: number[],
        clearedCols: number[],
        clearedBoxes: number[]
    ): void {
        this.moves.push({
            shapeId: shape.id,
            shapeCells: [...shape.cells],
            colorId: shape.colorId,
            boardRow,
            boardCol,
            timestamp: Date.now(),
            scoreAfter,
            clearedRows,
            clearedCols,
            clearedBoxes
        });
    }
    
    getReplayState(finalScore: number): ReplayState {
        return {
            seed: this.seed,
            moves: [...this.moves],
            finalScore
        };
    }
    
    saveReplayToLocalStorage(finalScore: number): void {
        const replayState = this.getReplayState(finalScore);
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(replayState));
        } catch (e) {
            console.error("Error saving replay to local storage:", e);
        }
    }
    
    static loadReplayFromLocalStorage(): ReplayState | null {
        try {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored) as ReplayState;
            }
        } catch (e) {
            console.error("Error loading replay from local storage:", e);
        }
        return null;
    }
    
    static clearReplayFromLocalStorage(): void {
        try {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        } catch (e) {
            console.error("Error clearing replay from local storage:", e);
        }
    }
    
    clear(): void {
        this.moves = [];
    }
    
    getMoveCount(): number {
        return this.moves.length;
    }
}
