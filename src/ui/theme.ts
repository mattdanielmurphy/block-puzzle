export const THEME = {
    colors: {
        background: '#121214',
        boardBackground: '#1e1e24',
        emptyCell: '#2a2a35',
        gridLines: '#121214',
        subgridLine: '#50505c',
        ghost: 'rgba(255, 255, 255, 0.2)',
        validOverlay: 'rgba(100, 255, 100, 0.3)',
        invalidOverlay: 'rgba(255, 100, 100, 0.3)',
        text: '#ffffff',
        
        // Shape Colors (Palette)
        shapes: [
            '#000000', // 0 unused
            '#FFFFFF', // 1: White
            '#FFFFFF', // 2: White
            '#FFFFFF', // 3: White
            '#FFFFFF', // 4: White
            '#FFFFFF', // 5: White
        ]
    },
    metrics: {
        cellGap: 2,
        borderRadius: 4,
        boardPadding: 10,
        trayHeightRatio: 0.3, // Bottom 30% is tray
    }
};
