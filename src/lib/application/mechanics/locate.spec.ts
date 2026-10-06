import { describe, expect, it } from 'vitest';
import { locateRules } from '$lib/domain/mechanics';
import { locatePresenter } from './locate';
import { NECK_PRESENTERS } from './index';

const aided = { aid: 'show-position', stringAid: false } as const;
const unaided = { aid: 'none', stringAid: false } as const;

describe('locatePresenter', () => {
	it('plays on the guitar, heard by the note sensor', () => {
		expect(locatePresenter.rules).toBe(locateRules);
		expect(locatePresenter.scene).toBe('guitar');
		expect(locatePresenter.sensor).toBe('note');
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
});
