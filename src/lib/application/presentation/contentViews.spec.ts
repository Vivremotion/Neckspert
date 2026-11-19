import { describe, expect, it } from 'vitest';
import { voicingOccurrences, parseVoicingKey } from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';
import { CONTENT_JUDGES, type MemberContent } from '$lib/domain/judges';
import type { Filter } from '$lib/domain/families';
import { GUITAR_DERIVATIONS } from '$lib/domain/families/guitar/derivations';
import { TRIAD_MESSAGES } from './triadMessages';
import { CONTENT_VIEWS, memberFieldNames, memberFields, membersPicture } from './contentViews';
import { shapeOf } from './triadWords';
import {
	chordShapes as chordShapesFamily,
	type ChordGridConfusion
} from '$lib/domain/families/guitar/chordShapes';
import type { StringNumber } from '$lib/domain/music';
import { changePresenter, linkPresenter } from '$lib/application/sets/chordGrid';
import { GESTURE_CLIMB, GESTURE_JAM, GESTURE_LINK, GESTURE_ZONE } from '$lib/testing/catalog';
import { servedPassageRound } from '$lib/testing/changesPassages';
import { shapeAt, shapeId } from '$lib/testing/shapes';

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

/** A note on a string, as its exercise asks it: any of its places on that string. */
const notePlaces = (index: { string: number; pitch: string }): MemberContent => ({
	family: 'note-places',
	index,
	selection: { family: 'note-places' }
});

/** A voicing's shapes, those `where` admits (all without it). */
const chordShapes = (voicingKey: string, where: readonly Filter[] = []): MemberContent => ({
	family: 'chord-shapes',
	index: GUITAR_DERIVATIONS.voicing.index({ voicingKey }),
	selection: { family: 'chord-shapes', where }
});

const member = CONTENT_VIEWS.member;

describe('CONTENT_VIEWS', () => {
	it('spells the note played as the prompt spells its target', () => {
		const value = notePlaces({ string: 2, pitch: 'D' });
		expect(member.answerLabel(value, { midi: 62 }, 'fr', () => 0)).toBe('D');
		// A# played: sharp or flat as the same random draws it for the prompt.
		expect(member.answerLabel(value, { midi: 70 }, 'fr', () => 0.9)).toBe('Bb');
		expect(member.answerLabel(value, { midi: 70 }, 'fr', () => 0)).toBe('A#');
	});

	it('tells a missed note its position', () => {
		const miss = member.miss(
			notePlaces({ string: 6, pitch: 'A' }),
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
			member.miss(notePlaces(item), { answer: null, confusion: null }, locale, () => 0).correction;
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
		const value = chordShapes(D_ON_B);
		expect(member.answerLabel(value, { decided: idAt(D_ON_B, [2, 3, 2]) }, 'fr', () => 0)).toBe(
			'2‑3‑2'
		);
		expect(member.answerLabel(value, { decided: null }, 'fr', () => 0)).toBeNull();
	});

	it('tells a missed chord what was heard, what was expected near it, and the gap', () => {
		const value = chordShapes(D_ON_B);
		const miss = member.miss(
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

	it('expects, of two octaves admitted, the one nearest the shape heard', () => {
		const miss = member.miss(
			chordShapes(D_ON_B),
			{
				answer: { decided: idAt('D|maj|3:3,2:5,1:1', [11, 10, 10]) },
				confusion: { kind: 'other-inversion', part: 'chord' }
			},
			'fr',
			() => 0
		);
		expect(miss.expected).toEqual(shape([14, 15, 14]));
		expect(miss.correction).toBe('14‑15‑14 · A D F#');
	});

	it('expects the admitted shape nearest the one heard, never one the selection leaves out', () => {
		// The close inversions of D on G-B-E, those from fret 6: 11-10-10 and 14-15-14, not 2-3-2.
		const value: MemberContent = {
			family: 'chord-shapes',
			index: { ...GUITAR_DERIVATIONS.voicing.index({ voicingKey: D_ON_B }), degrees: undefined },
			selection: { family: 'chord-shapes', where: [{ in: { frets: [6, 22] } }] }
		};
		const expectedFor = (heard: [number, number, number], voicingKey: string) =>
			member.miss(
				value,
				{ answer: { decided: idAt(voicingKey, heard) }, confusion: null },
				'fr',
				() => 0
			).expected;
		expect(expectedFor([14, 15, 14], D_ON_B)).toEqual(shape([14, 15, 14]));
		expect(expectedFor([2, 3, 2], D_ON_B)).toEqual(shape([11, 10, 10]));
		expect(expectedFor([7, 7, 5], D_ON_G)).toEqual(shape([11, 10, 10]));
	});

	it("expects the zone's shape at its position", () => {
		const value = chordShapes(D_ON_B, [{ at: 14 }]);
		const miss = member.miss(
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
		const miss = member.miss(
			chordShapes(D_ON_B, [{ at: 2 }]),
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
			member.miss(chordShapes(D_ON_B), { answer, confusion }, 'en', () => 0).gap;
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

	it('tells the pitch played as the view of a note on a string does', () => {
		for (const r of [0, 0.9]) {
			expect(CONTENT_VIEWS.pitch.answerLabel({ midi: 67 }, { midi: 70 }, 'fr', () => r)).toBe(
				member.answerLabel(notePlaces({ string: 2, pitch: 'G' }), { midi: 70 }, 'fr', () => r)
			);
		}
	});

	it('tells nothing of a member of a family it has no view for', () => {
		const value = { family: 'nobody', index: null, selection: { family: 'nobody' } };
		expect(member.answerLabel(value, { midi: 60 }, 'fr', () => 0)).toBeNull();
		expect(member.miss(value, { answer: null, confusion: null }, 'fr', () => 0)).toEqual({
			correction: null,
			heard: null,
			expected: null,
			gap: null
		});
	});

	it('tells nothing of a value that is no member content, without throwing', () => {
		for (const value of [null, undefined, 'note-places', 7, []]) {
			expect(member.answerLabel(value, { midi: 60 }, 'fr', () => 0)).toBeNull();
			expect(member.miss(value, { answer: null, confusion: null }, 'fr', () => 0)).toEqual({
				correction: null,
				heard: null,
				expected: null,
				gap: null
			});
		}
	});

	it('tells a pitch played as a note on a string is told, over the whole range', () => {
		const onString = notePlaces({ string: 2, pitch: 'G' });
		for (let midi = 28; midi <= 88; midi += 5) {
			for (const r of [0, 0.9]) {
				expect(
					CONTENT_VIEWS.pitch.answerLabel({ midi: 67 }, { midi }, 'fr', () => r),
					`${midi} at ${r}`
				).toBe(member.answerLabel(onString, { midi }, 'fr', () => r));
			}
		}
	});

	it('spells the pitch played', () => {
		expect(CONTENT_VIEWS.pitch.answerLabel({ midi: 67 }, { midi: 70 }, 'fr', () => 0.9)).toBe('Bb');
		expect(CONTENT_VIEWS.pitch.answerLabel({ midi: 67 }, null, 'fr', () => 0)).toBeNull();
	});

	it('has a view for every kind of content the judges judge', () => {
		expect(Object.keys(CONTENT_VIEWS).sort()).toEqual(Object.keys(CONTENT_JUDGES).sort());
	});
});

/** The member content of a passage's round, its plan compiled, and the round as a presenter reads it. */
function changeRound(served: ReturnType<typeof servedPassageRound>) {
	const content = served.plan.expectations[0].content!;
	return {
		item: served.planned.item,
		value: content.value as MemberContent,
		round: { passage: served.planned.passage, expectations: served.plan.expectations }
	};
}

const G_B_E: StringNumber[] = [3, 2, 1];
const D_G_B: StringNumber[] = [4, 3, 2];

const climb = (direction: 'up' | 'down', previous: string | null = null) =>
	changeRound(
		servedPassageRound(GESTURE_CLIMB, 'grid=iohefy-a;strings=3,2,1', 0, { direction }, previous)
	);
const zone = (frets: [number, number]) =>
	changeRound(servedPassageRound(GESTURE_ZONE, 'grid=iohefy-a', 0, { zone: frets }));
const jam = (previous: string | null = null) =>
	changeRound(servedPassageRound(GESTURE_JAM, 'grid=iohefy-a', 0, {}, previous));
const link = (rank: number, previous: string | null = null) =>
	changeRound(servedPassageRound(GESTURE_LINK, 'chord=D;strings=3,2,1', rank, {}, previous));

describe('the fields of the members of a family', () => {
	it('names the fields each family offers, none for a family without them or without a view', () => {
		expect(memberFieldNames('chord-shapes')).toEqual(['strings', 'frets', 'toward']);
		expect(memberFieldNames('note-places')).toEqual([]);
		expect(memberFieldNames('nobody')).toEqual([]);
	});

	it('tells the strings of a climb and the way it goes, in each language', () => {
		expect(memberFields(climb('up').value, 'fr')).toEqual({
			strings: 'sol‑si‑mi',
			frets: '',
			toward: '↑ en montant'
		});
		expect(memberFields(climb('down').value, 'en')).toEqual({
			strings: 'G‑B‑E',
			frets: '',
			toward: '↓ going down'
		});
	});

	it('tells the way the round looks as its passage writes it, after the climb has turned', () => {
		// The top shape of Dm on G-B-E rang: nothing lies above, the climb turns, the round looks down.
		const top = shapeId('D', 'min', G_B_E, '14-15-13');
		expect(memberFields(climb('down', top).value, 'fr').toward).toBe('↓ en descendant');
		// The round reads the direction compiled for it, not a turn the judge makes on its own.
		expect(memberFields(climb('up', top).value, 'fr').toward).toBe('↑ en montant');
	});

	it('tells the frets of a zone, and no way', () => {
		expect(memberFields(zone([5, 9]).value, 'fr')).toMatchObject({ frets: '5 à 9', toward: '' });
		expect(memberFields(zone([1, 5]).value, 'en')).toMatchObject({ frets: '1 to 5', toward: '' });
	});

	it('tells neither frets nor way when the round reads the grid alone', () => {
		expect(memberFields(jam().value, 'fr')).toMatchObject({ frets: '', toward: '' });
	});

	it('offers nothing for a note, a family without a view, or what is no member content', () => {
		expect(memberFields(notePlaces({ string: 2, pitch: 'D' }), 'fr')).toEqual({});
		expect(memberFields({ family: 'nobody', index: null, selection: {} }, 'fr')).toEqual({});
		for (const value of [null, undefined, 'chord-shapes', 7, { midi: 60 }]) {
			expect(memberFields(value, 'fr')).toEqual({});
		}
	});
});

describe('the picture of the members admitted', () => {
	const shapeMember = (root: string, quality: string, set: StringNumber[], frets: string) =>
		chordShapesFamily.member(shapeId(root, quality, set, frets))!;

	it('names the notes of every shape now, and of the next where none of now sits', () => {
		const now = [shapeMember('D', 'min', G_B_E, '7-6-5'), shapeMember('D', 'min', D_G_B, '7-7-6')];
		const next = [shapeMember('G', 'maj', G_B_E, '7-8-7')];
		expect(membersPicture('chord-shapes', now, next)).toEqual({
			kind: 'neck',
			frets: { low: 5, high: 8 },
			notes: [
				{ string: 3, fret: 7, name: 'D' },
				{ string: 2, fret: 6, name: 'F' },
				{ string: 1, fret: 5, name: 'A' },
				{ string: 4, fret: 7, name: 'A' },
				{ string: 2, fret: 8, name: 'G', next: true },
				{ string: 1, fret: 7, name: 'B', next: true }
			]
		});
	});

	it('draws a place two shapes share once', () => {
		const shared = shapeMember('D', 'min', G_B_E, '7-6-5');
		const picture = membersPicture('chord-shapes', [shared, shared], []);
		expect(picture).toMatchObject({ kind: 'neck', frets: { low: 5, high: 7 } });
		expect((picture as { notes: unknown[] }).notes).toHaveLength(3);
	});

	it('draws nothing of no shape, of a note, or of a family without a view', () => {
		expect(membersPicture('chord-shapes', [], [])).toBeNull();
		expect(membersPicture('note-places', [{ id: '2:3' }], [])).toBeNull();
		expect(membersPicture('nobody', [{ id: 'x' }], [])).toBeNull();
	});
});

describe('the miss of a change', () => {
	/** What the view tells of a miss, and what the presenter told of it before. */
	function both(
		{ item, value, round }: ReturnType<typeof changeRound>,
		decided: string | null,
		locale: 'fr' | 'en' = 'fr',
		presenter: { feedback: (...args: never[]) => unknown } = changePresenter
	) {
		const judged = CONTENT_JUDGES.member.judge(value, { decided });
		const outcome = { answer: judged.answer, confusion: judged.confusion };
		const told = member.miss(value, outcome, locale, () => 0);
		const before = (presenter.feedback as typeof changePresenter.feedback)(
			item as never,
			{ ...outcome, verdict: 'wrong' },
			locale,
			round
		)!;
		return { told, before, confusion: judged.confusion as ChordGridConfusion | null };
	}

	/** The view says what the presenter said: the shapes heard and expected, the gap. */
	function expectSame({ told, before }: ReturnType<typeof both>) {
		expect(told.heard).toEqual(before.heard && { kind: 'shape', ...before.heard });
		expect(told.expected).toEqual(before.expected && { kind: 'shape', ...before.expected });
		expect(told.gap).toBe(before.gap);
		expect(told.correction).toBeNull();
	}

	it('tells every kind of confusion of a change as the presenter told it', () => {
		const ringing = shapeId('D', 'min', G_B_E, '7-6-5');
		const cases: [ReturnType<typeof changeRound>, string | null, string, string][] = [
			[jam(), null, 'none', 'rien de reconnu'],
			[jam(), shapeId('C', 'maj', G_B_E, '5-5-3'), 'other-chord', 'autre accord'],
			[jam(), shapeId('D', 'maj', G_B_E, '7-7-5'), 'other-quality', 'autre qualité'],
			[climb('up', ringing), shapeId('D', 'min', D_G_B, '7-7-6'), 'other-set', 'autres cordes'],
			[climb('up', ringing), shapeId('D', 'min', G_B_E, '2-3-1'), 'not-higher', 'pas plus haut'],
			[
				climb('down', shapeId('D', 'min', G_B_E, '10-10-10')),
				shapeId('D', 'min', G_B_E, '14-15-13'),
				'not-lower',
				'pas plus bas'
			],
			[zone([5, 9]), shapeId('D', 'min', G_B_E, '10-10-10'), 'out-of-zone', 'hors de la zone']
		];
		for (const [round, decided, kind, words] of cases) {
			const seen = both(round, decided);
			expect(seen.confusion?.kind, kind).toBe(kind);
			expect(seen.told.gap, kind).toBe(words);
			expectSame(seen);
		}
	});

	it("tells a link's other shape as the presenter told it", () => {
		const seen = both(link(1), shapeId('D', 'maj', G_B_E, '2-3-2'), 'en', linkPresenter);
		expect(seen.confusion?.kind).toBe('other-shape');
		expect(seen.told.gap).toBe('other shape');
		expect(seen.told.expected).toEqual({
			kind: 'shape',
			...shapeOf(shapeAt('D', 'maj', G_B_E, '7-7-5'))
		});
		expectSame(seen);
	});

	it('expects the shape closest to the one heard, else to the one still ringing', () => {
		const ringing = shapeId('D', 'min', G_B_E, '10-10-10');
		const heard = both(jam(ringing), shapeId('D', 'maj', G_B_E, '7-7-5'));
		expect(heard.told.expected).toEqual({
			kind: 'shape',
			...shapeOf(shapeAt('D', 'min', G_B_E, '7-6-5'))
		});
		expectSame(heard);
		const none = both(jam(ringing), null);
		expect(none.told.expected).toEqual({
			kind: 'shape',
			...shapeOf(shapeAt('D', 'min', G_B_E, '10-10-10'))
		});
		expectSame(none);
	});

	it('says no chord was heard when nothing answered', () => {
		const { value, item, round } = jam();
		const told = member.miss(value, { answer: null, confusion: null }, 'en', () => 0);
		const before = changePresenter.feedback(
			item as never,
			{ answer: null, confusion: null, verdict: 'wrong' },
			'en',
			round
		)!;
		expect(told.gap).toBe('no chord heard');
		expect(told.gap).toBe(before.gap);
		expect(told.heard).toBeNull();
	});
});
