"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RNG = void 0;
var RNG = /** @class */ (function () {
    function RNG(seed) {
        this.state = seed;
    }
    // Mulberry32
    RNG.prototype.next = function () {
        this.state = (this.state + 0x6d2b79f5) | 0;
        var t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Min (inclusive) to Max (exclusive)
    RNG.prototype.range = function (min, max) {
        return Math.floor(this.next() * (max - min)) + min;
    };
    RNG.prototype.shuffle = function (array) {
        var _a;
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(this.next() * (i + 1));
            _a = [array[j], array[i]], array[i] = _a[0], array[j] = _a[1];
        }
        return array;
    };
    RNG.prototype.getState = function () {
        return this.state;
    };
    RNG.prototype.setState = function (state) {
        this.state = state;
    };
    return RNG;
}());
exports.RNG = RNG;
