import { describe, expect, it } from 'vitest';
import {
	cardKey,
	DEFAULT_SETTINGS,
	DIAGNOSTIC_BUDGETS_MB,
	isSuccess,
	parseCardKey,
	RESPONSE_VERDICTS,
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
		expect(isSuccess({ correct: false, verdict: 'corrected' })).toBe(false);
	});
});

describe('chord diagram setting', () => {
	it('draws chords on strings by default', () => {
		expect(DEFAULT_SETTINGS.chordDiagram).toBe('strings');
	});
});
