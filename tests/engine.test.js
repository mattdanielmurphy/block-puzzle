"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var logic_1 = require("../src/engine/logic");
var shapes_1 = require("../src/engine/shapes");
console.log("Starting Engine Tests...");
// Simple assertion helper
function assertTrue(condition, msg) {
    if (!condition) {
        throw new Error("Assertion failed: " + msg);
    }
}
function assertEqual(actual, expected, msg) {
    if (msg === void 0) { msg = ""; }
    if (actual !== expected) {
        throw new Error("Assertion failed: ".concat(msg, " | Expected ").concat(expected, ", got ").concat(actual));
    }
}
function testInitialState() {
    var game = new logic_1.GameEngine(12345);
    assertEqual(game.score, 0, "Initial score 0");
    assertTrue(game.grid.every(function (c) { return c === 0; }), "Grid should be empty");
    assertEqual(game.currentShapes.length, 3, "Should have 3 shapes");
    assertTrue(game.currentShapes.every(function (s) { return s !== null; }), "Should have 3 shapes");
    console.log("✅ testInitialState passed");
}
function testPlacement() {
    var game = new logic_1.GameEngine(12345);
    // Force a specific shape for testing: 1x1
    var s1 = shapes_1.ALL_SHAPES.find(function (s) { return s.id === '1x1'; });
    if (!s1)
        throw new Error("1x1 shape not found");
    game.currentShapes[0] = s1;
    var result = game.place(0, 4, 4);
    assertTrue(result.valid, "Placement should be valid");
    assertEqual(game.grid[4 * 9 + 4], 1, "Center cell should be filled (color 1)");
    assertEqual(game.currentShapes[0], null, "Shape slot should be empty");
    console.log("✅ testPlacement passed");
}
function testClearing() {
    var game = new logic_1.GameEngine(12345);
    // Fill a row except last cell
    for (var c = 0; c < 8; c++)
        game.grid[0 * 9 + c] = 1;
    // Use a 1x1 to fill the gap at (0, 8)
    var s1 = shapes_1.ALL_SHAPES.find(function (s) { return s.id === '1x1'; });
    if (!s1)
        throw new Error("1x1 shape not found");
    game.currentShapes[0] = s1;
    var result = game.place(0, 0, 8);
    assertTrue(result.valid, "Placement valid");
    assertTrue(result.clearedRows.includes(0), "Row 0 should be cleared");
    assertEqual(game.grid[0 * 9 + 0], 0, "Cell (0,0) should be empty after clear");
    console.log("✅ testClearing passed");
}
function testSimultaneousClear() {
    var game = new logic_1.GameEngine(12345);
    // Setup cross shape to clear row 0 and col 0
    // Fill row 0 except 0,0
    for (var c = 1; c < 9; c++)
        game.grid[0 * 9 + c] = 1;
    // Fill col 0 except 0,0
    for (var r = 1; r < 9; r++)
        game.grid[r * 9 + 0] = 1;
    var s1 = shapes_1.ALL_SHAPES.find(function (s) { return s.id === '1x1'; });
    if (!s1)
        throw new Error("1x1 shape not found");
    game.currentShapes[0] = s1;
    var result = game.place(0, 0, 0);
    assertTrue(result.valid, "Valid placement");
    assertTrue(result.clearedRows.includes(0), "Row 0 cleared");
    assertTrue(result.clearedCols.includes(0), "Col 0 cleared");
    assertEqual(result.comboMultiplier, 2, "Combo should be 2");
    console.log("✅ testSimultaneousClear passed");
}
function testGameOver() {
    var game = new logic_1.GameEngine(12345);
    // Fill entire board
    game.grid.fill(1);
    // Try to check game over
    var isOver = !game.canPlaceAny();
    assertEqual(isOver, true, "Should be game over if board is full");
    // Clear one spot
    game.grid[0] = 0;
    // Ensure we have a 1x1
    var s1 = shapes_1.ALL_SHAPES.find(function (s) { return s.id === '1x1'; });
    if (!s1)
        throw new Error("1x1 shape not found");
    game.currentShapes = [s1, null, null];
    assertEqual(!game.canPlaceAny(), false, "Should not be game over if 1x1 fits");
    console.log("✅ testGameOver passed");
}
try {
    testInitialState();
    testPlacement();
    testClearing();
    testSimultaneousClear();
    testGameOver();
    console.log("All tests passed!");
}
catch (e) {
    console.error("Test failed:", e);
    // Exit with error code 1 for CI/Tool checks
    // In node, process is available globally even without types
    // @ts-ignore
    if (typeof process !== 'undefined')
        process.exit(1);
}
