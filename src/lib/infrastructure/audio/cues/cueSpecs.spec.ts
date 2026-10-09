import { describe, expect, it } from 'vitest';
import { VERDICTS as ALL_VERDICTS, type Verdict } from '$lib/domain/types';
import { CUE_ATTACK_S, CUE_SPECS, MAX_CUE_DURATION_S, MAX_CUE_GAIN, cueDuration } from './cueSpecs';

const VERDICTS: readonly Verdict[] = ALL_VERDICTS;

describe('CUE_SPECS', () => {
	it('keeps every cue shorter than 150 ms', () => {
		expect(MAX_CUE_DURATION_S).toBe(0.15);
		for (const verdict of VERDICTS) {
			expect(cueDuration(CUE_SPECS[verdict])).toBeLessThan(MAX_CUE_DURATION_S);
		}
	});

	it('keeps every tone quiet and long enough for its envelope', () => {
		for (const tone of VERDICTS.flatMap((verdict) => CUE_SPECS[verdict])) {
			expect(tone.peakGain).toBeGreaterThan(0);
			expect(tone.peakGain).toBeLessThanOrEqual(MAX_CUE_GAIN);
			expect(tone.duration).toBeGreaterThan(CUE_ATTACK_S);
			expect(tone.startHz).toBeGreaterThan(0);
			expect(tone.endHz).toBeGreaterThan(0);
		}
	});

	it('plays perfect as two rising notes a major third apart', () => {
		expect(CUE_SPECS.perfect).toHaveLength(2);
		const [root, third] = CUE_SPECS.perfect;
		expect(third.offset).toBeGreaterThan(root.offset);
		expect(third.startHz / root.startHz).toBeCloseTo(2 ** (4 / 12), 3);
		expect(root.endHz).toBe(root.startHz);
		expect(third.endHz).toBe(third.startHz);
	});

	it('glides up for early and down for late', () => {
		const [early] = CUE_SPECS.early;
		const [late] = CUE_SPECS.late;
		expect(early.endHz).toBeGreaterThan(early.startHz);
		expect(late.endHz).toBeLessThan(late.startHz);
	});

	it('holds off beat on one soft note, below the timed cues', () => {
		const [offbeat] = CUE_SPECS.offbeat;
		expect(CUE_SPECS.offbeat).toHaveLength(1);
		expect(offbeat.endHz).toBe(offbeat.startHz);
		const timed = (['perfect', 'early', 'late'] as const).flatMap((verdict) => CUE_SPECS[verdict]);
		expect(offbeat.startHz).toBeLessThan(Math.min(...timed.map((tone) => tone.startHz)));
	});

	it('makes wrong a low buzz, far below every other cue', () => {
		const [wrong] = CUE_SPECS.wrong;
		const others = (['perfect', 'early', 'late', 'offbeat'] as const).flatMap(
			(verdict) => CUE_SPECS[verdict]
		);
		const lowestOther = Math.min(...others.map((tone) => Math.min(tone.startHz, tone.endHz)));
		expect(wrong.waveform).toBe('square');
		expect(Math.max(wrong.startHz, wrong.endHz)).toBeLessThan(lowestOther / 4);
	});

	it('plays corrected apart from wrong and off beat', () => {
		expect(CUE_SPECS.corrected).toBeDefined();
		expect(CUE_SPECS.corrected).not.toEqual(CUE_SPECS.wrong);
		expect(CUE_SPECS.corrected).not.toEqual(CUE_SPECS.offbeat);
	});
});
