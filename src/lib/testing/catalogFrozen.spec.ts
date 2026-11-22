import { expect, it } from 'vitest';
import { allExercises } from '$lib/domain/exercise';
import { allGrids } from '$lib/domain/grid';
import { findRoutine, routines } from '$lib/domain/routine/registry';

const IDS = [
	'locate-note-string',
	'identify-note',
	'chord-anchor',
	'chord-zone',
	'inversion-run',
	'grid-in-direction',
	'grid-in-zone',
	'grid-reading',
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
it('holds exactly the four routines', () => {
	expect(routines().map((routine) => routine.id)).toEqual([
		'notes',
		'chords',
		'chords-zone',
		'changes'
	]);
});
it.each(['notes', 'chords', 'chords-zone', 'changes'])('keeps the routine %s as it is', (id) => {
	expect(plain(findRoutine(id))).toMatchSnapshot();
});
