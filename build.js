const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const DIST_DIR = path.join(__dirname, 'dist');
const ASSETS_TO_COPY = [
    { src: 'index.html', dest: 'index.html', transform: true },
    { src: 'styles.css', dest: 'styles.css' },
    { src: 'manifest.json', dest: 'manifest.json' },
    { src: 'service-worker.js', dest: 'service-worker.js' },
    { src: 'assets', dest: 'assets', isDir: true }
];

console.log('Build started...');

// 1. Clean dist (optional, but tsc doesn't clear it)
// We won't strictly delete it to be safe, but tsc overwrites.

// 2. Run TypeScript Compiler
console.log('Compiling TypeScript...');
try {
    execSync('npx tsc', { stdio: 'inherit' });
} catch (e) {
    console.error('TypeScript compilation failed.');
    process.exit(1);
}

// 3. Copy Assets
console.log('Copying assets...');
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR);
}

ASSETS_TO_COPY.forEach(item => {
    const sourcePath = path.join(__dirname, item.src);
    const destPath = path.join(DIST_DIR, item.dest);

    if (!fs.existsSync(sourcePath)) {
        console.warn(`Warning: Source not found: ${item.src}`);
        return;
    }

    if (item.isDir) {
        // Recursive copy for directories
        fs.cpSync(sourcePath, destPath, { recursive: true });
    } else {
        if (item.transform && item.src === 'index.html') {
            // Special handling for index.html
            let content = fs.readFileSync(sourcePath, 'utf8');
            
            // Fix script path: "dist/src/main.js" -> "src/main.js"
            content = content.replace('src="dist/src/main.js"', 'src="src/main.js"');
            
            fs.writeFileSync(destPath, content);
        } else {
            fs.copyFileSync(sourcePath, destPath);
        }
    }
});

console.log('Build complete! Output directory: ./dist');
