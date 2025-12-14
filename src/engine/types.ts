export type Grid = number[]; // Flattened 9x9 array. 0 = empty, >0 = filled color ID
export const GRID_SIZE = 9;

export interface Point {
    r: number;
    c: number;
}

export interface Shape {
    id: string;
    cells: Point[]; // Relative to 0,0 (top-left of the shape)
    colorId: number;
}

export interface GameState {
    grid: Grid;
    score: number;
    bestScore: number;
    currentShapes: (Shape | null)[]; // 3 slots, null if used
    shapesInQueue: Shape[]; // Shapes for the next refill (optional, or just generate on demand)
    isGameOver: boolean;
    seed: number;
    moves: number;
}

export interface MoveResult {
    valid: boolean;
    clearedRows: number[];
    clearedCols: number[];
    clearedBoxes: number[];
    pointsAdded: number;
    comboMultiplier: number;
    gameOver: boolean;
}
