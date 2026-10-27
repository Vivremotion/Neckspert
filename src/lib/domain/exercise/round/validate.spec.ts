import { describe, expect, it } from 'vitest';
import { EXERCISES, IDENTIFY_NECK, LOCATE_NECK, TRIADS_ANCHOR } from '../catalog';
import type { ExerciseDefinition, Ladder } from '../types';
import type { RoundTemplate } from './types';
import { roundProblem } from './validate';

const SENSORS = ['note', 'chord', 'tap'];

function round(definition: ExerciseDefinition): RoundTemplate {
	if (!definition.round) throw new Error(`${definition.id} writes no round`);
	return definition.round;
}

const withRound = (
	definition: ExerciseDefinition,
	change: (template: RoundTemplate) => unknown
): ExerciseDefinition => ({
	...definition,
	round: change(structuredClone(round(definition))) as RoundTemplate
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
});
