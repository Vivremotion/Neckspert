/**
 * Common material for the sequence's specs: plain major triads on the G, B and E strings, each
 * chord shape one round of four beats arpeggiated over a figure, the shapes chained without a gap.
 */
import type { ExerciseDefinition } from '$lib/domain/exercise';
import { Fraction, METER_4_4, type Figure, type FigureElement } from '$lib/domain/time';

/** C, F and G major in root position on strings 3-2-1 (root, third, fifth), at their lowest place. */
export const ARPEGGIO_ITEMS = [
	'C|maj|3:1,2:3,1:5@0@4',
	'F|maj|3:1,2:3,1:5@0@4',
	'G|maj|3:1,2:3,1:5@0@4'
] as const;

/** The figure's k-th note plays the shape's note `PATTERN[k mod 4]`, from the lowest string. */
export const ARPEGGIO_PATTERN = [1, 2, 3, 2];

export const ARPEGGIO_TEMPO = 60;

/** One 4/4 bar of `count` notes of `1/count` (`c4 c c c`, `c8 c c c c c c c`). */
function evenNotes(count: number): Figure {
	const note: FigureElement = { kind: 'note', duration: Fraction.of(1, count), content: null };
	return {
		schema: 2,
		meter: METER_4_4,
		bars: 1,
		voices: [{ id: 'main', elements: Array<FigureElement>(count).fill(note) }]
	};
}

/**
 * The three shapes in turn, a run of three rounds before a breath; level 1 in quarter notes,
 * level 2 in eighth notes, both at ♩ = 60; below them an aid level that writes the shape's tab
 * under the figure (read from plan S, Task 12).
 */
export const ARPEGGIO_EXERCISE: ExerciseDefinition = {
	id: 'test-arpeggio-sequence',
	version: 1,
	title: { fr: 'Arpèges de triades', en: 'Triad arpeggios' },
	mechanic: 'voicing-figure',
	view: 'figure',
	tempo: ARPEGGIO_TEMPO,
	params: {
		figure: 'quarters',
		window: { ms: 80 },
		feedback: 'every-cycle',
		listen: 'free',
		cursor: true,
		thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 },
		pacing: { roundsPerBreath: 3, breathMinMs: 4000 }
	},
	figures: [
		{ id: 'quarters', figure: evenNotes(4) },
		{ id: 'eighths', figure: evenNotes(8) }
	],
	items: [...ARPEGGIO_ITEMS],
	round: {
		expectations: [
			{
				figure: { param: 'figure' },
				at: { bars: 0 },
				sensor: 'note',
				content: { from: 'voicing-notes', pattern: ARPEGGIO_PATTERN },
				window: { param: 'window' }
			}
		],
		length: { beats: { item: 'beats' } },
		handover: 'end',
		policy: { unit: 'cycle', verdict: 'cycle', correction: false, pairing: { mode: 'alignment' } }
	},
	presentation: { primary: '{chord}', secondary: '{strings}' },
	levels: [
		{ aid: true, params: { 'notation.tab': true } },
		{ params: { figure: 'quarters' } },
		{ params: { figure: 'eighths' } }
	]
};

/** A major seventh with its root on string 5 and two notes on string 4: `c\5 e\4 g\4 b\3`. */
export const FORM_MAJ7 = {
	id: 'maj7',
	symbol: 'maj7',
	notes: [
		{ midi: 48, string: 5 },
		{ midi: 52, string: 4 },
		{ midi: 55, string: 4 },
		{ midi: 59, string: 3 }
	]
};

/** The form on C, then F, then G: a change of four beats, one of two, one of four. */
export const FORM_ITEMS = ['maj7@c@4', 'maj7@f@2', 'maj7@g@4'] as const;

/**
 * One form written once, moved from chord to chord, the same figures and levels as the arpeggios:
 * each item names the form and the note it starts on, and each chord restarts from it.
 */
export const FORM_EXERCISE: ExerciseDefinition = {
	...ARPEGGIO_EXERCISE,
	id: 'test-form-sequence',
	title: { fr: 'Une forme déplacée', en: 'A moved form' },
	mechanic: 'form-figure',
	forms: [FORM_MAJ7],
	items: [...FORM_ITEMS],
	round: {
		...ARPEGGIO_EXERCISE.round!,
		expectations: ARPEGGIO_EXERCISE.round!.expectations.map((entry) => ({
			...entry,
			content: { from: 'form-notes' }
		})) as NonNullable<ExerciseDefinition['round']>['expectations']
	},
	presentation: { primary: '{chord}' }
};
