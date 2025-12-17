"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameEngine = void 0;
var shapes_js_1 = require("./shapes.js");
var types_js_1 = require("./types.js");
var powerups_js_1 = require("./powerups.js");
var rng_js_1 = require("./rng.js");
var replay_js_1 = require("./replay.js");
var GameEngine = /** @class */ (function () {
    function GameEngine(seed) {
        if (seed === void 0) { seed = Date.now(); }
        // Tracks each time a new hand of blocks is dealt so the UI can run timers.
        this.handGeneration = 0;
        this.handDealtAt = Date.now();
        this.bestScore = 0;
        this.shapesInQueue = [];
        this.isGameOver = false;
        this.moves = 0;
        this.lastUpdateTime = Date.now();
        this.lastMoveTime = Date.now();
        this.grid = new Array(types_js_1.GRID_SIZE * types_js_1.GRID_SIZE).fill(0);
        this.score = 0;
        this.seed = seed; // Store seed
        this.rng = new rng_js_1.RNG(seed);
        this.replayManager = new replay_js_1.ReplayManager(seed);
        this.powerupManager = new powerups_js_1.PowerupManager(this.rng);
        this.currentShapes = [];
        this.refillShapes();
    }
    // Persistence
    GameEngine.prototype.serialize = function () {
        return {
            grid: __spreadArray([], this.grid, true),
            score: this.score,
            currentShapes: __spreadArray([], this.currentShapes, true), // Shallow copy of shapes array (shapes are objects but effectively immutable)
            isGameOver: this.isGameOver,
            seed: this.seed,
            moves: this.moves,
            handGeneration: this.handGeneration,
            handDealtAt: this.handDealtAt,
            powerupManagerState: this.powerupManager.serialize(),
            rngState: this.rng.getState(),
            lastMoveTime: this.lastMoveTime,
        };
    };
    GameEngine.prototype.deserialize = function (state) {
        this.grid = state.grid;
        this.score = state.score;
        this.currentShapes = state.currentShapes;
        this.isGameOver = state.isGameOver;
        this.seed = state.seed;
        this.moves = state.moves;
        this.handGeneration = state.handGeneration;
        this.handDealtAt = state.handDealtAt;
        this.powerupManager.deserialize(state.powerupManagerState);
        if (state.rngState !== undefined) {
            this.rng.setState(state.rngState);
        }
        this.lastMoveTime = state.lastMoveTime || Date.now();
    };
    GameEngine.prototype.shiftTime = function (deltaMs) {
        if (this.handDealtAt > 0)
            this.handDealtAt += deltaMs;
        if (this.lastMoveTime > 0)
            this.lastMoveTime += deltaMs;
        this.powerupManager.shiftTime(deltaMs);
    };
    GameEngine.prototype.getPowerups = function () {
        return this.powerupManager.getPowerups();
    };
    GameEngine.prototype.getIndex = function (r, c) {
        return r * types_js_1.GRID_SIZE + c;
    };
    GameEngine.prototype.isValid = function (r, c) {
        return r >= 0 && r < types_js_1.GRID_SIZE && c >= 0 && c < types_js_1.GRID_SIZE;
    };
    // Refill logic: Get 3 random shapes with weighted selection
    // Weights are defined in SHAPE_WEIGHTS array (from shapes.ts)
    // Only one diagonal shape allowed per hand
    GameEngine.prototype.refillShapes = function () {
        if (this.currentShapes.every(function (s) { return s === null; })) {
            var selectedIndices = [];
            var selectedShapes = [];
            var selectedCategories = new Set();
            // Pick 3 unique shapes with weighted selection
            while (selectedShapes.length < 3) {
                // Create weighted pool excluding already selected shapes
                var weightedPool = [];
                for (var i = 0; i < shapes_js_1.ALL_SHAPES.length; i++) {
                    if (selectedIndices.includes(i))
                        continue; // Skip already selected
                    // Get the base shape index for this variation
                    var baseIdx = shapes_js_1.SHAPE_BASE_INDEX_MAP[i];
                    // Skip if this shape's category has already been selected
                    var category = shapes_js_1.SHAPE_CATEGORIES[baseIdx];
                    if (category && selectedCategories.has(category))
                        continue;
                    // Use weight from SHAPE_WEIGHTS array (indexed by base shape)
                    // Divide by variation count so total weight for base shape is correct
                    var baseWeight = shapes_js_1.SHAPE_WEIGHTS[baseIdx] || 1;
                    var variationCount = shapes_js_1.SHAPE_VARIATION_COUNTS[baseIdx] || 1;
                    var weight = baseWeight / variationCount;
                    // Convert fractional weights to integer pool entries
                    var poolEntries = Math.max(1, Math.round(weight * 10));
                    for (var w = 0; w < poolEntries; w++) {
                        weightedPool.push(i);
                    }
                }
                // Pick a random shape from the weighted pool
                if (weightedPool.length > 0) {
                    var shapeIdx = weightedPool[this.rng.range(0, weightedPool.length)];
                    selectedIndices.push(shapeIdx);
                    selectedShapes.push(shapes_js_1.ALL_SHAPES[shapeIdx]);
                    // Track category if present (using base index)
                    var baseIdx = shapes_js_1.SHAPE_BASE_INDEX_MAP[shapeIdx];
                    var category = shapes_js_1.SHAPE_CATEGORIES[baseIdx];
                    if (category)
                        selectedCategories.add(category);
                }
                else {
                    break; // Safety: no more shapes available
                }
            }
            this.currentShapes = selectedShapes;
            // Mark a new hand being dealt for timers/UX
            this.handGeneration++;
            this.handDealtAt = Date.now();
        }
    };
    GameEngine.prototype.canPlace = function (shape, boardRow, boardCol) {
        for (var _i = 0, _a = shape.cells; _i < _a.length; _i++) {
            var cell = _a[_i];
            var r = boardRow + cell.r;
            var c = boardCol + cell.c;
            // Check bounds
            if (!this.isValid(r, c))
                return false;
            // Check overlap
            if (this.grid[this.getIndex(r, c)] !== 0)
                return false;
        }
        return true;
    };
    GameEngine.prototype.place = function (shapeIndex, boardRow, boardCol, options) {
        var _this = this;
        var shape = this.currentShapes[shapeIndex];
        if (!shape)
            throw new Error("Shape index empty");
        if (!this.canPlace(shape, boardRow, boardCol)) {
            return { valid: false, clearedRows: [], clearedCols: [], clearedBoxes: [], clearedCells: [], pointsAdded: 0, comboMultiplier: 0, gameOver: false };
        }
        // 1. Commit placement
        var placedCells = [];
        for (var _i = 0, _a = shape.cells; _i < _a.length; _i++) {
            var cell = _a[_i];
            var r = boardRow + cell.r;
            var c = boardCol + cell.c;
            this.grid[this.getIndex(r, c)] = shape.colorId;
            placedCells.push({ r: r, c: c });
        }
        this.currentShapes[shapeIndex] = null;
        // 1.5 Check for powerup collection
        var collectedPowerup = this.powerupManager.checkCollection(placedCells);
        var powerupActivation = null;
        if (collectedPowerup) {
            powerupActivation = this.powerupManager.activatePowerup(collectedPowerup, this.grid);
            // Clear cells affected by powerup
            for (var _b = 0, _c = powerupActivation.affectedCells; _b < _c.length; _b++) {
                var cell = _c[_b];
                this.grid[this.getIndex(cell.r, cell.c)] = 0;
            }
        }
        // 2. Calculate placement points
        // Special case: 3x3 block gets fewer points (it's a "lucky" block)
        var points = shape.cells.length;
        if (shape.cells.length === 9) {
            // Check if it's actually a 3x3 block (not just 9 cells in some other shape)
            var minR = Math.min.apply(Math, shape.cells.map(function (c) { return c.r; }));
            var maxR = Math.max.apply(Math, shape.cells.map(function (c) { return c.r; }));
            var minC = Math.min.apply(Math, shape.cells.map(function (c) { return c.c; }));
            var maxC = Math.max.apply(Math, shape.cells.map(function (c) { return c.c; }));
            var is3x3Block = maxR - minR === 2 && maxC - minC === 2;
            if (is3x3Block) {
                points = 5; // Reduced from 9 for the lucky 3x3 block
            }
        }
        // 3. Clear Detection
        var rowsToClear = [];
        var colsToClear = [];
        var boxesToClear = [];
        // Check Rows
        for (var r = 0; r < types_js_1.GRID_SIZE; r++) {
            var full = true;
            for (var c = 0; c < types_js_1.GRID_SIZE; c++) {
                if (this.grid[this.getIndex(r, c)] === 0) {
                    full = false;
                    break;
                }
            }
            if (full)
                rowsToClear.push(r);
        }
        // Check Cols
        for (var c = 0; c < types_js_1.GRID_SIZE; c++) {
            var full = true;
            for (var r = 0; r < types_js_1.GRID_SIZE; r++) {
                if (this.grid[this.getIndex(r, c)] === 0) {
                    full = false;
                    break;
                }
            }
            if (full)
                colsToClear.push(c);
        }
        // Check Boxes (3x3)
        // Box indices: 0..8
        // Top-left of box b: r = Math.floor(b/3)*3, c = (b%3)*3
        for (var b = 0; b < 9; b++) {
            var startR = Math.floor(b / 3) * 3;
            var startC = (b % 3) * 3;
            var full = true;
            for (var r = startR; r < startR + 3; r++) {
                for (var c = startC; c < startC + 3; c++) {
                    if (this.grid[this.getIndex(r, c)] === 0) {
                        full = false;
                        break;
                    }
                }
                if (!full)
                    break;
            }
            if (full)
                boxesToClear.push(b);
        }
        // 4. Score Bonues (Simple but satisfying rules)
        var totalClears = rowsToClear.length + colsToClear.length + boxesToClear.length;
        if (totalClears > 0) {
            points += totalClears * 10; // 10 points per line/box
            if (totalClears > 1) {
                points += (totalClears - 1) * 20; // Combo bonus
            }
        }
        // Fast Move Multiplier
        var now = Date.now();
        var timeSinceLastMove = now - this.lastMoveTime;
        var moveMultiplier = 1;
        if (timeSinceLastMove < 1500 && this.moves > 0) {
            // 1.5 seconds threshold, skip first move
            moveMultiplier = 1.5;
            points = Math.floor(points * moveMultiplier);
        }
        // Add powerup points if any
        if (powerupActivation) {
            points += powerupActivation.pointsAwarded;
        }
        if (!(options === null || options === void 0 ? void 0 : options.isTutorial)) {
            this.score += points;
        }
        // 5. Apply Clears
        var cellsToClear = new Set();
        rowsToClear.forEach(function (r) {
            for (var c = 0; c < types_js_1.GRID_SIZE; c++)
                cellsToClear.add(_this.getIndex(r, c));
        });
        colsToClear.forEach(function (c) {
            for (var r = 0; r < types_js_1.GRID_SIZE; r++)
                cellsToClear.add(_this.getIndex(r, c));
        });
        boxesToClear.forEach(function (b) {
            var startR = Math.floor(b / 3) * 3;
            var startC = (b % 3) * 3;
            for (var r = startR; r < startR + 3; r++) {
                for (var c = startC; c < startC + 3; c++) {
                    cellsToClear.add(_this.getIndex(r, c));
                }
            }
        });
        cellsToClear.forEach(function (idx) {
            _this.grid[idx] = 0;
        });
        // Chance to spawn a powerup after a successful placement (post-clear so it lands on empty cells)
        this.powerupManager.onPlacement(Date.now(), this.grid);
        // 6. Refill if empty
        if (this.currentShapes.every(function (s) { return s === null; })) {
            this.refillShapes();
        }
        // 7. Check Game Over
        var gameOver = !this.canPlaceAny();
        this.isGameOver = gameOver; // Update state
        this.moves++; // Increment moves
        this.lastMoveTime = Date.now();
        // Record move for replay
        this.replayManager.recordMove(shape, boardRow, boardCol, this.score, rowsToClear, colsToClear, boxesToClear);
        // Combine cleared cells from lines/boxes and powerup
        var allClearedCells = Array.from(cellsToClear).map(function (idx) { return ({
            r: Math.floor(idx / types_js_1.GRID_SIZE),
            c: idx % types_js_1.GRID_SIZE,
        }); });
        if (powerupActivation) {
            allClearedCells.push.apply(allClearedCells, powerupActivation.affectedCells);
        }
        return {
            valid: true,
            clearedRows: rowsToClear,
            clearedCols: colsToClear,
            clearedBoxes: boxesToClear,
            clearedCells: allClearedCells,
            pointsAdded: points,
            comboMultiplier: totalClears,
            moveMultiplier: moveMultiplier, // Pass back to UI if needed
            gameOver: gameOver,
        };
    };
    GameEngine.prototype.canPlaceAny = function () {
        // Brute force check: try every shape in every position
        // Optimization: early exit
        for (var _i = 0, _a = this.currentShapes; _i < _a.length; _i++) {
            var shape = _a[_i];
            if (!shape)
                continue;
            if (this.canPlaceShape(shape))
                return true;
        }
        return false;
    };
    GameEngine.prototype.canPlaceShape = function (shape) {
        for (var r = 0; r < types_js_1.GRID_SIZE; r++) {
            for (var c = 0; c < types_js_1.GRID_SIZE; c++) {
                if (this.canPlace(shape, r, c))
                    return true;
            }
        }
        return false;
    };
    GameEngine.prototype.setGrid = function (newGrid) {
        this.grid = __spreadArray([], newGrid, true);
    };
    GameEngine.prototype.setShapes = function (newShapes) {
        this.currentShapes = __spreadArray([], newShapes, true);
    };
    GameEngine.prototype.reset = function (seed) {
        if (seed === void 0) { seed = Date.now(); }
        this.seed = seed;
        this.rng = new rng_js_1.RNG(seed);
        this.replayManager = new replay_js_1.ReplayManager(seed);
        this.powerupManager = new powerups_js_1.PowerupManager(this.rng);
        this.grid = new Array(types_js_1.GRID_SIZE * types_js_1.GRID_SIZE).fill(0);
        this.score = 0;
        this.currentShapes = [];
        this.refillShapes();
        this.isGameOver = false;
        this.moves = 0;
        this.lastUpdateTime = Date.now();
        this.handGeneration = 0;
        this.handDealtAt = Date.now();
        this.lastMoveTime = Date.now();
    };
    // Update powerups (call this from the game loop)
    GameEngine.prototype.update = function (currentTime) {
        if (currentTime === void 0) { currentTime = Date.now(); }
        this.lastUpdateTime = currentTime;
        this.powerupManager.update(currentTime, this.grid);
    };
    // Testing helper: force spawn a powerup immediately
    GameEngine.prototype.spawnTestPowerup = function (currentTime) {
        if (currentTime === void 0) { currentTime = Date.now(); }
        this.powerupManager.spawnImmediate(currentTime, this.grid);
    };
    // Testing helper: force spawn a specific powerup type
    GameEngine.prototype.spawnPowerupOfType = function (type, currentTime) {
        if (currentTime === void 0) { currentTime = Date.now(); }
        this.powerupManager.spawnOfType(type, currentTime, this.grid);
    };
    return GameEngine;
}());
exports.GameEngine = GameEngine;
