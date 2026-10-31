import { describe, expect, it } from 'vitest';
import { DEFAULT_DETECTOR_CONFIG } from './config';
import { confirmedPitch } from './confirmPitch';

const GATE = {
	attackClarityThreshold: DEFAULT_DETECTOR_CONFIG.attackClarityThreshold,
	sustainClarityThreshold: DEFAULT_DETECTOR_CONFIG.clarityThreshold
};

describe('confirmedPitch', () => {
	it('keeps 0.85 on the sustained window and uses 0.75 on the attack', () => {
		expect(DEFAULT_DETECTOR_CONFIG.clarityThreshold).toBe(0.85);
		expect(DEFAULT_DETECTOR_CONFIG.attackClarityThreshold).toBe(0.75);
	});

	it('accepts an attack window under 0.85 when the sustained window is clear and the pitches agree', () => {
		const result = confirmedPitch(
			{ frequencyHz: 98.3, clarity: 0.79 },
			{ frequencyHz: 98.71, clarity: 0.96 },
			GATE
		);
		expect(result).not.toBeNull();
		expect(result!.frequencyHz).toBeCloseTo(98.505, 2);
		expect(result!.clarity).toBeCloseTo(0.79, 2);
	});

	it('rejects an attack window under 0.75', () => {
		expect(
			confirmedPitch(
				{ frequencyHz: 98.3, clarity: 0.74 },
				{ frequencyHz: 98.71, clarity: 0.96 },
				GATE
			)
		).toBeNull();
	});

	it('keeps the sustained window at 0.85', () => {
		expect(
			confirmedPitch(
				{ frequencyHz: 98.3, clarity: 0.96 },
				{ frequencyHz: 98.71, clarity: 0.84 },
				GATE
			)
		).toBeNull();
	});

	it('rejects windows that disagree by more than 50 cents', () => {
		expect(
			confirmedPitch(
				{ frequencyHz: 98.3, clarity: 0.96 },
				{ frequencyHz: 110, clarity: 0.97 },
				GATE
			)
		).toBeNull();
	});

	it('takes the sustained pitch when the attack window reads an octave below it', () => {
		const result = confirmedPitch(
			{ frequencyHz: 196, clarity: 0.85 },
			{ frequencyHz: 392, clarity: 1 },
			GATE
		);
		expect(result).toEqual({ frequencyHz: 392, clarity: 0.85 });
	});

	it('still rejects an attack window an octave above the sustained one', () => {
		expect(
			confirmedPitch({ frequencyHz: 392, clarity: 1 }, { frequencyHz: 196, clarity: 1 }, GATE)
		).toBeNull();
	});

	it('still rejects an attack window a fifth below the sustained one', () => {
		expect(
			confirmedPitch({ frequencyHz: 196, clarity: 1 }, { frequencyHz: 293.66, clarity: 1 }, GATE)
		).toBeNull();
	});
});
