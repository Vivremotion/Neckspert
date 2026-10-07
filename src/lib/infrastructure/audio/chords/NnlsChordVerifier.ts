import type { ChordExpectation, ChordReport, ChordVerifierPort } from '$lib/application/ports';
import type { AudioFrame } from '../input/WebAudioInput';
import { DEFAULT_DETECTOR_CONFIG } from '../detection/config';
import { OnsetDetector } from '../detection/OnsetDetector';
import {
	MIN_HZ,
	REPORT_POINTS_MS,
	SPECTRUM_KEEP_MAX_HZ,
	fftSizeFor,
	hopSizeFor
} from './constants';
import { magnitudeSpectrum } from './fft';
import { judgeWindow } from './judge';
import { binHz, hannWindow, maxPool } from './spectrum';
import { DEFAULT_VARIANT, type JudgeVariant } from './variants';

/** Where the verifier takes its frames: the shared input, or a test double. */
export interface FrameSource {
	readonly sampleRate: number;
	onFrame(callback: (frame: AudioFrame) => void): () => void;
}

/** Significant digits kept for each stored magnitude. */
const KEPT_DIGITS = 4;

/** One attack being listened to: the peak of each bin since it, and the next report due. */
interface OpenWindow {
	attack: number;
	pooled: Float64Array | null;
	nextPoint: number;
}

/**
 * Chord verification by fitting harmonic combs (the spike's `nnls-abs` judge): after each attack
 * in a round, the peak-held spectrum since the attack is judged against the expected candidates by
 * every variant, at each report point. Between rounds, only the onset envelope runs.
 */
export class NnlsChordVerifier implements ChordVerifierPort {
	private readonly variants: readonly JudgeVariant[];
	private readonly active: string;
	private readonly listeners = new Set<(report: ChordReport) => void>();
	private expectation: ChordExpectation | null = null;
	private windows: OpenWindow[] = [];
	private onsets: OnsetDetector | null = null;
	private rate = 0;
	private fftSize = 0;
	private hopSize = 0;
	private window: Float64Array = new Float64Array(0);
	/** The last fftSize samples, oldest first, and how many samples arrived since the last spectrum. */
	private recent: Float64Array = new Float64Array(0);
	private sinceSpectrum = 0;
	private lastFrameEnd = 0;

	constructor(
		private readonly input: FrameSource,
		options: { variants?: readonly JudgeVariant[]; active?: string } = {}
	) {
		this.variants = options.variants ?? [DEFAULT_VARIANT];
		this.active = options.active ?? this.variants[0].id;
		if (!this.variants.some((v) => v.id === this.active)) {
			throw new RangeError(`No judge variant: ${this.active}`);
		}
		input.onFrame((frame) => this.onFrame(frame));
	}

	expect(expectation: ChordExpectation | null): void {
		this.flushWindows();
		this.expectation = expectation;
	}

	onReport(callback: (report: ChordReport) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	private prepare(sampleRate: number): void {
		if (sampleRate === this.rate) return;
		this.rate = sampleRate;
		this.fftSize = fftSizeFor(sampleRate);
		this.hopSize = hopSizeFor(sampleRate);
		this.window = hannWindow(this.fftSize);
		this.recent = new Float64Array(this.fftSize);
		this.sinceSpectrum = 0;
		this.onsets = new OnsetDetector(DEFAULT_DETECTOR_CONFIG, sampleRate);
	}

	private onFrame({ samples, frameTime }: AudioFrame): void {
		// Fed even between rounds: the onset envelope must know what is already ringing, or a
		// chord still sounding when a round opens would pass for an attack.
		this.prepare(this.input.sampleRate);
		const n = samples.length;
		this.recent.copyWithin(0, n);
		this.recent.set(samples, this.fftSize - n);
		this.sinceSpectrum += n;
		this.lastFrameEnd = frameTime + n / this.rate;
		const attack = this.onsets?.push(samples, frameTime) ?? null;
		if (!this.expectation) return;

		if (attack !== null && attack >= this.expectation.opensAt) {
			this.windows.push({ attack, pooled: null, nextPoint: 0 });
		}
		if (this.windows.length === 0) return;

		if (this.sinceSpectrum >= this.hopSize) {
			this.sinceSpectrum = 0;
			const start = this.lastFrameEnd - this.fftSize / this.rate;
			const listening = this.windows.filter((w) => start >= w.attack);
			if (listening.length > 0) {
				const frame = new Float64Array(this.fftSize);
				for (let i = 0; i < this.fftSize; i++) frame[i] = this.recent[i] * this.window[i];
				const spectrum = magnitudeSpectrum(frame);
				for (const w of listening) {
					if (!w.pooled) w.pooled = new Float64Array(spectrum);
					else maxPool(w.pooled, spectrum);
				}
			}
		}

		for (const w of this.windows) {
			while (
				w.nextPoint < REPORT_POINTS_MS.length &&
				this.lastFrameEnd >= w.attack + REPORT_POINTS_MS[w.nextPoint] / 1000
			) {
				const last = w.nextPoint === REPORT_POINTS_MS.length - 1;
				if (w.pooled) this.report(w, REPORT_POINTS_MS[w.nextPoint], last);
				w.nextPoint++;
			}
		}
		this.windows = this.windows.filter((w) => w.nextPoint < REPORT_POINTS_MS.length);
	}

	/** The windows still open report what they heard, then are forgotten. */
	private flushWindows(): void {
		for (const w of this.windows) {
			if (!w.pooled) continue;
			this.report(w, Math.round((this.lastFrameEnd - w.attack) * 1000), true);
		}
		this.windows = [];
	}

	private report(w: OpenWindow, windowMs: number, keepSpectrum: boolean): void {
		const expectation = this.expectation;
		if (!expectation || !w.pooled) return;
		const variants = this.variants.map((variant) =>
			judgeWindow(w.pooled as Float64Array, this.rate, expectation.candidates, variant)
		);
		const report: ChordReport = {
			time: w.attack,
			windowMs,
			decided: variants.find((v) => v.id === this.active)?.decided ?? null,
			variants,
			...(keepSpectrum ? { spectrum: this.keptSpectrum(w.pooled) } : {})
		};
		this.listeners.forEach((listener) => listener(report));
	}

	private keptSpectrum(pooled: Float64Array): NonNullable<ChordReport['spectrum']> {
		const width = binHz(this.rate, this.fftSize);
		const from = Math.ceil(MIN_HZ / width);
		const to = Math.min(pooled.length, Math.floor(SPECTRUM_KEEP_MAX_HZ / width) + 1);
		const magnitudes = Array.from(pooled.subarray(from, to), (v) =>
			Number(v.toPrecision(KEPT_DIGITS))
		);
		return { fromHz: from * width, binHz: width, magnitudes };
	}
}
