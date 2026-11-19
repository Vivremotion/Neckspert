import { beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseDefinition } from '$lib/domain/exercise';
import { allExercises, clearExercises } from '$lib/domain/exercise/registry';
import { clearGrids, registerGrid } from '$lib/domain/grid/registry';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { registerTestSkills } from '$lib/testing/testSkills';
import { definitionChecks } from './checks';

registerTestSkills();
import { LOCATE_NECK, IOHEFY_A, GESTURE_CLIMB, RHYTHM_TWO_FOUR } from '$lib/testing/catalog';
import { exerciseById } from '$lib/domain/exercise/registry';

const check = (exercise: ExerciseDefinition) => definitionChecks().exercise(exercise);

describe('definitionChecks', () => {
	it('accepts every exercise of the catalog', () => {
		expect(allExercises().map((e) => [e.id, check(e)])).toEqual(
			allExercises().map((e) => [e.id, null])
		);
	});

	it('refuses a practices that names no registered skill', () => {
		expect(check({ ...LOCATE_NECK, practices: 'nope' })).toBe(
			'practices names skill "nope", which no file read so far defines'
		);
	});

	it('accepts a practices that names a registered skill', () => {
		expect(check({ ...LOCATE_NECK, practices: 'locate-note-string' })).toBeNull();
	});

	it('refuses an exercise whose skill is missing', () => {
		const { practices: _practices, ...rest } = LOCATE_NECK;
		expect(check(rest as ExerciseDefinition)).toBe('practices is missing');
	});

	it('gives the reason of the first validator that refuses, without the exercise id', () => {
		const reason = check({ ...LOCATE_NECK, tempo: -3 });
		expect(reason).toMatch(/^tempo /);
		expect(reason).not.toContain('locate-note-string');
	});

	it('refuses a presentation naming a field its set does not have', () => {
		expect(check({ ...LOCATE_NECK, presentation: { primary: '{chord}' } })).toBe(
			'presentation.primary names field "chord", which note-on-string does not have'
		);
	});

	it('refuses an exercise whose skill’s item set has no presenter', () => {
		const checks = definitionChecks({}, {});
		expect(checks.exercise(LOCATE_NECK)).toBe(
			'practices a skill whose item set "note-on-string" has no presenter'
		);
	});

	it('refuses an item its round cannot compile', () => {
		// A key alone, where the round reads the length of its item.
		const far = { ...ARPEGGIO_EXERCISE, id: 'far', items: ['C|maj|3:1,2:3,1:5@5-5-3'] };
		expect(check(far)).toMatch(/^items\[0\] .*does not compile at exercise level -1/);
	});

	it('refuses a view the screen cannot draw', () => {
		expect(check({ ...ARPEGGIO_EXERCISE, id: 'three', view: 'score' })).toMatch(
			/^view "score" is not a view/
		);
	});

	describe('grids', () => {
		beforeEach(() => {
			clearExercises();
			clearGrids();
		});

		it('refuses a grid no file read so far defines', () => {
			clearGrids();
			const link = { ...GESTURE_CLIMB, params: { ...GESTURE_CLIMB.params, grids: ['nowhere'] } };
			expect(check(link)).toBe(
				'params.grids names grid "nowhere", which no file read so far defines'
			);
		});

		it('refuses a grid no file defines for any exercise that names grids, gesture or not', () => {
			const other = {
				...ARPEGGIO_EXERCISE,
				id: 'other',
				params: { ...ARPEGGIO_EXERCISE.params, grids: ['nowhere'] }
			};
			expect(check(other)).toBe(
				'params.grids names grid "nowhere", which no file read so far defines'
			);
		});

		it('accepts a grid a file defines', () => {
			registerGrid(IOHEFY_A, 'a.json');
			const climb = { ...GESTURE_CLIMB, params: { ...GESTURE_CLIMB.params, grids: ['iohefy-a'] } };
			expect(check(climb)).toBeNull();
		});
	});

	describe('the params of the changes', () => {
		const withParams = (params: Record<string, unknown>) => ({
			...GESTURE_CLIMB,
			params: { ...GESTURE_CLIMB.params, grids: [], ...params }
		});

		it('refuses a quality that is none', () => {
			expect(check(withParams({ qualities: ['xyz'] }))).toBe(
				'params.qualities names "xyz", which is no chord quality'
			);
		});

		it.each([[[[9, 8, 7]]], [[[1, 2]]], [[[1, 2, 3]]], [[[3, 3, 1]]], [['a']]])(
			'refuses the sets of strings %j',
			(stringSets) => {
				expect(check(withParams({ stringSets }))).toBe('params.stringSets[0] is no set of strings');
			}
		);

		it('refuses a quality that is no triad', () => {
			expect(check(withParams({ qualities: ['maj7'] }))).toBe(
				'params.qualities names "maj7", which is no triad quality'
			);
		});

		it('leaves an exercise of another view alone', () => {
			const other = { ...GESTURE_CLIMB, view: 'lane', params: { grids: [] } };
			expect(check(other)).not.toMatch(/^params\.(rule|qualities|stringSets)/);
		});

		it('refuses a rule that is none', () => {
			expect(check(withParams({ rule: 'fly' }))).toBe(
				'params.rule must be link, climb, zone or jam'
			);
		});

		it('refuses grids that are no list of ids', () => {
			expect(check(withParams({ grids: 'iohefy-a' }))).toBe(
				'params.grids must be a list of grid ids'
			);
			expect(check(withParams({ grids: [3] }))).toBe('params.grids must be a list of grid ids');
		});
	});
});

describe('the learning an exercise writes', () => {
	const IDENTIFY = exerciseById('identify-note');
	const ZONE = exerciseById('chord-zone');
	const PULSE = exerciseById('rhythm-silent-bars');
	const withLearning = (base: ExerciseDefinition, learning: unknown) => ({
		...base,
		params: { ...base.params, learning }
	});
	const enter = (acquired: unknown) => ({ enter: { acquired } });

	it('accepts a well-formed entry condition and draw', () => {
		const good = withLearning(IDENTIFY, {
			presentAtOnce: false,
			...enter({ skill: 'locate-note-string', item: 'same-place' })
		});
		expect(check(good)).toBeNull();
		expect(check(withLearning(ZONE, { draw: 'another-place' }))).toBeNull();
		expect(check(withLearning(IDENTIFY, { somethingNoPieceReads: 3 }))).toBeNull();
	});

	it.each([
		[3, 'params.learning must be an object'],
		[{ presentAtOnce: 3 }, 'params.learning.presentAtOnce must be true or false'],
		[{ enter: 3 }, 'params.learning.enter must be { acquired: { skill, item } }'],
		[{ enter: {} }, 'params.learning.enter must be { acquired: { skill, item } }'],
		[
			enter({ skill: 3, item: 'same' }),
			'params.learning.enter must be { acquired: { skill, item } }'
		],
		[{ draw: 3 }, 'params.learning.draw must be a string'],
		[{ draw: 'nope' }, 'params.learning.draw "nope" is no draw of placed-note']
	])('refuses %j', (learning, reason) => {
		expect(check(withLearning(IDENTIFY, learning))).toBe(reason);
	});

	it('refuses an entry condition on a skill without cards', () => {
		expect(check(withLearning(PULSE, enter({ skill: 'locate-note-string', item: 'same' })))).toBe(
			'params.learning.enter needs a skill with cards'
		);
	});

	it('refuses an entry condition naming a skill no file defines, or one without cards', () => {
		expect(check(withLearning(IDENTIFY, enter({ skill: 'x', item: 'same' })))).toBe(
			'params.learning.enter names skill "x", which no file read so far defines'
		);
		expect(check(withLearning(IDENTIFY, enter({ skill: 'inner-pulse', item: 'same' })))).toBe(
			'params.learning.enter names skill "inner-pulse", which has no cards'
		);
	});

	it('refuses a correspondence that does not exist between the two sets', () => {
		expect(
			check(withLearning(IDENTIFY, enter({ skill: 'locate-note-string', item: 'nope' })))
		).toBe(
			'params.learning.enter.acquired.item "nope" is no correspondence from placed-note to note-on-string'
		);
	});

	it('refuses a draw the exercise’s set does not have', () => {
		expect(check(withLearning(ZONE, { draw: 'nope' }))).toBe(
			'params.learning.draw "nope" is no draw of voicing-on-strings'
		);
	});
});

describe('definitionChecks, the items of a memory exercise', () => {
	it('refuses an exercise that practises a skill with cards and lists no items', () => {
		const { items: _items, ...without } = LOCATE_NECK;
		expect(check(without as ExerciseDefinition)).toBe(
			'an exercise that practises a skill with cards must list its items'
		);
	});

	it('refuses an item listed twice, naming both places', () => {
		const items = [...(LOCATE_NECK.items as string[])];
		items[5] = items[1];
		expect(check({ ...LOCATE_NECK, items })).toBe('items[5] repeats items[1]');
	});

	it('lets an exercise without memory repeat an item, or list none', () => {
		const { items: _items, ...without } = RHYTHM_TWO_FOUR;
		expect(check(without as ExerciseDefinition)).toBeNull();
		// A sequence of shapes may play the same one twice.
		const [first] = ARPEGGIO_EXERCISE.items!;
		expect(check({ ...ARPEGGIO_EXERCISE, items: [first, first] })).toBeNull();
	});
});
