import { Shape, Point } from './types.js';

// Helper to create shapes easily structure: [r, c] pairs
function createShape(id: string, colorId: number, coords: number[][]): Shape {
    return {
        id,
        colorId,
        cells: coords.map(([r, c]) => ({ r, c }))
    };
}

// Basic set of shapes logic
// 1. Single
const S1 = createShape('1x1', 1, [[0,0]]);

// 2. Dominoes
const S2_H = createShape('2x1', 2, [[0,0], [0,1]]);
const S2_V = createShape('1x2', 2, [[0,0], [1,0]]);

// 3. Trominoes
const S3_H = createShape('3x1', 3, [[0,0], [0,1], [0,2]]);
const S3_V = createShape('1x3', 3, [[0,0], [1,0], [2,0]]);
const S3_L = createShape('L3', 3, [[0,0], [1,0], [1,1]]); // Corner

// 4. Tetrominoes
const S4_H = createShape('4x1', 4, [[0,0], [0,1], [0,2], [0,3]]);
const S4_V = createShape('1x4', 4, [[0,0], [1,0], [2,0], [3,0]]);
const S4_SQ = createShape('2x2', 4, [[0,0], [0,1], [1,0], [1,1]]);
// L-shapes
const S4_L1 = createShape('L4_1', 4, [[0,0], [1,0], [2,0], [2,1]]); 

// 5. Pentominoes (Selected subset to avoid frustration)
const S5_H = createShape('5x1', 5, [[0,0], [0,1], [0,2], [0,3], [0,4]]);
const S5_V = createShape('1x5', 5, [[0,0], [1,0], [2,0], [3,0], [4,0]]);
const S5_SQ_PLUS = createShape('3x3_L', 5, [[0,0], [0,1], [0,2], [1,0], [2,0]]); // Big corner

export const ALL_SHAPES = [
    S1, 
    S2_H, S2_V, 
    S3_H, S3_V, S3_L,
    S4_H, S4_V, S4_SQ, S4_L1,
    S5_H, S5_V, S5_SQ_PLUS
];

// Simple color mapping
// 1: Blue, 2: Green, 3: Yellow, 4: Orange, 5: Red
