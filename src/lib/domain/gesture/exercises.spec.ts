import { describe, expect, it } from 'vitest';
import { EXERCISES, exerciseById, exerciseLevelsOf, tempoOf } from '$lib/domain/exercise';
import {
	GESTURE_CLIMB,
	GESTURE_EXERCISES,
	GESTURE_JAM,
	GESTURE_LINK,
	GESTURE_ZONE,
	gestureElements
} from './exercises';

describe('the gesture exercises', () => {
	it('are four, in the order of the ladder, in the catalog, each with its view and instruction', () => {
		expect(GESTURE_EXERCISES.map((e) => e.id)).toEqual([
			'gesture-link',
			'gesture-climb',
			'gesture-zone',
			'gesture-jam'
		]);
		expect(GESTURE_EXERCISES.map((e) => e.view)).toEqual([
			'link-lane',
			'grid-scroll',
			'grid-scroll',
			'grid-scroll'
		]);
		expect(GESTURE_LINK.howTo?.fr).toMatch(
			/^Joue l’accord demandé sur les cordes indiquées, en partant de sa position la plus grave/
		);
		for (const exercise of GESTURE_EXERCISES) {
			expect(exercise).toMatchObject({ mechanic: 'chord-grid', tempo: 80 });
			// Nine tempo levels, 80 to 120 by 5, up after ten right changes, down after three misses.
			expect(exerciseLevelsOf(exercise).map((_, level) => tempoOf(exercise, level))).toEqual([
				80, 85, 90, 95, 100, 105, 110, 115, 120
			]);
			expect(
				exercise.levels?.every(
					(level) => level.pass?.successes === 10 && level.drop?.failures === 3 && !level.aid
				)
			).toBe(true);
			expect(exercise.howTo?.fr && exercise.howTo.en).toBeTruthy();
			expect(EXERCISES).toContain(exercise);
			expect(exerciseById(exercise.id)).toBe(exercise);
		}
		expect(GESTURE_CLIMB.params).toEqual({
			rule: 'climb',
			stringSets: [
				[3, 2, 1],
				[4, 3, 2]
			],
			qualities: ['maj', 'min'],
			grids: ['iohefy-a', 'blues-f']
		});
	});

	it('link: one element per chord and string set, the sets of a chord side by side', () => {
		const elements = gestureElements(GESTURE_LINK);
		expect(elements).toHaveLength(48);
		expect(elements.slice(0, 4).map((e) => e.key)).toEqual([
			'link:C|maj:3,2,1',
			'link:C|maj:4,3,2',
			'link:C|min:3,2,1',
			'link:C|min:4,3,2'
		]);
		expect(elements.map((e) => e.key)).toContain('link:Eb|min:3,2,1');
		expect(elements[0]).toEqual({
			exerciseId: 'gesture-link',
			rule: 'link',
			key: 'link:C|maj:3,2,1',
			chord: 'C|maj',
			sets: [[3, 2, 1]]
		});
	});

	it('climb: one element per grid and string set; zone and jam: one per grid on both sets', () => {
		expect(gestureElements(GESTURE_CLIMB).map((e) => e.key)).toEqual([
			'climb:iohefy-a:3,2,1',
			'climb:iohefy-a:4,3,2',
			'climb:blues-f:3,2,1',
			'climb:blues-f:4,3,2'
		]);
		expect(gestureElements(GESTURE_ZONE)).toEqual([
			{
				exerciseId: 'gesture-zone',
				rule: 'zone',
				key: 'zone:iohefy-a',
				gridId: 'iohefy-a',
				sets: [
					[3, 2, 1],
					[4, 3, 2]
				]
			},
			expect.objectContaining({ key: 'zone:blues-f' })
		]);
		expect(gestureElements(GESTURE_JAM).map((e) => e.key)).toEqual(['jam:iohefy-a', 'jam:blues-f']);
	});
});
