import { describe, expect, it } from 'vitest';
import { locateRules } from '$lib/domain/mechanics';
import type { ResponseValue } from '$lib/domain/time';
import { locatePresenter, type NoteLaneModel } from './locate';
import { NECK_PRESENTERS } from './index';

const aided = { aid: 'show-position', stringAid: false } as const;
const unaided = { aid: 'none', stringAid: false } as const;

const place = { anchorBeat: 8, promptBeat: 0, history: [] };
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

describe('locatePresenter', () => {
	it('plays on the guitar, heard by the note sensor', () => {
		expect(locatePresenter.rules).toBe(locateRules);
		expect(locatePresenter.scene).toBe('guitar');
		expect(locatePresenter.sensors).toEqual(['note']);
		expect(locatePresenter.answerChoices).toBeUndefined();
		expect(NECK_PRESENTERS.locate).toBe(locatePresenter);
	});

	it('builds a locate prompt with aid fret', () => {
		const view = locatePresenter.prompt({ string: 2, pitch: 'F' }, aided, 'fr', () => 0);
		expect(view.primary).toBe('F');
		expect(view.secondary).toBe('corde de B');
		expect(view.aid).toBe('case 6');
	});

	it('draws the string of a learning prompt, with its open note', () => {
		const item = { string: 6, pitch: 'A' } as const;
		expect(
			locatePresenter.prompt(item, { ...aided, stringAid: true }, 'fr', () => 0).diagram
		).toEqual({ string: 6, label: 'E' });
		expect(locatePresenter.prompt(item, aided, 'fr', () => 0).diagram).toBeNull();
	});

	it('omits aid when aid is none', () => {
		expect(
			locatePresenter.prompt({ string: 2, pitch: 'F' }, unaided, 'fr', () => 0).aid
		).toBeNull();
	});

	it('spells altered pitches from random', () => {
		const item = { string: 2, pitch: 'F#' } as const;
		expect(locatePresenter.prompt(item, unaided, 'fr', () => 0).primary).toBe('F#');
		expect(locatePresenter.prompt(item, unaided, 'fr', () => 0.5).primary).toBe('Gb');
	});

	it('spells the target as the answer, a played note being always on it or a miss', () => {
		const item = { string: 2, pitch: 'F#' } as const;
		expect(locatePresenter.answerLabel({ midi: 66 }, item, 'fr', () => 0)).toBe('F#');
		expect(locatePresenter.answerLabel({ midi: 66 }, item, 'fr', () => 0.5)).toBe('Gb');
	});

	it('reveals the string and the fret of the expected note after a miss', () => {
		const miss = { correct: false, verdict: 'wrong' } as const;
		expect(locatePresenter.reveal({ string: 6, pitch: 'A' }, miss, 'fr')).toBe(
			'corde de E grave, case 5'
		);
		expect(locatePresenter.reveal({ string: 2, pitch: 'F' }, miss, 'en')).toBe('B string, fret 6');
	});

	it('never reveals the open string, fret 12 instead', () => {
		expect(
			locatePresenter.reveal({ string: 5, pitch: 'A' }, { correct: false, verdict: 'wrong' }, 'fr')
		).toBe('corde de A, case 12');
	});

	it('reveals nothing on a right note, in time or off beat', () => {
		const item = { string: 2, pitch: 'F' } as const;
		expect(locatePresenter.reveal(item, { correct: true, verdict: 'perfect' }, 'fr')).toBeNull();
		expect(locatePresenter.reveal(item, { correct: true, verdict: 'offbeat' }, 'fr')).toBeNull();
	});

	it('logs the accepted frequencies and the cents to each', () => {
		const lines = locatePresenter.debugLines!(
			{ string: 2, pitch: 'F' },
			{ midi: 65, frequencyHz: 349.23, clarity: 0.95 }
		);
		expect(lines.some((line) => line.includes('t brut'))).toBe(false);
		expect(lines.some((line) => line.startsWith('fréquences acceptées : F4 MIDI 65'))).toBe(true);
		expect(lines.some((line) => line.startsWith('écart au plus proche accepté (F4)'))).toBe(true);
	});
	it('shows the string alone before the round, then the note, its aid and the drawn string', () => {
		const stageOf = locatePresenter.stageOf!;
		const before = stageOf(
			item,
			null,
			'fr',
			{ aid: 'show-position', stringAid: true },
			{ anchorBeat: null, promptBeat: 0, history: [] },
			undefined,
			() => 0
		).model as NoteLaneModel;
		expect(before.anchorBeat).toBeNull();
		expect(before.promptBeat).toBe(0);
		expect(before.verdict).toBeNull();
		expect(before.prompt).toEqual({
			primary: 'F',
			secondary: 'corde de B',
			aid: 'case 6',
			diagram: { string: 2, label: 'B' }
		});
		expect(locatePresenter.previewBeats).toBe(1);
	});

	it('shows the position after a wrong note, the offset after a hit', () => {
		const stageOf = locatePresenter.stageOf!;
		const miss = stageOf(
			item,
			{ value: valueOf({ midi: 70 }), success: false },
			'fr',
			unaided,
			place,
			undefined,
			() => 0
		).model as NoteLaneModel;
		expect(miss.verdict).toEqual({
			verdict: 'wrong',
			offsetMs: null,
			answerLabel: 'F',
			correction: 'corde de B, case 6'
		});
		const hit = stageOf(
			item,
			{ value: valueOf(), success: true },
			'fr',
			unaided,
			place,
			undefined,
			() => 0
		).model as NoteLaneModel;
		expect(hit.verdict).toEqual({
			verdict: 'perfect',
			offsetMs: 12,
			answerLabel: 'F',
			correction: null
		});
		expect(hit.anchorBeat).toBe(8);
	});

	it('keeps the data a locate attempt has today', () => {
		expect(locatePresenter.attemptData!(item, valueOf({ midi: 70 }))).toEqual({
			item,
			answer: { midi: 70 },
			confusion: { kind: 'octave' }
		});
		expect(locatePresenter.attemptData!(item, valueOf({ midi: null }))).toEqual({
			item,
			answer: null,
			confusion: null
		});
	});
});
