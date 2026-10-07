import { describe, expect, it } from 'vitest';
import type { ChordExpectation, ChordReport } from '$lib/application/ports';
import { NnlsChordVerifier } from './NnlsChordVerifier';
import { DEFAULT_VARIANT } from './variants';
import { FakeFrameSource } from './testing/frames';
import { dCandidates, synthChordSignal } from './testing/synthChord';

const D_232 = [57, 62, 66];

function expectation(opensAt: number): ChordExpectation {
	return { opensAt, expected: '2,3,2', candidates: dCandidates(), style: 'strummed' };
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
	it('reports a strummed chord at each window, the longest with its spectrum', () => {
		const { source, verifier, reports } = setup();
		verifier.expect(expectation(0.9));
		source.playUntil();
		expect(reports.map((r) => r.windowMs)).toEqual([250, 500, 1000, 2000]);
		for (const report of reports) {
			expect(Math.abs(report.time - 1.0)).toBeLessThan(0.015);
			expect(report.decided).toBe('2,3,2');
		}
		expect(reports.slice(0, 3).every((r) => r.spectrum === undefined)).toBe(true);
		const spectrum = reports[3].spectrum;
		expect(spectrum?.magnitudes.length).toBeGreaterThan(900);
		expect(spectrum?.fromHz).toBeGreaterThanOrEqual(70);
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
		expect(last.spectrum).toBeDefined();
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
});
