import { Shape } from "./types.js"

// Helper: Normalize coordinates to be zero-indexed at top-left
function normalize(coords: { r: number; c: number }[]): { r: number; c: number }[] {
	if (coords.length === 0) return []

	let minR = Infinity,
		minC = Infinity
	for (const p of coords) {
		if (p.r < minR) minR = p.r
		if (p.c < minC) minC = p.c
	}

	// Shift and sort for consistent signature
	return coords.map((p) => ({ r: p.r - minR, c: p.c - minC })).sort((a, b) => (a.r === b.r ? a.c - b.c : a.r - b.r))
}

// Helper: Generate a unique signature string for deduplication
function getSignature(coords: { r: number; c: number }[]): string {
	return coords.map((p) => `${p.r},${p.c}`).join("|")
}

// Transformation functions
function rotate90(coords: { r: number; c: number }[]): { r: number; c: number }[] {
	return coords.map((p) => ({ r: p.c, c: -p.r }))
}

function reflect(coords: { r: number; c: number }[]): { r: number; c: number }[] {
	return coords.map((p) => ({ r: p.r, c: -p.c }))
}

// Parse ASCII art to coords
function parseArtToCoords(art: string): { r: number; c: number }[] {
	const coords: { r: number; c: number }[] = []
	const lines = art.split("\n")
	let r = 0
	for (const line of lines) {
		if (line.trim().length === 0) continue // Skip empty lines logic handles via normalization later so strict row tracking isn't critical if relative
	}

	let currentRow = 0
	const allLines = art.split("\n")
	// trimming start/end lines
	let firstLine = 0
	while (firstLine < allLines.length && allLines[firstLine].trim().length === 0) firstLine++
	let lastLine = allLines.length - 1
	while (lastLine >= 0 && allLines[lastLine].trim().length === 0) lastLine--

	// Scan indentation
	let minIndent = Infinity
	for (let i = firstLine; i <= lastLine; i++) {
		const line = allLines[i]
		if (line.trim().length === 0) continue
		const indent = (line.match(/^ */) || [""])[0].length
		if (indent < minIndent) minIndent = indent
	}
	if (minIndent === Infinity) minIndent = 0

	for (let i = firstLine; i <= lastLine; i++) {
		const line = allLines[i]
		const content = line.substring(minIndent)
		for (let c = 0; c < content.length; c++) {
			if (content[c] === "#" || content[c] === "X") {
				coords.push({ r: currentRow, c })
			}
		}
		currentRow++
	}
	return coords
}

// Generate all unique variations (rotations and reflections)
function generateVariations(baseCoords: { r: number; c: number }[], baseIndex: number): Shape[] {
	const uniqueSignatures = new Set<string>()
	const shapes: Shape[] = []
	let current = baseCoords

	// For each of 2 reflections (original, reflected):
	//   For each of 4 rotations:
	//      Normalize, Hash -> if new, Add.
	//      Rotate.

	const transforms = [current, reflect(current)]

	transforms.forEach((startShape, tIdx) => {
		let shp = startShape
		for (let i = 0; i < 4; i++) {
			const normalized = normalize(shp)
			const sig = getSignature(normalized)

			if (!uniqueSignatures.has(sig)) {
				uniqueSignatures.add(sig)

				// Color based on size
				const size = normalized.length
				const colorId = Math.max(1, Math.min(5, size))

				shapes.push({
					id: `shape_${baseIndex}_v${shapes.length}`,
					colorId,
					cells: normalized,
				})
			}

			shp = rotate90(shp)
		}
	})

	return shapes
}

// Main processor
function processShapes(defs: { art: string; weight: number; category?: string }[]): {
	shapes: Shape[]
	baseIndexMap: number[]
	variationCounts: number[]
} {
	let allShapes: Shape[] = []
	let baseIndexMap: number[] = []
	let variationCounts: number[] = new Array(defs.length).fill(0)

	defs.forEach((def, index) => {
		const coords = parseArtToCoords(def.art)
		if (coords.length === 0) return
		const variations = generateVariations(coords, index)

		// Track variation count for this base shape
		variationCounts[index] = variations.length

		// Track which base shape each variation belongs to
		variations.forEach(() => {
			baseIndexMap.push(index)
		})

		allShapes = allShapes.concat(variations)
	})

	return { shapes: allShapes, baseIndexMap, variationCounts }
}

// Base Unique Shapes
// No need to define rotations/mirrors here!
// Each shape has an 'art' (ASCII representation) and 'weight' (spawn probability multiplier)
const SHAPE_DEFS = [
	// 1. Single
	{
		art: `
    #
    `,
		weight: 3,
	},

	// 2. Domino
	{
		art: `
    ##
    `,
		weight: 3,
	},

	// 3. Trominoes
	{
		art: `
    ###
    `,
		weight: 2,
	},
	{
		art: `
    #
    ##
    `,
		weight: 2,
	},

	// 4. Tetrominoes
	{
		art: `
    ####
    `,
		weight: 2,
	},
	{
		art: `
    ##
    ##
    `,
		weight: 2,
	},
	{
		art: `
    #
    #
    ##
    `,
		weight: 1,
	},
	{
		art: `
     #
    ###
    `,
		weight: 1,
	}, // T-Shape
	{
		art: `
    # #
    ###
    `,
		weight: 0.8,
	}, // U-Shape

	// 5. Pentominoes
	{
		art: `
    #####
    `,
		weight: 1.3,
	},
	{
		art: `
    ###
    #
    #
    `,
		weight: 0.8,
	},
	{
		art: `
     # 
    ###
     # 
    `,
		weight: 1,
	},

	// 6. Hexominoes
	{
		art: `
    ###
    ###
    `,
		weight: 1,
	},

	// 7. Nonominoes
	{
		art: `
    ###
    ###
    ###
    `,
		weight: 0.6,
	},

	// Diagonals (2-long) - less common
	{
		art: `
    #
     #
    `,
		weight: 0.5,
		category: "diagonal",
	},

	// Diagonals (3-long) - less common
	{
		art: `
    #
     #
      #
    `,
		weight: 0.5,
		category: "diagonal",
	},

	// V-Shapes
	{
		art: `
    # #
     #
    `,
		weight: 0.5,
		category: "diagonal",
	},
	{
		art: `
    #   #
     # #
      #
    `,
		weight: 0.1,
		category: "diagonal",
	}, // Large V - rare

	{
		art: `
    # #
     #
    # #
    `,
		weight: 0.3,
		category: "diagonal",
	}, // X-Shape - less common

	{
		art: `
     #
    # #
     #
    `,
		weight: 0.3,
		category: "diagonal",
	}, // Donut - less common
]

const { shapes, baseIndexMap, variationCounts } = processShapes(SHAPE_DEFS)

export const ALL_SHAPES = shapes
export const SHAPE_BASE_INDEX_MAP = baseIndexMap
export const SHAPE_VARIATION_COUNTS = variationCounts
export const SHAPE_WEIGHTS = SHAPE_DEFS.map((def) => def.weight)
export const SHAPE_CATEGORIES = SHAPE_DEFS.map((def) => def.category)
