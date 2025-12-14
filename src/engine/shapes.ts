import { Shape } from './types.js';

// Parse a list of ASCII art strings into Shape objects
function parseShapes(arts: string[]): Shape[] {
    return arts.map((art, index) => {
        const coords: number[][] = [];
        let lines = art.split('\n');
        
        // Remove empty leading/trailing lines
        while (lines.length > 0 && lines[0].trim().length === 0) lines.shift();
        while (lines.length > 0 && lines[lines.length - 1].trim().length === 0) lines.pop();

        if (lines.length === 0) return { id: `shape_${index}`, colorId: 1, cells: [] };

        // Calculate minimum indentation
        let minIndent = Infinity;
        for (const line of lines) {
            if (line.trim().length === 0) continue;
            const match = line.match(/^ */);
            const indent = match ? match[0].length : 0;
            if (indent < minIndent) minIndent = indent;
        }
        if (minIndent === Infinity) minIndent = 0;

        // Extract coordinates
        for (let r = 0; r < lines.length; r++) {
            const line = lines[r];
            if (line.length < minIndent) continue;
            
            const content = line.substring(minIndent);
            for (let c = 0; c < content.length; c++) {
                if (content[c] === '#' || content[c] === 'X') {
                    coords.push([r, c]);
                }
            }
        }

        // Auto-assign color based on size (1..5)
        // 1: Blue, 2: Green, 3: Yellow, 4: Orange, 5: Red
        const size = coords.length;
        const colorId = Math.max(1, Math.min(5, size));

        return {
            id: `shape_${index}_${size}`,
            colorId,
            cells: coords.map(([r, c]) => ({ r, c }))
        };
    });
}

// Define all shapes here using ASCII art
// Colors are automatically assigned based on the number of blocks (#)
// IDs are automatically generated
const SHAPE_DEFS = [
    // 1. Single
    `
    #
    `,

    // 2. Dominoes
    `
    ##
    `,
    `
    #
    #
    `,

    // 3. Trominoes
    `
    ###
    `,
    `
    #
    #
    #
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
    #
    #
    #
    #
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

    // 5. Pentominoes
    `
    #####
    `,
    `
    #
    #
    #
    #
    #
    `,
    `
    ###
    #
    #
    `,

    // Diagonals (2-long)
    `
    #
     #
    `,
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
    `
      #
     #
    #
    `,

    // Special Shapes
    `
    # #
    ###
    `,
    `
    ###
     #
    `,
    `
     # 
    ###
     # 
    `
];

export const ALL_SHAPES = parseShapes(SHAPE_DEFS);
