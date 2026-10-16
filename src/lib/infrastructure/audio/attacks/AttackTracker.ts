import { magnitudeSpectrumInto } from '../spectral/fft';
import { createSemitoneFilterbank, type SemitoneFilterbank } from '../spectral/semitoneBands';
import { DEFAULT_ATTACK_CONFIG, type AttackConfig } from './config';

export interface DetectedAttack {
	/** Audio time (s) of the attack's start, before latency correction. */
	time: number;
	/** Flux of the attack against the strongest of the last seconds, in [0, 1]. */
	strength: number;
}

/** Strength compares an attack with the flux heard over this long. */
const STRENGTH_MEMORY_S = 4;
/** Magnitudes are scaled so a window reads alike at any rate (as 2048 points do at 48 kHz). */
const REFERENCE_WINDOW_SUM = 1024;
/** Raw samples kept beyond the analysis window, for the refinement. */
const HISTORY_EXTRA_S = 0.2;
/** Without a sharper reading, the onset is taken this long before the peak frame's end. */
const COARSE_BEFORE_END_MS = 5;
/** The onset is looked for in the raw samples from this long before the peak frame's end… */
const REFINE_BEFORE_MS = 30;
/** …to this long after it. */
const REFINE_AFTER_MS = 5;
/** The sound before the search is predicted from this long of it (and is the background). */
const REFINE_BACKGROUND_MS = 20;
/** Order of the linear prediction of the sound already ringing. */
const REFINE_ORDER = 24;
/** Residual RMS measured over this long, ending at the candidate sample. */
const REFINE_RMS_MS = 1;
/** The onset is where the residual RMS first exceeds the background this many times… */
const REFINE_RATIO = 4;
/** …and this floor (digital silence predicts perfectly). */
const REFINE_FLOOR_RMS = 1e-4;

function nearestPowerOfTwo(n: number): number {
	const below = 2 ** Math.floor(Math.log2(n));
	return n - below <= below * 2 - n ? below : below * 2;
}

/**
 * Online SuperFlux onset detector (Böck and Widmer, DAFx 2013): positive flux of a log
 * quarter-tone spectrum against a reference frame widened by a maximum filter across bands (a
 * vibrato or a bend raises no flux), local adaptive threshold, peak picking. The onset time is
 * then refined in the raw samples, where the sound stops being predictable from what rang before.
 * Peaks closer than `mergeMs` are one attack, timed at the strongest, so an attack is emitted
 * `mergeMs` after its peak at the latest.
 */
export class AttackTracker {
	private readonly config: AttackConfig;
	private readonly fftSize: number;
	private readonly hop: number;
	private readonly lag: number;
	private readonly maxRadius: number;
	private readonly preMax: number;
	private readonly postMax: number;
	private readonly preAvg: number;
	private readonly postAvg: number;
	private readonly settleAfter: number;
	private readonly minGap: number;
	private readonly merge: number;
	private readonly strengthFrames: number;
	private readonly bank: SemitoneFilterbank;
	private readonly hann: Float64Array;
	private readonly gain: number;
	private readonly frame: Float64Array;
	/** Buffers of the analysis, reused by every frame. */
	private readonly scratch: { re: Float64Array; im: Float64Array };
	private readonly magnitudes: Float64Array;
	private readonly reference: Float64Array;

	private readonly history: Float32Array;
	private readonly historyMask: number;
	private readonly spectra: Float64Array[];
	private readonly flux: Float64Array;

	/** Audio time of the first sample since the last reset. */
	private origin: number | null = null;
	/** Where the next block should start, in audio time. */
	private expected: number | null = null;
	/** Samples received since the last reset. */
	private received = 0;
	/** Frames analysed since the last reset. */
	private frames = 0;
	/** Peak frame of the last attack emitted. */
	private lastPeak = -Infinity;
	/** Sample of the last emitted attack's onset. */
	private lastOnset = -Infinity;
	/** The strongest peak of the attack being heard, emitted once `mergeMs` has passed after it. */
	private pending: { peak: number; flux: number; onset: number; attack: DetectedAttack } | null =
		null;

	constructor(
		private readonly sampleRate: number,
		config: Partial<AttackConfig> = {}
	) {
		this.config = { ...DEFAULT_ATTACK_CONFIG, ...config };
		const c = this.config;
		const steps = (ms: number) => Math.max(0, Math.round(ms / c.hopMs));
		this.fftSize = nearestPowerOfTwo((c.windowMs / 1000) * sampleRate);
		this.hop = Math.max(1, Math.round((c.hopMs / 1000) * sampleRate));
		this.lag = Math.max(1, Math.round(c.lagMs / c.hopMs));
		this.maxRadius = Math.floor(c.maxFilterBands / 2);
		this.preMax = steps(c.preMaxMs);
		this.postMax = steps(c.postMaxMs);
		this.preAvg = steps(c.preAvgMs);
		this.postAvg = steps(c.postAvgMs);
		this.settleAfter = Math.max(this.postMax, this.postAvg);
		this.minGap = steps(c.minGapMs);
		this.merge = steps(c.mergeMs);
		this.strengthFrames = steps(STRENGTH_MEMORY_S * 1000);

		this.bank = createSemitoneFilterbank({ sampleRate, fftSize: this.fftSize });
		this.hann = new Float64Array(this.fftSize);
		let windowSum = 0;
		for (let i = 0; i < this.fftSize; i++) {
			this.hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.fftSize);
			windowSum += this.hann[i];
		}
		this.gain = REFERENCE_WINDOW_SUM / windowSum;
		this.frame = new Float64Array(this.fftSize);
		this.scratch = { re: new Float64Array(this.fftSize), im: new Float64Array(this.fftSize) };
		this.magnitudes = new Float64Array(this.fftSize / 2);
		this.reference = new Float64Array(this.bank.bands);

		const historySize = 2 ** Math.ceil(Math.log2(this.fftSize + HISTORY_EXTRA_S * sampleRate));
		this.history = new Float32Array(historySize);
		this.historyMask = historySize - 1;
		this.spectra = Array.from({ length: this.lag + 1 }, () => new Float64Array(this.bank.bands));
		const kept = Math.max(this.strengthFrames, this.preMax, this.preAvg) + this.settleAfter + 1;
		this.flux = new Float64Array(kept);
	}

	/** Feeds one block of mono samples starting at `frameTime` (audio s); returns the attacks settled by it. */
	push(samples: Float32Array, frameTime: number): DetectedAttack[] {
		const attacks: DetectedAttack[] = [];
		const halfBlock = samples.length / 2 / this.sampleRate;
		if (this.expected !== null && Math.abs(frameTime - this.expected) > halfBlock) {
			if (this.pending) attacks.push(this.pending.attack);
			this.reset();
		}
		if (this.origin === null) this.origin = frameTime;
		this.expected = frameTime + samples.length / this.sampleRate;

		for (let i = 0; i < samples.length; i++) {
			this.history[this.received & this.historyMask] = samples[i];
			this.received++;
			if (this.received === this.fftSize + this.frames * this.hop) {
				const attack = this.analyse();
				if (attack) attacks.push(attack);
			}
		}
		return attacks;
	}

	/** Forgets the past (a gap in the input). */
	reset(): void {
		this.origin = null;
		this.expected = null;
		this.received = 0;
		this.frames = 0;
		this.lastPeak = -Infinity;
		this.lastOnset = -Infinity;
		this.pending = null;
		this.flux.fill(0);
	}

	private sampleAt(index: number): number {
		return this.history[index & this.historyMask];
	}

	private fluxAt(frame: number): number {
		return this.flux[frame % this.flux.length];
	}

	/** End (exclusive sample index) of frame `f`. */
	private frameEnd(f: number): number {
		return this.fftSize + f * this.hop;
	}

	/** Analyses the frame ending at the last sample received, then settles the frame due. */
	private analyse(): DetectedAttack | null {
		const n = this.fftSize;
		const start = this.received - n;
		let energy = 0;
		for (let i = 0; i < n; i++) {
			const sample = this.sampleAt(start + i);
			energy += sample * sample;
			this.frame[i] = sample * this.hann[i];
		}
		const magnitudes = this.magnitudes;
		magnitudeSpectrumInto(this.frame, magnitudes, this.scratch);
		for (let i = 0; i < magnitudes.length; i++) magnitudes[i] *= this.gain;
		const t = this.frames;
		const current = this.spectra[t % this.spectra.length];
		this.bank.apply(magnitudes, current);

		let flux = 0;
		if (t >= this.lag && Math.sqrt(energy / n) >= this.config.minRms) {
			const past = this.spectra[(t - this.lag) % this.spectra.length];
			const bands = past.length;
			for (let b = 0; b < bands; b++) {
				let max = past[b];
				const last = Math.min(bands - 1, b + this.maxRadius);
				for (let k = Math.max(0, b - this.maxRadius); k <= last; k++) {
					if (past[k] > max) max = past[k];
				}
				this.reference[b] = max;
			}
			for (let b = 0; b < bands; b++) flux += Math.max(0, current[b] - this.reference[b]);
		}
		this.flux[t % this.flux.length] = flux;
		this.frames++;
		return this.settle(t - this.settleAfter);
	}

	/**
	 * Settles frame `c`, whose look-ahead is now complete: emits the attack held once `mergeMs`
	 * has passed after its peak, then holds `c` if it is a peak, unless a stronger one is held.
	 */
	private settle(c: number): DetectedAttack | null {
		if (c < 0) return null;
		let emitted: DetectedAttack | null = null;
		if (this.pending && c - this.pending.peak >= this.merge) {
			emitted = this.pending.attack;
			this.lastPeak = this.pending.peak;
			this.lastOnset = this.pending.onset;
			this.pending = null;
		}
		const value = this.fluxAt(c);
		if (!this.isPeak(c, value) || (this.pending && this.pending.flux >= value)) return emitted;

		let recent = Math.max(value, this.config.strengthFloor);
		for (let f = Math.max(0, c - this.strengthFrames + 1); f < c; f++) {
			recent = Math.max(recent, this.fluxAt(f));
		}
		// Refined against the last attack emitted, never against the weaker peak this one replaces.
		const onset = this.refine(this.frameEnd(c));
		this.pending = {
			peak: c,
			flux: value,
			onset,
			attack: {
				time: (this.origin ?? 0) + onset / this.sampleRate,
				strength: Math.min(1, Math.max(0, value / recent))
			}
		};
		return emitted;
	}

	/** Whether frame `c` is a flux peak standing above its neighbourhood. */
	private isPeak(c: number, value: number): boolean {
		if (value <= 0 || c - this.lastPeak < this.minGap) return false;
		for (let f = Math.max(0, c - this.preMax); f <= c + this.postMax; f++) {
			if (this.fluxAt(f) > value) return false;
		}
		let sum = 0;
		let count = 0;
		for (let f = Math.max(0, c - this.preAvg); f <= c + this.postAvg; f++) {
			sum += this.fluxAt(f);
			count++;
		}
		return value >= sum / count + this.config.delta;
	}

	/**
	 * The onset of the attack whose flux peaks in the frame ending at `end`: the first sample
	 * where the sound stops following its linear prediction from the background just before
	 * (residual RMS over the last millisecond above `REFINE_RATIO` times the background's
	 * median). Never before the last emitted attack plus the minimum gap.
	 */
	private refine(end: number): number {
		const ms = this.sampleRate / 1000;
		const coarse = Math.round(end - COARSE_BEFORE_END_MS * ms);
		const rmsLength = Math.max(1, Math.round(REFINE_RMS_MS * ms));
		const oldest = Math.max(0, this.received - this.history.length);
		const from = Math.max(
			Math.round(end - REFINE_BEFORE_MS * ms),
			this.lastOnset + Math.round(this.config.minGapMs * ms),
			oldest + REFINE_ORDER + rmsLength
		);
		const to = Math.min(this.received - 1, Math.round(end + REFINE_AFTER_MS * ms));
		// Never before the window's start, which already keeps the minimum gap from the last onset.
		const fallback = Math.max(coarse, from);
		if (from > to) return fallback;
		const fitStart = Math.max(oldest, from - Math.round(REFINE_BACKGROUND_MS * ms));

		const length = to - fitStart + 1;
		const x = new Float64Array(length);
		for (let i = 0; i < length; i++) x[i] = this.sampleAt(fitStart + i);
		const fitLength = from - fitStart;
		const order = Math.min(REFINE_ORDER, Math.floor(fitLength / 4));
		const a = predictor(x, fitLength, order);
		const squared = new Float64Array(length);
		for (let i = order; i < length; i++) {
			let e = x[i];
			for (let k = 1; k <= order; k++) e -= a[k - 1] * x[i - k];
			squared[i] = e * e;
		}

		const blockRms: number[] = [];
		for (let s = order; s + rmsLength <= fitLength; s += rmsLength) {
			let sum = 0;
			for (let i = s; i < s + rmsLength; i++) sum += squared[i];
			blockRms.push(Math.sqrt(sum / rmsLength));
		}
		blockRms.sort((p, q) => p - q);
		const background = blockRms.length ? blockRms[blockRms.length >> 1] : 0;
		const threshold = Math.max(REFINE_RATIO * background, REFINE_FLOOR_RMS);
		const limit = threshold * threshold * rmsLength;

		let sum = 0;
		for (let i = Math.max(0, fitLength - rmsLength + 1); i < fitLength; i++) sum += squared[i];
		for (let i = fitLength; i < length; i++) {
			sum += squared[i];
			if (i - rmsLength >= 0) sum -= squared[i - rmsLength];
			if (sum > limit) return fitStart + i;
		}
		return fallback;
	}
}

/**
 * Least-squares linear predictor of order `order` over `x[0..length)` (covariance method):
 * x[n] ≈ Σ a[k−1]·x[n−k]. Lightly regularised, so silence gives zeros.
 */
function predictor(x: Float64Array, length: number, order: number): Float64Array {
	const a = new Float64Array(order);
	if (order === 0) return a;
	const phi = new Float64Array(order * order);
	const psi = new Float64Array(order);
	for (let n = order; n < length; n++) {
		for (let j = 1; j <= order; j++) {
			const xj = x[n - j];
			psi[j - 1] += x[n] * xj;
			for (let k = j; k <= order; k++) phi[(j - 1) * order + (k - 1)] += xj * x[n - k];
		}
	}
	let trace = 0;
	for (let j = 0; j < order; j++) trace += phi[j * order + j];
	const loading = 1e-9 * trace + 1e-20;
	for (let j = 0; j < order; j++) {
		phi[j * order + j] += loading;
		for (let k = 0; k < j; k++) phi[j * order + k] = phi[k * order + j];
	}
	// Cholesky: phi = L·Lᵀ, then two triangular solves.
	const l = new Float64Array(order * order);
	for (let j = 0; j < order; j++) {
		for (let k = 0; k <= j; k++) {
			let s = phi[j * order + k];
			for (let m = 0; m < k; m++) s -= l[j * order + m] * l[k * order + m];
			if (j === k) {
				if (s <= 0) return new Float64Array(order);
				l[j * order + j] = Math.sqrt(s);
			} else {
				l[j * order + k] = s / l[k * order + k];
			}
		}
	}
	const y = new Float64Array(order);
	for (let j = 0; j < order; j++) {
		let s = psi[j];
		for (let m = 0; m < j; m++) s -= l[j * order + m] * y[m];
		y[j] = s / l[j * order + j];
	}
	for (let j = order - 1; j >= 0; j--) {
		let s = y[j];
		for (let m = j + 1; m < order; m++) s -= l[m * order + j] * a[m];
		a[j] = s / l[j * order + j];
	}
	return a;
}
