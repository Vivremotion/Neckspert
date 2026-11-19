import { describe, expect, it } from 'vitest';
import {
	cardKey,
	DEFAULT_SETTINGS,
	DIAGNOSTIC_BUDGETS_MB,
	parseCardKey,
	RESPONSE_RELATIONS,
	RESPONSE_VERDICTS,
	responseVerdictOf,
	resolveDiagnosticsEnabled,
	sessionKindOf,
	sessionOriginOf,
	type SessionKind
} from './types';

describe('cardKey', () => {
	it('prefixes an item key with its skill', () => {
		expect(cardKey('locate-note-string', '6:F')).toBe('locate-note-string:6:F');
		expect(cardKey('identify-note', '5:8')).toBe('identify-note:5:8');
	});

	it('splits a key into its skill and its item key', () => {
		expect(parseCardKey('identify-note:6:3')).toEqual({ skill: 'identify-note', itemKey: '6:3' });
		expect(parseCardKey(cardKey('locate-note-string', '6:G#'))).toEqual({
			skill: 'locate-note-string',
			itemKey: '6:G#'
		});
	});

	it('rejects a key without a skill or an item', () => {
		expect(() => parseCardKey('locate-note-string')).toThrow();
		expect(() => parseCardKey('locate-note-string:')).toThrow();
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

describe('the origin of a session', () => {
	it.each([
		['learn', undefined, { routine: 'notes' }],
		['free', undefined, { routine: 'notes', free: true }],
		['triads', undefined, { routine: 'chords' }],
		['triads-zone', undefined, { routine: 'chords-zone' }],
		['gesture', undefined, { routine: 'changes' }],
		['exercise', 'rhythm-two-four', { exercise: 'rhythm-two-four' }]
	] as const)('%s: recorded as its routine or its exercise, and read back', (kind, id, origin) => {
		expect(sessionOriginOf(kind as SessionKind, id)).toEqual(origin);
		expect(sessionKindOf(origin)).toBe(kind);
	});

	it('records an exercise session without an exercise as no origin', () => {
		expect(sessionOriginOf('exercise')).toEqual({});
	});

	it('reads a record no routine describes as an exercise session', () => {
		expect(sessionKindOf({})).toBe('exercise');
		expect(sessionKindOf({ routine: 'kazoo' })).toBe('exercise');
		expect(sessionKindOf({ routine: 'chords', free: true })).toBe('exercise');
	});
});
