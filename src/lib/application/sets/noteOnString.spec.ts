import { describe, expect, it } from 'vitest';
import { noteOnStringSet } from '$lib/domain/sets';
import type { ResponseValue } from '$lib/domain/time';
import { noteOnStringPresenter } from './noteOnString';
import { SET_PRESENTERS } from './index';

const item = { string: 2, pitch: 'F' } as const;

function valueOf(over: Partial<ResponseValue> & { midi?: number | null } = {}): ResponseValue {
	const { midi = 65, ...rest } = over;
	const right = midi === 65;
	return {
		verdict: right ? 'perfect' : 'wrong',
		timingOffsetMs: right ? 12 : null,
		reactionMs: 800,
		leadMs: 4000,
		expectations: [
			{
				index: 0,
				answer: midi === null ? null : { midi },
				correct: midi === null ? null : right,
				confusion: right || midi === null ? null : { kind: 'octave' },
				correction: null,
				late: false
			}
		],
		...rest
	};
}

describe('noteOnStringPresenter', () => {
	it('plays on the guitar, heard by the note sensor', () => {
		expect(noteOnStringPresenter.set).toBe(noteOnStringSet);
		expect(noteOnStringPresenter.scene).toBe('guitar');
		expect(noteOnStringPresenter.sensors).toEqual(['note']);
		expect(noteOnStringPresenter.answerChoices).toBeUndefined();
		expect(SET_PRESENTERS['note-on-string']).toBe(noteOnStringPresenter);
		// Its string shows a beat before its prompt; its screen is its exercise's presentation.
		expect(noteOnStringPresenter.previewBeats).toBe(1);
		expect(noteOnStringPresenter.stageOf).toBeUndefined();
	});

	it('logs the accepted frequencies and the cents to each', () => {
		const lines = noteOnStringPresenter.debugLines!(
			{ string: 2, pitch: 'F' },
			{ midi: 65, frequencyHz: 349.23, clarity: 0.95 }
		);
		expect(lines.some((line) => line.includes('t brut'))).toBe(false);
		expect(lines.some((line) => line.startsWith('fréquences acceptées : F4 MIDI 65'))).toBe(true);
		expect(lines.some((line) => line.startsWith('écart au plus proche accepté (F4)'))).toBe(true);
	});

	it('keeps the data a locate attempt has today', () => {
		expect(noteOnStringPresenter.attemptData!(item, valueOf({ midi: 70 }))).toEqual({
			item,
			answer: { midi: 70 },
			confusion: { kind: 'octave' }
		});
		expect(noteOnStringPresenter.attemptData!(item, valueOf({ midi: null }))).toEqual({
			item,
			answer: null,
			confusion: null
		});
	});
});
