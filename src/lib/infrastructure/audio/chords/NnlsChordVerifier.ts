import type {
	AttackDetectorPort,
	ChordExpectation,
	ChordReport,
	ChordVerifierPort,
	DiagnosticSink
} from '$lib/application/ports';
import type { AudioFrame, FrameSource } from '../input/WebAudioInput';
import {
	ARPEGGIO_NOTES_SPAN_MS,
	ARPEGGIO_SPAN_MS,
	ATTACK_NOTICE_S,
	FIRST_READING_MS,
	JUDGE_EVERY_MS,
	LAST_READING_MS,
	NOTHING_FINAL_MS,
	SPECTRUM_KEEP_MAX_HZ,
	SPECTRUM_POINTS_MS,
	STABLE_READINGS,
	SPECTRUM_KEEP_MIN_HZ,
	STRUM_STRENGTH,
	fftSizeFor,
	hopSizeFor
} from './constants';
import { magnitudeSpectrum } from '../spectral/fft';
import { judgeWindow } from './judge';
import { binHz, hannWindow, maxPool } from './spectrum';
import { DEFAULT_VARIANT, type JudgeVariant } from './variants';

/** Spectrum of a window, as written to the diagnostic journal. */
export interface KeptSpectrum {
	fromHz: number;
	binHz: number;
	magnitudes: number[];
}

/** Significant digits kept for each journaled magnitude. */
const KEPT_DIGITS = 4;

/** A spectrum of the round, over the samples from `start` to `end` (audio s). */
interface TimedSpectrum {
	start: number;
	end: number;
	magnitudes: Float64Array;
}

/** One attack being listened to: the peak of each bin since it, and its readings so far. */
interface OpenWindow {
	attack: number;
	/** The peak of each bin over the spectra since the attack that it has taken so far. */
	pooled: Float64Array | null;
	/** Length of the next reading due, ms. */
	nextMs: number;
	/** The last reading's decision; undefined before the first one. */
	decided: string | null | undefined;
	/** How many readings in a row decided it. */
	sameCount: number;
}

/**
 * Chord verification by fitting harmonic combs (the spike's `nnls-abs` judge): after each attack
 * the attack sensor tells in a round, the peak-held spectrum since the attack is judged against
 * the expected candidates by every variant, from FIRST_READING_MS every JUDGE_EVERY_MS until a
 * reading is final. The sensor tells an attack up to ATTACK_NOTICE_S after it, so a window takes
 * a spectrum, and is read, only once no attack can still be told before that spectrum's end. A
 * new attack closes an earlier window that has outlived an arpeggio: a chord played again is read
 * on its own. Spectra are computed only while an expectation is set.
 */
export class NnlsChordVerifier implements ChordVerifierPort {
	private readonly variants: readonly JudgeVariant[];
	private readonly active: string;
	private readonly diagnostics: DiagnosticSink | undefined;
	private readonly listeners = new Set<(report: ChordReport) => void>();
	private expectation: ChordExpectation | null = null;
	private windows: OpenWindow[] = [];
	/** The spectra of the round not taken by the windows yet: an attack may still come before. */
	private spectra: TimedSpectrum[] = [];
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
		attacks: Pick<AttackDetectorPort, 'onAttack'>,
		options: {
			variants?: readonly JudgeVariant[];
			active?: string;
			/** Gets each expectation and each report whole, with its spectrum, when enabled. */
			diagnostics?: DiagnosticSink;
		} = {}
	) {
		this.diagnostics = options.diagnostics;
		this.variants = options.variants ?? [DEFAULT_VARIANT];
		this.active = options.active ?? this.variants[0].id;
		if (!this.variants.some((v) => v.id === this.active)) {
			throw new RangeError(`No judge variant: ${this.active}`);
		}
		input.onFrame((frame) => this.onFrame(frame));
		attacks.onAttack(({ time, strength }) => this.onAttack(time, strength));
	}

	expect(expectation: ChordExpectation | null): void {
		this.flushWindows();
		this.spectra = [];
		this.expectation = expectation;
		if (this.diagnostics?.enabled) {
			this.diagnostics.event('chord.expectation', this.lastFrameEnd, expectation);
		}
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
	}

	private onFrame({ samples, frameTime }: AudioFrame): void {
		// The last samples are kept even between rounds: a round's first spectrum needs them.
		this.prepare(this.input.sampleRate);
		const n = samples.length;
		this.recent.copyWithin(0, n);
		this.recent.set(samples, this.fftSize - n);
		this.sinceSpectrum += n;
		this.lastFrameEnd = frameTime + n / this.rate;
		if (!this.expectation) return;

		if (this.sinceSpectrum >= this.hopSize) {
			this.sinceSpectrum = 0;
			const frame = new Float64Array(this.fftSize);
			for (let i = 0; i < this.fftSize; i++) frame[i] = this.recent[i] * this.window[i];
			this.spectra.push({
				start: this.lastFrameEnd - this.fftSize / this.rate,
				end: this.lastFrameEnd,
				magnitudes: magnitudeSpectrum(frame)
			});
		}

		// Every attack up to here has been told: what was heard before belongs to the windows open.
		const known = this.lastFrameEnd - ATTACK_NOTICE_S;
		const settled = this.spectra.filter((spectrum) => spectrum.end <= known);
		this.spectra = this.spectra.filter((spectrum) => spectrum.end > known);
		for (const w of this.windows) pool(w, settled, known);

		const done = new Set<OpenWindow>();
		for (const w of this.windows) {
			while (!done.has(w) && known >= w.attack + w.nextMs / 1000) {
				const windowMs = w.nextMs;
				// On the grid of JUDGE_EVERY_MS after the first reading: 250, 300, 400 … 2000.
				const next = (Math.floor(windowMs / JUDGE_EVERY_MS) + 1) * JUDGE_EVERY_MS;
				w.nextMs = Math.min(next, LAST_READING_MS);
				if (w.pooled && this.report(w, windowMs, windowMs >= LAST_READING_MS)) done.add(w);
				else if (windowMs >= LAST_READING_MS) done.add(w);
			}
		}
		this.windows = this.windows.filter((w) => !done.has(w));
	}

	/** An attack told by the attack sensor: a window opens at it, when it falls in the round. */
	private onAttack(attack: number, strength: number): void {
		if (!this.expectation || attack < this.expectation.opensAt) return;
		this.closeBefore(attack, strength);
		const w: OpenWindow = {
			attack,
			pooled: null,
			nextMs: FIRST_READING_MS,
			decided: undefined,
			sameCount: 0
		};
		this.windows.push(w);
	}

	/** A new attack at `attack`: the windows it closes give their final reading now. */
	private closeBefore(attack: number, strength: number): void {
		// Within the span, it may be an arpeggio whose notes have not all come: two of them can
		// already read as another shape. Known risk: a chord played again this soon is read with the
		// first, and a weak one (or a firm arpeggio note) within ARPEGGIO_NOTES_SPAN_MS likewise.
		const spanMs = strength >= STRUM_STRENGTH ? ARPEGGIO_SPAN_MS : ARPEGGIO_NOTES_SPAN_MS;
		this.windows = this.windows.filter((w) => {
			if ((attack - w.attack) * 1000 <= spanMs) return true;
			pool(w, this.spectra, attack);
			this.report(w, Math.round((attack - w.attack) * 1000), true);
			return false;
		});
	}

	/** The windows still open report what they heard, then are forgotten. */
	private flushWindows(): void {
		for (const w of this.windows) {
			pool(w, this.spectra, this.lastFrameEnd);
			this.report(w, Math.round((this.lastFrameEnd - w.attack) * 1000), true);
		}
		this.windows = [];
	}

	/** Judges the window at `windowMs`; true when the reading is final. */
	private report(w: OpenWindow, windowMs: number, last: boolean): boolean {
		const expectation = this.expectation;
		const pooled = w.pooled;
		if (!expectation || !pooled) return false;
		const journal = this.diagnostics?.enabled ? this.diagnostics : null;
		const started = journal ? performance.now() : 0;
		const variants = this.variants.map((variant) =>
			judgeWindow(pooled, this.rate, expectation.candidates, variant)
		);
		const judgeMs = journal ? performance.now() - started : 0;
		const decided = variants.find((v) => v.id === this.active)?.decided ?? null;
		w.sameCount = decided !== null && decided === w.decided ? w.sameCount + 1 : 1;
		w.decided = decided;
		const final =
			last ||
			(decided !== null && expectation.expected.includes(decided)) ||
			(decided !== null && w.sameCount >= STABLE_READINGS) ||
			(decided === null && windowMs >= NOTHING_FINAL_MS);
		const report: ChordReport = { time: w.attack, windowMs, decided, final, variants };
		const spectrum =
			final || SPECTRUM_POINTS_MS.includes(windowMs) ? { spectrum: this.keptSpectrum(pooled) } : {};
		journal?.event('chord.report', report.time, { ...report, judgeMs, ...spectrum });
		this.listeners.forEach((listener) => listener(report));
		return final;
	}

	private keptSpectrum(pooled: Float64Array): KeptSpectrum {
		const width = binHz(this.rate, this.fftSize);
		const from = Math.max(0, Math.floor(SPECTRUM_KEEP_MIN_HZ / width));
		const to = Math.min(pooled.length, Math.floor(SPECTRUM_KEEP_MAX_HZ / width) + 1);
		const magnitudes = Array.from(pooled.subarray(from, to), (v) =>
			Number(v.toPrecision(KEPT_DIGITS))
		);
		return { fromHz: from * width, binHz: width, magnitudes };
	}
}

/** Takes into the window the spectra heard after its attack and ending by `until`. */
function pool(w: OpenWindow, spectra: readonly TimedSpectrum[], until: number): void {
	for (const spectrum of spectra) {
		if (spectrum.start < w.attack || spectrum.end > until) continue;
		if (!w.pooled) w.pooled = new Float64Array(spectrum.magnitudes);
		else maxPool(w.pooled, spectrum.magnitudes);
	}
}
