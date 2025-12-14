import { Shape } from './types.js';

// Helper: Normalize coordinates to be zero-indexed at top-left
function normalize(coords: { r: number, c: number }[]): { r: number, c: number }[] {
    if (coords.length === 0) return [];
    
    let minR = Infinity, minC = Infinity;
    for (const p of coords) {
        if (p.r < minR) minR = p.r;
        if (p.c < minC) minC = p.c;
    }

    // Shift and sort for consistent signature
    return coords.map(p => ({ r: p.r - minR, c: p.c - minC }))
        .sort((a, b) => a.r === b.r ? a.c - b.c : a.r - b.r);
}

// Helper: Generate a unique signature string for deduplication
function getSignature(coords: { r: number, c: number }[]): string {
    return coords.map(p => `${p.r},${p.c}`).join('|');
}

// Transformation functions
function rotate90(coords: { r: number, c: number }[]): { r: number, c: number }[] {
    return coords.map(p => ({ r: p.c, c: -p.r }));
}

function reflect(coords: { r: number, c: number }[]): { r: number, c: number }[] {
    return coords.map(p => ({ r: p.r, c: -p.c }));
}

// Parse ASCII art to coords
function parseArtToCoords(art: string): { r: number, c: number }[] {
    const coords: { r: number, c: number }[] = [];
    const lines = art.split('\n');
    let r = 0;
    for (const line of lines) {
        if (line.trim().length === 0) continue; // Skip empty lines logic handles via normalization later so strict row tracking isn't critical if relative
        // Actually, we need strictly relative rows. 
        // Simple approach: filter empty lines first? No, internal empty lines matter.
        // Better: Find first non-empty to start '0'? 
        // We will just parse strictly and let normalize() fix the offset.
    }
    
    // Robust parsing
    const rows = art.split('\n').filter(l => l.trim().length > 0); // Remove pure whitespace lines at start/end mostly
    // But wait, if I have:
    // #
    //
    // #
    // That's a valid shape. 
    // Let's stick to the previous robust parsing logic but return coords directly.
    
    let currentRow = 0;
    const allLines = art.split('\n');
    // trimming start/end lines
    let firstLine = 0;
    while (firstLine < allLines.length && allLines[firstLine].trim().length === 0) firstLine++;
    let lastLine = allLines.length - 1;
    while (lastLine >= 0 && allLines[lastLine].trim().length === 0) lastLine--;
    
    // Scan indentation
    let minIndent = Infinity;
    for (let i = firstLine; i <= lastLine; i++) {
        const line = allLines[i];
        if (line.trim().length === 0) continue;
        const indent = (line.match(/^ */) || [''])[0].length;
        if (indent < minIndent) minIndent = indent;
    }
    if (minIndent === Infinity) minIndent = 0;

    for (let i = firstLine; i <= lastLine; i++) {
        const line = allLines[i];
        const content = line.substring(minIndent);
        for (let c = 0; c < content.length; c++) {
            if (content[c] === '#' || content[c] === 'X') {
                coords.push({ r: currentRow, c });
            }
        }
        currentRow++;
    }
    return coords;
}

// Generate all unique variations (rotations and reflections)
function generateVariations(baseCoords: { r: number, c: number }[], baseIndex: number): Shape[] {
    const uniqueSignatures = new Set<string>();
    const shapes: Shape[] = [];
    let current = baseCoords;

    // We generate 8 symmetries: 4 rotations * 2 reflections
    // Sequence: Rot, Rot, Rot, Rot (back to start), Reflect, Rot, Rot, Rot, Rot
    
    // Actually simpler:
    // Set S = empty
    // For each of 2 reflections (original, reflected):
    //   For each of 4 rotations:
    //      Normalize, Hash -> if new, Add.
    //      Rotate.
    
    const transforms = [current, reflect(current)];
    
    transforms.forEach((startShape, tIdx) => {
        let shp = startShape;
        for (let i = 0; i < 4; i++) {
            const normalized = normalize(shp);
            const sig = getSignature(normalized);
            
            if (!uniqueSignatures.has(sig)) {
                uniqueSignatures.add(sig);
                
                // Color based on size
                const size = normalized.length;
                const colorId = Math.max(1, Math.min(5, size));
                
                shapes.push({
                    id: `shape_${baseIndex}_v${shapes.length}`,
                    colorId,
                    cells: normalized
                });
            }
            
            shp = rotate90(shp);
        }
    });

    return shapes;
}


// Main processor
function processShapes(arts: string[]): Shape[] {
    let allShapes: Shape[] = [];
    arts.forEach((art, index) => {
        const coords = parseArtToCoords(art);
        if (coords.length === 0) return;
        const variations = generateVariations(coords, index);
        allShapes = allShapes.concat(variations);
    });
    return allShapes;
}

// Base Unique Shapes
// No need to define rotations/mirrors here!
const SHAPE_DEFS = [
    // 1. Single
    `
    #
    `,

    // 2. Domino
    `
    ##
    `,

    // 3. Trominoes
    `
    ###
    `,
    `
    #
    ##
    `,

    // 4. Tetrominoes
    `
    ####
    `,
    `
    ##
    ##
    `,
    `
    #
    #
    ##
    `,
    `
     #
    ###
    `, // T-Shape (moved here as it's a tetromino)
    `
    # #
    ###
    `, // U-Shape (technically pentomino if filled? No, U is 5 blocks usually. The art has 5 hashes.)

    // 5. Pentominoes
    `
    #####
    `,
    `
    ###
    #
    #
    `,
    `
     # 
    ###
     # 
    `, // Plus (Pentomino)

    // Diagonals (2-long)
    `
    #
     #
    `,

    // Diagonals (3-long)
    `
    #
     #
      #
    `,
];

export const ALL_SHAPES = processShapes(SHAPE_DEFS);
