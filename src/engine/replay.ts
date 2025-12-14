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
    
    clear(): void {
        this.moves = [];
    }
    
    getMoveCount(): number {
        return this.moves.length;
    }
}
