import { GameEngine } from '../src/engine/logic';
import { ALL_SHAPES } from '../src/engine/shapes';
import { runReplay } from '../src/engine/runReplay';

console.log("Starting Engine Tests...");

// Simple assertion helper
function assertTrue(condition: boolean, msg: string) {
    if (!condition) {
        throw new Error("Assertion failed: " + msg);
    }
}

function assertEqual(actual: any, expected: any, msg: string = "") {
    if (actual !== expected) {
        throw new Error(`Assertion failed: ${msg} | Expected ${expected}, got ${actual}`);
    }
}

function testInitialState() {
    const game = new GameEngine(12345);
    assertEqual(game.score, 0, "Initial score 0");
    assertTrue(game.grid.every(c => c === 0), "Grid should be empty");
    assertEqual(game.currentShapes.length, 3, "Should have 3 shapes");
    assertTrue(game.currentShapes.every(s => s !== null), "Should have 3 shapes");
    console.log("✅ testInitialState passed");
}

function testPlacement() {
    const game = new GameEngine(12345);
    const s1 = ALL_SHAPES.find(s => s.id === 'shape_0_v0');
    if (!s1) throw new Error("shape_0_v0 not found");
    game.currentShapes[0] = s1;

    const result = game.place(0, 4, 4);
    assertTrue(result.valid, "Placement should be valid");
    assertEqual(game.grid[4 * 9 + 4], 1, "Center cell should be filled (color 1)");
    assertEqual(game.currentShapes[0], null, "Shape slot should be empty");
    console.log("✅ testPlacement passed");
}

function testClearing() {
    const game = new GameEngine(12345);
    // Fill a row except last cell
    for(let c=0; c<8; c++) game.grid[0 * 9 + c] = 1;
    
    const s1 = ALL_SHAPES.find(s => s.id === 'shape_0_v0');
    if (!s1) throw new Error("shape_0_v0 not found");
    game.currentShapes[0] = s1;

    const result = game.place(0, 0, 8);
    assertTrue(result.valid, "Placement valid");
    assertTrue(result.clearedRows.includes(0), "Row 0 should be cleared");
    assertEqual(game.grid[0 * 9 + 0], 0, "Cell (0,0) should be empty after clear");
    console.log("✅ testClearing passed");
}

function testSimultaneousClear() {
    const game = new GameEngine(12345);
    // Setup cross shape to clear row 0 and col 0
    // Fill row 0 except 0,0
    for(let c=1; c<9; c++) game.grid[0 * 9 + c] = 1;
    // Fill col 0 except 0,0
    for(let r=1; r<9; r++) game.grid[r * 9 + 0] = 1;

    const s1 = ALL_SHAPES.find(s => s.id === 'shape_0_v0');
    if(!s1) throw new Error("shape_0_v0 not found");
    game.currentShapes[0] = s1;

    const result = game.place(0, 0, 0);
    assertTrue(result.valid, "Valid placement");
    assertTrue(result.clearedRows.includes(0), "Row 0 cleared");
    assertTrue(result.clearedCols.includes(0), "Col 0 cleared");
    assertEqual(result.comboMultiplier, 2, "Combo should be 2");
    console.log("✅ testSimultaneousClear passed");
}

function testGameOver() {
    const game = new GameEngine(12345); 
    
    // Fill entire board
    game.grid.fill(1);
    
    // Try to check game over
    const isOver = !game.canPlaceAny();
    assertEqual(isOver, true, "Should be game over if board is full");

    // Clear one spot
    game.grid[0] = 0;
    // Ensure we have a 1x1
    const s1 = ALL_SHAPES.find(s => s.id === 'shape_0_v0');
    if(!s1) throw new Error("shape_0_v0 not found");
    game.currentShapes = [s1, null, null];

    assertEqual(!game.canPlaceAny(), false, "Should not be game over if 1x1 fits");
    console.log("✅ testGameOver passed");
}

function testReplayVerification() {
    const game = new GameEngine(54321); // Use a fixed seed for determinism

    // Ensure we have at least two shapes in hand to perform moves
    assertTrue(game.currentShapes.length >= 2, "Game should start with at least 2 shapes");
    const s1 = game.currentShapes[0];
    const s2 = game.currentShapes[1];
    assertTrue(s1 !== null && s2 !== null, "First two shapes in hand should not be null");

    // Move 1: Place s1 at (0,0) 
    game.place(0, 0, 0); 
    const expectedScore1 = s1!.cells.length; // First move, no multiplier
    assertEqual(game.score, expectedScore1, `Score after first placement (${s1!.id})`); 
    
    // Move 2: Place s2 at (0,1)
    // Find the index of s2 in the current hand (it should be at index 1 initially, but might shift if s0 was placed)
    const s2Index = game.currentShapes.findIndex(s => s && s.id === s2!.id);
    assertTrue(s2Index !== -1, `${s2!.id} should be in hand for second move`);
    game.place(s2Index, 0, 1);
    
    // Score for second move: base points * 1.5 multiplier (floor)
    const pointsAddedByS2 = Math.floor(s2!.cells.length * 1.5);
    const expectedScore2 = expectedScore1 + pointsAddedByS2;

    assertEqual(game.score, expectedScore2, `Score after second placement (${s2!.id})`); 

    const finalScore = game.score;
    const replayState = game.replayManager.getReplayState(finalScore);

    // Run replay verification
    const replayVerificationResult = runReplay({
        seed: replayState.seed,
        actions: replayState.moves,
    });

    assertTrue(replayVerificationResult.isValid, "Replay verification should be valid");
    assertEqual(replayVerificationResult.finalScore, finalScore, "Replay final score should match original");
    console.log("✅ testReplayVerification passed");
}

try {
    testInitialState();
    testPlacement();
    testClearing();
    testSimultaneousClear();
    testGameOver();
    testReplayVerification(); // Add the new test here
    console.log("All tests passed!");
} catch (e) {
    console.error("Test failed:", e);
    // Exit with error code 1 for CI/Tool checks
    // In node, process is available globally even without types
    // @ts-ignore
    if (typeof process !== 'undefined') process.exit(1);
}