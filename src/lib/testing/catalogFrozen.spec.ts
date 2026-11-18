import { expect, it } from 'vitest';
import { allExercises } from '$lib/domain/exercise';
import { allGrids } from '$lib/domain/grid';

const IDS = [
	'locate-neck',
	'identify-neck',
	'triads-anchor',
	'triads-zone',
	'gesture-link',
	'gesture-climb',
	'gesture-zone',
	'gesture-jam',
	'rhythm-silent-bars',
	'rhythm-two-four',
	'rhythm-offbeats'
];
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

it('holds exactly the eleven exercises', () => {
	expect(
		allExercises()
			.map((exercise) => exercise.id)
			.sort()
	).toEqual([...IDS].sort());
});
it.each(IDS)('keeps %s as it is', (id) => {
	expect(plain(allExercises().find((exercise) => exercise.id === id))).toMatchSnapshot();
});
it.each(['iohefy-a', 'blues-f'])('keeps the grid %s as it is', (id) => {
	expect(plain(allGrids().find((grid) => grid.id === id))).toMatchSnapshot();
});
