import { describe, expect, it } from 'vitest';
import { voicingOccurrences, parseVoicingKey } from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';
import { CONTENT_JUDGES } from '$lib/domain/judges';
import { TRIAD_MESSAGES } from './triadMessages';
import { CONTENT_VIEWS } from './contentViews';

const D_ON_B = 'D|maj|3:5,2:1,1:3';
const D_ON_G = 'D|maj|3:1,2:3,1:5';

/** The id of the shape of a voicing whose lowest fret is `position`. */
function idAt(voicingKey: string, frets: [number, number, number]): string {
	const shape = voicingOccurrences(parseVoicingKey(voicingKey)).find((s) =>
		s.notes.every((note, i) => note.fret === frets[i])
	);
	if (!shape) throw new Error(`no shape ${frets}`);
	return occurrenceId(shape);
}

const shape = (frets: [number, number, number]) => ({
	kind: 'shape',
	notes: [
		{ string: 3, fret: frets[0] },
		{ string: 2, fret: frets[1] },
		{ string: 1, fret: frets[2] }
	]
});

describe('CONTENT_VIEWS', () => {
	it('spells the note played as the prompt spells its target', () => {
		const value = { string: 2, pitch: 'D' };
		expect(CONTENT_VIEWS.note.answerLabel(value, { midi: 62 }, 'fr', () => 0)).toBe('D');
		// A# played: sharp or flat as the same random draws it for the prompt.
		expect(CONTENT_VIEWS.note.answerLabel(value, { midi: 70 }, 'fr', () => 0.9)).toBe('Bb');
		expect(CONTENT_VIEWS.note.answerLabel(value, { midi: 70 }, 'fr', () => 0)).toBe('A#');
	});

	it('tells a missed note its position', () => {
		const miss = CONTENT_VIEWS.note.miss(
			{ string: 6, pitch: 'A' },
			{ answer: { midi: 50 }, confusion: { kind: 'octave' } },
			'fr',
			() => 0
		);
		expect(miss).toEqual({
			correction: 'corde de E grave, case 5',
			heard: null,
			expected: null,
			gap: null
		});
	});

	it('never tells the open string as a position, fret 12 instead, in either language', () => {
		const told = (item: { string: number; pitch: string }, locale: 'fr' | 'en') =>
			CONTENT_VIEWS.note.miss(item, { answer: null, confusion: null }, locale, () => 0).correction;
		expect(told({ string: 5, pitch: 'A' }, 'fr')).toBe('corde de A, case 12');
		expect(told({ string: 2, pitch: 'F' }, 'en')).toBe('B string, fret 6');
	});

	it('tells a missed name both spellings', () => {
		const value = { string: 3, fret: 3 };
		expect(CONTENT_VIEWS.name.answerLabel(value, { pitch: 'F#' }, 'fr', () => 0.9)).toBe('Gb');
		expect(
			CONTENT_VIEWS.name.miss(value, { answer: { pitch: 'A' }, confusion: null }, 'fr', () => 0)
				.correction
		).toBe('A# / Bb');
	});

	it('tells the frets of the chord heard, nothing when none was recognized', () => {
		const value = { voicingKey: D_ON_B, position: null };
		expect(
			CONTENT_VIEWS['chord-voicing'].answerLabel(
				value,
				{ decided: idAt(D_ON_B, [2, 3, 2]) },
				'fr',
				() => 0
			)
		).toBe('2‑3‑2');
		expect(
			CONTENT_VIEWS['chord-voicing'].answerLabel(value, { decided: null }, 'fr', () => 0)
		).toBeNull();
	});

	it('tells a missed chord what was heard, what was expected near it, and the gap', () => {
		const value = { voicingKey: D_ON_B, position: null };
		const miss = CONTENT_VIEWS['chord-voicing'].miss(
			value,
			{
				answer: { decided: idAt(D_ON_G, [7, 7, 5]) },
				confusion: { kind: 'other-inversion', part: 'chord' }
			},
			'fr',
			() => 0
		);
		expect(miss.heard).toEqual(shape([7, 7, 5]));
		// The shape of the asked voicing nearest the one played.
		expect(miss.expected).toEqual(shape([2, 3, 2]));
		expect(miss.gap).toBe(TRIAD_MESSAGES.fr.gap['other-inversion']);
		expect(miss.correction).toBe('2‑3‑2 · A D F#');
	});

	it("expects the zone's shape at its position", () => {
		const value = { voicingKey: D_ON_B, position: 14 };
		const miss = CONTENT_VIEWS['chord-voicing'].miss(
			value,
			{
				answer: { decided: idAt(D_ON_B, [2, 3, 2]) },
				confusion: { kind: 'other-octave', part: 'chord' }
			},
			'en',
			() => 0
		);
		expect(miss.expected).toEqual(shape([14, 15, 14]));
		expect(miss.heard).toEqual(shape([2, 3, 2]));
		expect(miss.gap).toBe('other octave');
	});

	it('says no chord was heard when nothing answered', () => {
		const miss = CONTENT_VIEWS['chord-voicing'].miss(
			{ voicingKey: D_ON_B, position: 2 },
			{ answer: null, confusion: null },
			'fr',
			() => 0
		);
		expect(miss.heard).toBeNull();
		expect(miss.gap).toBe(TRIAD_MESSAGES.fr.gap.noChordHeard);
		expect(miss.expected).toEqual(shape([2, 3, 2]));
	});

	it('names the gap of a missed chord in English', () => {
		const gap = (confusion: unknown, answer: unknown = { decided: null }) =>
			CONTENT_VIEWS['chord-voicing'].miss(
				{ voicingKey: D_ON_B, position: null },
				{ answer, confusion },
				'en',
				() => 0
			).gap;
		expect(gap({ kind: 'other-inversion', part: 'chord' })).toBe('other inversion');
		expect(gap({ kind: 'other-quality', part: 'chord' })).toBe('other quality');
		expect(gap({ kind: 'none', part: 'chord' })).toBe('nothing recognized');
		expect(gap(null, null)).toBe('no chord heard');
	});

	it('tells a missed pitch the note heard and the note expected', () => {
		const miss = (locale: 'fr' | 'en') =>
			CONTENT_VIEWS.pitch.miss(
				{ midi: 67, string: 2 },
				{ answer: { midi: 69 }, confusion: null },
				locale,
				() => 0
			);
		expect(miss('en')).toEqual({
			correction: 'G',
			heard: null,
			expected: null,
			gap: 'A instead of G'
		});
		expect(miss('fr').gap).toBe('A au lieu de G');
		// Nothing heard: only the right note.
		const silent = CONTENT_VIEWS.pitch.miss(
			{ midi: 67 },
			{ answer: null, confusion: null },
			'fr',
			() => 0
		);
		expect(silent).toMatchObject({ correction: 'G', gap: null });
	});

	it('tells an octave error as such, not as the same note twice', () => {
		const told = (heard: number, locale: 'fr' | 'en') =>
			CONTENT_VIEWS.pitch.miss(
				{ midi: 67 },
				{ answer: { midi: heard }, confusion: null },
				locale,
				() => 0
			).gap;
		expect(told(79, 'fr')).toBe('G, une octave trop haut');
		expect(told(55, 'fr')).toBe('G, une octave trop bas');
		expect(told(79, 'en')).toBe('G, an octave too high');
		expect(told(55, 'en')).toBe('G, an octave too low');
		expect(told(91, 'fr')).toBe('G, 2 octaves trop haut');
		expect(told(43, 'en')).toBe('G, 2 octaves too low');
	});

	it('spells the note heard and the note expected with one accidental choice', () => {
		// Each draw would flip the spelling: both notes take the first.
		const draws = [0.9, 0.1, 0.9, 0.1];
		const random = () => draws.shift() ?? 0.5;
		const miss = CONTENT_VIEWS.pitch.miss(
			{ midi: 70 },
			{ answer: { midi: 68 }, confusion: null },
			'fr',
			random
		);
		expect(miss).toMatchObject({ correction: 'Bb', gap: 'Ab au lieu de Bb' });
	});

	it('tells the pitch played as the note view does', () => {
		for (const r of [0, 0.9]) {
			expect(CONTENT_VIEWS.pitch.answerLabel({ midi: 67 }, { midi: 70 }, 'fr', () => r)).toBe(
				CONTENT_VIEWS.note.answerLabel({ string: 2, pitch: 'G' }, { midi: 70 }, 'fr', () => r)
			);
		}
		expect(CONTENT_VIEWS.pitch.answerLabel).toBe(CONTENT_VIEWS.note.answerLabel);
	});

	it('spells the pitch played', () => {
		expect(CONTENT_VIEWS.pitch.answerLabel({ midi: 67 }, { midi: 70 }, 'fr', () => 0.9)).toBe('Bb');
		expect(CONTENT_VIEWS.pitch.answerLabel({ midi: 67 }, null, 'fr', () => 0)).toBeNull();
	});

	it('has a view for every kind of content the judges judge, but those no view covers yet', () => {
		/** Kinds judged but drawn by their presenter's own model until the gesture is data. */
		const NOT_VIEWED_YET = ['chord-grid'];
		const judged = Object.keys(CONTENT_JUDGES);
		expect(NOT_VIEWED_YET.every((kind) => judged.includes(kind))).toBe(true);
		expect(Object.keys(CONTENT_VIEWS).sort()).toEqual(
			judged.filter((kind) => !NOT_VIEWED_YET.includes(kind)).sort()
		);
	});
});
