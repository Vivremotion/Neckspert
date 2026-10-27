import { describe, expect, it } from 'vitest';
import {
	closeTriadVoicings,
	parseSpelledNote,
	qualityById,
	voicingKey,
	voicingOccurrences,
	type VoicingOccurrence
} from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';
import { cardKeyOf, mechanicRules, MECHANIC_RULES } from './index';
import { triadAnchorRules } from './triadAnchor';
import { triadZoneRules } from './triadZone';

const D_MAJOR = closeTriadVoicings(
	{ root: parseSpelledNote('D'), quality: qualityById('maj') },
	[3, 2, 1]
);
const D_MINOR = closeTriadVoicings(
	{ root: parseSpelledNote('D'), quality: qualityById('min') },
	[3, 2, 1]
);
/** D with its root on B: 2-3-2, 14-15-14. */
const D_ON_B = D_MAJOR[2];
const KEY = voicingKey(D_ON_B);

function at(voicing: (typeof D_MAJOR)[number], frets: string): VoicingOccurrence {
	const found = voicingOccurrences(voicing).find(
		(o) => o.notes.map((n) => n.fret).join('-') === frets
	);
	if (!found) throw new Error(`no occurrence at ${frets}`);
	return found;
}

const heard = (occurrence: VoicingOccurrence | null) => ({
	windowMs: 250,
	decided: occurrence ? occurrenceId(occurrence) : null,
	final: true,
	variants: []
});

describe('triadAnchorRules', () => {
	const item = { voicingKey: KEY };

	it('takes the root on the string that carries it, at any octave', () => {
		// D on the B string: fret 3 (D4, MIDI 62) or fret 15 (D5, 74).
		expect(triadAnchorRules.judge(item, { midi: 62 }, 'note')).toMatchObject({
			correct: true,
			answer: { midi: 62 },
			confusion: null
		});
		expect(triadAnchorRules.judge(item, { midi: 74 }, 'note').correct).toBe(true);
	});

	it('names the confusion of a wrong root as locate does, for the root', () => {
		expect(triadAnchorRules.judge(item, { midi: 63 }, 'note')).toMatchObject({
			correct: false,
			confusion: { kind: 'semitone', delta: 1, part: 'root' }
		});
	});

	it('takes any shape of the voicing as the chord', () => {
		const right = triadAnchorRules.judge(item, heard(at(D_ON_B, '14-15-14')), 'chord');
		expect(right).toMatchObject({ correct: true, confusion: null });
		expect(right.answer).toEqual({ decided: occurrenceId(at(D_ON_B, '14-15-14')) });
	});

	it('names another inversion, another quality, or nothing recognized', () => {
		expect(triadAnchorRules.judge(item, heard(at(D_MAJOR[0], '7-7-5')), 'chord').confusion).toEqual(
			{ kind: 'other-inversion', part: 'chord' }
		);
		expect(
			triadAnchorRules.judge(item, heard(voicingOccurrences(D_MINOR[2])[0]), 'chord').confusion
		).toEqual({ kind: 'other-quality', part: 'chord' });
		expect(triadAnchorRules.judge(item, heard(null), 'chord')).toMatchObject({
			correct: false,
			answer: { decided: null },
			confusion: { kind: 'none', part: 'chord' }
		});
	});

	it('plays on the anchor time relation', () => {
		expect(triadAnchorRules.timing.id).toBe('anchor');
	});
});

describe('triadZoneRules', () => {
	const item = { voicingKey: KEY, position: 2 as const };

	it('is right only on the shape at the asked position', () => {
		expect(triadZoneRules.judge(item, heard(at(D_ON_B, '2-3-2')), 'chord')).toMatchObject({
			correct: true,
			confusion: null
		});
	});

	it('names the same shape at the other octave, another inversion, another quality', () => {
		expect(triadZoneRules.judge(item, heard(at(D_ON_B, '14-15-14')), 'chord')).toMatchObject({
			correct: false,
			confusion: { kind: 'other-octave', part: 'chord' }
		});
		expect(triadZoneRules.judge(item, heard(at(D_MAJOR[0], '7-7-5')), 'chord').confusion).toEqual({
			kind: 'other-inversion',
			part: 'chord'
		});
		expect(
			triadZoneRules.judge(item, heard(voicingOccurrences(D_MINOR[2])[0]), 'chord').confusion
		).toEqual({ kind: 'other-quality', part: 'chord' });
		expect(triadZoneRules.judge(item, heard(null), 'chord').confusion).toEqual({
			kind: 'none',
			part: 'chord'
		});
	});

	it('keeps one card per voicing, whatever the position asked', () => {
		expect(cardKeyOf(triadZoneRules, item)).toBe(`triad-zone:${KEY}`);
		expect(triadZoneRules.cardItem?.(item)).toEqual({ voicingKey: KEY });
		expect(triadZoneRules.timing.id).toBe('beat');
	});
});

describe('the triad mechanics in the registry', () => {
	it('finds both, and reads their keys back', () => {
		expect(MECHANIC_RULES.map((rules) => rules.id).slice(0, 4)).toEqual([
			'locate',
			'identify',
			'triad-anchor',
			'triad-zone'
		]);
		expect(mechanicRules('triad-anchor')).toBe(triadAnchorRules);
		expect(mechanicRules('triad-zone')).toBe(triadZoneRules);
		expect(triadAnchorRules.parseItem(KEY)).toEqual({ voicingKey: KEY });
		expect(triadZoneRules.parseItem(KEY)).toEqual({ voicingKey: KEY });
		expect(() => triadAnchorRules.parseItem('D|maj')).toThrow();
	});
});
