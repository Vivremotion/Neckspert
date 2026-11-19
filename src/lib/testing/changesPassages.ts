/**
 * The four exercises of the changes as plan 4b's Task 5 writes them, on in-memory copies of the
 * catalog's: their passages, their params and the content of a change. The catalog switch writes
 * them into its file; until then the specs of the passages read them here.
 */
import type { ExerciseDefinition, PassagesTemplate, RoundTemplate } from '$lib/domain/exercise';
import { CHART_ROOTS } from '$lib/domain/gesture/exercises';
import { GESTURE_CLIMB, GESTURE_JAM, GESTURE_LINK, GESTURE_ZONE } from './catalog';

/** The link's 24 chords: each root of a chord chart, major then minor (`C`, `Cm`, `C#`, `C#m`…). */
export const LINK_CHORDS: readonly string[] = CHART_ROOTS.flatMap((root) => [root, `${root}m`]);

/** The two groups of strings the link and the climb play on. */
export const STRING_GROUPS: readonly (readonly number[])[] = [
	[3, 2, 1],
	[4, 3, 2]
];

/** The thirteen zones of five frets of `grid-in-zone`, in today's order (D7). */
export const ZONES: readonly (readonly [number, number])[] = [
	[1, 5],
	[6, 10],
	[11, 15],
	[3, 7],
	[8, 12],
	[13, 17],
	[5, 9],
	[10, 14],
	[2, 6],
	[7, 11],
	[12, 16],
	[4, 8],
	[9, 13]
];

const GRIDS = ['iohefy-a', 'blues-f'];

/** `exercise` with no view (its rounds read its skill's items), its params and content replaced. */
function written(
	exercise: ExerciseDefinition,
	params: Record<string, unknown>,
	content: unknown,
	passages: PassagesTemplate,
	length?: RoundTemplate['length']
): ExerciseDefinition {
	const { view: _view, items: _items, ...rest } = exercise;
	const round = exercise.round!;
	return {
		...rest,
		params,
		round: {
			...round,
			...(length && { length }),
			expectations: round.expectations.map((expectation) => ({
				...expectation,
				content
			})) as typeof round.expectations
		},
		passages
	};
}

const anchorOpens = (need: 'every-group' | 'one-group') => ({
	acquired: { skill: 'chord-anchor', item: 'voicing', need }
});

export const LINK_PASSAGES = written(
	GESTURE_LINK,
	{},
	{ family: 'chord-shapes' },
	{
		of: { chord: LINK_CHORDS, strings: STRING_GROUPS },
		members: { family: 'chord-shapes', order: ['position'], take: 4, andBack: true },
		opens: anchorOpens('every-group'),
		again: 'until-passed',
		restBars: 1,
		passes: 0.9
	},
	// A placed voicing carries no change to measure: a shape of the link lasts its bar.
	{ bars: 1 }
);

export const CLIMB_PASSAGES = written(
	GESTURE_CLIMB,
	{},
	{
		family: 'chord-shapes',
		where: [{ position: { beyond: 'previous', toward: { param: 'direction' }, turns: true } }]
	},
	{
		of: { grid: GRIDS, strings: STRING_GROUPS },
		members: { family: 'grid-changes' },
		each: { direction: ['up', 'down'] },
		opens: anchorOpens('every-group'),
		passes: 0.9,
		scope: 'grid'
	}
);

export const ZONE_PASSAGES = written(
	GESTURE_ZONE,
	{ strings: [4, 3, 2, 1] },
	{ family: 'chord-shapes', where: [{ in: { frets: { param: 'zone' } } }] },
	{
		of: { grid: GRIDS },
		members: { family: 'grid-changes' },
		each: { zone: ZONES },
		opens: { acquired: { skill: 'chord-zone', item: 'voicing', need: 'every-group' } },
		passes: 0.9,
		scope: 'grid'
	}
);

export const JAM_PASSAGES = written(
	GESTURE_JAM,
	{ strings: [4, 3, 2, 1] },
	{ family: 'chord-shapes' },
	{
		of: { grid: GRIDS },
		members: { family: 'grid-changes' },
		opens: anchorOpens('one-group'),
		passes: 0.9,
		scope: 'grid'
	}
);

export const PASSAGE_EXERCISES: readonly ExerciseDefinition[] = [
	LINK_PASSAGES,
	CLIMB_PASSAGES,
	ZONE_PASSAGES,
	JAM_PASSAGES
];
