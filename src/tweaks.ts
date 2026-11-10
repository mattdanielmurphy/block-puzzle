// Feel knobs live in /tweaks.json (shared format with Matt's Tweaks panel, ⌃⌥⌘T).
// The dev server hot-reloads it; app builds bake in whatever the file says at build time.
import file from "../tweaks.json"

type Knob = { value: number | boolean | string }
const knobs = (file as { tweaks: Record<string, Knob> }).tweaks

export function tweak(key: string, fallback: number): number {
	const v = knobs[key]?.value
	return typeof v === "number" ? v : fallback
}
