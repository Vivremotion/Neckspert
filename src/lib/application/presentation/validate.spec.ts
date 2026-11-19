import { registerTestSkills } from '$lib/testing/testSkills';
import { describe, expect, it } from 'vitest';
import { allExercises } from '$lib/domain/exercise/registry';
import type { RoundTemplate } from '$lib/domain/exercise/round';
import type { ExerciseDefinition, PromptPresentation } from '$lib/domain/exercise/types';
import { validateExercise } from '$lib/domain/exercise/validate';
import { SET_PRESENTERS, VIEW_PRESENTERS } from '$lib/application/sets';
import { DEFAULT_PLAY_VIEW, playViewOf } from '$lib/application/session/contract';
import { Fraction, METER_4_4, type FigureElement } from '$lib/domain/time';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { PROMPT_STAGE_VIEWS } from './playViews';
import { presentationProblem, previewProblem, screenProblem } from './validate';
import { anchorWithZone } from '$lib/testing/changesPassages';
import {
	GESTURE_CLIMB,
	GESTURE_LINK,
	LOCATE_NECK,
	TRIADS_ANCHOR,
	RHYTHM_OFFBEATS
} from '$lib/testing/catalog';

registerTestSkills();

const withPresentation = (
	base: ExerciseDefinition,
	presentation: PromptPresentation
): ExerciseDefinition => ({ ...base, presentation });

describe('presentationProblem', () => {
	it('accepts the catalog', () => {
		for (const exercise of allExercises()) {
			expect(presentationProblem(exercise)).toBeNull();
		}
		expect(
			allExercises().filter((exercise) => exercise.presentation).length
		).toBeGreaterThanOrEqual(4);
	});

	it('refuses a field the set does not have, naming the exercise and the field', () => {
		expect(presentationProblem(withPresentation(LOCATE_NECK, { primary: '{chord}' }))).toBe(
			'locate-note-string: presentation.primary names field "chord", which note-on-string does not have'
		);
		expect(
			presentationProblem(
				withPresentation(TRIADS_ANCHOR, {
					primary: '{chord}',
					aided: { line: { fr: 'case {fret}', en: 'fret {fret}' } }
				})
			)
		).toBe(
			'chord-anchor: presentation.aided.line names field "fret", which neither voicing-on-strings nor note-places nor chord-shapes has'
		);
	});

	it('refuses a picture that does not read the set', () => {
		expect(
			presentationProblem(
				withPresentation(LOCATE_NECK, { primary: '{note}', aided: { picture: 'lowest-shape' } })
			)
		).toBe(
			'locate-note-string: presentation.aided.picture names picture "lowest-shape", which does not read note-on-string'
		);
		expect(
			presentationProblem(
				withPresentation(LOCATE_NECK, { primary: '{note}', fading: { picture: 'nowhere' } })
			)
		).toBe(
			'locate-note-string: presentation.fading.picture names picture "nowhere", which does not exist'
		);
	});

	it("reads the fields of the members its round names, beside its items'", () => {
		expect(
			presentationProblem(
				withPresentation(GESTURE_CLIMB, {
					primary: '{symbol}',
					detail: '{strings} · {toward}',
					target: '{title} {frets}',
					aided: { picture: 'admitted' }
				})
			)
		).toBeNull();
	});

	it('refuses a field neither its items nor the members of its round have, naming the slot', () => {
		expect(
			presentationProblem(
				withPresentation(GESTURE_CLIMB, { primary: '{symbol}', detail: '{nope}' })
			)
		).toBe(
			'grid-in-direction: presentation.detail names field "nope", which neither change nor chord-shapes has'
		);
	});

	it('reads the fields of every member content of its round, a note first and a chord then', () => {
		expect(
			presentationProblem(anchorWithZone({ primary: '{chord}', detail: '{strings} {frets}' }))
		).toBeNull();
		expect(presentationProblem(anchorWithZone({ primary: '{chord}', detail: '{nope}' }))).toBe(
			'chord-anchor: presentation.detail names field "nope", which neither voicing-on-strings nor note-places nor chord-shapes has'
		);
	});

	it('refuses the picture of the members admitted for a round with no member content', () => {
		expect(
			presentationProblem(
				withPresentation(RHYTHM_OFFBEATS, { primary: 'x', aided: { picture: 'admitted' } })
			)
		).toBe(
			'rhythm-offbeats: presentation.aided.picture names picture "admitted", which draws the members its round admits, and no expectation of its round has a member content'
		);
	});

	it('is silent about an exercise that says nothing', () => {
		expect(presentationProblem({ ...LOCATE_NECK, presentation: undefined })).toBeNull();
	});
});

/** No presenter at all. */
const NONE = { presenters: {}, views: {} };

describe('screenProblem', () => {
	const presenters = { presenters: SET_PRESENTERS, views: VIEW_PRESENTERS };
	/** Locate with neither its presentation nor its view. */
	const bare: ExerciseDefinition = { ...LOCATE_NECK, view: undefined, presentation: undefined };

	it('refuses a response exercise with neither a presentation nor a screen of its presenter, naming the exercise', () => {
		expect(screenProblem(bare, presenters)).toBe(
			'locate-note-string: writes a round but no presentation, and note-on-string draws no screen of its own'
		);
		expect(
			screenProblem({ ...TRIADS_ANCHOR, view: undefined, presentation: undefined }, NONE)
		).toBe(
			'chord-anchor: writes a round but no presentation, and voicing-on-strings draws no screen of its own'
		);
	});

	it('accepts the catalog: a presentation, a screen of its presenter, a figure, or no round', () => {
		for (const exercise of allExercises()) {
			expect([exercise.id, screenProblem(exercise, presenters)]).toEqual([exercise.id, null]);
		}
		expect(screenProblem({ ...bare, round: undefined }, NONE)).toBeNull();
	});

	const figureRound: RoundTemplate = {
		expectations: [
			{
				figure: { id: 'main' },
				at: { bars: 0 },
				sensor: 'attack',
				content: null,
				window: { ms: 80 }
			}
		],
		length: { bars: 1 },
		policy: { unit: 'cycle', verdict: 'cycle', correction: false, pairing: { mode: 'alignment' } }
	};

	it('accepts a round that plays a figure in the figure view, with or without a prompt', () => {
		// Its screen is the figure's, built by the series from the round's figure.
		expect(screenProblem(RHYTHM_OFFBEATS, NONE)).toBeNull();
		expect(screenProblem({ ...bare, view: 'figure', round: figureRound }, NONE)).toBeNull();
		expect(screenProblem({ ...LOCATE_NECK, view: 'figure', round: figureRound }, NONE)).toBeNull();
	});

	it('refuses a view that draws a passage on an exercise that writes none, naming the field', () => {
		// The link's lane draws the tour its passage plays: an exercise of items has none.
		const { passages: _passages, ...link } = GESTURE_LINK;
		expect(screenProblem(link, presenters)).toBe(
			'inversion-run: view "link-lane" draws a passage, and the exercise writes no passages'
		);
		expect(screenProblem({ ...ARPEGGIO_EXERCISE, view: 'link-lane' }, presenters)).toBe(
			'test-arpeggio-sequence: view "link-lane" draws a passage, and the exercise writes no passages'
		);
		expect(screenProblem(GESTURE_LINK, presenters)).toBeNull();
	});

	it('accepts a presentation on a view that draws a passage, and asks it passages', () => {
		const climb: PromptPresentation = { primary: '{symbol}', target: '{symbol}' };
		expect(screenProblem(withPresentation(GESTURE_CLIMB, climb), presenters)).toBeNull();
		expect(
			screenProblem(withPresentation(GESTURE_LINK, { primary: '{chord}' }), presenters)
		).toBeNull();
		const { passages: _passages, ...items } = GESTURE_CLIMB;
		expect(screenProblem(withPresentation(items, climb), presenters)).toBe(
			'grid-in-direction: view "grid-scroll" draws a passage, and the exercise writes no passages'
		);
		// Without a presentation, the default view stays the screen its presenter draws.
		expect(screenProblem(items, presenters)).toBeNull();
		expect(screenProblem({ ...bare, view: 'grid-scroll', round: undefined }, NONE)).toBeNull();
	});

	it('refuses the figure view for a round that plays no figure, and a figure with no view to draw it', () => {
		expect(screenProblem({ ...LOCATE_NECK, view: 'figure' }, presenters)).toBe(
			'locate-note-string: view "figure" draws the figure of its round, and the round plays none'
		);
		expect(screenProblem({ ...bare, round: figureRound }, presenters)).toBe(
			'locate-note-string: writes a round but no presentation, and note-on-string draws no screen of its own'
		);
	});

	it('refuses a level that shows the tab of a figure with a note without string', () => {
		const fretted = (pitch: number, string?: number): FigureElement => ({
			kind: 'note',
			duration: Fraction.of(1, 4),
			content: null,
			pitch,
			...(string === undefined ? {} : { string })
		});
		/** The arpeggio played on the notes written in its figures, the second a note without string. */
		const written: ExerciseDefinition = {
			...ARPEGGIO_EXERCISE,
			figures: [
				{
					id: 'quarters',
					figure: {
						schema: 2,
						meter: METER_4_4,
						bars: 1,
						voices: [
							{
								id: 'main',
								elements: [fretted(60, 2), fretted(64), fretted(67, 1), fretted(64, 1)]
							}
						]
					}
				}
			],
			round: {
				...ARPEGGIO_EXERCISE.round!,
				expectations: [{ ...ARPEGGIO_EXERCISE.round!.expectations[0], content: { from: 'figure' } }]
			},
			levels: [{ params: {} }]
		};
		// A written figure shows its staff and its tab by default.
		expect(screenProblem(written, NONE)).toBe(
			'test-arpeggio-sequence: exercise level 0 shows the tab of figure "quarters", whose note 2 has no string'
		);
		// Without its tab, the staff alone needs no string.
		expect(
			screenProblem({ ...written, levels: [{ params: { 'notation.tab': false } }] }, NONE)
		).toBeNull();
		// A bare rhythm shows no tab, unless a level asks for it.
		expect(screenProblem(RHYTHM_OFFBEATS, NONE)).toBeNull();
		const [first, ...others] = RHYTHM_OFFBEATS.levels!;
		expect(
			screenProblem(
				{
					...RHYTHM_OFFBEATS,
					levels: [{ ...first, params: { ...first.params, 'notation.tab': true } }, ...others]
				},
				NONE
			)
		).toBe(
			'rhythm-offbeats: exercise level -1 shows the tab of figure "offbeats-1", whose note 1 has no string'
		);
		// Notes derived from the item carry the string the derivation gives: the aid level's tab.
		expect(screenProblem(ARPEGGIO_EXERCISE, NONE)).toBeNull();
	});

	it('draws a presentation without a view on the lane', () => {
		const unnamed = { ...LOCATE_NECK, view: undefined };
		expect(playViewOf(unnamed)).toBe('lane');
		expect(screenProblem(unnamed, presenters)).toBeNull();
		expect(playViewOf(bare)).toBe(DEFAULT_PLAY_VIEW);
	});

	it('refuses a view the screen does not have, naming the exercise and the field', () => {
		expect(screenProblem({ ...LOCATE_NECK, view: 'score' }, presenters)).toBe(
			'locate-note-string: view "score" is not a view of the screen (known: answer-keys, figure, grid-scroll, lane, link-lane)'
		);
	});

	it('refuses a presentation drawn by a view that reads another model, and such a view without one', () => {
		expect(screenProblem({ ...LOCATE_NECK, view: 'grid-scroll' }, presenters)).toBe(
			'locate-note-string: view "grid-scroll" draws a passage, and the exercise writes no passages'
		);
		expect(screenProblem({ ...bare, view: 'lane', round: undefined }, presenters)).toBe(
			'locate-note-string: view "lane" draws a presentation, and the exercise writes none'
		);
		for (const view of PROMPT_STAGE_VIEWS) {
			const round = view === 'figure' ? figureRound : LOCATE_NECK.round;
			expect(screenProblem({ ...LOCATE_NECK, view, round }, presenters)).toBeNull();
		}
	});
});

describe('previewProblem', () => {
	const presenters = { presenters: SET_PRESENTERS, views: VIEW_PRESENTERS };
	/** Locate on a round of one beat that stops listening its preview before its end. */
	const short = (flow?: ExerciseDefinition['flow']): ExerciseDefinition => ({
		...LOCATE_NECK,
		...(flow && { flow }),
		round: {
			...LOCATE_NECK.round!,
			length: { beats: 1 },
			listenBeforeEnd: { beats: { param: 'previewBeats' } }
		}
	});

	it('refuses a round its presenter’s preview leaves without listening, naming the exercise and the field', () => {
		// The domain cannot know the presenter's preview: it accepts the exercise.
		expect(validateExercise(short())).toBeNull();
		expect(previewProblem(short(), presenters)).toBe(
			"locate-note-string: round.listenBeforeEnd must leave the round some listening: it lasts 1/4, got 1/4 (its preview is note-on-string's, 1 beats)"
		);
	});

	it('leaves to validateExercise an exercise that writes its preview, and accepts the catalog', () => {
		expect(previewProblem(short({ previewBeats: 0 }), presenters)).toBeNull();
		for (const exercise of allExercises()) {
			expect([exercise.id, previewProblem(exercise, presenters)]).toEqual([exercise.id, null]);
		}
	});
});
