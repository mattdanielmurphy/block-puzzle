const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

// Configuration
const DIST_DIR = path.join(__dirname, "dist")
const ASSETS_TO_COPY = [
	{ src: "index.html", dest: "index.html", transform: true },
	{ src: "styles.css", dest: "styles.css" },
	{ src: "manifest.json", dest: "manifest.json" },
	{ src: "service-worker.js", dest: "service-worker.js", transform: true },
	{ src: "assets", dest: "assets", isDir: true },
]

console.log("Build started...")

// 1. Clean dist (optional, but tsc doesn't clear it)
// We won't strictly delete it to be safe, but tsc overwrites.

// 2. Run TypeScript Compiler for client-side code
console.log("Compiling client-side TypeScript...")
try {
	execSync("npx tsc --build tsconfig.web.json", { stdio: "inherit" })
} catch (e) {
	console.error("Client-side TypeScript compilation failed.")
	process.exit(1)
}

// 3. Run TypeScript Compiler for API routes
console.log("Compiling API routes TypeScript...")
try {
	// Clean up dist/api first to prevent conflicts from previous builds if module types changed
	if (fs.existsSync(path.join(DIST_DIR, "api"))) {
		fs.rmSync(path.join(DIST_DIR, "api"), { recursive: true, force: true })
	}
	execSync("npx tsc --build tsconfig.api.json", { stdio: "inherit" })
} catch (e) {
	console.error("API routes TypeScript compilation failed.")
	process.exit(1)
}

// 4. Copy Assets
console.log("Copying assets...")
if (!fs.existsSync(DIST_DIR)) {
	fs.mkdirSync(DIST_DIR)
}

ASSETS_TO_COPY.forEach((item) => {
	const sourcePath = path.join(__dirname, item.src)
	const destPath = path.join(DIST_DIR, item.dest)

	if (!fs.existsSync(sourcePath)) {
		console.warn(`Warning: Source not found: ${item.src}`)
		return
	}

	if (item.isDir) {
		// Recursive copy for directories
		fs.cpSync(sourcePath, destPath, { recursive: true })
	} else {
		if (item.transform) {
			let content = fs.readFileSync(sourcePath, "utf8")

			if (item.src === "index.html") {
				const timestamp = Date.now()
				// Fix script path for the built bundle and add cache buster.
				// Use a *relative* URL so this works whether the site is served from / or a subpath (e.g. /dist/ or GitHub Pages).
				content = content.replace('src="dist/src/main.js"', `src="src/main.js?v=${timestamp}"`)

				// Add cache buster to CSS (also relative for the same reason)
				content = content.replace('href="styles.css"', `href="styles.css?v=${timestamp}"`)
			} else if (item.src === "service-worker.js") {
				const timestamp = Date.now()
				// Fix paths: "./dist/src/..." -> "./src/..."
				content = content.replace(/\.\/dist\/src\//g, "./src/")
				// Update Cache Name to force refresh
				content = content.replace(/const CACHE_NAME = ['"]block-puzzle-v1['"](;?)/, `const CACHE_NAME = 'block-puzzle-v${timestamp}'$1`)
			}

			fs.writeFileSync(destPath, content)
		} else {
			fs.copyFileSync(sourcePath, destPath)
		}
	}
})

console.log("Build complete! Output directory: ./dist")
