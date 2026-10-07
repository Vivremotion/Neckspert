import { describe, expect, it } from 'vitest';
import type { ChordExpectation, ChordReport } from '$lib/application/ports';
import { FakeDiagnosticSink } from '$lib/testing/fakes';
import { SPECTRUM_KEEP_MAX_HZ, SPECTRUM_KEEP_MIN_HZ } from './constants';
import { NnlsChordVerifier } from './NnlsChordVerifier';
import { DEFAULT_VARIANT } from './variants';
import { FakeFrameSource } from './testing/frames';
import { dCandidates, synthChordSignal } from './testing/synthChord';

const D_232 = [57, 62, 66];

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
	it('reports a strummed chord at each window, without its spectrum', () => {
		const { source, verifier, reports } = setup();
		verifier.expect(expectation(0.9));
		source.playUntil();
		expect(reports.map((r) => r.windowMs)).toEqual([250, 500, 1000, 2000]);
		for (const report of reports) {
			expect(Math.abs(report.time - 1.0)).toBeLessThan(0.015);
			expect(report.decided).toBe('2,3,2');
		}
		expect(reports.every((r) => !('spectrum' in r))).toBe(true);
	});

	it('marks final the first report that retains the expected chord, and every one after it', () => {
		const { source, verifier, reports } = setup();
		verifier.expect(expectation(0.9));
		source.playUntil();
		expect(reports.map((r) => [r.windowMs, r.final])).toEqual([
			[250, true],
			[500, true],
			[1000, true],
			[2000, true]
		]);
	});

	it('marks final only the last report of an attack whose chord is not the expected one', () => {
		const { source, verifier, reports } = setup();
		verifier.expect(expectation(0.9, ['0,1,0']));
		source.playUntil();
		expect(reports.map((r) => [r.windowMs, r.final])).toEqual([
			[250, false],
			[500, false],
			[1000, false],
			[2000, true]
		]);
	});

	it('marks final a report cut by the next expectation', () => {
		const { source, verifier, reports } = setup();
		verifier.expect(expectation(0.9, ['0,1,0']));
		source.playUntil(1.6);
		verifier.expect(expectation(1.6, ['0,1,0']));
		expect(reports.map((r) => r.final)).toEqual([false, false, true]);
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
		verifier.expect(expectation(0.9));
		source.playUntil(1.3);
		verifier.expect(expectation(1.3));
		source.playUntil(1.31);
		const cut = reports.length;
		source.playUntil();
		expect(reports.slice(0, cut).map((r) => r.windowMs)[0]).toBe(250);
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
			expect(reports).toHaveLength(4);
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

		it('writes every report whole, with the spectrum from 20 Hz to 6.3 kHz and the judging time', () => {
			const diagnostics = new FakeDiagnosticSink();
			const { source, verifier, reports } = setup(48000, D_232, { diagnostics });
			verifier.expect(expectation(0.9));
			source.playUntil();
			const written = diagnostics.events.filter((e) => e.kind === 'chord.report');
			expect(written).toHaveLength(reports.length);
			written.forEach((event, i) => {
				const data = event.data as ChordReport & {
					judgeMs: number;
					spectrum: { fromHz: number; binHz: number; magnitudes: number[] };
				};
				expect(event.audioTime).toBe(reports[i].time);
				expect(data).toMatchObject(reports[i]);
				expect(data.judgeMs).toBeGreaterThanOrEqual(0);
				const { fromHz, binHz, magnitudes } = data.spectrum;
				expect(fromHz).toBeLessThanOrEqual(SPECTRUM_KEEP_MIN_HZ + binHz);
				expect(fromHz + (magnitudes.length - 1) * binHz).toBeGreaterThanOrEqual(
					SPECTRUM_KEEP_MAX_HZ - binHz
				);
				expect(magnitudes.some((m) => m > 0)).toBe(true);
			});
			expect(SPECTRUM_KEEP_MIN_HZ).toBe(20);
			expect(SPECTRUM_KEEP_MAX_HZ).toBe(6300);
		});
	});
});
