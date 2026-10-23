import { describe, expect, it } from 'vitest';
import {
	cardKey,
	DEFAULT_SETTINGS,
	DIAGNOSTIC_BUDGETS_MB,
	isResponseSuccess,
	parseCardKey,
	RESPONSE_RELATIONS,
	RESPONSE_VERDICTS,
	responseVerdictOf,
	resolveDiagnosticsEnabled
} from './types';

describe('cardKey', () => {
	it('prefixes an item key with its mechanic', () => {
		expect(cardKey('locate', '6:F')).toBe('locate:6:F');
		expect(cardKey('identify', '5:8')).toBe('identify:5:8');
	});

	it('splits a key into its mechanic and its item key', () => {
		expect(parseCardKey('identify:6:3')).toEqual({ mechanic: 'identify', itemKey: '6:3' });
		expect(parseCardKey(cardKey('locate', '6:G#'))).toEqual({
			mechanic: 'locate',
			itemKey: '6:G#'
		});
	});

	it('rejects a key without a mechanic or an item', () => {
		expect(() => parseCardKey('locate')).toThrow();
		expect(() => parseCardKey('locate:')).toThrow();
		expect(() => parseCardKey(':6:F')).toThrow();
	});
});

describe('diagnostics settings', () => {
	it('leave the journal to the build by default, within 300 MB', () => {
		expect(DEFAULT_SETTINGS.diagnostics).toEqual({ enabled: null, budgetMb: 300 });
		expect(DIAGNOSTIC_BUDGETS_MB).toEqual([100, 300, 1000]);
	});

	it('follow the build default until the player chooses', () => {
		expect(resolveDiagnosticsEnabled({ enabled: null, budgetMb: 300 }, true)).toBe(true);
		expect(resolveDiagnosticsEnabled({ enabled: null, budgetMb: 300 }, false)).toBe(false);
		expect(resolveDiagnosticsEnabled({ enabled: false, budgetMb: 300 }, true)).toBe(false);
		expect(resolveDiagnosticsEnabled({ enabled: true, budgetMb: 300 }, false)).toBe(true);
	});
});

describe('verdicts', () => {
	it('ranks corrected between off beat and wrong', () => {
		expect(RESPONSE_VERDICTS).toEqual([
			'perfect',
			'early',
			'late',
			'offbeat',
			'corrected',
			'wrong'
		]);
	});

	it('never counts a corrected attempt as a success', () => {
		expect(isResponseSuccess({ correct: false, verdict: 'corrected' })).toBe(false);
	});

	it('counts a right answer in time as a success, never one off the beat', () => {
		expect(isResponseSuccess({ correct: true, verdict: 'late' })).toBe(true);
		expect(isResponseSuccess({ correct: true, verdict: 'offbeat' })).toBe(false);
		expect(isResponseSuccess({ correct: false, verdict: 'wrong' })).toBe(false);
	});
});

describe('responseVerdictOf', () => {
	it('names the one-answer relations', () => {
		expect(RESPONSE_RELATIONS).toEqual(['beat', 'free', 'anchor', 'grid-change', 'response']);
	});

	it('reads the verdict of a response envelope', () => {
		const value = {
			verdict: 'late',
			timingOffsetMs: 120,
			reactionMs: 3120,
			leadMs: 3000,
			expectations: []
		};
		expect(responseVerdictOf({ verdict: { relation: 'response', version: 1, value } })).toBe(
			'late'
		);
		expect(responseVerdictOf({ verdict: { relation: 'beat', version: 1, value: 'perfect' } })).toBe(
			'perfect'
		);
		expect(
			responseVerdictOf({ verdict: { relation: 'response', version: 1, value: { verdict: 'x' } } })
		).toBeNull();
	});

	it('reads the verdict of a one-answer relation', () => {
		expect(responseVerdictOf({ verdict: { relation: 'beat', version: 1, value: 'offbeat' } })).toBe(
			'offbeat'
		);
		expect(
			responseVerdictOf({ verdict: { relation: 'grid-change', version: 1, value: 'perfect' } })
		).toBe('perfect');
	});

	it('reads nothing from another relation', () => {
		expect(
			responseVerdictOf({ verdict: { relation: 'cycle', version: 1, value: { passed: true } } })
		).toBeNull();
	});
});

describe('chord diagram setting', () => {
	it('draws chords on strings by default', () => {
		expect(DEFAULT_SETTINGS.chordDiagram).toBe('strings');
	});
});
