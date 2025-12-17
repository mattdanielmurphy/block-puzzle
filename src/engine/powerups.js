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
exports.PowerupManager = exports.PowerupType = void 0;
var types_js_1 = require("./types.js");
var PowerupType;
(function (PowerupType) {
    PowerupType["BOMB_SMALL"] = "bomb_small";
    PowerupType["BOMB_MED"] = "bomb_med";
    PowerupType["BOMB_LARGE"] = "bomb_large";
    PowerupType["BOMB_MEGA"] = "bomb_mega";
})(PowerupType || (exports.PowerupType = PowerupType = {}));
var POWERUP_SPECS = [
    { type: PowerupType.BOMB_SMALL, size: 3, weight: 10, lifetime: 7000 },
    { type: PowerupType.BOMB_MED, size: 4, weight: 5, lifetime: 6000 },
    { type: PowerupType.BOMB_LARGE, size: 5, weight: 2, lifetime: 4000 },
    { type: PowerupType.BOMB_MEGA, size: 6, weight: 0.5, lifetime: 3500 }, // very rare & fast fade
];
var PowerupManager = /** @class */ (function () {
    function PowerupManager(rng) {
        this.powerups = [];
        // Time-based spawning constants
        this.COOLDOWN_DURATION = 20000; // 20 seconds to restore full probability
        this.BASE_SPAWN_RATE = 0.1; // 10% chance per second after cooldown
        this.lastSpawnTime = 0;
        this.lastUpdateTime = 0;
        this.rng = rng;
    }
    PowerupManager.prototype.update = function (currentTime, grid) {
        // Initialize lastUpdateTime if strictly 0 (first frame)
        if (this.lastUpdateTime === 0) {
            this.lastUpdateTime = currentTime;
        }
        var dt = currentTime - this.lastUpdateTime;
        this.lastUpdateTime = currentTime;
        // 1. Remove expired powerups
        this.powerups = this.powerups.filter(function (p) {
            var age = currentTime - p.spawnTime;
            return age < p.lifetime;
        });
        // 2. Try to spawn new powerup based on time
        this.checkSpawn(currentTime, dt, grid);
    };
    PowerupManager.prototype.checkSpawn = function (currentTime, dt, grid) {
        // Calculate time since last spawn
        // If lastSpawnTime is 0, we treat it as "long ago" so full probability applies
        var timeSinceLast = this.lastSpawnTime === 0 ? this.COOLDOWN_DURATION : currentTime - this.lastSpawnTime;
        // Logic:
        // "when a bomb is spawned, for the next 20s or so, the probability ... should be extremely low
        // and grow as more time passes until it's restored"
        // 0 to 1 progress factor over 20s
        var progress = Math.min(1, Math.max(0, timeSinceLast / this.COOLDOWN_DURATION));
        // Use a curve that stays low then grows (convex). Squared or Cubed.
        var probabilityFactor = progress * progress * progress;
        // Calculate probability for this frame
        // Rate is "events per second". Prob ~ Rate * (dt / 1000)
        var currentRatePerSecond = this.BASE_SPAWN_RATE * probabilityFactor;
        var spawnChance = currentRatePerSecond * (dt / 1000);
        if (this.rng.next() < spawnChance) {
            this.spawnPowerup(currentTime, grid);
        }
    };
    // Explicitly spawn a powerup right now (useful for testing or tutorials)
    PowerupManager.prototype.spawnImmediate = function (currentTime, grid) {
        this.spawnPowerup(currentTime, grid);
    };
    // Called after a successful block placement.
    // DEPRECATED regarding spawning logic, but kept for interface compatibility if needed.
    // We no longer spawn here directly.
    PowerupManager.prototype.onPlacement = function (currentTime, grid) {
        // No-op for spawning.
    };
    PowerupManager.prototype.spawnPowerup = function (currentTime, grid) {
        // Find all empty cells
        var emptyCells = [];
        for (var r = 0; r < types_js_1.GRID_SIZE; r++) {
            for (var c = 0; c < types_js_1.GRID_SIZE; c++) {
                var idx = r * types_js_1.GRID_SIZE + c;
                if (grid[idx] === 0) {
                    emptyCells.push({ r: r, c: c });
                }
            }
        }
        // If no empty cells, don't spawn
        if (emptyCells.length === 0)
            return;
        // Pick a random empty cell
        var randomIndex = Math.floor(this.rng.next() * emptyCells.length);
        var position = emptyCells[randomIndex];
        var chosen = this.pickSpec();
        var powerup = {
            type: chosen.type,
            position: position,
            spawnTime: currentTime,
            lifetime: chosen.lifetime,
        };
        this.powerups.push(powerup);
        // Record the spawn time to fully reset the probability cooldown
        this.lastSpawnTime = currentTime;
    };
    PowerupManager.prototype.pickSpec = function () {
        var totalWeight = POWERUP_SPECS.reduce(function (sum, p) { return sum + p.weight; }, 0);
        var roll = this.rng.next() * totalWeight;
        var chosen = POWERUP_SPECS[0];
        for (var _i = 0, POWERUP_SPECS_1 = POWERUP_SPECS; _i < POWERUP_SPECS_1.length; _i++) {
            var spec = POWERUP_SPECS_1[_i];
            if (roll < spec.weight) {
                chosen = spec;
                break;
            }
            roll -= spec.weight;
        }
        return chosen;
    };
    // Force spawn a specific type (debug/testing)
    PowerupManager.prototype.spawnOfType = function (type, currentTime, grid) {
        // Find a spec for the requested type
        var spec = POWERUP_SPECS.find(function (s) { return s.type === type; });
        if (!spec)
            return;
        // Find all empty cells
        var emptyCells = [];
        for (var r = 0; r < types_js_1.GRID_SIZE; r++) {
            for (var c = 0; c < types_js_1.GRID_SIZE; c++) {
                var idx = r * types_js_1.GRID_SIZE + c;
                if (grid[idx] === 0) {
                    emptyCells.push({ r: r, c: c });
                }
            }
        }
        if (emptyCells.length === 0)
            return;
        var randomIndex = Math.floor(this.rng.next() * emptyCells.length);
        var position = emptyCells[randomIndex];
        this.powerups.push({
            type: spec.type,
            position: position,
            spawnTime: currentTime,
            lifetime: spec.lifetime,
        });
    };
    // Check if a block placement collects a powerup
    PowerupManager.prototype.checkCollection = function (placedCells) {
        var _loop_1 = function (powerup) {
            // Check if any placed cell matches the powerup position
            for (var _b = 0, placedCells_1 = placedCells; _b < placedCells_1.length; _b++) {
                var cell = placedCells_1[_b];
                if (cell.r === powerup.position.r && cell.c === powerup.position.c) {
                    // Remove the powerup from the list
                    this_1.powerups = this_1.powerups.filter(function (p) { return p !== powerup; });
                    return { value: powerup };
                }
            }
        };
        var this_1 = this;
        for (var _i = 0, _a = this.powerups; _i < _a.length; _i++) {
            var powerup = _a[_i];
            var state_1 = _loop_1(powerup);
            if (typeof state_1 === "object")
                return state_1.value;
        }
        return null;
    };
    // Activate a collected powerup
    PowerupManager.prototype.activatePowerup = function (powerup, grid) {
        switch (powerup.type) {
            case PowerupType.BOMB_SMALL:
                return this.activateBomb(powerup.position, grid, 3, powerup.type);
            case PowerupType.BOMB_MED:
                return this.activateBomb(powerup.position, grid, 4, powerup.type);
            case PowerupType.BOMB_LARGE:
                return this.activateBomb(powerup.position, grid, 5, powerup.type);
            case PowerupType.BOMB_MEGA:
                return this.activateBomb(powerup.position, grid, 6, powerup.type);
            default:
                return {
                    type: powerup.type,
                    position: powerup.position,
                    affectedCells: [],
                    pointsAwarded: 0,
                };
        }
    };
    PowerupManager.prototype.activateBomb = function (position, grid, size, powerupType) {
        var affectedCells = [];
        // Clear a square of side length `size` centered on the bomb.
        var halfLower = Math.floor((size - 1) / 2); // rows/cols below/left
        var halfUpper = size - halfLower - 1; // rows/cols above/right
        for (var r = position.r - halfLower; r <= position.r + halfUpper; r++) {
            for (var c = position.c - halfLower; c <= position.c + halfUpper; c++) {
                if (r >= 0 && r < types_js_1.GRID_SIZE && c >= 0 && c < types_js_1.GRID_SIZE) {
                    var idx = r * types_js_1.GRID_SIZE + c;
                    if (grid[idx] !== 0) {
                        affectedCells.push({ r: r, c: c });
                    }
                }
            }
        }
        // Award points: 5 points per block cleared
        var pointsAwarded = affectedCells.length * 5;
        return {
            type: powerupType,
            position: position,
            affectedCells: affectedCells,
            pointsAwarded: pointsAwarded,
        };
    };
    PowerupManager.prototype.getPowerups = function () {
        return __spreadArray([], this.powerups, true);
    };
    // Persistence
    PowerupManager.prototype.serialize = function () {
        return {
            powerups: __spreadArray([], this.powerups, true),
            lastSpawnTime: this.lastSpawnTime,
            lastUpdateTime: this.lastUpdateTime,
        };
    };
    PowerupManager.prototype.deserialize = function (state) {
        this.powerups = state.powerups;
        this.lastSpawnTime = state.lastSpawnTime;
        this.lastUpdateTime = state.lastUpdateTime;
    };
    PowerupManager.prototype.shiftTime = function (deltaMs) {
        if (this.lastSpawnTime > 0)
            this.lastSpawnTime += deltaMs;
        if (this.lastUpdateTime > 0)
            this.lastUpdateTime += deltaMs;
        this.powerups.forEach(function (p) {
            p.spawnTime += deltaMs;
        });
    };
    PowerupManager.prototype.reset = function () {
        this.powerups = [];
    };
    return PowerupManager;
}());
exports.PowerupManager = PowerupManager;
