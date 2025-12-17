"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHAPE_CATEGORIES = exports.SHAPE_WEIGHTS = exports.SHAPE_VARIATION_COUNTS = exports.SHAPE_BASE_INDEX_MAP = exports.ALL_SHAPES = void 0;
// Helper: Normalize coordinates to be zero-indexed at top-left
function normalize(coords) {
    if (coords.length === 0)
        return [];
    var minR = Infinity, minC = Infinity;
    for (var _i = 0, coords_1 = coords; _i < coords_1.length; _i++) {
        var p = coords_1[_i];
        if (p.r < minR)
            minR = p.r;
        if (p.c < minC)
            minC = p.c;
    }
    // Shift and sort for consistent signature
    return coords.map(function (p) { return ({ r: p.r - minR, c: p.c - minC }); }).sort(function (a, b) { return (a.r === b.r ? a.c - b.c : a.r - b.r); });
}
// Helper: Generate a unique signature string for deduplication
function getSignature(coords) {
    return coords.map(function (p) { return "".concat(p.r, ",").concat(p.c); }).join("|");
}
// Transformation functions
function rotate90(coords) {
    return coords.map(function (p) { return ({ r: p.c, c: -p.r }); });
}
function reflect(coords) {
    return coords.map(function (p) { return ({ r: p.r, c: -p.c }); });
}
// Parse ASCII art to coords
function parseArtToCoords(art) {
    var coords = [];
    var lines = art.split("\n");
    var r = 0;
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
        var line = lines_1[_i];
        if (line.trim().length === 0)
            continue; // Skip empty lines logic handles via normalization later so strict row tracking isn't critical if relative
    }
    var currentRow = 0;
    var allLines = art.split("\n");
    // trimming start/end lines
    var firstLine = 0;
    while (firstLine < allLines.length && allLines[firstLine].trim().length === 0)
        firstLine++;
    var lastLine = allLines.length - 1;
    while (lastLine >= 0 && allLines[lastLine].trim().length === 0)
        lastLine--;
    // Scan indentation
    var minIndent = Infinity;
    for (var i = firstLine; i <= lastLine; i++) {
        var line = allLines[i];
        if (line.trim().length === 0)
            continue;
        var indent = (line.match(/^ */) || [""])[0].length;
        if (indent < minIndent)
            minIndent = indent;
    }
    if (minIndent === Infinity)
        minIndent = 0;
    for (var i = firstLine; i <= lastLine; i++) {
        var line = allLines[i];
        var content = line.substring(minIndent);
        for (var c = 0; c < content.length; c++) {
            if (content[c] === "#" || content[c] === "X") {
                coords.push({ r: currentRow, c: c });
            }
        }
        currentRow++;
    }
    return coords;
}
// Generate all unique variations (rotations and reflections)
function generateVariations(baseCoords, baseIndex) {
    var uniqueSignatures = new Set();
    var shapes = [];
    var current = baseCoords;
    // For each of 2 reflections (original, reflected):
    //   For each of 4 rotations:
    //      Normalize, Hash -> if new, Add.
    //      Rotate.
    var transforms = [current, reflect(current)];
    transforms.forEach(function (startShape, tIdx) {
        var shp = startShape;
        for (var i = 0; i < 4; i++) {
            var normalized = normalize(shp);
            var sig = getSignature(normalized);
            if (!uniqueSignatures.has(sig)) {
                uniqueSignatures.add(sig);
                // Color is locked to the base shape index so rotations/mirrors share one hue
                var colorId = baseIndex + 1;
                shapes.push({
                    id: "shape_".concat(baseIndex, "_v").concat(shapes.length),
                    colorId: colorId,
                    cells: normalized,
                });
            }
            shp = rotate90(shp);
        }
    });
    return shapes;
}
// Main processor
function processShapes(defs) {
    var allShapes = [];
    var baseIndexMap = [];
    var variationCounts = new Array(defs.length).fill(0);
    defs.forEach(function (def, index) {
        var coords = parseArtToCoords(def.art);
        if (coords.length === 0)
            return;
        var variations = generateVariations(coords, index);
        // Track variation count for this base shape
        variationCounts[index] = variations.length;
        // Track which base shape each variation belongs to
        variations.forEach(function () {
            baseIndexMap.push(index);
        });
        allShapes = allShapes.concat(variations);
    });
    return { shapes: allShapes, baseIndexMap: baseIndexMap, variationCounts: variationCounts };
}
// Base Unique Shapes
// No need to define rotations/mirrors here!
// Each shape has an 'art' (ASCII representation) and 'weight' (spawn probability multiplier)
var SHAPE_DEFS = [
    // 1. Single
    {
        art: "\n    #\n    ",
        weight: 3,
    },
    // 2. Domino
    {
        art: "\n    ##\n    ",
        weight: 3,
    },
    // 3. Trominoes
    {
        art: "\n    ###\n    ",
        weight: 2,
    },
    {
        art: "\n    #\n    ##\n    ",
        weight: 2,
    },
    // 4. Tetrominoes
    {
        art: "\n    ####\n    ",
        weight: 2,
    },
    {
        art: "\n    ##\n    ##\n    ",
        weight: 2,
    },
    {
        art: "\n    #\n    #\n    ##\n    ",
        weight: 1,
    },
    {
        art: "\n     #\n    ###\n    ",
        weight: 1,
    }, // T-Shape
    {
        art: "\n    # #\n    ###\n    ",
        weight: 0.8,
    }, // U-Shape
    // 5. Pentominoes
    {
        art: "\n    #####\n    ",
        weight: 1.3,
    },
    {
        art: "\n    ###\n    #\n    #\n    ",
        weight: 0.8,
    },
    {
        art: "\n     # \n    ###\n     # \n    ",
        weight: 1,
    },
    // 6. Hexominoes
    {
        art: "\n    ###\n    ###\n    ",
        weight: 1,
    },
    // 7. Nonominoes
    {
        art: "\n    ###\n    ###\n    ###\n    ",
        weight: 0.6,
    },
    // Diagonals (2-long) - less common
    {
        art: "\n    #\n     #\n    ",
        weight: 0.5,
        category: "diagonal",
    },
    // Diagonals (3-long) - less common
    {
        art: "\n    #\n     #\n      #\n    ",
        weight: 0.5,
        category: "diagonal",
    },
    // V-Shapes
    {
        art: "\n    # #\n     #\n    ",
        weight: 0.5,
        category: "diagonal",
    },
    {
        art: "\n    #   #\n     # #\n      #\n    ",
        weight: 0.1,
        category: "diagonal",
    }, // Large V - rare
    {
        art: "\n    # #\n     #\n    # #\n    ",
        weight: 0.3,
        category: "diagonal",
    }, // X-Shape - less common
    {
        art: "\n     #\n    # #\n     #\n    ",
        weight: 0.3,
        category: "diagonal",
    }, // Donut - less common
];
var _a = processShapes(SHAPE_DEFS), shapes = _a.shapes, baseIndexMap = _a.baseIndexMap, variationCounts = _a.variationCounts;
exports.ALL_SHAPES = shapes;
exports.SHAPE_BASE_INDEX_MAP = baseIndexMap;
exports.SHAPE_VARIATION_COUNTS = variationCounts;
exports.SHAPE_WEIGHTS = SHAPE_DEFS.map(function (def) { return def.weight; });
exports.SHAPE_CATEGORIES = SHAPE_DEFS.map(function (def) { return def.category; });
