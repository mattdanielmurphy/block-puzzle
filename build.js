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

const packageJson = require("./package.json")
const homepage = packageJson.homepage || ""

console.log("Build started...")
if (homepage) {
	console.log(`Using homepage base path: ${homepage}`)
}

// 1. Clean dist (optional, but tsc doesn't clear it)
// We won't strictly delete it to be safe, but tsc overwrites.

// 2. Run TypeScript Compiler
console.log("Compiling TypeScript...")
try {
	execSync("npx tsc", { stdio: "inherit" })
} catch (e) {
	console.error("TypeScript compilation failed.")
	process.exit(1)
}

// 3. Copy Assets
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
				// Fix script path: "dist/src/main.js" -> "src/main.js"
				content = content.replace('src="dist/src/main.js"', 'src="src/main.js"')

				// Inject base tag if homepage is set
				// Inject dynamic base tag script to support both root and subdirectory deployment
				// and handle missing trailing slashes (e.g. /blocks vs /blocks/)
				const baseScript = `<script>
    (function() {
        var path = window.location.pathname;
        if (!path.endsWith('/') && path.split('/').pop().indexOf('.') === -1) {
            path += '/';
        } else if (path.split('/').pop().indexOf('.') !== -1) {
            path = path.substring(0, path.lastIndexOf('/') + 1);
        }
        document.write('<base href="' + path + '" />');
    })();
</script>`
				content = content.replace("<head>", `<head>\n    ${baseScript}`)
			} else if (item.src === "service-worker.js") {
				// Fix paths: "./dist/src/..." -> "./src/..."
				// utilizing a global regex to replace all occurrences
				content = content.replace(/\.\/dist\/src\//g, "./src/")
			}

			fs.writeFileSync(destPath, content)
		} else {
			fs.copyFileSync(sourcePath, destPath)
		}
	}
})

console.log("Build complete! Output directory: ./dist")
