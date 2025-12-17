"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runReplay = runReplay;
const logic_1 = require("./logic");
// A shape in the hand may not have an ID, but the shapes in a replay do.
// This is a bit of a hack to make them compatible.
const shapeIdMap = new Map();
function getShapeId(shape) {
    if (shape.id)
        return shape.id;
    const key = JSON.stringify(shape.cells);
    if (shapeIdMap.has(key))
        return shapeIdMap.get(key).id;
    shapeIdMap.set(key, shape);
    return shape.id;
}
function runReplay(args) {
    const { seed, actions, options } = args;
    const engine = new logic_1.GameEngine(seed);
    const maxActions = options?.maxActions ?? 1000;
    const maxDuration = options?.maxDurationMs ?? 10 * 60 * 1000; // 10 minutes
    if (actions.length > maxActions) {
        return { isValid: false, finalScore: 0, reason: "Too many actions" };
    }
    const startTime = Date.now();
    for (const action of actions) {
        if (Date.now() - startTime > maxDuration) {
            return { isValid: false, finalScore: 0, reason: "Replay took too long" };
        }
        // Find the shape in the current hand
        const shapeIndex = engine.currentShapes.findIndex((s) => s && getShapeId(s) === action.shapeId);
        if (shapeIndex === -1) {
            return { isValid: false, finalScore: engine.score, reason: "Shape not in hand" };
        }
        const result = engine.place(shapeIndex, action.boardRow, action.boardCol);
        if (!result.valid) {
            return { isValid: false, finalScore: engine.score, reason: "Invalid placement" };
        }
    }
    return { isValid: true, finalScore: engine.score };
}
//# sourceMappingURL=runReplay.js.map