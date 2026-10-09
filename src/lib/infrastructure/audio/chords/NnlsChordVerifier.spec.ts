import { describe, expect, it } from 'vitest';
import type { ChordExpectation, ChordReport } from '$lib/application/ports';
import { FakeDiagnosticSink } from '$lib/testing/fakes';
import { SPECTRUM_KEEP_MAX_HZ, SPECTRUM_KEEP_MIN_HZ } from './constants';
import { NnlsChordVerifier } from './NnlsChordVerifier';
import { DEFAULT_VARIANT } from './variants';
import { FakeFrameSource } from './testing/frames';
import { dCandidates, synthChordSignal } from './testing/synthChord';

const D_232 = [57, 62, 66];
const D_775 = [62, 66, 69];

/** Two chords struck one after the other, the first damped when the second comes. */
function twoChords(first: number[], firstAt: number, second: number[], secondAt: number) {
	const sampleRate = 48000;
	const a = synthChordSignal(first, sampleRate, { durationS: 3.6, attackS: firstAt });
	const b = synthChordSignal(second, sampleRate, { durationS: 3.6, attackS: secondAt });
	const damped = Math.floor(secondAt * sampleRate);
	const signal = b.map((v, i) => v + (i < damped ? a[i] : 0));
	const source = new FakeFrameSource(sampleRate, signal);
	const verifier = new NnlsChordVerifier(source);
	const reports: ChordReport[] = [];
	verifier.onReport((report) => reports.push(report));
	return { source, verifier, reports };
}

function expectation(opensAt: number, expected: readonly string[] = ['2,3,2']): ChordExpectation {
	return { opensAt, expected, candidates: dCandidates(), style: 'strummed' };
}

function setup(sampleRate = 48000, midis: number[] = D_232, options = {}) {
	const signal = synthChordSignal(midis, sampleRate, { durationS: 3.6, attackS: 1.0 });
	const source = new FakeFrameSource(sampleRate, signal);
	const verifier = new NnlsChordVerifier(source, options);
	const reports: ChordReport[] = [];
	verifier.onReport((report) => reports.push(report));
	return { source, verifier, reports };
}

describe('NnlsChordVerifier', () => {
	it('reads a strummed chord from 250 ms on and stops once it is final', () => {
		const { source, verifier, reports } = setup();
		verifier.expect(expectation(0.9));
		source.playUntil();
		expect(reports.map((r) => [r.windowMs, r.final, r.decided])).toEqual([[250, true, '2,3,2']]);
		expect(Math.abs(reports[0].time - 1.0)).toBeLessThan(0.015);
		expect(reports.every((r) => !('spectrum' in r))).toBe(true);
	});

	it('ends with the reading that holds the same wrong shape three times in a row', () => {
		const { source, verifier, reports } = setup();
		verifier.expect(expectation(0.9, ['0,1,0']));
		source.playUntil();
		expect(reports.map((r) => [r.windowMs, r.final, r.decided])).toEqual([
			[250, false, '2,3,2'],
			[300, false, '2,3,2'],
			[400, true, '2,3,2']
		]);
	});

	it('ends at 1 s a reading that recognizes nothing', () => {
		const { source, verifier, reports } = setup(48000, [60, 64, 67]);
		verifier.expect(expectation(0.9));
		source.playUntil();
		expect(reports.every((r) => r.decided === null)).toBe(true);
		expect(reports.map((r) => r.windowMs)).toEqual([250, 300, 400, 500, 600, 700, 800, 900, 1000]);
		expect(reports.map((r) => r.final)).toEqual([...Array(8).fill(false), true]);
	});

	it('reads a chord played after a wrong one on its own', () => {
		const { source, verifier, reports } = twoChords(D_775, 1.0, D_232, 1.8);
		verifier.expect(expectation(0.9));
		source.playUntil();
		// The synthetic strum may set off a second onset within the first chord: only the first
		// attack and the one at 1.8 s matter.
		const first = Math.min(...reports.map((r) => r.time));
		const second = reports.find((r) => Math.abs(r.time - 1.8) < 0.015)?.time;
		const finalOf = (time: number | undefined) => reports.find((r) => r.time === time && r.final);
		expect(Math.abs(first - 1.0)).toBeLessThan(0.015);
		expect(finalOf(first)?.decided).toBe('7,7,5');
		expect(finalOf(second)?.decided).toBe('2,3,2');
	});

	it('reads a right chord apart from an unrecognized one before it', () => {
		const { source, verifier, reports } = twoChords([60, 64, 67], 1.0, D_232, 1.6);
		verifier.expect(expectation(0.9));
		source.playUntil();
		const first = Math.min(...reports.map((r) => r.time));
		const second = reports.find((r) => Math.abs(r.time - 1.6) < 0.015)?.time;
		expect(Math.abs(first - 1.0)).toBeLessThan(0.015);
		expect(reports.filter((r) => r.time === first).every((r) => r.decided !== '2,3,2')).toBe(true);
		expect(reports.find((r) => r.time === second && r.final)?.decided).toBe('2,3,2');
	});

	/** D 2-3-2 plucked low to high, each note louder so that each one sets off an onset. */
	function arpeggio(spacingS: number) {
		const sampleRate = 48000;
		const signal = new Float32Array(sampleRate * 3.6);
		D_232.forEach((midi, i) => {
			const note = synthChordSignal([midi], sampleRate, {
				durationS: 3.6,
				attackS: 1.0 + i * spacingS
			});
			const gain = [1, 1.8, 3.2][i];
			for (let j = 0; j < signal.length; j++) signal[j] += note[j] * gain;
		});
		const source = new FakeFrameSource(sampleRate, signal);
		const verifier = new NnlsChordVerifier(source);
		const reports: ChordReport[] = [];
		verifier.onReport((report) => reports.push(report));
		verifier.expect(expectation(0.9));
		source.playUntil();
		return reports;
	}

	for (const spacingS of [0.13, 0.2]) {
		it(`does not cut an arpeggio of notes ${spacingS * 1000} ms apart`, () => {
			const reports = arpeggio(spacingS);
			const first = Math.min(...reports.map((r) => r.time));
			const firstFinal = reports.filter((r) => r.time === first && r.final);
			expect(Math.abs(first - 1.0)).toBeLessThan(0.015);
			expect(firstFinal).toHaveLength(1);
			expect(firstFinal[0].decided).toBe('2,3,2');
		});
	}

	it('marks final a report cut by the next expectation', () => {
		const { source, verifier, reports } = setup();
		verifier.expect(expectation(0.9, ['0,1,0']));
		source.playUntil(1.3);
		verifier.expect(expectation(1.3, ['0,1,0']));
		expect(reports.map((r) => r.final)).toEqual([false, true]);
	});

	it('reports nothing without an attack', () => {
		const signal = new Float32Array(48000 * 3);
		const source = new FakeFrameSource(48000, signal);
		const verifier = new NnlsChordVerifier(source);
		const reports: ChordReport[] = [];
		verifier.onReport((report) => reports.push(report));
		verifier.expect(expectation(0.5));
		source.playUntil();
		expect(reports).toHaveLength(0);
	});

	it('cuts the window when the next expectation comes', () => {
		const { source, verifier, reports } = setup();
		verifier.expect(expectation(0.9, ['0,1,0']));
		source.playUntil(1.3);
		verifier.expect(expectation(1.3, ['0,1,0']));
		source.playUntil(1.31);
		const cut = reports.length;
		source.playUntil();
		const last = reports[cut - 1];
		expect(last.windowMs).toBeGreaterThan(280);
		expect(last.windowMs).toBeLessThan(320);
		expect(reports).toHaveLength(cut);
	});

	it('does not take a chord still ringing for an attack', () => {
		const { source, verifier, reports } = setup();
		source.playUntil(1.5);
		verifier.expect(expectation(1.4));
		source.playUntil();
		expect(reports).toHaveLength(0);
	});

	it('stops reporting once told there is nothing to listen for', () => {
		const { source, verifier, reports } = setup();
		verifier.expect(expectation(0.9));
		source.playUntil(1.1);
		verifier.expect(null);
		source.playUntil();
		expect(reports).toHaveLength(0);
	});

	it('works at 44.1 kHz', () => {
		const { source, verifier, reports } = setup(44100);
		verifier.expect(expectation(0.9));
		source.playUntil();
		expect(reports.at(-1)?.decided).toBe('2,3,2');
	});

	it('runs every variant and lets the active one decide', () => {
		const strict = { ...DEFAULT_VARIANT, id: 'strict', threshold: 0.99 };
		const { source, verifier, reports } = setup(48000, D_232, {
			variants: [DEFAULT_VARIANT, strict],
			active: 'strict'
		});
		verifier.expect(expectation(0.9));
		source.playUntil();
		const last = reports.at(-1);
		expect(last?.variants.map((v) => v.id)).toEqual(['default', 'strict']);
		expect(last?.variants[0].decided).toBe('2,3,2');
		expect(last?.decided).toBeNull();
	});

	describe('with a diagnostic journal', () => {
		it('writes nothing to a journal that is off', () => {
			const diagnostics = new FakeDiagnosticSink(false);
			const { source, verifier, reports } = setup(48000, D_232, { diagnostics });
			verifier.expect(expectation(0.9));
			source.playUntil();
			verifier.expect(null);
			expect(reports).toHaveLength(1);
			expect(diagnostics.events).toEqual([]);
		});

		it('writes each expectation, null included, at the audio time of the last frame', () => {
			const diagnostics = new FakeDiagnosticSink();
			const { source, verifier } = setup(48000, D_232, { diagnostics });
			source.playUntil(0.5);
			verifier.expect(expectation(0.9));
			source.playUntil(0.6);
			verifier.expect(null);
			const expectations = diagnostics.events.filter((e) => e.kind === 'chord.expectation');
			expect(expectations.map((e) => e.data)).toEqual([expectation(0.9), null]);
			expect(Math.abs(expectations[0].audioTime - 0.5)).toBeLessThan(512 / 48000);
			expect(Math.abs(expectations[1].audioTime - 0.6)).toBeLessThan(512 / 48000);
		});

		it('writes every report, with the spectrum only at 250, 500, 1000, 2000 ms and when final', () => {
			const diagnostics = new FakeDiagnosticSink();
			const { source, verifier, reports } = setup(48000, [60, 64, 67], { diagnostics });
			verifier.expect(expectation(0.9));
			source.playUntil();
			const written = diagnostics.events.filter((e) => e.kind === 'chord.report');
			expect(written).toHaveLength(reports.length);
			const withSpectrum = written.filter((e) => 'spectrum' in (e.data as object));
			expect(withSpectrum.map((e) => (e.data as ChordReport).windowMs)).toEqual([250, 500, 1000]);
			written.forEach((event, i) => {
				const data = event.data as ChordReport & { judgeMs: number };
				expect(event.audioTime).toBe(reports[i].time);
				expect(data).toMatchObject(reports[i]);
				expect(data.judgeMs).toBeGreaterThanOrEqual(0);
			});
			const { fromHz, binHz, magnitudes } = (
				withSpectrum[0].data as {
					spectrum: { fromHz: number; binHz: number; magnitudes: number[] };
				}
			).spectrum;
			expect(fromHz).toBeLessThanOrEqual(SPECTRUM_KEEP_MIN_HZ + binHz);
			expect(fromHz + (magnitudes.length - 1) * binHz).toBeGreaterThanOrEqual(
				SPECTRUM_KEEP_MAX_HZ - binHz
			);
			expect(magnitudes.some((m) => m > 0)).toBe(true);
			expect(SPECTRUM_KEEP_MIN_HZ).toBe(20);
			expect(SPECTRUM_KEEP_MAX_HZ).toBe(6300);
		});
	});
});
