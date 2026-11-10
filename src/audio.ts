// Synthesized sound effects (Web Audio, no sample files, nothing AI-made).
// Soft and short on purpose: a wooden "tock" for placing, glassy chimes for clears.
// Clears climb a pentatonic scale with the streak, so a long streak plays a little melody.
import { tweak } from "./tweaks"

const PENTA = [0, 2, 4, 7, 9] // major pentatonic steps
const BASE_HZ = 392 // G4

function noteHz(step: number): number {
	const octave = Math.floor(step / PENTA.length)
	const semis = PENTA[((step % PENTA.length) + PENTA.length) % PENTA.length] + octave * 12
	return BASE_HZ * Math.pow(2, semis / 12)
}

class SoundManager {
	private ctx: AudioContext | null = null
	private out: GainNode | null = null
	private wet: GainNode | null = null
	private noiseBuf: AudioBuffer | null = null
	private _enabled = true
	private _volume = 0.8

	constructor() {
		try {
			this._enabled = localStorage.getItem("bp_sound_enabled") !== "false"
			const v = parseFloat(localStorage.getItem("bp_sound_volume") ?? "")
			if (!isNaN(v)) this._volume = Math.min(1, Math.max(0, v))
		} catch {}

		// Mix with the player's music and respect the ring/silent switch (Safari 17+ / WKWebView).
		const nav = navigator as any
		if (nav.audioSession) {
			try {
				nav.audioSession.type = "ambient"
			} catch {}
		}

		// Browsers only allow audio after a user gesture: unlock on the first touch/click/key.
		const unlock = () => {
			this.ensure()
			if (this.ctx && this.ctx.state !== "running") this.ctx.resume().catch(() => {})
		}
		window.addEventListener("pointerdown", unlock, true)
		window.addEventListener("keydown", unlock, true)
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible") unlock()
		})
	}

	get enabled() {
		return this._enabled
	}
	set enabled(v: boolean) {
		this._enabled = v
		try {
			localStorage.setItem("bp_sound_enabled", String(v))
		} catch {}
		this.applyVolume()
	}

	get volume() {
		return this._volume
	}
	set volume(v: number) {
		this._volume = Math.min(1, Math.max(0, v))
		try {
			localStorage.setItem("bp_sound_volume", String(this._volume))
		} catch {}
		this.applyVolume()
	}

	private applyVolume() {
		if (!this.ctx || !this.out) return
		const target = this._enabled ? this._volume * tweak("sound.master", 0.55) : 0
		this.out.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02)
		if (this.wet) this.wet.gain.value = tweak("sound.reverb", 0.18)
	}

	private ensure(): AudioContext | null {
		if (this.ctx) return this.ctx
		const AC = window.AudioContext || (window as any).webkitAudioContext
		if (!AC) return null
		const ctx: AudioContext = new AC()
		this.ctx = ctx

		// Gentle limiter so stacked chimes never clip.
		const comp = ctx.createDynamicsCompressor()
		comp.threshold.value = -14
		comp.knee.value = 12
		comp.ratio.value = 4
		comp.attack.value = 0.003
		comp.release.value = 0.15
		comp.connect(ctx.destination)

		this.out = ctx.createGain()
		this.out.connect(comp)

		// Small synthetic room: decaying stereo noise impulse.
		const len = Math.floor(ctx.sampleRate * 1.2)
		const ir = ctx.createBuffer(2, len, ctx.sampleRate)
		for (let ch = 0; ch < 2; ch++) {
			const d = ir.getChannelData(ch)
			for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2)
		}
		const verb = ctx.createConvolver()
		verb.buffer = ir
		this.wet = ctx.createGain()
		verb.connect(this.wet)
		this.wet.connect(this.out)
		this.verbIn = verb

		const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate)
		const nd = nb.getChannelData(0)
		for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
		this.noiseBuf = nb

		this.applyVolume()
		return ctx
	}
	private verbIn: ConvolverNode | null = null

	private ready(): AudioContext | null {
		if (!this._enabled || this._volume <= 0) return null
		const ctx = this.ensure()
		if (!ctx || !this.out) return null
		// A suspended context keeps its clock still, so sounds queued now play the moment it resumes.
		if (ctx.state !== "running") ctx.resume().catch(() => {})
		return ctx
	}

	/** One enveloped oscillator voice. */
	private tone(
		ctx: AudioContext,
		opts: { type?: OscillatorType; freq: number; freqEnd?: number; start?: number; attack?: number; decay: number; gain: number; reverb?: boolean; pan?: number }
	) {
		const t0 = ctx.currentTime + (opts.start ?? 0)
		const osc = ctx.createOscillator()
		osc.type = opts.type ?? "sine"
		osc.frequency.setValueAtTime(opts.freq, t0)
		if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + opts.decay * 0.6)
		const g = ctx.createGain()
		const attack = opts.attack ?? 0.004
		g.gain.setValueAtTime(0.0001, t0)
		g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t0 + attack)
		g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + opts.decay)
		osc.connect(g)
		let node: AudioNode = g
		if (opts.pan && ctx.createStereoPanner) {
			const p = ctx.createStereoPanner()
			p.pan.value = opts.pan
			g.connect(p)
			node = p
		}
		node.connect(this.out!)
		if (opts.reverb && this.verbIn) node.connect(this.verbIn)
		osc.start(t0)
		osc.stop(t0 + attack + opts.decay + 0.05)
	}

	/** Short filtered noise burst (the "wood" in the tock, the air in the shimmer). */
	private noise(ctx: AudioContext, opts: { start?: number; decay: number; gain: number; freq: number; q?: number; type?: BiquadFilterType; reverb?: boolean }) {
		if (!this.noiseBuf) return
		const t0 = ctx.currentTime + (opts.start ?? 0)
		const src = ctx.createBufferSource()
		src.buffer = this.noiseBuf
		const f = ctx.createBiquadFilter()
		f.type = opts.type ?? "bandpass"
		f.frequency.value = opts.freq
		f.Q.value = opts.q ?? 1
		const g = ctx.createGain()
		g.gain.setValueAtTime(opts.gain, t0)
		g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.decay)
		src.connect(f)
		f.connect(g)
		g.connect(this.out!)
		if (opts.reverb && this.verbIn) g.connect(this.verbIn)
		src.start(t0)
		src.stop(t0 + opts.decay + 0.02)
	}

	/** A glassy bell: fundamental plus a quiet inharmonic partial. */
	private bell(ctx: AudioContext, freq: number, start: number, gain: number, decay: number, pan = 0) {
		this.tone(ctx, { freq, start, decay, gain, reverb: true, pan })
		this.tone(ctx, { freq: freq * 2.76, start, decay: decay * 0.35, gain: gain * 0.18, reverb: true, pan })
		this.tone(ctx, { type: "triangle", freq: freq * 2, start, decay: decay * 0.5, gain: gain * 0.12, reverb: true, pan })
	}

	pickUp() {
		const ctx = this.ready()
		if (!ctx) return
		const v = tweak("sound.pickup", 0.35)
		this.tone(ctx, { freq: 620, freqEnd: 900, decay: 0.07, gain: 0.22 * v })
	}

	place() {
		const ctx = this.ready()
		if (!ctx) return
		const v = tweak("sound.place", 0.7)
		const pitch = 1 + (Math.random() - 0.5) * 0.08 // tiny variation so repeats don't sound robotic
		this.tone(ctx, { type: "triangle", freq: 210 * pitch, freqEnd: 140 * pitch, decay: 0.11, gain: 0.5 * v })
		this.noise(ctx, { decay: 0.035, gain: 0.35 * v, freq: 1800 * pitch, q: 1.4 })
	}

	invalid() {
		const ctx = this.ready()
		if (!ctx) return
		const v = tweak("sound.invalid", 0.45)
		this.tone(ctx, { type: "triangle", freq: 170, freqEnd: 150, decay: 0.09, gain: 0.4 * v })
		this.tone(ctx, { type: "triangle", freq: 130, freqEnd: 110, start: 0.09, decay: 0.12, gain: 0.4 * v })
	}

	/**
	 * Lines/boxes cleared. Bigger combos play more notes; the streak lifts the starting note,
	 * so consecutive clears climb like a melody.
	 */
	clear(lines: number, streak: number) {
		const ctx = this.ready()
		if (!ctx) return
		const v = tweak("sound.clear", 0.55)
		const decay = tweak("sound.chimeDecay", 0.9)
		const gap = tweak("sound.arpGap", 0.06)
		const root = Math.min(Math.max(streak - 1, 0), 9)
		const notes = Math.min(1 + lines, 5)
		for (let i = 0; i < notes; i++) {
			const step = root + i * 2
			const pan = notes > 1 ? -0.3 + (0.6 * i) / (notes - 1) : 0
			this.bell(ctx, noteHz(step), i * gap, (0.32 * v) / Math.sqrt(1 + i * 0.4), decay, pan)
		}
		if (lines >= 2) {
			// Combo: an airy shimmer on top plus a soft low root.
			this.noise(ctx, { start: 0.02, decay: 0.35 + 0.1 * lines, gain: 0.05 * v * Math.min(lines, 4), freq: 7000, q: 0.8, type: "highpass", reverb: true })
			this.tone(ctx, { freq: noteHz(root) / 2, decay: decay * 1.2, gain: 0.18 * v, attack: 0.01, reverb: true })
		}
	}

	bomb() {
		const ctx = this.ready()
		if (!ctx) return
		const v = tweak("sound.clear", 0.55)
		this.tone(ctx, { freq: 120, freqEnd: 45, decay: 0.35, gain: 0.55 * v })
		this.noise(ctx, { decay: 0.4, gain: 0.25 * v, freq: 500, q: 0.7, type: "lowpass", reverb: true })
	}

	gameOver() {
		const ctx = this.ready()
		if (!ctx) return
		const v = tweak("sound.gameOver", 0.5)
		const seq = [7, 4, 2, 0]
		seq.forEach((s, i) => this.tone(ctx, { type: "triangle", freq: noteHz(s) / 2, start: i * 0.16, attack: 0.02, decay: 0.5 + i * 0.12, gain: 0.3 * v, reverb: true }))
	}

	newBest() {
		const ctx = this.ready()
		if (!ctx) return
		const v = tweak("sound.newBest", 0.5)
		const seq = [5, 7, 9, 10]
		seq.forEach((s, i) => this.bell(ctx, noteHz(s), i * 0.09, 0.26 * v, i === seq.length - 1 ? 1.4 : 0.5))
	}

	/** Preview used by the volume slider. */
	preview() {
		this.place()
	}
}

export const sound = new SoundManager()
