import { Layout } from './renderer.js';
import { THEME } from './theme.js';
import { GRID_SIZE } from '../engine/types.js';

export interface Effect {
    isFinished: boolean;
    update(dt: number): void;
    draw(ctx: CanvasRenderingContext2D, layout: Layout): void;
}

export class BlockClearEffect implements Effect {
    isFinished: boolean = false;
    life: number = 0;
    readonly DURATION = 0.4;
    
    r: number;
    c: number;
    colorFn: (life: number) => string;

    constructor(r: number, c: number) {
        this.r = r;
        this.c = c;
        // White flash then fade
        this.colorFn = (t: number) => {
             const alpha = 1.0 - (t / this.DURATION);
             return `rgba(255, 255, 255, ${alpha})`;
        };
    }

    update(dt: number) {
        this.life += dt;
        if (this.life >= this.DURATION) {
            this.isFinished = true;
        }
    }

    draw(ctx: CanvasRenderingContext2D, layout: Layout) {
        const { x, y, cellSize } = layout.boardRect;
        const gap = THEME.metrics.cellGap;
        
        const cx = x + this.c * (cellSize + gap);
        const cy = y + this.r * (cellSize + gap);
        const rad = THEME.metrics.borderRadius;

        const progress = this.life / this.DURATION;
        // Shrink effect
        const scale = 1.0 - progress * 0.5; // Shrink to 50%
        const size = cellSize * scale;
        const offset = (cellSize - size) / 2;

        ctx.fillStyle = this.colorFn(this.life);
        
        // Custom round rect for effect
        ctx.beginPath();
        const drawX = cx + offset;
        const drawY = cy + offset;
        const drawW = size;
        const drawH = size;
        let effRad = rad * scale; // Adjust radius with scale
        
        // Simple rect for speed or round rect
        // Re-implement round rect inline or reuse utility?
        // Renderer has private roundRect. Let's just do fillRect for flash or make it standard.
        // Let's implement simple round rect here strictly for the effect
        // actually easier to just expose roundRect or duplicate minimal logic
        
        if (drawW < 2 * effRad) effRad = drawW / 2;
        ctx.moveTo(drawX + effRad, drawY);
        ctx.arcTo(drawX + drawW, drawY, drawX + drawW, drawY + drawH, effRad);
        ctx.arcTo(drawX + drawW, drawY + drawH, drawX, drawY + drawH, effRad);
        ctx.arcTo(drawX, drawY + drawH, drawX, drawY, effRad);
        ctx.arcTo(drawX, drawY, drawX + drawW, drawY, effRad);
        ctx.closePath();
        
        ctx.fill();
    }
}
