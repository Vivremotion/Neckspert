import { describe, expect, it } from 'vitest';
import { placedNoteSet } from '$lib/domain/sets';
import type { ResponseValue } from '$lib/domain/time';
import { placedNotePresenter } from './placedNote';
import { SET_PRESENTERS } from './index';

const item = { string: 5, fret: 8 } as const;

describe('placedNotePresenter', () => {
	it('is answered on the screen, by a tap', () => {
		expect(placedNotePresenter.set).toBe(placedNoteSet);
		expect(placedNotePresenter.scene).toBe('screen');
		expect(placedNotePresenter.sensors).toEqual(['tap']);
		expect(SET_PRESENTERS['placed-note']).toBe(placedNotePresenter);
		// Its screen is its exercise's presentation.
		expect(placedNotePresenter.stageOf).toBeUndefined();
	});

	it('returns twelve chromatic choices, valued by pitch', () => {
		const choices = placedNotePresenter.answerChoices!();
		expect(choices).toHaveLength(12);
		expect(choices[0]).toEqual({ value: 'C', label: 'C' });
		expect(choices[1]).toEqual({ value: 'C#', label: 'C# / Db' });
		expect(choices[6]).toEqual({ value: 'F#', label: 'F# / Gb' });
	});

	const valueOf = (pitch: string | null): ResponseValue => ({
		verdict: pitch === 'F' ? 'perfect' : 'wrong',
		timingOffsetMs: null,
		reactionMs: 900,
		leadMs: null,
		expectations: [
			{
				index: 0,
				answer: pitch === null ? null : { pitch },
				correct: pitch === null ? null : pitch === 'F',
				confusion: pitch === 'F' || pitch === null ? null : { kind: 'semitone' },
				correction: null,
				late: false
			}
		]
	});

	it('keeps the data an identify attempt has today', () => {
		expect(placedNotePresenter.attemptData!(item, valueOf('G'))).toEqual({
			item,
			answer: { pitch: 'G' },
			confusion: { kind: 'semitone' }
		});
		expect(placedNotePresenter.attemptData!(item, valueOf(null))).toEqual({
			item,
			answer: null,
			confusion: null
		});
	});
});
