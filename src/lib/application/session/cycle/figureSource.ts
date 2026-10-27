import type { ExerciseDefinition } from '$lib/domain/exercise';
import type { RhythmItem } from '$lib/domain/mechanics';
import type { ItemSource } from '$lib/domain/progress';
import type { PlannedItem } from '$lib/domain/types';
import { figureFor, rhythmParamsOf } from './rhythmExercise';

/**
 * The items of a figure exercise: the same figure again (`loop`) or the next one (`next`), at the
 * level played. Each item is a turn of the series; served at level 0, it is served again at the
 * level its exercise plays (`atLevel`) with the figure of that turn which fits the level's cycle.
 * Free play, hot: it never ends on its own, the series' length does; it learns nothing from an
 * attempt.
 */
export function createFigureSource(definition: ExerciseDefinition): ItemSource {
	let turns = 0;
	const turnOf = new WeakMap<PlannedItem, number>();
	const served = (turn: number, level: number): PlannedItem<RhythmItem> => {
		const { id } = figureFor(definition, rhythmParamsOf(definition, level), turn);
		const item: PlannedItem<RhythmItem> = {
			exerciseId: definition.id,
			mechanic: definition.mechanic,
			exerciseLevel: level,
			item: { figureId: id, level },
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			leadBeats: null
		};
		turnOf.set(item, turn);
		return item;
	};
	return {
		next: () => served(turns++, 0),
		atLevel: (item, level) => {
			const turn = turnOf.get(item);
			if (turn === undefined) throw new Error('an item this source did not serve');
			return served(turn, level);
		},
		record: () => null,
		cardChanged: () => {}
	};
}
