import { exerciseById } from '$lib/domain/exercise/catalog';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import {
	cardKey,
	type CardKey,
	type Execution,
	type Locale,
	type PlannedItem
} from '$lib/domain/types';
import type { MechanicPresenter } from '$lib/application/mechanics/types';

/** What a series reads of its items' data: their presenter, card key, execution and exercise. */
export class SeriesItems {
	constructor(
		private readonly mechanics: Record<string, MechanicPresenter>,
		private readonly executions: () => readonly Execution[]
	) {}

	presenterOf(item: PlannedItem): MechanicPresenter {
		const presenter = this.mechanics[item.mechanic];
		if (!presenter) throw new Error(`No presenter for mechanic: ${item.mechanic}`);
		return presenter;
	}

	cardKeyOf(item: PlannedItem): CardKey {
		const { rules } = this.presenterOf(item);
		return cardKey(rules.id, rules.itemKey(item.item));
	}

	/** The execution an item belongs to, by its exercise and its tempo scope. */
	executionOf(item: PlannedItem): Execution {
		const execution = this.executions().find(
			(e) => e.exerciseId === item.exerciseId && (e.scope ?? null) === (item.tempoScope ?? null)
		);
		if (!execution) throw new Error(`No execution for exercise: ${item.exerciseId}`);
		return execution;
	}

	definitionOf(item: PlannedItem): ExerciseDefinition | null {
		try {
			return exerciseById(item.exerciseId);
		} catch {
			// An exercise the catalog does not know (a test's) has no view nor instruction.
			return null;
		}
	}

	/** The instruction of an item's exercise, in `locale`; null without one. */
	howToOf(item: PlannedItem, locale: Locale): string | null {
		return this.definitionOf(item)?.howTo?.[locale] ?? null;
	}
}
