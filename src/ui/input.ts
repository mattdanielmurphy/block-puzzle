import { GameRenderer } from './renderer.js';
import { GameState, Shape } from '../engine/types.js';
import { THEME } from './theme.js';

export interface DragState {
    shapeIndex: number;
    shape: Shape;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    touchOffsetX: number; // Offset from finger to shape anchor
    touchOffsetY: number;
}

export type InputEvents = {
    onDragStart: (shapeIndex: number) => void;
    onDragMove: (x: number, y: number) => void;
    onDragEnd: (r: number, c: number) => void; // r,c is board coord or -1,-1
}

export class InputManager {
    canvas: HTMLCanvasElement;
    renderer: GameRenderer;
    events: InputEvents;
    dragState: DragState | null = null;
    
    public sensitivity: number = 1.5;

    constructor(canvas: HTMLCanvasElement, renderer: GameRenderer, events: InputEvents) {
        this.canvas = canvas;
        this.renderer = renderer;
        this.events = events;
        
        this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
        this.canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
        this.canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
        this.canvas.addEventListener('pointercancel', this.onPointerUp.bind(this));
    }

    private onPointerDown(e: PointerEvent) {
        // Prevent default browser actions
        e.preventDefault();
        
        const { left, top } = this.canvas.getBoundingClientRect();
        const x = e.clientX - left;
        const y = e.clientY - top;

        // Check if hitting a shape in tray
        const { trayRect } = this.renderer.layout;
        // Hit test based on centers and approx size
        // We know there are 3 slots.
        const slotW = trayRect.w / 3;
        
        // Simple hit test: if y is in tray area
        if (y >= trayRect.y) {
            const index = Math.floor(x / slotW);
            if (index >= 0 && index < 3) {
                 // Calculate exact distance to center? Or just fuzzy.
                 // Fuzzy is fine for finger.
                 
                 // We need to know if there's actually a shape there.
                 // Assuming Game passes existing shapes or we ask Game?
                 // InputManager handles interaction, expects Game to confirm via checking state or callback
                 // But strictly, InputManager shouldn't know GameState directly unless passed.
                 
                 // I'll emit DragStart with index. Game will ignore if null.
                 
                 // But for drag offset, we need the initial "Shape Visual Center".
                 // The renderer calculates centers.
                 const center = trayRect.shapecenters[index];
                 
                 // Start drag
                 this.canvas.setPointerCapture(e.pointerId);
                 this.dragState = {
                     shapeIndex: index,
                     shape: null as any, // Filled by Game via callback or shared state? 
                     // Let's pass the state or just indices. 
                     // For cleaner arch, I'll let the user of this class set the shape data or just "active".
                     // But I need touch offset.
                     
                     startX: x,
                     startY: y,
                     currentX: x,
                     currentY: y,
                     // We want the shape to appear under the finger initially.
                     // The visual center is `center`. Finger is at `x,y`.
                     touchOffsetX: center.x - x,
                     touchOffsetY: center.y - y
                 };
                 
                 this.events.onDragStart(index);
                 
                 // Immediate move to set initial position and prevent disappearance frame
                 // Initial move is 1:1, delta is 0
                 const visualX = x + this.dragState.touchOffsetX;
                 const visualY = y + this.dragState.touchOffsetY;
                 this.events.onDragMove(visualX, visualY);
            }
        }
    }

    private onPointerMove(e: PointerEvent) {
        if (!this.dragState) return;
        e.preventDefault();

        const { left, top } = this.canvas.getBoundingClientRect();
        const x = e.clientX - left;
        const y = e.clientY - top;

        this.dragState.currentX = x;
        this.dragState.currentY = y;

        // Apply sensitivity to the DELTA from start
        // Delta = (CurrentFinger - StartFinger) * sensitivity
        const deltaX = (x - this.dragState.startX) * this.sensitivity;
        const deltaY = (y - this.dragState.startY) * this.sensitivity;

        // Visual Position = StartFinger + Offset + Delta
        // (StartFinger + Offset) was the original center position of the shape
        const originX = this.dragState.startX + this.dragState.touchOffsetX;
        const originY = this.dragState.startY + this.dragState.touchOffsetY;
        
        const visualX = originX + deltaX;
        const visualY = originY + deltaY;

        this.events.onDragMove(visualX, visualY);
    }

    private onPointerUp(e: PointerEvent) {
        if (!this.dragState) return;
        e.preventDefault();
        this.canvas.releasePointerCapture(e.pointerId);

        // Determine drop target
        // We need to map screen coords to board grid (r, c)
        // Board logic:
        const { boardRect } = this.renderer.layout;
        const gap = THEME.metrics.cellGap;
        const cellSize = boardRect.cellSize + gap;
        
        // Calculate final visual position using same sensitivity logic
        const deltaX = (this.dragState.currentX - this.dragState.startX) * this.sensitivity;
        const deltaY = (this.dragState.currentY - this.dragState.startY) * this.sensitivity;
        
        const originX = this.dragState.startX + this.dragState.touchOffsetX;
        const originY = this.dragState.startY + this.dragState.touchOffsetY;

        const visualX = originX + deltaX;
        const visualY = originY + deltaY;
        
        // Inverse transform
        // visualX = boardX + c * cellSize -> c = (visualX - boardX) / cellSize
        // But visualX is the ANCHOR (0,0 of shape). 
        // We want to snap to the nearest cell.
        
        // Snap logic: Round to nearest cell
        const c = Math.round((visualX - boardRect.x) / cellSize);
        const r = Math.round((visualY - boardRect.y) / cellSize);
        
        this.events.onDragEnd(r, c);
        this.dragState = null;
    }
}
