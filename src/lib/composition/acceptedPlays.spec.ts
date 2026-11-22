import { afterAll, describe, expect, it } from 'vitest';
import { voicingOnStringsPresenter } from '$lib/application/sets/voicingOnStrings';
import { presentPrompt } from '$lib/application/presentation/presentPrompt';
import { exerciseSessionExercises, findExercise } from '$lib/domain/exercise/registry';
import { createExerciseItemSource } from '$lib/application/session/series/itemSource';
import { compileRound } from '$lib/domain/exercise/round';
import { itemEntryKey } from '$lib/domain/exercise/itemEntries';
import { admittedMembers, type MemberContent } from '$lib/domain/judges';
import { exerciseSubject } from '$lib/domain/learning/exerciseSubject';
import { exerciseItemSet } from '$lib/domain/sets';
import { METER_4_4 } from '$lib/domain/time';
import { cardKey, type PlannedItem } from '$lib/domain/types';
import { CATALOG_FILES } from './catalogFiles';
import { loadDefinitions } from './definitions';

/**
 * Files the load accepts must play: every listed item at every item level compiles its round,
 * draws its prompt, tells the chord sensor what to listen for and builds its aided prompt,
 * without a throw.
 */

type Json = Record<string, any>;

const chords = JSON.parse(
	Object.entries(CATALOG_FILES).find(([name]) => name.endsWith('/chords.json'))![1]
) as { exercises: Json[] };
const catalogExercise = (id: string): Json =>
	JSON.parse(JSON.stringify(chords.exercises.find((exercise) => exercise.id === id)));

/** Every listed item of the zone at each of its item levels. */
const ZONE_ROUNDS =
	catalogExercise('chord-zone').items.length * catalogExercise('chord-zone').params.ladder.length;

/** A copy of a catalog exercise under `id`, practising a skill of its own. */
function variant(base: string, id: string, change: (exercise: Json) => void) {
	const exercise = catalogExercise(base);
	exercise.id = id;
	exercise.practices = id;
	delete exercise.params.learning?.enter;
	change(exercise);
	return {
		skill: {
			id,
			name: { fr: id, en: id },
			items: 'voicing-on-strings',
			memory: true,
			directRecall: { withinMs: 1500 }
		},
		exercise
	};
}

/** The refusals of an imported file holding `file`. */
function load(file: { skill: Json; exercise: Json }): string[] {
	const text = JSON.stringify({ format: 0, skills: [file.skill], exercises: [file.exercise] });
	const { imported } = loadDefinitions({ catalog: CATALOG_FILES, imported: { 'a.json': text } });
	return imported.refusals.map((refusal) => refusal.reason);
}

/** Plays every listed item at every item level of exercise `id`: the number of rounds opened. */
function playAll(id: string): number {
	const definition = findExercise(id)!;
	const set = exerciseItemSet(definition);
	const levels = (definition.params.ladder as unknown[]).length;
	const subject = exerciseSubject({ exercises: [definition], attempts: [] });
	let played = 0;
	for (const entry of definition.items ?? []) {
		const base = set.parseItem(itemEntryKey(entry));
		for (let level = 0; level < levels; level++) {
			const card = {
				skill: definition.practices,
				item: base,
				key: cardKey(definition.practices, set.itemKey(base))
			};
			const item = subject.promptItem ? subject.promptItem(card, () => 0.5, level) : base;
			const planned: PlannedItem = {
				exerciseId: definition.id,
				skill: definition.practices,
				exerciseLevel: 0,
				item,
				phase: 'learning',
				temperature: 'hot',
				aid: 'show-position',
				leadBeats: 2,
				level
			};
			const plan = compileRound(definition, planned, METER_4_4, {
				previewBeats: 0,
				fromRunStart: null
			});
			voicingOnStringsPresenter.expectation!(item as never, {
				opensAt: 0,
				previous: null,
				expectations: plan.expectations
			});
			presentPrompt(definition, planned, 'fr', () => 0);
			played++;
		}
	}
	return played;
}

afterAll(() => {
	loadDefinitions({ catalog: CATALOG_FILES });
});

describe('a zone whose ends are read and come out reversed', () => {
	it('loads and plays when a level reverses an end read in a param', () => {
		const file = variant('chord-zone', 'zone-param-end', (exercise) => {
			exercise.params.lo = 1;
			exercise.params.ladder[1].params.lo = 10;
			exercise.round.expectations[0].content = {
				family: 'chord-shapes',
				where: [{ in: { frets: [{ param: 'lo' }, 5] } }]
			};
		});
		expect(load(file)).toEqual([]);
		expect(playAll('zone-param-end')).toBe(ZONE_ROUNDS);
	});

	it('loads and draws when the prompt’s selection reverses an end read in a param', () => {
		const file = variant('chord-zone', 'zone-asks-param-end', (exercise) => {
			exercise.params.lo = 1;
			exercise.params.ladder[1].params.lo = 10;
			exercise.params.learning.asks = {
				family: 'chord-shapes',
				where: [{ in: { frets: [{ param: 'lo' }, 5] } }]
			};
		});
		expect(load(file)).toEqual([]);
		expect(playAll('zone-asks-param-end')).toBe(ZONE_ROUNDS);
	});

	it('loads and plays when the item names a fret above the zone’s written end', () => {
		const file = variant('chord-zone', 'zone-item-end', (exercise) => {
			exercise.round.expectations[0].content = {
				family: 'chord-shapes',
				where: [{ in: { frets: [{ item: 'fret' }, 3] } }]
			};
		});
		expect(load(file)).toEqual([]);
		expect(playAll('zone-item-end')).toBe(ZONE_ROUNDS);
	});
});

/** A copy of the zone that lists `item` alone. */
const listing = (id: string, item: string) =>
	variant('chord-zone', id, (exercise) => {
		exercise.items = [item];
	});

describe('a listed voicing that is no close triad on three strings', () => {
	for (const [id, item] of [
		['seventh-listed', 'C|maj7|4:1,3:5,2:7,1:3'],
		['two-strings-listed', 'C|maj|3:1,2:3']
	] as const) {
		it(`tells the chord sensor the admitted shapes alone (${item})`, () => {
			expect(load(listing(id, item))).toEqual([]);
			const definition = findExercise(id)!;
			const voicing = exerciseItemSet(definition).parseItem(item) as { voicingKey: string };
			const plan = compileRound(
				definition,
				{
					exerciseId: id,
					skill: id,
					exerciseLevel: 0,
					item: voicing,
					phase: 'learning',
					temperature: 'hot',
					aid: 'none',
					leadBeats: 2,
					level: 0
				},
				METER_4_4,
				{ previewBeats: 0, fromRunStart: null }
			);
			const expectation = voicingOnStringsPresenter.expectation!(voicing as never, {
				opensAt: 0,
				previous: null,
				expectations: plan.expectations
			});
			const chord = (expectation as { chord?: { expected: string[]; candidates: unknown[] } })
				.chord;
			const shapes = admittedMembers(plan.expectations[0].content!.value as MemberContent);
			expect(shapes.length).toBeGreaterThan(0);
			expect(chord!.expected).toEqual(shapes.map((shape) => shape.id));
			expect(chord!.candidates).toHaveLength(shapes.length);
		});
	}
});

describe('a listed voicing without a playable shape', () => {
	it('builds its aided prompt with its words and no picture', () => {
		const item = 'C|maj|5:1,3:3,1:5';
		const file = variant('chord-anchor', 'anchor-no-shape', (exercise) => {
			exercise.items = [item];
		});
		expect(load(file)).toEqual([]);
		const definition = findExercise('anchor-no-shape')!;
		const voicing = exerciseItemSet(definition).parseItem(item);
		const shown = presentPrompt(
			definition,
			{
				exerciseId: definition.id,
				skill: definition.practices,
				exerciseLevel: 0,
				item: voicing,
				phase: 'learning',
				temperature: 'hot',
				aid: 'show-position',
				leadBeats: 8,
				level: 0
			},
			'fr',
			() => 0
		);
		expect(shown.primary).toBe('C');
		expect(shown.pictures).toEqual([]);
		expect(playAll('anchor-no-shape')).toBe(3);
	});
});

/** An arpeggio of a placed voicing over a figure a param names: no figure read on its items. */
function arpeggio(id: string, extra: Json = {}): Json {
	return {
		id,
		title: { fr: id, en: id },
		practices: 'arpeggio',
		view: 'figure',
		tempo: 60,
		params: {
			figure: 'quarters',
			window: { ms: 80 },
			thresholds: { regularity: 40 },
			pacing: { roundsPerBreath: 3, breathMinMs: 4000 }
		},
		figures: [{ id: 'quarters', lilypond: 'c4 c c c' }],
		round: {
			expectations: [
				{
					figure: { param: 'figure' },
					at: { bars: 0 },
					sensor: 'note',
					content: { from: 'voicing-notes', pattern: [1, 2, 3, 2] },
					window: { param: 'window' }
				}
			],
			length: { bars: 1 },
			handover: 'end',
			policy: { unit: 'cycle', verdict: 'cycle', correction: false, pairing: { mode: 'alignment' } }
		},
		levels: [{ params: { figure: 'quarters' } }],
		...extra
	};
}

describe('the exercise sessions list exactly what their source can serve', () => {
	afterAll(() => {
		loadDefinitions({ catalog: CATALOG_FILES });
	});

	it('accepts a passages exercise and one without items, lists neither, and starts every one listed', () => {
		const text = JSON.stringify({
			format: 0,
			skills: [
				{ id: 'arpeggio', name: { fr: 'a', en: 'a' }, items: 'placed-voicing', memory: false }
			],
			exercises: [
				arpeggio('arpeggio-passages', {
					passages: {
						of: { chord: ['C', 'F'], strings: [[3, 2, 1]] },
						members: { family: 'chord-shapes', order: ['position'], take: 4, andBack: true }
					}
				}),
				arpeggio('arpeggio-no-items')
			]
		});
		const { imported } = loadDefinitions({ catalog: CATALOG_FILES, imported: { 'a.json': text } });
		expect(imported.refusals).toEqual([]);
		expect(findExercise('arpeggio-passages')).toBeDefined();
		expect(findExercise('arpeggio-no-items')).toBeDefined();

		const listed = exerciseSessionExercises().map((exercise) => exercise.id);
		expect(listed).not.toContain('arpeggio-passages');
		expect(listed).not.toContain('arpeggio-no-items');
		expect(listed.length).toBeGreaterThan(0);
		for (const exercise of exerciseSessionExercises()) {
			expect(
				() => createExerciseItemSource(exercise).next({ now: 0, elapsedMs: 0, fatigued: false }),
				exercise.id
			).not.toThrow();
		}
	});
});

describe('the link’s lane on an exercise without passages', () => {
	afterAll(() => {
		loadDefinitions({ catalog: CATALOG_FILES });
	});

	it('is refused at load, naming the view', () => {
		const text = JSON.stringify({
			format: 0,
			skills: [
				{ id: 'arpeggio', name: { fr: 'a', en: 'a' }, items: 'placed-voicing', memory: false }
			],
			exercises: [
				arpeggio('arpeggio-link-lane', {
					view: 'link-lane',
					items: [{ item: 'C|maj|3:1,2:3,1:5@5-5-3', beats: 4 }]
				})
			]
		});
		const { imported } = loadDefinitions({ catalog: CATALOG_FILES, imported: { 'a.json': text } });
		expect(imported.refusals.map((refusal) => refusal.reason)).toEqual([
			'view "link-lane" draws a passage, and the exercise writes no passages'
		]);
		expect(findExercise('arpeggio-link-lane')).toBeUndefined();
	});
});
