import { beforeEach, describe, expect, it } from 'vitest';
import { allExercises, clearExercises } from '$lib/domain/exercise/registry';
import { allGrids, clearGrids, gridById } from '$lib/domain/grid/registry';
import { allSkills, clearSkills, hasSkill } from '$lib/domain/skill/registry';
import { clearRoutines, routines } from '$lib/domain/routine/registry';
import { registerFiles, type DefinitionChecks } from './register';
import { MAX_FILE_CHECK_COST } from '$lib/domain/exercise/checkCost';
import { LOCATE_NECK, BLUES_F } from '$lib/testing/catalog';

const accept: DefinitionChecks = { exercise: () => null };
const skill = (id: string) => ({
	id,
	name: { fr: 'x', en: 'x' },
	items: 'figure',
	memory: false
});
const file = (value: object) => JSON.stringify({ format: 0, ...value });
const exercise = (id: string) => ({ ...LOCATE_NECK, id });
const grid = (id: string) => ({ ...BLUES_F, id });

beforeEach(() => {
	clearSkills();
	clearExercises();
	clearGrids();
	clearRoutines();
});

describe('registerFiles', () => {
	it('reads the files in the order of their names', () => {
		const { refusals } = registerFiles(
			{
				'b.json': file({ exercises: [exercise('from-b')] }),
				'a.json': file({ exercises: [exercise('from-a')] })
			},
			accept
		);
		expect(refusals).toEqual([]);
		expect(allExercises().map((e) => e.id)).toEqual(['from-a', 'from-b']);
	});

	it('refuses an id another file holds, naming it', () => {
		const { refusals } = registerFiles(
			{
				'a.json': file({ exercises: [exercise('x')] }),
				'b.json': file({ exercises: [exercise('x')] })
			},
			accept
		);
		expect(refusals).toEqual([
			{ file: 'b.json', kind: 'exercise', id: 'x', reason: 'this id is already defined in a.json' }
		]);
		expect(allExercises()).toHaveLength(1);
	});

	it('refuses a grid id another file holds', () => {
		const { refusals } = registerFiles(
			{ 'a.json': file({ grids: [grid('g')] }), 'b.json': file({ grids: [grid('g')] }) },
			accept
		);
		expect(refusals).toEqual([
			{ file: 'b.json', kind: 'grid', id: 'g', reason: 'this id is already defined in a.json' }
		]);
	});

	it('lets a grid and an exercise share an id', () => {
		const { refusals } = registerFiles(
			{ 'a.json': file({ grids: [grid('x')], exercises: [exercise('x')] }) },
			accept
		);
		expect(refusals).toEqual([]);
		expect(allGrids()).toHaveLength(1);
		expect(allExercises()).toHaveLength(1);
	});

	it('keeps the valid objects of a file that holds a refused one', () => {
		const { refusals } = registerFiles(
			{ 'a.json': file({ exercises: [exercise('bad'), exercise('good')] }) },
			{ exercise: (e) => (e.id === 'bad' ? 'no good' : null) }
		);
		expect(refusals).toEqual([{ file: 'a.json', kind: 'exercise', id: 'bad', reason: 'no good' }]);
		expect(allExercises().map((e) => e.id)).toEqual(['good']);
	});

	it('checks an exercise after the grids of its file are registered', () => {
		const { refusals } = registerFiles(
			{ 'a.json': file({ exercises: [exercise('x')], grids: [grid('g')] }) },
			{ exercise: () => (gridById('g') ? null : 'unreachable') }
		);
		expect(refusals).toEqual([]);
		expect(allExercises()).toHaveLength(1);
	});

	it('refuses an exercise whose check throws, and goes on', () => {
		const { refusals } = registerFiles(
			{ 'a.json': file({ exercises: [exercise('broken'), exercise('fine')] }) },
			{
				exercise: (e) => {
					if (e.id === 'broken') throw new Error('round is not a template');
					return null;
				}
			}
		);
		expect(refusals).toEqual([
			{ file: 'a.json', kind: 'exercise', id: 'broken', reason: 'round is not a template' }
		]);
		expect(allExercises().map((e) => e.id)).toEqual(['fine']);
	});

	it('gives the exercises of one file one check budget: past it, the one under way and the later ones are refused in its words', () => {
		// Each check spends 60 % of the budget: the second of a file passes it.
		const spend: DefinitionChecks = {
			exercise: (_exercise, budget) => {
				budget!.charge(MAX_FILE_CHECK_COST * 0.6);
				return null;
			}
		};
		const { refusals, registered } = registerFiles(
			{
				'a.json': file({
					skills: [skill('s')],
					grids: [grid('g')],
					exercises: [exercise('first'), exercise('second'), exercise('third')]
				}),
				'b.json': file({ exercises: [exercise('elsewhere')] })
			},
			spend
		);
		const reason = `this file asks more checking than a start can afford (cost ${MAX_FILE_CHECK_COST * 1.2}, at most ${MAX_FILE_CHECK_COST})`;
		expect(refusals).toEqual([
			{ file: 'a.json', kind: 'exercise', id: 'second', reason },
			{ file: 'a.json', kind: 'exercise', id: 'third', reason }
		]);
		// The file's skills, grids and earlier exercises stay; another file has its own budget.
		expect(registered.map(({ kind, id }) => `${kind} ${id}`)).toEqual([
			'skill s',
			'grid g',
			'exercise first',
			'exercise elsewhere'
		]);
	});

	it('refuses nothing when there is no file', () => {
		expect(registerFiles({}, accept)).toEqual({ refusals: [], registered: [] });
		expect(allExercises()).toEqual([]);
	});

	it('never throws on a file that is no JSON', () => {
		const { refusals } = registerFiles(
			{ 'a.json': '{ nope', 'b.json': file({ exercises: [exercise('x')] }) },
			accept
		);
		expect(refusals).toHaveLength(1);
		expect(refusals[0]).toMatchObject({ file: 'a.json', kind: 'file', id: null });
		expect(allExercises().map((e) => e.id)).toEqual(['x']);
	});

	it('registers a skill before the exercise of its file that names it', () => {
		let seen: boolean | null = null;
		const { refusals } = registerFiles(
			{ 'a.json': file({ skills: [skill('s')], exercises: [exercise('e')] }) },
			{
				exercise: () => {
					seen = hasSkill('s');
					return null;
				}
			}
		);
		expect(refusals).toEqual([]);
		expect(seen).toBe(true);
		expect(allSkills()).toHaveLength(1);
	});

	it('refuses a skill id another file holds', () => {
		const { refusals } = registerFiles(
			{ 'a.json': file({ skills: [skill('s')] }), 'b.json': file({ skills: [skill('s')] }) },
			accept
		);
		expect(refusals).toEqual([
			{ file: 'b.json', kind: 'skill', id: 's', reason: 'this id is already defined in a.json' }
		]);
	});

	it('lets a skill, a grid and an exercise share an id', () => {
		const { refusals } = registerFiles(
			{
				'a.json': file({ skills: [skill('x')], grids: [grid('x')], exercises: [exercise('x')] })
			},
			accept
		);
		expect(refusals).toEqual([]);
	});

	describe('every skill and grid of the files, before any exercise', () => {
		/**
		 * As the application's checks do: each skill an exercise names (its practices, its entry
		 * condition, its opening) and each grid its passages name must be registered.
		 */
		const naming: DefinitionChecks = {
			exercise: (e) => {
				const learning = e.params?.learning as { enter?: { acquired: { skill: string } } };
				const skills = [
					e.practices,
					learning?.enter?.acquired.skill,
					e.passages?.opens?.acquired.skill
				].filter((id): id is string => id !== undefined);
				const missing = skills.find((id) => !hasSkill(id));
				if (missing) return `names skill "${missing}", which no file read so far defines`;
				const grids = (e.passages?.of.grid ?? []) as string[];
				const grid = grids.find((id) => !allGrids().some((g) => g.id === id));
				return grid ? `names grid "${grid}", which no file read so far defines` : null;
			}
		};
		const named = (overrides: object) => ({ ...exercise('e'), practices: 'own', ...overrides });
		const withA = (exercises: object[]) =>
			registerFiles(
				{
					'a.json': file({ skills: [skill('own')], exercises }),
					'b.json': file({ skills: [skill('later')], grids: [grid('later-grid')] })
				},
				naming
			);

		it('accepts an exercise practising a skill of a file read later', () => {
			expect(withA([named({ practices: 'later' })]).refusals).toEqual([]);
			expect(allExercises().map((e) => e.id)).toEqual(['e']);
		});

		it('accepts an entry condition and an opening naming a skill of a file read later', () => {
			const enter = named({
				params: { learning: { enter: { acquired: { skill: 'later', item: 'same' } } } }
			});
			const opens = named({
				id: 'f',
				passages: {
					of: {},
					members: { family: 'x' },
					opens: { acquired: { skill: 'later', item: 'same' } }
				}
			});
			expect(withA([enter, opens]).refusals).toEqual([]);
		});

		it('accepts passages of a grid of a file read later', () => {
			const passages = named({
				passages: { of: { grid: ['later-grid'] }, members: { family: 'grid-changes' } }
			});
			expect(withA([passages]).refusals).toEqual([]);
		});

		it('still refuses a skill no file of the source defines', () => {
			expect(withA([named({ practices: 'nowhere' })]).refusals).toEqual([
				{
					file: 'a.json',
					kind: 'exercise',
					id: 'e',
					reason: 'names skill "nowhere", which no file read so far defines'
				}
			]);
		});

		it('keeps the first registered of two skills of one id, in the order of the names', () => {
			const { refusals } = registerFiles(
				{
					'b.json': file({ skills: [skill('s')] }),
					'a.json': file({ skills: [skill('s')] })
				},
				accept
			);
			expect(refusals).toEqual([
				{ file: 'b.json', kind: 'skill', id: 's', reason: 'this id is already defined in a.json' }
			]);
		});
	});

	it('lists what it registers in order, and nothing it refused', () => {
		const { registered } = registerFiles(
			{
				'b.json': file({ exercises: [exercise('e2')] }),
				'a.json': file({
					skills: [skill('s')],
					grids: [grid('g')],
					exercises: [exercise('bad'), exercise('e1')]
				})
			},
			{ exercise: (e) => (e.id === 'bad' ? 'no good' : null) }
		);
		// Every skill, then every grid, then every exercise; the files in name order in each.
		expect(registered).toEqual([
			{ file: 'a.json', kind: 'skill', id: 's' },
			{ file: 'a.json', kind: 'grid', id: 'g' },
			{ file: 'a.json', kind: 'exercise', id: 'e1' },
			{ file: 'b.json', kind: 'exercise', id: 'e2' }
		]);
		const later = registerFiles(
			{
				'a.json': file({ exercises: [exercise('e3')] }),
				'b.json': file({ skills: [skill('t')], grids: [grid('h')] })
			},
			accept
		).registered;
		expect(later).toEqual([
			{ file: 'b.json', kind: 'skill', id: 't' },
			{ file: 'b.json', kind: 'grid', id: 'h' },
			{ file: 'a.json', kind: 'exercise', id: 'e3' }
		]);
	});

	describe('the routines, after every exercise', () => {
		/** The skill LOCATE_NECK practises, with memory. */
		const locateSkill = {
			id: LOCATE_NECK.practices,
			name: { fr: 'x', en: 'x' },
			items: 'note-on-string',
			memory: true,
			directRecall: { withinMs: 1500 }
		};
		const routine = (id: string, exercises: string[]) => ({
			id,
			title: { fr: id, en: id },
			exercises
		});

		it('registers a routine naming an exercise of a file read after its own', () => {
			const { refusals, registered } = registerFiles(
				{
					'a.json': file({ routines: [routine('r', ['e'])] }),
					'b.json': file({ skills: [locateSkill], exercises: [exercise('e')] })
				},
				accept
			);
			expect(refusals).toEqual([]);
			expect(registered.slice(-1)).toEqual([{ file: 'a.json', kind: 'routine', id: 'r' }]);
			expect(routines().map((r) => r.id)).toEqual(['r']);
		});

		it('refuses a routine id another file holds, naming it; a routine and an exercise may share an id', () => {
			const { refusals } = registerFiles(
				{
					'a.json': file({
						skills: [locateSkill],
						exercises: [exercise('e')],
						routines: [routine('e', ['e'])]
					}),
					'b.json': file({ routines: [routine('e', ['e'])] })
				},
				accept
			);
			expect(refusals).toEqual([
				{ file: 'b.json', kind: 'routine', id: 'e', reason: 'this id is already defined in a.json' }
			]);
			expect(routines()).toHaveLength(1);
		});

		it('refuses the routine of a refused exercise, and loads the others', () => {
			const { refusals } = registerFiles(
				{
					'a.json': file({
						skills: [locateSkill],
						exercises: [exercise('bad'), exercise('good')],
						routines: [routine('with-bad', ['bad']), routine('with-good', ['good'])]
					})
				},
				{ exercise: (e) => (e.id === 'bad' ? 'no good' : null) }
			);
			expect(refusals).toEqual([
				{ file: 'a.json', kind: 'exercise', id: 'bad', reason: 'no good' },
				{
					file: 'a.json',
					kind: 'routine',
					id: 'with-bad',
					reason: 'exercises[0]: no file defines the exercise "bad"'
				}
			]);
			expect(routines().map((r) => r.id)).toEqual(['with-good']);
		});

		it('refuses the routine of an exercise whose file is refused whole', () => {
			const { refusals } = registerFiles(
				{
					'a.json': file({ routines: [routine('r', ['e'])] }),
					'b.json': '{ nope'
				},
				accept
			);
			expect(refusals).toHaveLength(2);
			expect(refusals[1]).toEqual({
				file: 'a.json',
				kind: 'routine',
				id: 'r',
				reason: 'exercises[0]: no file defines the exercise "e"'
			});
			expect(routines()).toEqual([]);
		});
	});
});
