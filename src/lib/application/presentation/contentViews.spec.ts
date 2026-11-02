import { describe, expect, it } from 'vitest';
import { voicingOccurrences, parseVoicingKey } from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';
import { CONTENT_JUDGES, type MemberContent } from '$lib/domain/judges';
import type { Filter } from '$lib/domain/families';
import { GUITAR_DERIVATIONS } from '$lib/domain/families/guitar/derivations';
import { TRIAD_MESSAGES } from './triadMessages';
import {
	CONTENT_VIEWS,
	memberFieldNames,
	memberFields,
	membersPicture,
	roundMemberFields
} from './contentViews';
import { shapeOf } from './triadWords';
import {
	chordShapes as chordShapesFamily,
	type ChordGridConfusion
} from '$lib/domain/families/guitar/chordShapes';
import type { StringNumber } from '$lib/domain/music';
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

	it('spells the note expected as its content names it, and the note heard alike', () => {
		const miss = (name: string, heard: number) =>
			CONTENT_VIEWS.pitch.miss(
				{ midi: 70, name },
				{ answer: { midi: heard }, confusion: null },
				'fr',
				() => 0
			);
		// Written B flat: a flat for the note heard too, whatever the draw.
		expect(miss('Bb', 68)).toMatchObject({ correction: 'Bb', gap: 'Ab au lieu de Bb' });
		expect(miss('A#', 68)).toMatchObject({ correction: 'A#', gap: 'G# au lieu de A#' });
		expect(miss('Bb', 69).gap).toBe('A au lieu de Bb');
		expect(miss('Bb', 82).gap).toBe('Bb, une octave trop haut');
		// A natural names itself; the note heard takes the draw.
		const natural = CONTENT_VIEWS.pitch.miss(
			{ midi: 67, name: 'G' },
			{ answer: { midi: 68 }, confusion: null },
			'fr',
			() => 0.9
		);
		expect(natural).toMatchObject({ correction: 'G', gap: 'Ab au lieu de G' });
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
const climbOn = (strings: string) =>
	changeRound(
		servedPassageRound(GESTURE_CLIMB, `grid=iohefy-a;strings=${strings}`, 0, { direction: 'up' })
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

	it('tells the strings low first on D-G-B, and every string of a zone of four', () => {
		expect(memberFields(climbOn('4,3,2').value, 'fr').strings).toBe('ré‑sol‑si');
		expect(memberFields(climbOn('4,3,2').value, 'en').strings).toBe('D‑G‑B');
		// The zone and the jam play on the four high strings (`params.strings`).
		expect(memberFields(zone([5, 9]).value, 'fr').strings).toBe('ré‑sol‑si‑mi');
		expect(memberFields(jam().value, 'en').strings).toBe('D‑G‑B‑E');
	});

	it("gathers the fields of a round, each the first content's that offers it", () => {
		const low = zone([1, 5]).value;
		const high = zone([6, 10]).value;
		expect(roundMemberFields([notePlaces({ string: 2, pitch: 'D' }), low, high], 'fr')).toEqual(
			memberFields(low, 'fr')
		);
		expect(roundMemberFields([high, low], 'fr').frets).toBe('6 à 10');
		expect(roundMemberFields([notePlaces({ string: 2, pitch: 'D' })], 'fr')).toEqual({});
	});

	it('takes a field from the first content that gives it words, past one that leaves it empty', () => {
		// The jam's content says no way and no frets; the climb's and the zone's do.
		const fields = roundMemberFields([jam().value, climb('up').value, zone([5, 9]).value], 'fr');
		expect(fields).toEqual({ strings: 'ré‑sol‑si‑mi', frets: '5 à 9', toward: '↑ en montant' });
		expect(roundMemberFields([jam().value], 'fr')).toMatchObject({ frets: '', toward: '' });
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
		expect(membersPicture(jam().value, now, next)).toEqual({
			kind: 'neck',
			frets: { low: 5, high: 8 },
			// The strings of the content's index, low to high: the jam's zone of four strings.
			strings: [4, 3, 2, 1],
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
		const picture = membersPicture(climb('up').value, [shared, shared], []);
		expect(picture).toMatchObject({ kind: 'neck', frets: { low: 5, high: 7 }, strings: [3, 2, 1] });
		expect((picture as { notes: unknown[] }).notes).toHaveLength(3);
	});

	it("keeps the strings of the content's zone whatever strings the shapes use", () => {
		// Shapes on G-B-E alone, now and next: the zone's neck keeps its four strings.
		const now = [shapeMember('D', 'min', G_B_E, '7-6-5')];
		const next = [shapeMember('G', 'maj', G_B_E, '7-8-7')];
		expect(membersPicture(zone([5, 9]).value, now, next)).toMatchObject({
			strings: [4, 3, 2, 1]
		});
		expect(membersPicture(climb('up').value, now, next)).toMatchObject({ strings: [3, 2, 1] });
	});

	it('draws nothing of no shape, of a note, or of a family without a view', () => {
		expect(membersPicture(jam().value, [], [])).toBeNull();
		expect(membersPicture(notePlaces({ string: 2, pitch: 'D' }), [{ id: '2:3' }], [])).toBeNull();
		expect(
			membersPicture(
				{ family: 'nobody', index: null, selection: { family: 'nobody' } },
				[{ id: 'x' }],
				[]
			)
		).toBeNull();
	});
});

/** The picture of a shape: its frets written low string first, on `strings`. */
const drawn = (frets: string, strings: StringNumber[] = G_B_E) => ({
	kind: 'shape',
	notes: frets.split('-').map((fret, i) => ({ string: strings[i], fret: Number(fret) }))
});

/**
 * The miss of a change, as the presenters of the changes told it before plan 4c deleted them
 * (the view was compared with them while they ran; these expectations were captured then).
 */
describe('the miss of a change', () => {
	/** What the view tells of a miss of `decided` in the round. */
	function told(
		{ value }: ReturnType<typeof changeRound>,
		decided: string | null,
		locale: 'fr' | 'en' = 'fr'
	) {
		const judged = CONTENT_JUDGES.member.judge(value, { decided });
		const outcome = { answer: judged.answer, confusion: judged.confusion };
		return {
			told: member.miss(value, outcome, locale, () => 0),
			confusion: judged.confusion as ChordGridConfusion | null
		};
	}

	it('tells every kind of confusion of a change: the shape heard, the shape expected, the gap', () => {
		const ringing = shapeId('D', 'min', G_B_E, '7-6-5');
		const cases: [
			ReturnType<typeof changeRound>,
			string | null,
			string,
			string,
			unknown,
			unknown
		][] = [
			[jam(), null, 'none', 'rien de reconnu', null, drawn('2-3-1')],
			[
				jam(),
				shapeId('C', 'maj', G_B_E, '5-5-3'),
				'other-chord',
				'autre accord',
				drawn('5-5-3'),
				drawn('3-2-3', D_G_B)
			],
			[
				jam(),
				shapeId('D', 'maj', G_B_E, '7-7-5'),
				'other-quality',
				'autre qualité',
				drawn('7-7-5'),
				drawn('7-6-5')
			],
			[
				climb('up', ringing),
				shapeId('D', 'min', D_G_B, '7-7-6'),
				'other-set',
				'autres cordes',
				drawn('7-7-6', D_G_B),
				drawn('10-10-10')
			],
			[
				climb('up', ringing),
				shapeId('D', 'min', G_B_E, '2-3-1'),
				'not-higher',
				'pas plus haut',
				drawn('2-3-1'),
				drawn('10-10-10')
			],
			[
				climb('down', shapeId('D', 'min', G_B_E, '10-10-10')),
				shapeId('D', 'min', G_B_E, '14-15-13'),
				'not-lower',
				'pas plus bas',
				drawn('14-15-13'),
				drawn('7-6-5')
			],
			[
				zone([5, 9]),
				shapeId('D', 'min', G_B_E, '10-10-10'),
				'out-of-zone',
				'hors de la zone',
				drawn('10-10-10'),
				drawn('7-7-6', D_G_B)
			]
		];
		for (const [round, decided, kind, words, heard, expected] of cases) {
			const seen = told(round, decided);
			expect(seen.confusion?.kind, kind).toBe(kind);
			expect(seen.told, kind).toEqual({ correction: null, heard, expected, gap: words });
		}
	});

	it("tells a link's other shape", () => {
		const seen = told(link(1), shapeId('D', 'maj', G_B_E, '2-3-2'), 'en');
		expect(seen.confusion?.kind).toBe('other-shape');
		expect(seen.told).toEqual({
			correction: null,
			heard: drawn('2-3-2'),
			expected: { kind: 'shape', ...shapeOf(shapeAt('D', 'maj', G_B_E, '7-7-5')) },
			gap: 'other shape'
		});
	});

	it('expects the shape closest to the one heard, else to the one still ringing', () => {
		const ringing = shapeId('D', 'min', G_B_E, '10-10-10');
		const heard = told(jam(ringing), shapeId('D', 'maj', G_B_E, '7-7-5'));
		expect(heard.told).toMatchObject({ heard: drawn('7-7-5'), expected: drawn('7-6-5') });
		const none = told(jam(ringing), null);
		expect(none.told).toMatchObject({ heard: null, expected: drawn('10-10-10') });
	});

	it('draws the shape heard and the closest admitted after a shape that does not climb', () => {
		const ringing = shapeId('F', 'maj', G_B_E, '5-6-5');
		const asked = changeRound(
			servedPassageRound(
				GESTURE_CLIMB,
				'grid=blues-f;strings=3,2,1',
				0,
				{ direction: 'up' },
				ringing
			)
		);
		const seen = told(asked, shapeId('F', 'maj', G_B_E, '2-1-1'));
		expect(seen.confusion?.kind).toBe('not-higher');
		expect(seen.told).toEqual({
			correction: null,
			heard: drawn('2-1-1'),
			expected: drawn('10-10-8'),
			gap: 'pas plus haut'
		});
		const { value } = asked;
		expect(member.miss(value, { answer: null, confusion: null }, 'en', () => 0)).toMatchObject({
			heard: null,
			gap: 'no chord heard'
		});
	});

	it('tells a miss whose confusion says nothing without a gap, and without throwing', () => {
		const heard = shapeId('D', 'min', G_B_E, '7-6-5');
		expect(
			member.miss(jam().value, { answer: { decided: heard }, confusion: null }, 'fr', () => 0)
		).toEqual({ correction: null, heard: drawn('7-6-5'), expected: drawn('7-6-5'), gap: null });
	});

	it('tells the gap of a missed change in English', () => {
		const ringing = shapeId('D', 'min', G_B_E, '7-6-5');
		expect(told(jam(), shapeId('C', 'maj', G_B_E, '5-5-3'), 'en').told.gap).toBe('other chord');
		expect(told(jam(), shapeId('D', 'maj', G_B_E, '7-7-5'), 'en').told.gap).toBe('other quality');
		expect(told(climb('up', ringing), shapeId('D', 'min', G_B_E, '2-3-1'), 'en').told.gap).toBe(
			'not higher'
		);
		expect(told(zone([5, 9]), shapeId('D', 'min', G_B_E, '10-10-10'), 'en').told.gap).toBe(
			'out of the zone'
		);
	});

	it('says no chord was heard when nothing answered', () => {
		const told = member.miss(jam().value, { answer: null, confusion: null }, 'en', () => 0);
		expect(told.gap).toBe('no chord heard');
		expect(told.heard).toBeNull();
	});
});
