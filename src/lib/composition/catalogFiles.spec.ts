import { describe, expect, it } from 'vitest';
import { definitionChecks } from '$lib/application/definitions/checks';
import { registerFiles } from '$lib/domain/definitions/register';
import {
	allExercises,
	clearExercises,
	MAX_EXERCISE_ITEMS,
	MAX_EXERCISE_LEVELS,
	MAX_LADDER_LEVELS,
	MAX_LEVEL_PARAMS
} from '$lib/domain/exercise';
import { allGrids, clearGrids } from '$lib/domain/grid';
import { idProblem, RESERVED_EXERCISE_IDS, RESERVED_IDS } from '$lib/domain/definitions/ids';
import { allSkills, clearSkills, hasSkill } from '$lib/domain/skill';
import { clearRoutines, routines } from '$lib/domain/routine/registry';
import { i18n } from '$lib/i18n/index.svelte';
import { playMessages } from '$lib/ui/play/messages';
import { CATALOG_FILES } from './catalogFiles';

function load() {
	clearSkills();
	clearExercises();
	clearGrids();
	clearRoutines();
	return registerFiles(CATALOG_FILES, definitionChecks()).refusals;
}

describe('the catalog files', () => {
	it('holds the five files', () => {
		expect(Object.keys(CATALOG_FILES).sort()).toEqual([
			'/catalog/changes.json',
			'/catalog/chords.json',
			'/catalog/notes.json',
			'/catalog/rhythm.json',
			'/catalog/routines.json'
		]);
	});

	it('names every skill, grid and exercise with an id a file may write', () => {
		load();
		const problems = [
			...allSkills().map((s) => idProblem(s.id, { reserved: RESERVED_IDS })),
			...allExercises().map((e) => idProblem(e.id, { reserved: RESERVED_EXERCISE_IDS })),
			...allGrids().map((g) => idProblem(g.id))
		];
		expect(problems.filter((p) => p !== null)).toEqual([]);
	});

	it('loads without a single refusal', () => {
		expect(load()).toEqual([]);
		expect(allExercises()).toHaveLength(11);
		expect(allGrids().map((grid) => grid.id)).toEqual(['iohefy-a', 'blues-f']);
	});

	it('stays far under the limits of what checking an exercise may cost', () => {
		expect(load()).toEqual([]);
		for (const exercise of allExercises()) {
			const ladder = (exercise.params.ladder ?? []) as { params: object }[];
			const levels = [...(exercise.levels ?? []), ...ladder];
			expect(exercise.levels?.length ?? 0, exercise.id).toBeLessThanOrEqual(
				MAX_EXERCISE_LEVELS / 10
			);
			expect(ladder.length, exercise.id).toBeLessThanOrEqual(MAX_LADDER_LEVELS / 10);
			expect(exercise.items?.length ?? 0, exercise.id).toBeLessThanOrEqual(MAX_EXERCISE_ITEMS / 10);
			for (const level of levels) {
				expect(Object.keys(level.params).length, exercise.id).toBeLessThanOrEqual(
					MAX_LEVEL_PARAMS / 10
				);
			}
		}
	});

	it('writes the eleven skills, each exercise practising a registered one', () => {
		expect(load()).toEqual([]);
		expect(
			allSkills()
				.map((skill) => skill.id)
				.sort()
		).toEqual(
			[
				'locate-note-string',
				'identify-note',
				'chord-anchor',
				'chord-zone',
				'inversion-run',
				'grid-in-direction',
				'grid-in-zone',
				'grid-reading',
				'inner-pulse',
				'displaced-pulse',
				'figure-independence'
			].sort()
		);
		for (const exercise of allExercises()) {
			expect(exercise.practices, exercise.id).toBeDefined();
			expect(hasSkill(exercise.practices!), exercise.id).toBe(true);
		}
	});

	it('names eight exercises after the skill they practise, the rhythm keeping its own ids', () => {
		expect(load()).toEqual([]);
		const named = Object.fromEntries(allExercises().map((e) => [e.id, e.practices]));
		expect(named).toEqual({
			'locate-note-string': 'locate-note-string',
			'identify-note': 'identify-note',
			'chord-anchor': 'chord-anchor',
			'chord-zone': 'chord-zone',
			'inversion-run': 'inversion-run',
			'grid-in-direction': 'grid-in-direction',
			'grid-in-zone': 'grid-in-zone',
			'grid-reading': 'grid-reading',
			'rhythm-silent-bars': 'inner-pulse',
			'rhythm-two-four': 'displaced-pulse',
			'rhythm-offbeats': 'figure-independence'
		});
	});

	it('writes the four routines in one file, in the order of the home', () => {
		expect(load()).toEqual([]);
		expect(routines().map((r) => [r.id, r.exercises, r.opens])).toEqual([
			['notes', ['identify-note', 'locate-note-string'], undefined],
			['chords', ['chord-anchor'], undefined],
			['chords-zone', ['chord-zone'], { acquired: { skill: 'chord-anchor', atLeast: 6 } }],
			['changes', ['inversion-run', 'grid-in-direction', 'grid-in-zone', 'grid-reading'], undefined]
		]);
		for (const [name, text] of Object.entries(CATALOG_FILES)) {
			const routinesWritten = (JSON.parse(text) as { routines?: unknown[] }).routines ?? [];
			expect(routinesWritten.length, name).toBe(name === '/catalog/routines.json' ? 4 : 0);
		}
	});

	it('titles the routines as the home did and tells their how-to as the screens do today', () => {
		expect(load()).toEqual([]);
		// The home's block titles, which the routines now give it.
		const titles = {
			fr: {
				notes: 'Apprentissage',
				chords: 'Triades',
				'chords-zone': 'Triades vers une case',
				changes: 'Changements'
			},
			en: {
				notes: 'Learn',
				chords: 'Triads',
				'chords-zone': 'Triads around a fret',
				changes: 'Changes'
			}
		};
		const told = (locale: 'fr' | 'en') => {
			i18n.locale = locale;
			const play = playMessages();
			return {
				notes: { title: titles[locale].notes, howTo: play.howTo.learn },
				chords: { title: titles[locale].chords, howTo: play.howTo.triads },
				'chords-zone': {
					title: titles[locale]['chords-zone'],
					howTo: play.howTo['triads-zone']
				},
				changes: { title: titles[locale].changes, howTo: play.howTo.gesture }
			};
		};
		try {
			for (const locale of ['fr', 'en'] as const) {
				const today = told(locale);
				const written = Object.fromEntries(
					routines().map((r) => [r.id, { title: r.title[locale], howTo: r.howTo?.[locale] }])
				);
				expect(written, locale).toEqual(today);
			}
		} finally {
			i18n.locale = 'fr';
		}
	});
});
