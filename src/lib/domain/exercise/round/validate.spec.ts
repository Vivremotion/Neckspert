import { describe, expect, it } from 'vitest';
import { EXERCISES, exerciseById, IDENTIFY_NECK, LOCATE_NECK, TRIADS_ANCHOR } from '../catalog';
import type { ExerciseDefinition, Ladder } from '../types';
import { clickAccompaniment } from '../../time/accompaniment';
import type { Figure } from '../../time/figure';
import { METER_4_4 } from '../../time/meter';
import { parseLilyPond } from '../../time/notation/lilypond';
import type { FigureExpectationTemplate, PointExpectationTemplate, RoundTemplate } from './types';
import { roundProblem } from './validate';

const SENSORS = ['note', 'chord', 'tap'];

function round(definition: ExerciseDefinition): RoundTemplate {
	if (!definition.round) throw new Error(`${definition.id} writes no round`);
	return definition.round;
}

/** A template whose expectations are all points, as the catalog's are. */
type PointRound = RoundTemplate & { expectations: PointExpectationTemplate[] };

const withRound = (
	definition: ExerciseDefinition,
	change: (template: PointRound) => unknown
): ExerciseDefinition => ({
	...definition,
	round: change(structuredClone(round(definition)) as PointRound) as RoundTemplate
});

describe('roundProblem', () => {
	it('accepts the catalog', () => {
		const written = EXERCISES.filter((exercise) => exercise.round);
		expect(written.map((exercise) => exercise.id)).toEqual([
			'locate-neck',
			'identify-neck',
			'triads-anchor',
			'triads-zone',
			'gesture-link',
			'gesture-climb',
			'gesture-zone',
			'gesture-jam'
		]);
		for (const exercise of written) {
			expect([exercise.id, roundProblem(exercise)]).toEqual([exercise.id, null]);
			expect([exercise.id, roundProblem(exercise, { sensors: SENSORS })]).toEqual([
				exercise.id,
				null
			]);
		}
		// An exercise without a round has nothing to check.
		expect(roundProblem({ id: 'bare', version: 1, mechanic: 'locate', params: {} })).toBeNull();
	});

	it('refuses an unknown key, naming it', () => {
		const top = withRound(LOCATE_NECK, (t) => ({ ...t, lenght: { bars: 1 } }));
		expect(roundProblem(top)).toMatch(/round\.lenght/);
		const expectation = withRound(LOCATE_NECK, (t) => {
			(t.expectations[0] as unknown as Record<string, unknown>).sensors = 'note';
			return t;
		});
		expect(roundProblem(expectation)).toMatch(/round\.expectations\[0\]\.sensors/);
		const policy = withRound(LOCATE_NECK, (t) => ({
			...t,
			policy: { ...t.policy, pairing: { ...t.policy.pairing, mode: 'nowhere' } }
		}));
		expect(roundProblem(policy)).toMatch(/round\.policy\.pairing\.mode.*"nowhere"/);
		const verdict = withRound(LOCATE_NECK, (t) => ({
			...t,
			policy: { ...t.policy, verdict: 'vibes' }
		}));
		expect(roundProblem(verdict)).toMatch(/round\.policy\.verdict.*"vibes"/);
		const derivation = withRound(LOCATE_NECK, (t) => {
			t.expectations[0].content = { from: 'note-of-nothing' };
			return t;
		});
		expect(roundProblem(derivation)).toMatch(
			/round\.expectations\[0\]\.content.*"note-of-nothing"/
		);
		const measure = withRound(LOCATE_NECK, (t) => ({ ...t, length: { beats: { item: 'size' } } }));
		expect(roundProblem(measure)).toMatch(/round\.length\.beats.*"size"/);
	});

	it('refuses a derivation that does not read the mechanic', () => {
		const wrong: ExerciseDefinition = { ...IDENTIFY_NECK, round: round(LOCATE_NECK) };
		expect(roundProblem(wrong)).toMatch(
			/round\.expectations\[0\]\.content .*"note-of-item".*locate.*not identify/
		);
		const measure = withRound(LOCATE_NECK, (t) => ({
			...t,
			length: { beats: { item: 'change-beats' } }
		}));
		expect(roundProblem(measure)).toMatch(/round\.length\.beats .*"change-beats".*chord-grid/);
	});

	it('refuses a lead param a level of the ladder does not give, naming the levels', () => {
		const ladder: Ladder = [
			{ params: { leadBeats: 4, aided: false } },
			{ params: { leadBeats: null, aided: false } },
			{ params: { leadBeats: 2, aided: false } },
			{ params: { leadBeats: null, aided: false } }
		];
		const noLead: ExerciseDefinition = {
			...LOCATE_NECK,
			params: { ...LOCATE_NECK.params, ladder }
		};
		expect(roundProblem(noLead)).toMatch(
			/round\.prompt\.lead .*"leadBeats".*params\.ladder level 1, 3 gives? no lead/
		);
		const noLadder: ExerciseDefinition = { ...LOCATE_NECK, params: {} };
		expect(roundProblem(noLadder)).toMatch(/round\.prompt\.lead .*"leadBeats".*no ladder/);
		const nowhere = withRound(LOCATE_NECK, (t) => ({
			...t,
			prompt: { lead: { param: 'windows.x' } }
		}));
		expect(roundProblem(nowhere)).toMatch(/round\.prompt\.lead .*"windows\.x"/);
	});

	it('refuses a sensor the session does not have, when told the sensors', () => {
		expect(roundProblem(LOCATE_NECK, { sensors: ['chord', 'tap'] })).toMatch(
			/round\.expectations\[0\]\.sensor .*"note"/
		);
		expect(roundProblem(LOCATE_NECK, { sensors: ['note'] })).toBeNull();
		expect(roundProblem(LOCATE_NECK)).toBeNull();
	});

	it('refuses a span ending before it starts', () => {
		const backwards = withRound(TRIADS_ANCHOR, (t) => {
			t.expectations[1].until = { beats: 1 };
			return t;
		});
		expect(roundProblem(backwards)).toMatch(/round\.expectations\[1\]\.until .*after/);
	});

	it('refuses a negative position, mixed timing, a bar offset outside its bar and a count end', () => {
		const negative = withRound(LOCATE_NECK, (t) => {
			t.expectations[0].at = { beats: -1 };
			return t;
		});
		expect(roundProblem(negative)).toMatch(/round\.expectations\[0\]\.at\.beats .*negative/);
		const mixed = withRound(TRIADS_ANCHOR, (t) => {
			t.expectations[1].at = null;
			delete t.expectations[1].until;
			return t;
		});
		expect(roundProblem(mixed)).toMatch(/round\.expectations .*free time.*placed/);
		const offset = (barOffset: string) => withRound(LOCATE_NECK, (t) => ({ ...t, barOffset }));
		expect(roundProblem(offset('1'))).toMatch(/round\.barOffset .*within its bar/);
		expect(roundProblem(offset('-1/4'))).toMatch(/round\.barOffset .*within its bar/);
		expect(roundProblem(offset('a quarter'))).toMatch(/round\.barOffset .*fraction/);
		expect(roundProblem(offset('3/4'))).toBeNull();
		const ends = withRound(LOCATE_NECK, (t) => ({ ...t, countEndsOn: 'never' }));
		expect(roundProblem(ends)).toMatch(/round\.countEndsOn .*prompt, target.*"never"/);
		const gap = withRound(LOCATE_NECK, (t) => {
			t.expectations[0].window = { ofGap: '1,5' };
			return t;
		});
		expect(roundProblem(gap)).toMatch(/round\.expectations\[0\]\.window\.ofGap .*fraction/);
	});

	it('refuses what the compiled round could not hold, as far as the exercise knows its places', () => {
		// Each refused here was drawn by openness.spec, accepted, and failed in play.
		const nothing = withRound(IDENTIFY_NECK, (t) => ({ ...t, length: { bars: 0 } }));
		expect(roundProblem(nothing)).toMatch(/round\.length must last more than nothing/);
		const backwards = withRound(TRIADS_ANCHOR, (t) => {
			t.expectations[1].at = { beats: 0 };
			t.expectations[0].at = { beats: 1 };
			t.expectations[0].window = { ms: 80 };
			return t;
		});
		expect(roundProblem(backwards)).toMatch(
			/round\.expectations\[1\]\.at comes before expectations\[0\] \(0 before 1\/4\)/
		);
		// Locate lasts its breath, one bar: a place on the next bar is past its end.
		const past = withRound(LOCATE_NECK, (t) => {
			t.expectations[0].at = { bars: 1 };
			return t;
		});
		expect(roundProblem(past)).toMatch(
			/round\.expectations\[0\]\.at must fall within the round, which lasts 1, got 1/
		);
		const overlong = withRound(TRIADS_ANCHOR, (t) => {
			t.expectations[1].until = { bars: 3 };
			return t;
		});
		expect(roundProblem(overlong)).toMatch(
			/round\.expectations\[1\]\.until must end within the round, which lasts 2, got 3/
		);
		// Listening ends a beat before the end: a place on the last beat is still answered early.
		const early = withRound(TRIADS_ANCHOR, (t) => ({
			...t,
			listenBeforeEnd: { beats: 1 },
			expectations: [{ ...t.expectations[0], at: { beats: 7 } }]
		}));
		expect(roundProblem(early)).toBeNull();
		// A stretch is answered from its start only: starting where listening ends, never.
		const unheard = withRound(TRIADS_ANCHOR, (t) => ({ ...t, listenBeforeEnd: { beats: 7 } }));
		expect(roundProblem(unheard)).toMatch(
			/round\.policy\.pairing cannot be run by mode "first-answer": expectation 1 is a stretch starting at 1\/4, where the round has stopped listening/
		);
		const deaf = withRound(LOCATE_NECK, (t) => ({ ...t, listenBeforeEnd: { bars: 1 } }));
		expect(roundProblem(deaf)).toMatch(
			/round\.listenBeforeEnd must leave the round some listening/
		);
		// A length an item measures is not known here: nothing is refused on it.
		expect(roundProblem(exerciseById('gesture-jam'))).toBeNull();
	});

	it('refuses a plan its pairing or verdict mode cannot run, naming the mode', () => {
		const stretched = withRound(TRIADS_ANCHOR, (t) => ({
			...t,
			expectations: t.expectations.slice(1)
		}));
		expect(roundProblem(stretched)).toBe(
			'round.policy.verdict "response" cannot judge the round: a response verdict needs a point expectation'
		);
		const early = withRound(IDENTIFY_NECK, (t) => ({
			...t,
			policy: {
				...t.policy,
				pairing: { ...t.policy.pairing, opens: { beforeMs: 100, maxBeats: 1 } }
			}
		}));
		expect(roundProblem(early)).toBe(
			'round.policy.pairing cannot be run by mode "first-answer": a free-time plan must open with afterPromptMs'
		);
	});

	it('refuses a judged rest, a cycle verdict or an alignment where its mode cannot run it', () => {
		const rest = withRound(LOCATE_NECK, (t) => ({
			...t,
			expectations: [{ ...t.expectations[0], role: 'judged-rest' }]
		}));
		expect(roundProblem(rest)).toBe(
			'round.policy.pairing cannot be run by mode "first-answer": expectation 0 is a judged rest: a first answer pairs attacks with targets and cannot judge a silence'
		);
		const alignment = { mode: 'alignment' };
		const cycle = withRound(LOCATE_NECK, (t) => ({
			...t,
			policy: { ...t.policy, verdict: 'cycle', pairing: alignment }
		}));
		// The alignment, before the verdict, refuses the note it would not judge.
		expect(roundProblem(cycle)).toBe(
			'round.policy.pairing cannot be run by mode "alignment": expectation 0 asks for content (note): an alignment times attacks and judges no content'
		);
		const rhythm = withRound(LOCATE_NECK, (t) => ({
			...t,
			expectations: [{ ...t.expectations[0], content: null }],
			policy: { ...t.policy, verdict: 'cycle', pairing: alignment }
		}));
		expect(roundProblem(rhythm)).toBe(
			'round.policy.verdict "cycle" cannot judge the round: a cycle verdict judges a whole cycle (unit "cycle"), got unit "response"'
		);
		const cycled = withRound(LOCATE_NECK, (t) => ({
			...t,
			expectations: [{ ...t.expectations[0], content: null }],
			policy: { ...t.policy, unit: 'cycle', verdict: 'cycle', pairing: alignment }
		}));
		const thresholds = { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 };
		expect(roundProblem({ ...cycled, params: { ...cycled.params, thresholds } })).toBeNull();
	});

	it('refuses a verdict that reads thresholds an exercise level does not give', () => {
		const alignment = { mode: 'alignment' };
		const cycled = withRound(LOCATE_NECK, (t) => ({
			...t,
			expectations: [{ ...t.expectations[0], content: null }],
			policy: { ...t.policy, unit: 'cycle', verdict: 'cycle', pairing: alignment }
		}));
		const unjudged = { ...cycled, params: { ...cycled.params, thresholds: undefined } };
		expect(roundProblem(unjudged)).toBe(
			'round.policy.verdict "cycle" judges against params.thresholds, which exercise level 0 does not give'
		);
		// Given by the exercise, or by every level that overrides them.
		const thresholds = { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 };
		expect(roundProblem({ ...cycled, params: { ...cycled.params, thresholds } })).toBeNull();
		const leveled = { ...unjudged, levels: [{ params: { thresholds } }, { params: {} }] };
		expect(roundProblem(leveled)).toBe(
			'round.policy.verdict "cycle" judges against params.thresholds, which exercise level 1 does not give'
		);
	});

	it('refuses a bar offset or a gap that is not written as text', () => {
		// A number would read as the text of itself: « 0 » is a fraction, but not as written.
		const offset = withRound(LOCATE_NECK, (t) => ({ ...t, barOffset: 0 }));
		expect(roundProblem(offset)).toMatch(/round\.barOffset .*fraction.*0/);
		const gap = withRound(LOCATE_NECK, (t) => {
			t.expectations[0].window = { ofGap: 1 } as unknown as { ofGap: string };
			return t;
		});
		expect(roundProblem(gap)).toMatch(/round\.expectations\[0\]\.window\.ofGap .*fraction/);
	});

	it('returns the problem of the exercise’s own params instead of checking raw ones', () => {
		const noThreshold: ExerciseDefinition = {
			...LOCATE_NECK,
			params: { ...LOCATE_NECK.params, recallThresholdMs: -5 }
		};
		expect(roundProblem(noThreshold)).toMatch(/recallThresholdMs must be a positive number/);
	});
	describe('a figure entry', () => {
		const THRESHOLDS = { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 };
		/** A rhythm written as a template: a figure filling the round, its click and window in the params. */
		const RHYTHM: ExerciseDefinition = {
			id: 'figured-rhythm',
			version: 1,
			mechanic: 'rhythm-figure',
			figures: [
				{ id: 'eighths', figure: parseLilyPond('c8 c c c c c c c') },
				{ id: 'halves', figure: parseLilyPond('c2 c') }
			],
			params: {
				window: { ms: 80 },
				accompaniment: clickAccompaniment({
					meter: METER_4_4,
					beats: [1, 2, 3, 4],
					accent: [1],
					bars: ['on', 'on', 'on', 'off']
				}),
				thresholds: THRESHOLDS
			},
			round: {
				expectations: [
					{
						figure: { item: 'figure' },
						at: { bars: 0 },
						sensor: 'attack',
						content: null,
						window: { param: 'window' }
					}
				],
				accompaniment: { param: 'accompaniment' },
				length: { bars: 4 },
				handover: 'end',
				policy: {
					unit: 'cycle',
					verdict: 'cycle',
					correction: false,
					pairing: { mode: 'alignment' }
				}
			}
		};
		/** An arpeggio: the notes of a voicing spread over a figure a level names, answered one by one. */
		const ARPEGGIO: ExerciseDefinition = {
			id: 'arpeggio',
			version: 1,
			mechanic: 'voicing-figure',
			figures: [
				{ id: 'quarters', figure: parseLilyPond('c4 c c c') },
				{ id: 'written', figure: parseLilyPond("e'4\\1 g'\\1 c''\\2 e'") }
			],
			params: { figure: 'quarters' },
			levels: [{ params: {} }, { params: { figure: 'written' } }],
			round: {
				prompt: { lead: 4 },
				expectations: [
					{
						figure: { param: 'figure' },
						at: { bars: 0 },
						sensor: 'note',
						content: { from: 'voicing-notes', pattern: [1, 2, 3, 2] },
						window: { ms: 80 }
					}
				],
				length: { beats: { item: 'beats' } },
				handover: 'end',
				policy: {
					unit: 'response',
					verdict: 'response',
					correction: false,
					pairing: {
						mode: 'first-answer',
						opens: { afterPromptMs: 100 },
						lateMs: 100,
						lateCapture: null
					}
				}
			}
		};
		const entry = (definition: ExerciseDefinition) =>
			round(definition).expectations[0] as FigureExpectationTemplate;
		const withEntry = (definition: ExerciseDefinition, change: Record<string, unknown>) =>
			withRound(definition, (t) => ({ ...t, expectations: [{ ...entry(definition), ...change }] }));

		it('accepts figure entries and the new keys', () => {
			expect(roundProblem(RHYTHM)).toBeNull();
			expect(roundProblem(ARPEGGIO, { sensors: SENSORS })).toBeNull();
			expect(roundProblem(withEntry(RHYTHM, { figure: { id: 'halves' } }))).toBeNull();
			const written = withEntry(ARPEGGIO, {
				figure: { id: 'written' },
				content: { from: 'figure' }
			});
			expect(roundProblem(written)).toBeNull();
			const accompanied = withRound(RHYTHM, (t) => ({
				...t,
				accompaniment: RHYTHM.params.accompaniment
			}));
			expect(roundProblem(accompanied)).toBeNull();
		});

		it("refuses { from: 'figure' } over a note without pitch", () => {
			const schemaOne: ExerciseDefinition = {
				...withEntry(ARPEGGIO, { figure: { id: 'bare' }, content: { from: 'figure' } }),
				figures: [{ id: 'bare', figure: pitchless(parseLilyPond('c4 c c c')) }]
			};
			expect(roundProblem(schemaOne)).toMatch(
				/^round\.expectations\[0\]\.content reads the pitches of figure "bare", whose note 0 has none/
			);
		});

		it('refuses a pattern index below 1, and a pattern that is no list of indexes', () => {
			for (const pattern of [[0, 1], [1, -2], [1.5], [], 'up']) {
				const problem = roundProblem(
					withEntry(ARPEGGIO, { content: { from: 'voicing-notes', pattern } })
				);
				expect(problem).toMatch(/^round\.expectations\[0\]\.content\.pattern /);
			}
			const onFigure = withEntry(ARPEGGIO, {
				figure: { id: 'written' },
				content: { from: 'figure', pattern: [1] }
			});
			expect(roundProblem(onFigure)).toMatch(/^round\.expectations\[0\]\.content\.pattern/);
		});

		it('refuses a figure it cannot find, naming the field', () => {
			expect(roundProblem(withEntry(RHYTHM, { figure: { id: 'nowhere' } }))).toMatch(
				/^round\.expectations\[0\]\.figure names figure "nowhere", which the exercise does not write \(eighths, halves\)/
			);
			const level = {
				...ARPEGGIO,
				levels: [{ params: {} }, { params: { figure: 'sixteenths' } }]
			};
			expect(roundProblem(level)).toMatch(
				/^round\.expectations\[0\]\.figure reads param "figure", which exercise level 1 gives as "sixteenths"/
			);
			expect(roundProblem(withEntry(ARPEGGIO, { figure: { item: 'figure' } }))).toMatch(
				/^round\.expectations\[0\]\.figure .*"figure" which reads rhythm-figure, not voicing-figure/
			);
			expect(roundProblem(withEntry(RHYTHM, { figure: { line: 1 } }))).toMatch(
				/^round\.expectations\[0\]\.figure must be/
			);
		});

		it('refuses a figure that does not fill the round from its place a whole number of times', () => {
			const halves = withEntry(RHYTHM, { figure: { id: 'halves' }, at: { beats: 1 } });
			expect(roundProblem(halves)).toMatch(
				/^round\.expectations\[0\]\.figure names figure "halves" of 1 bars, which does not fill the 15\/4 bars/
			);
			const twoBars: ExerciseDefinition = {
				...withEntry(RHYTHM, { figure: { id: 'long' } }),
				figures: [{ id: 'long', figure: parseLilyPond('c1 | c1') }],
				round: { ...withEntry(RHYTHM, { figure: { id: 'long' } }).round!, length: { bars: 3 } }
			};
			expect(roundProblem(twoBars)).toMatch(/^round\.expectations\[0\]\.figure .*"long" of 2 bars/);
		});

		it('refuses a list on a point and a single content on a figure', () => {
			const point = withRound(ARPEGGIO, (t) => ({
				...t,
				expectations: [
					{
						at: { beats: 0 },
						sensor: 'note',
						content: { from: 'voicing-notes' },
						window: { ms: 80 }
					}
				]
			}));
			expect(roundProblem(point)).toMatch(
				/^round\.expectations\[0\]\.content derives "voicing-notes", a list, which only a figure spreads/
			);
			const single = withEntry(
				{ ...RHYTHM, mechanic: 'locate' },
				{ figure: { id: 'eighths' }, sensor: 'note', content: { from: 'note-of-item' } }
			);
			expect(roundProblem(single)).toMatch(
				/^round\.expectations\[0\]\.content derives "note-of-item", not a list/
			);
		});

		it('refuses an accompaniment it cannot play and a window param that is none', () => {
			const silent = withRound(RHYTHM, (t) => ({ ...t, accompaniment: { param: 'nowhere' } }));
			expect(roundProblem(silent)).toMatch(/^round\.accompaniment /);
			const empty = withRound(RHYTHM, (t) => ({
				...t,
				accompaniment: { figure: parseLilyPond('c1'), bars: [] }
			}));
			expect(roundProblem(empty)).toMatch(/^round\.accompaniment /);
			const window = withEntry(RHYTHM, { window: { param: 'accompaniment' } });
			expect(roundProblem(window)).toMatch(/^round\.expectations\[0\]\.window /);
		});
	});
});

/** The figure as a schema 1 figure gives it: its notes carry no pitch. */
function pitchless(figure: Figure): Figure {
	return {
		...figure,
		voices: figure.voices.map((voice) => ({
			...voice,
			elements: voice.elements.map((element) =>
				element.kind === 'note'
					? { kind: 'note', duration: element.duration, content: null }
					: element
			)
		}))
	};
}
