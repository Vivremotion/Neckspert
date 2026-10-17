import { describe, expect, it } from 'vitest';
import type { CycleFailure, MeasureId } from '$lib/domain/time';
import { GLOSSARY, TERM_IDS, termOfFailure, termOfMeasure } from './index';

const MEASURES: MeasureId[] = [
	'fidelity',
	'placement',
	'precision',
	'regularity',
	'holdOffset',
	'holdDrift'
];
const FAILURES: CycleFailure[] = ['missed', 'extra', 'shift', 'precision', 'regularity', 'hold'];

describe('glossary', () => {
	it('every measure and every failure has a term', () => {
		const ids = [...MEASURES.map(termOfMeasure), ...FAILURES.map(termOfFailure)];
		for (const id of ids) {
			for (const locale of ['fr', 'en'] as const) {
				expect(GLOSSARY[id][locale].term.length).toBeGreaterThan(0);
				expect(GLOSSARY[id][locale].definition.length).toBeGreaterThan(0);
			}
		}
	});

	it('every term is defined in both languages', () => {
		for (const id of TERM_IDS) {
			expect(GLOSSARY[id].fr.definition).not.toBe('');
			expect(GLOSSARY[id].en.definition).not.toBe('');
		}
	});

	it("the screen words are the glossary's", () => {
		expect(GLOSSARY.hold.fr.term).toBe('tenue');
		expect(GLOSSARY.level.fr.term).toBe('niveau');
		expect(GLOSSARY.breath.fr.term).toBe('respiration');
		expect(termOfMeasure('holdDrift')).toBe('hold');
		expect(termOfFailure('extra')).toBe('fidelity');
	});
});
