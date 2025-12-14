import { GameState, Shape, GRID_SIZE, Point, Grid } from '../engine/types.js';
import { THEME } from './theme.js';

export interface Layout {
    boardRect: { x: number, y: number, w: number, h: number, cellSize: number };
    trayRect: { x: number, y: number, w: number, h: number, shapecenters: {x:number, y:number}[] };
}

export class GameRenderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    width: number = 0;
    height: number = 0;
    layout!: Layout;
    
    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error("Could not get 2d context");
        this.ctx = ctx;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        // Parent container dimensions
        const container = this.canvas.parentElement;
        if (!container) return;
        
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        
        this.width = rect.width;
        this.height = rect.height;

        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        
        this.ctx.scale(dpr, dpr);
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';

        this.recalcLayout();
        // Request redraw handled by game loop
    }

    recalcLayout() {
        const padding = THEME.metrics.boardPadding;
        const availableW = this.width - padding * 2;
        // Board is square
        // We want board to be as big as possible but leave room for tray
        // Tray should be at bottom ~25-30%
        
        const trayHeight = this.height * THEME.metrics.trayHeightRatio;
        const boardMaxH = this.height - trayHeight - padding * 2;
        
        const boardSize = Math.min(availableW, boardMaxH);
        
        const boardX = (this.width - boardSize) / 2;
        const boardY = padding; // Top padding

        const cellSize = (boardSize - ((GRID_SIZE - 1) * THEME.metrics.cellGap)) / GRID_SIZE;

        this.layout = {
            boardRect: { x: boardX, y: boardY, w: boardSize, h: boardSize, cellSize },
            trayRect: { 
                x: 0, 
                y: boardY + boardSize + padding, 
                w: this.width, 
                h: this.height - (boardY + boardSize + padding),
                shapecenters: [] // calculated below
            }
        };

        // Calculate 3 slots for shapes in tray
        const slotW = this.width / 3;
        const cy = this.layout.trayRect.y + this.layout.trayRect.h / 2;
        this.layout.trayRect.shapecenters = [
            { x: slotW * 0.5, y: cy },
            { x: slotW * 1.5, y: cy },
            { x: slotW * 2.5, y: cy }
        ];
    }

    draw(state: GameState, dragShape: Shape | null, dragPos: {x:number, y:number} | null, ghostPos: {r:number, c:number} | null, placeability: boolean[] | null) {
        // Clear
        this.ctx.fillStyle = THEME.colors.background;
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.drawBoard(state.grid, ghostPos, dragShape);
        this.drawTray(state.currentShapes, dragShape, state.currentShapes.indexOf(dragShape), placeability);
        
        if (dragShape && dragPos) {
            this.drawShapeAtPixels(dragShape, dragPos.x, dragPos.y, this.layout.boardRect.cellSize * 1.0); 
            // Dragging shape is slightly larger? No, keep same size for accuracy or maybe slightly lifted.
        }
    }

    drawBoard(grid: Grid, ghostPos: {r:number, c:number} | null, dragShape: Shape | null) {
        const { x, y, cellSize } = this.layout.boardRect;
        const gap = THEME.metrics.cellGap;
        const rad = THEME.metrics.borderRadius;

        // Draw Background Slots
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const cx = x + c * (cellSize + gap);
                const cy = y + r * (cellSize + gap);
                
                // Draw Cell
                const cellVal = grid[r * GRID_SIZE + c];
                this.ctx.fillStyle = cellVal === 0 ? THEME.colors.emptyCell : THEME.colors.shapes[cellVal];
                
                // Highlight valid/invalid if ghosting?
                // Actually ghost is drawn on top
                
                this.roundRect(cx, cy, cellSize, cellSize, rad);
                this.ctx.fill();
            }
        }

        // Draw Subdivision Lines
        this.ctx.strokeStyle = THEME.colors.subgridLine;
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        
        // Vertical lines (after col 2 and 5)
        for (let c = 3; c < GRID_SIZE; c += 3) {
             const cx = x + c * (cellSize + gap) - gap/2;
             this.ctx.moveTo(cx, y);
             this.ctx.lineTo(cx, y + GRID_SIZE * (cellSize + gap) - gap);
        }

        // Horizontal lines (after row 2 and 5)
        for (let r = 3; r < GRID_SIZE; r += 3) {
             const cy = y + r * (cellSize + gap) - gap/2;
             this.ctx.moveTo(x, cy);
             this.ctx.lineTo(x + GRID_SIZE * (cellSize + gap) - gap, cy);
        }
        this.ctx.stroke();

        // Draw Ghost
        if (ghostPos && dragShape) {
            this.ctx.fillStyle = THEME.colors.ghost;
            for(const cell of dragShape.cells) {
                const r = ghostPos.r + cell.r;
                const c = ghostPos.c + cell.c;
                if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
                    const cx = x + c * (cellSize + gap);
                    const cy = y + r * (cellSize + gap);
                    this.roundRect(cx, cy, cellSize, cellSize, rad);
                    this.ctx.fill();
                }
            }
            
            // Draw validity overlay? 
            // The prompt asks for: "valid placement in green and invalid in red"
            // We can do this by tinting the ghost or drawing a border
            // I'll re-check game logic for validity passed in? 
            // Actually, the main loop will determine validity. 
            // Renderer just receives "ghostPos" which implies validity (snapped). 
            // But invalid placement needs red.
        }
    }

    drawTray(shapes: (Shape | null)[], draggingShape: Shape | null, draggingIndex: number, placeability: boolean[] | null) {
        const { shapecenters } = this.layout.trayRect;
        const cellSize = this.layout.boardRect.cellSize * 0.6; // Smaller in tray

        shapes.forEach((shape, i) => {
            if (shape && shape !== draggingShape) {
                const center = shapecenters[i];
                
                // Opacity if not placeable
                const isPlaceable = placeability ? placeability[i] : true;
                this.ctx.globalAlpha = isPlaceable ? 1.0 : 0.3;
                
                // Center the shape
                this.drawShapeCentered(shape, center.x, center.y, cellSize);
                
                this.ctx.globalAlpha = 1.0;
            }
        });
    }

    drawShapeCentered(shape: Shape, cx: number, cy: number, cellSize: number) {
        const gap = THEME.metrics.cellGap;
        // Calculate bounds of shape to center it
        let minR=10, maxR=-1, minC=10, maxC=-1;
        shape.cells.forEach(p => {
            if(p.r < minR) minR = p.r;
            if(p.r > maxR) maxR = p.r;
            if(p.c < minC) minC = p.c;
            if(p.c > maxC) maxC = p.c;
        });
        
        const width = (maxC - minC + 1) * (cellSize + gap) - gap;
        const height = (maxR - minR + 1) * (cellSize + gap) - gap;
        
        const startX = cx - width / 2;
        const startY = cy - height / 2;

        this.ctx.fillStyle = THEME.colors.shapes[shape.colorId];
        
        shape.cells.forEach(p => {
             const px = startX + (p.c - minC) * (cellSize + gap);
             const py = startY + (p.r - minR) * (cellSize + gap);
             this.roundRect(px, py, cellSize, cellSize, THEME.metrics.borderRadius);
             this.ctx.fill();
        });
    }
    
    drawShapeAtPixels(shape: Shape, x: number, y: number, cellSize: number) {
        const gap = THEME.metrics.cellGap;
        this.ctx.fillStyle = THEME.colors.shapes[shape.colorId];
        
        // Draw with slight shadow/lift
        this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowOffsetY = 5;

        // Calculate shape bounds to center it
        let minR=10, maxR=-1, minC=10, maxC=-1;
        shape.cells.forEach(p => {
            if(p.r < minR) minR = p.r;
            if(p.r > maxR) maxR = p.r;
            if(p.c < minC) minC = p.c;
            if(p.c > maxC) maxC = p.c;
        });

        const width = (maxC - minC + 1) * (cellSize + gap) - gap;
        const height = (maxR - minR + 1) * (cellSize + gap) - gap;
        
        // x,y is the center position
        const startX = x - width / 2;
        const startY = y - height / 2;

        shape.cells.forEach(p => {
             // We need to draw relative to the bounding box start
             const px = startX + (p.c - minC) * (cellSize + gap);
             const py = startY + (p.r - minR) * (cellSize + gap);
             this.roundRect(px, py, cellSize, cellSize, THEME.metrics.borderRadius);
             this.ctx.fill();
        });

        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetY = 0;
    }

    private roundRect(x: number, y: number, w: number, h: number, r: number) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + r, y);
        this.ctx.arcTo(x + w, y, x + w, y + h, r);
        this.ctx.arcTo(x + w, y + h, x, y + h, r);
        this.ctx.arcTo(x, y + h, x, y, r);
        this.ctx.arcTo(x, y, x + w, y, r);
        this.ctx.closePath();
    }
}
