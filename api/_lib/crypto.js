// api/_lib/crypto.js
// A simple SHA256 utility for demonstration purposes.
// In a production environment, use a robust crypto library or built-in Node.js crypto.

export async function sha256(message: string): Promise<string> {
	const textEncoder = new TextEncoder()
	const data = textEncoder.encode(message)
	const hashBuffer = await crypto.subtle.digest("SHA-256", data)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	const hexHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
	return hexHash
}