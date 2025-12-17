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
exports.ReplayManager = void 0;
var ReplayManager = /** @class */ (function () {
    function ReplayManager(seed) {
        this.moves = [];
        this.seed = seed;
    }
    ReplayManager.prototype.recordMove = function (shape, boardRow, boardCol, scoreAfter, clearedRows, clearedCols, clearedBoxes) {
        this.moves.push({
            shapeId: shape.id,
            shapeCells: __spreadArray([], shape.cells, true),
            colorId: shape.colorId,
            boardRow: boardRow,
            boardCol: boardCol,
            timestamp: Date.now(),
            scoreAfter: scoreAfter,
            clearedRows: clearedRows,
            clearedCols: clearedCols,
            clearedBoxes: clearedBoxes
        });
    };
    ReplayManager.prototype.getReplayState = function (finalScore) {
        return {
            seed: this.seed,
            moves: __spreadArray([], this.moves, true),
            finalScore: finalScore
        };
    };
    ReplayManager.prototype.clear = function () {
        this.moves = [];
    };
    ReplayManager.prototype.getMoveCount = function () {
        return this.moves.length;
    };
    return ReplayManager;
}());
exports.ReplayManager = ReplayManager;
