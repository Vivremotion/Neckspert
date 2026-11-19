import { describe, expect, it } from 'vitest';
import type { Refusal } from '$lib/domain/definitions';
import { refusalText } from './refusalMessages';

const refusal = (kind: Refusal['kind'], id: string | null): Refusal => ({
	file: 'mes grilles.json',
	kind,
	id,
	reason: 'the chord is unknown'
});

describe('refusalText', () => {
	it.each([
		['skill', 'capacité'],
		['grid', 'grille'],
		['exercise', 'exercice']
	] as const)('frames a %s with its id in French', (kind, word) => {
		expect(refusalText(refusal(kind, 'abc'), 'fr')).toBe(
			`mes grilles.json, ${word} \`abc\` : the chord is unknown`
		);
	});

	it.each(['skill', 'grid', 'exercise'] as const)('frames a %s with its id in English', (kind) => {
		expect(refusalText(refusal(kind, 'abc'), 'en')).toBe(
			`mes grilles.json, ${kind} \`abc\`: the chord is unknown`
		);
	});

	it('names the kind alone without an id', () => {
		expect(refusalText(refusal('grid', null), 'fr')).toBe(
			'mes grilles.json, grille : the chord is unknown'
		);
		expect(refusalText(refusal('grid', null), 'en')).toBe(
			'mes grilles.json, grid: the chord is unknown'
		);
	});

	it('gives the file then the reason for a file-level refusal', () => {
		expect(refusalText(refusal('file', null), 'fr')).toBe(
			'mes grilles.json : the chord is unknown'
		);
		expect(refusalText(refusal('file', null), 'en')).toBe('mes grilles.json: the chord is unknown');
	});

	it('leaves the file out on request', () => {
		expect(refusalText(refusal('exercise', 'x'), 'fr', { file: false })).toBe(
			'exercice `x` : the chord is unknown'
		);
		expect(refusalText(refusal('file', null), 'en', { file: false })).toBe('the chord is unknown');
	});
});
