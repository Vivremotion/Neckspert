import { figureItemsAt } from '$lib/domain/exercise/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { mechanicRules } from '$lib/domain/mechanics';
import type { ItemSource } from '$lib/domain/progress';
import { METER_4_4 } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';

/**
 * The items of an exercise session: the items the exercise writes (`items`, keys parsed by its
 * mechanic), in order and again from the first; else its figures, each served as the item its
 * round reads it on (`figureItemsAt`): the same again (`pick: 'loop'`) or the next one
 * (`'next'`). Each item is a turn of the series; served at level 0, it is served again at the
 * level its exercise plays (`atLevel`), with the figure of that turn that fits the level's round.
 * Free play, hot: it never ends on its own, the series' length does; it learns nothing from an
 * attempt. Throws, naming the exercise, on an item its mechanic cannot read, or when it writes no
 * items and its round reads no figure on its items.
 */
export function createExerciseItemSource(definition: ExerciseDefinition): ItemSource {
	const itemAt = turnItems(definition);
	let turns = 0;
	const turnOf = new WeakMap<PlannedItem, number>();
	const served = (turn: number, level: number): PlannedItem => {
		const item: PlannedItem = {
			exerciseId: definition.id,
			mechanic: definition.mechanic,
			exerciseLevel: level,
			item: itemAt(turn, level),
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

/** The mechanic's item of turn `turn` (from 0) at exercise level `level`. */
function turnItems(definition: ExerciseDefinition): (turn: number, level: number) => unknown {
	const { items } = definition;
	if (items !== undefined) {
		if (items.length === 0) throw new Error(`${definition.id}: items lists no item`);
		const rules = mechanicRules(definition.mechanic);
		const parsed = items.map((key, i) => {
			try {
				return rules.parseItem(key);
			} catch (error) {
				throw new Error(`${definition.id}: items[${i}] ${(error as Error).message}`);
			}
		});
		return (turn) => parsed[turn % parsed.length];
	}
	const meter = definition.meter ?? METER_4_4;
	if (figureItemsAt(definition, 0, meter) === null) {
		throw new Error(
			`${definition.id}: writes no items, and its round reads no figure on its items`
		);
	}
	return (turn, level) => {
		const figures = figureItemsAt(definition, level, meter) ?? [];
		if (figures.length === 0) {
			throw new Error(`No figure of ${definition.id} fits its round at level ${level}`);
		}
		if (definition.pick !== 'next') return figures[0].item;
		return figures[turn % figures.length].item;
	};
}
