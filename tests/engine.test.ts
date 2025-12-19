import { GameEngine } from '../src/engine/logic';
import { ALL_SHAPES } from '../src/engine/shapes';

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

function testBombClearsAfterLine() {
    const game = new GameEngine(12345);
    // Fill row 0 except 0,0
    for(let c=1; c<9; c++) game.grid[0 * 9 + c] = 1;

    // Place a block at 1,1
    game.grid[1 * 9 + 1] = 1;
    
    // Setup a small bomb at 0,0. 
    // Small bomb is 3x3, centered on 0,0 means it affects (0,0) to (1,1) within bounds.
    // If we place at 0,0, it should clear row 0 FIRST.
    // Then the bomb activates.
    // If row 0 clears first, (0,1) to (0,8) are emptied.
    // Then bomb activates at (0,0). Radius 3x3 centered at (0,0) is (0,0)-(1,1).
    // It should find blocks at (1,0), (1,1) if they are filled.
    
    game.powerupManager.deserialize({
        powerups: [{
            type: 'bomb_small' as any,
            position: { r: 0, c: 0 },
            spawnTime: Date.now(),
            lifetime: 5000
        }],
        lastSpawnTime: Date.now(),
        lastUpdateTime: Date.now()
    });

    const s1 = ALL_SHAPES.find(s => s.id === 'shape_0_v0'); // 1x1
    if(!s1) throw new Error("shape_0_v0 not found");
    game.currentShapes[0] = s1;

    // Place at 0,0. This completes Row 0.
    const result = game.place(0, 0, 0);
    
    assertTrue(result.valid, "Placement valid");
    assertTrue(result.clearedRows.includes(0), "Row 0 should be cleared by line clear");
    
    // Affected cells by bomb should NOT include row 0 cells because they were cleared already.
    // Bomb at 0,0 (3x3) affects (0,0), (0,1), (1,0), (1,1).
    // Row 0 cells (0,0), (0,1) are cleared by line clear.
    // So bomb should only 'affect' (1,0), (1,1) IF they were filled.
    // We filled (1,1) earlier.
    
    const bombAffected = result.clearedCells.filter(p => !result.clearedRows.includes(p.r));
    // Wait, result.clearedCells contains ALL cleared cells (lines + powerups).
    // If our logic is correct:
    // 1. Piece at 0,0 completes Row 0.
    // 2. Row 0 is cleared. grid[0,0..8] = 0.
    // 3. Bomb at 0,0 activates. 
    //    It checks 3x3 around 0,0: (0,0), (0,1), (1,0), (1,1).
    //    grid[0,0] is 0, grid[0,1] is 0.
    //    grid[1,0] is 0.
    //    grid[1,1] is 1.
    //    So it should only affect (1,1).
    
    const affectedByPowerup = result.clearedCells.filter(p => p.r === 1 && p.c === 1);
    assertEqual(affectedByPowerup.length, 1, "Bomb should have cleared (1,1)");
    
    const affectedRow0 = result.clearedCells.filter(p => p.r === 0 && (p.c === 0 || p.c === 1));
    // These were cleared by LINE clear, so they shouldn't be in the powerup's affectedCells list internally,
    // but they ARE in result.clearedCells.
    // How to distinguish? PowerupActivation.affectedCells is what we want to check.
    // But GameEngine.place merges them.
    
    // If I check result.pointsAdded:
    // Line clear: 10 points.
    // Bomb clear: 5 points per cell. If it cleared (0,0) and (0,1) it would be 5*2 = 10 more.
    // If it only cleared (1,1), it's 5 points.
    // Piece placement: 1 point.
    // Total should be 1 + 10 + 5 = 16.
    // If bomb cleared (0,0) and (0,1) too, it would be 16 + 10 = 26.
    
    assertEqual(result.pointsAdded, 16, "Points should reflect bomb only clearing remaining blocks");
    
    console.log("✅ testBombClearsAfterLine passed");
}

try {
    testInitialState();
    testPlacement();
    testClearing();
    testSimultaneousClear();
    testGameOver();
    testBombClearsAfterLine();
    console.log("All tests passed!");
} catch (e) {
    console.error("Test failed:", e);
    // Exit with error code 1 for CI/Tool checks
    // In node, process is available globally even without types
    // @ts-ignore
    if (typeof process !== 'undefined') process.exit(1);
}