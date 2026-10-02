import { describe, expect, it } from 'vitest';
import type { Verdict } from '$lib/domain/types';
import { CUE_ATTACK_S, CUE_SPECS, MAX_CUE_DURATION_S, MAX_CUE_GAIN, cueDuration } from './cueSpecs';

const VERDICTS: Verdict[] = ['perfect', 'early', 'late', 'wrong'];

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

	it('makes wrong a low buzz, far below every other cue', () => {
		const [wrong] = CUE_SPECS.wrong;
		const others = (['perfect', 'early', 'late'] as const).flatMap((verdict) => CUE_SPECS[verdict]);
		const lowestOther = Math.min(...others.map((tone) => Math.min(tone.startHz, tone.endHz)));
		expect(wrong.waveform).toBe('square');
		expect(Math.max(wrong.startHz, wrong.endHz)).toBeLessThan(lowestOther / 4);
	});
});
