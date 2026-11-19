/**
 * The three memory exercises played on the guitar judge their answers as members of families
 * (plan 4a, Task 4). Before the judges `note` and `chord-voicing` were deleted, every item of
 * their lists (each zone shape at each fret it covers, on open strings, and without a position)
 * was judged both ways on every note from 28 to 88 and every shape of the chord's inversions and
 * of its other quality, and the chord sensor was given the same expected shapes and candidates:
 * all equal. These frozen rows, taken from that comparison, keep it pinned.
 */
import { describe, expect, it } from 'vitest';
import type { ChordExpectation } from '$lib/application/ports';
import { voicingOnStringsPresenter } from '$lib/application/sets/voicingOnStrings';
import { compileRound } from '$lib/domain/exercise/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { contentJudges } from '$lib/domain/judges';
import { METER_4_4 } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { LOCATE_NECK, TRIADS_ANCHOR, TRIADS_ZONE } from './catalog';

function planned(definition: ExerciseDefinition, item: unknown): PlannedItem {
	return {
		exerciseId: definition.id,
		skill: definition.practices,
		exerciseLevel: 0,
		item,
		phase: 'learning',
		temperature: 'hot',
		aid: 'none',
		leadBeats: 2,
		level: 2
	};
}

const planOf = (definition: ExerciseDefinition, item: unknown) =>
	compileRound(definition, planned(definition, item), METER_4_4, {
		previewBeats: 0,
		fromRunStart: null
	});

const D_ON_B = 'D|maj|3:5,2:1,1:3';
const D_ON_G = 'D|maj|3:1,2:3,1:5';
const C_ON_G = 'C|maj|3:1,2:3,1:5';
const E_MINOR = 'E|min|3:b3,2:5,1:1';

const right = (answer: unknown) => ({ correct: true, answer, confusion: null });
const wrong = (answer: unknown, confusion: unknown) => ({ correct: false, answer, confusion });
const chord = (kind: string) => ({ kind, part: 'chord' });
const decided = (id: string | null) => ({ decided: id });

/** [exercise, item, expectation, payload, what the judge gives]. */
const ROWS: [ExerciseDefinition, unknown, number, unknown, unknown][] = [
	// A note on a string: any of its places on that string; each confusion.
	[LOCATE_NECK, { string: 2, pitch: 'F' }, 0, { midi: 65 }, right({ midi: 65 })],
	[LOCATE_NECK, { string: 2, pitch: 'F' }, 0, { midi: 77 }, right({ midi: 77 })],
	[
		LOCATE_NECK,
		{ string: 2, pitch: 'F' },
		0,
		{ midi: 53 },
		wrong({ midi: 53 }, { kind: 'octave' })
	],
	[
		LOCATE_NECK,
		{ string: 2, pitch: 'F' },
		0,
		{ midi: 66 },
		wrong({ midi: 66 }, { kind: 'semitone', delta: 1 })
	],
	[
		LOCATE_NECK,
		{ string: 2, pitch: 'F' },
		0,
		{ midi: 59 },
		wrong({ midi: 59 }, { kind: 'string-name' })
	],
	[
		LOCATE_NECK,
		{ string: 2, pitch: 'F' },
		0,
		{ midi: 70 },
		wrong({ midi: 70 }, { kind: 'other', semitones: 5 })
	],
	[
		LOCATE_NECK,
		{ string: 6, pitch: 'G' },
		0,
		{ midi: 40 },
		wrong({ midi: 40 }, { kind: 'string-name' })
	],
	// A reading without a pitch is never judged in play; the member judge keeps no answer. The
	// old judge kept `{ midi: undefined }` and the confusion `other`: left out of the comparison.
	[LOCATE_NECK, { string: 6, pitch: 'G' }, 0, { frequencyHz: 440 }, wrong(null, null)],
	// The anchor's root, on the string that carries it, at any octave.
	[TRIADS_ANCHOR, { voicingKey: D_ON_B }, 0, { midi: 62 }, right({ midi: 62 })],
	[TRIADS_ANCHOR, { voicingKey: D_ON_B }, 0, { midi: 74 }, right({ midi: 74 })],
	[
		TRIADS_ANCHOR,
		{ voicingKey: D_ON_B },
		0,
		{ midi: 63 },
		wrong({ midi: 63 }, { kind: 'semitone', delta: 1 })
	],
	// The anchor's chord: the voicing at any octave.
	[
		TRIADS_ANCHOR,
		{ voicingKey: D_ON_B },
		1,
		decided(`${D_ON_B}@2-3-2`),
		right(decided(`${D_ON_B}@2-3-2`))
	],
	[
		TRIADS_ANCHOR,
		{ voicingKey: D_ON_B },
		1,
		decided(`${D_ON_B}@14-15-14`),
		right(decided(`${D_ON_B}@14-15-14`))
	],
	[
		TRIADS_ANCHOR,
		{ voicingKey: D_ON_B },
		1,
		decided(`${D_ON_G}@7-7-5`),
		wrong(decided(`${D_ON_G}@7-7-5`), chord('other-inversion'))
	],
	[
		TRIADS_ANCHOR,
		{ voicingKey: D_ON_B },
		1,
		decided('D|min|3:5,2:1,1:b3@2-3-1'),
		wrong(decided('D|min|3:5,2:1,1:b3@2-3-1'), chord('other-quality'))
	],
	[TRIADS_ANCHOR, { voicingKey: D_ON_B }, 1, decided(null), wrong(decided(null), chord('none'))],
	[
		TRIADS_ANCHOR,
		{ voicingKey: D_ON_B },
		1,
		decided('garbage'),
		wrong(decided('garbage'), chord('none'))
	],
	[
		TRIADS_ANCHOR,
		{ voicingKey: E_MINOR },
		1,
		decided(`${E_MINOR}@0-0-0`),
		right(decided(`${E_MINOR}@0-0-0`))
	],
	// The zone: the shape that covers the fret named (5-5-3 covers 4), not its octave.
	[
		TRIADS_ZONE,
		{ voicingKey: C_ON_G, position: 3, fret: 4 },
		0,
		decided(`${C_ON_G}@5-5-3`),
		right(decided(`${C_ON_G}@5-5-3`))
	],
	[
		TRIADS_ZONE,
		{ voicingKey: C_ON_G, position: 3, fret: 4 },
		0,
		decided(`${C_ON_G}@17-17-15`),
		wrong(decided(`${C_ON_G}@17-17-15`), chord('other-octave'))
	],
	[
		TRIADS_ZONE,
		{ voicingKey: C_ON_G, position: 3, fret: 5 },
		0,
		decided('C|maj|3:3,2:5,1:1@9-8-8'),
		wrong(decided('C|maj|3:3,2:5,1:1@9-8-8'), chord('other-inversion'))
	],
	// An attempt stored before the cue fret: the position stands for it.
	[
		TRIADS_ZONE,
		{ voicingKey: C_ON_G, position: 3 },
		0,
		decided(`${C_ON_G}@5-5-3`),
		right(decided(`${C_ON_G}@5-5-3`))
	],
	[
		TRIADS_ZONE,
		{ voicingKey: C_ON_G, position: 3 },
		0,
		decided(`${C_ON_G}@17-17-15`),
		wrong(decided(`${C_ON_G}@17-17-15`), chord('other-octave'))
	],
	// A shape on open strings: fret 0, not its octave; and the octave asked, not the open shape.
	[
		TRIADS_ZONE,
		{ voicingKey: E_MINOR, position: 'open' },
		0,
		decided(`${E_MINOR}@0-0-0`),
		right(decided(`${E_MINOR}@0-0-0`))
	],
	[
		TRIADS_ZONE,
		{ voicingKey: E_MINOR, position: 'open' },
		0,
		decided(`${E_MINOR}@12-12-12`),
		wrong(decided(`${E_MINOR}@12-12-12`), chord('other-octave'))
	],
	[
		TRIADS_ZONE,
		{ voicingKey: E_MINOR, position: 12, fret: 12 },
		0,
		decided(`${E_MINOR}@0-0-0`),
		wrong(decided(`${E_MINOR}@0-0-0`), chord('other-octave'))
	],
	// An item without a position: the voicing at any of its places.
	[
		TRIADS_ZONE,
		{ voicingKey: C_ON_G },
		0,
		decided(`${C_ON_G}@17-17-15`),
		right(decided(`${C_ON_G}@17-17-15`))
	],
	[
		TRIADS_ZONE,
		{ voicingKey: C_ON_G },
		0,
		decided('C|min|3:1,2:b3,1:5@5-4-3'),
		wrong(decided('C|min|3:1,2:b3,1:5@5-4-3'), chord('other-quality'))
	],
	[TRIADS_ZONE, { voicingKey: C_ON_G }, 0, decided(null), wrong(decided(null), chord('none'))]
];

describe('the catalog judged as members of families', () => {
	it('judges the notes and the chords as the judges note and chord-voicing did', () => {
		for (const [definition, item, index, payload, judged] of ROWS) {
			const content = planOf(definition, item).expectations[index].content!;
			expect(content.kind).toBe('member');
			const { correct, answer, confusion } = contentJudges(content.kind).judge(
				content.value,
				payload
			);
			expect(
				{ correct, answer, confusion },
				`${definition.id} ${JSON.stringify(item)} ${JSON.stringify(payload)}`
			).toEqual(judged);
		}
	});
});

describe('the chord sensor of the catalog’s triads', () => {
	const ringing = planned(TRIADS_ANCHOR, { voicingKey: D_ON_B });
	const listened = (definition: ExerciseDefinition, item: unknown, previous: PlannedItem | null) =>
		(
			voicingOnStringsPresenter.expectation!(item as never, {
				opensAt: 1,
				previous,
				expectations: planOf(definition, item).expectations
			}) as { chord: ChordExpectation }
		).chord;
	const told = (chordExpectation: ChordExpectation) =>
		chordExpectation.candidates.map((c) => `${c.kind} ${c.id}`);

	it('expects every octave of the anchor’s voicing, its look-alikes around the lowest', () => {
		const chordExpectation = listened(TRIADS_ANCHOR, { voicingKey: D_ON_B }, null);
		expect(chordExpectation.expected).toEqual([`${D_ON_B}@2-3-2`, `${D_ON_B}@14-15-14`]);
		expect(told(chordExpectation)).toEqual([
			`expected ${D_ON_B}@2-3-2`,
			`expected ${D_ON_B}@14-15-14`,
			`other-inversion ${D_ON_G}@7-7-5`,
			'other-inversion D|maj|3:3,2:5,1:1@11-10-10',
			'other-quality D|min|3:5,2:1,1:b3@2-3-1',
			'other-quality D|aug|3:#5,2:1,1:3@3-3-2'
		]);
		expect(chordExpectation.candidates[1].notes).toEqual([
			{ string: 3, fret: 14, midi: 69 },
			{ string: 2, fret: 15, midi: 74 },
			{ string: 1, fret: 14, midi: 78 }
		]);
	});

	it('never lists a shape of the chord still ringing', () => {
		expect(told(listened(TRIADS_ANCHOR, { voicingKey: D_ON_G }, ringing))).toEqual([
			`expected ${D_ON_G}@7-7-5`,
			'other-inversion D|maj|3:3,2:5,1:1@11-10-10',
			'other-quality D|min|3:1,2:b3,1:5@7-6-5',
			'other-quality D|aug|3:1,2:3,1:#5@7-7-6'
		]);
	});

	it('expects the zone’s one shape, at a fret inside it and on open strings', () => {
		expect(told(listened(TRIADS_ZONE, { voicingKey: C_ON_G, position: 3, fret: 4 }, null))).toEqual(
			[
				`expected ${C_ON_G}@5-5-3`,
				`other-octave ${C_ON_G}@17-17-15`,
				'other-inversion C|maj|3:3,2:5,1:1@9-8-8',
				'other-inversion C|maj|3:5,2:1,1:3@0-1-0',
				'other-quality C|min|3:1,2:b3,1:5@5-4-3',
				'other-quality C|aug|3:1,2:3,1:#5@5-5-4'
			]
		);
		expect(told(listened(TRIADS_ZONE, { voicingKey: E_MINOR, position: 'open' }, null))).toEqual([
			`expected ${E_MINOR}@0-0-0`,
			`other-octave ${E_MINOR}@12-12-12`,
			'other-inversion E|min|3:1,2:b3,1:5@9-8-7',
			'other-inversion E|min|3:5,2:1,1:b3@4-5-3',
			'other-quality E|maj|3:3,2:5,1:1@1-0-0',
			'other-quality E|dim|3:b3,2:b5,1:1@12-11-12'
		]);
	});
});
