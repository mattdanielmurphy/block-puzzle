import { GameEngine } from '../engine/logic.js';
import { GameRenderer } from './renderer.js';
import { ReplayState, GameMove } from '../engine/replay.js';
import { GRID_SIZE } from '../engine/types.js';
import { BlockClearEffect } from './effects.js';

export class ReplayPlayer {
    private replayState: ReplayState;
    private currentMoveIndex: number = -1;
    private engine: GameEngine;
    private renderer: GameRenderer;
    private isPlaying: boolean = false;
    private playbackSpeed: number = 7;
    private playbackTimer: number | null = null;
    
    constructor(replayState: ReplayState, renderer: GameRenderer) {
        this.replayState = replayState;
        this.renderer = renderer;
        // Create a new engine with the same seed to replay the game
        this.engine = new GameEngine(replayState.seed);
    }
    
    getCurrentMoveIndex(): number {
        return this.currentMoveIndex;
    }
    
    getTotalMoves(): number {
        return this.replayState.moves.length;
    }
    
    getCurrentScore(): number {
        return this.currentMoveIndex >= 0 && this.currentMoveIndex < this.replayState.moves.length
            ? this.replayState.moves[this.currentMoveIndex].scoreAfter
            : 0;
    }
    
    getEngine(): GameEngine {
        return this.engine;
    }
    
    setSpeed(speed: number): void {
        this.playbackSpeed = speed;
    }
    
    isCurrentlyPlaying(): boolean {
        return this.isPlaying;
    }
    
    // Reset to beginning
    reset(): void {
        this.stop();
        this.currentMoveIndex = -1;
        this.engine = new GameEngine(this.replayState.seed);
    }
    
    // Go to first move
    goToFirst(): void {
        this.reset();
        this.nextMove();
    }
    
    // Go to last move
    goToLast(): void {
        this.reset();
        for (let i = 0; i < this.replayState.moves.length; i++) {
            this.nextMove();
        }
    }
    
    // Step to next move
    nextMove(): boolean {
        if (this.currentMoveIndex >= this.replayState.moves.length - 1) {
            this.stop();
            return false;
        }
        
        this.currentMoveIndex++;
        const move = this.replayState.moves[this.currentMoveIndex];
        this.applyMove(move);
        return true;
    }
    
    // Step to previous move
    previousMove(): boolean {
        if (this.currentMoveIndex <= 0) {
            this.reset();
            return false;
        }
        
        // Save the target index before resetting
        const targetIndex = this.currentMoveIndex - 1;
        
        // Rebuild state from scratch up to the previous move
        this.engine = new GameEngine(this.replayState.seed);
        this.currentMoveIndex = -1;
        
        for (let i = 0; i <= targetIndex; i++) {
            this.currentMoveIndex++;
            const move = this.replayState.moves[this.currentMoveIndex];
            this.applyMoveQuiet(move);
        }
        
        return true;
    }
    
    // Apply a move with visual effects
    private applyMove(move: GameMove): void {
        // Find the shape in the current shapes
        const shapeIndex = this.engine.currentShapes.findIndex(s => 
            s && s.id === move.shapeId
        );
        
        if (shapeIndex === -1) {
            console.error('Shape not found in current shapes:', move.shapeId);
            return;
        }
        
        const result = this.engine.place(shapeIndex, move.boardRow, move.boardCol);
        
        // Add visual effects for cleared cells
        if (result.valid && result.clearedCells && result.clearedCells.length > 0) {
            result.clearedCells.forEach(pt => {
                this.renderer.addEffect(new BlockClearEffect(pt.r, pt.c));
            });
        }
    }
    
    // Apply a move without visual effects (for rebuilding state)
    private applyMoveQuiet(move: GameMove): void {
        const shapeIndex = this.engine.currentShapes.findIndex(s => 
            s && s.id === move.shapeId
        );
        
        if (shapeIndex !== -1) {
            this.engine.place(shapeIndex, move.boardRow, move.boardCol);
        }
    }
    
    // Start automatic playback
    play(): void {
        if (this.isPlaying) return;
        
        this.isPlaying = true;
        this.scheduleNextMove();
    }
    
    // Stop automatic playback
    stop(): void {
        this.isPlaying = false;
        if (this.playbackTimer !== null) {
            clearTimeout(this.playbackTimer);
            this.playbackTimer = null;
        }
    }
    
    // Toggle play/pause
    togglePlayPause(): void {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
        }
    }
    
    private scheduleNextMove(): void {
        if (!this.isPlaying) return;
        
        const delay = 1000 / this.playbackSpeed; // Base delay of 1 second per move
        
        this.playbackTimer = window.setTimeout(() => {
            const hasNext = this.nextMove();
            if (hasNext) {
                this.scheduleNextMove();
            } else {
                this.stop();
            }
        }, delay);
    }
    
    // Clean up
    destroy(): void {
        this.stop();
    }
}
