import { previewBeatsOf } from '$lib/domain/exercise/pacing';
import type { ExerciseDefinition, ExerciseId, Scene } from '$lib/domain/exercise/types';
import { cardKey, type CardKey, type Locale, type PlannedItem } from '$lib/domain/types';
import type { MechanicPresenter } from '$lib/application/mechanics/types';

/** What a series reads of its items' data: their presenter, card key and exercise. */
export class SeriesItems {
	constructor(
		private readonly mechanics: Record<string, MechanicPresenter>,
		private readonly exercise: (id: ExerciseId) => ExerciseDefinition
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

	/** The definition of an item's exercise; an exercise the catalog does not know throws. */
	definitionOf(item: PlannedItem): ExerciseDefinition {
		return this.exercise(item.exerciseId);
	}

	/** The item's scene, preview and contest: its exercise's, else its mechanic's presenter's. */
	flowOf(item: PlannedItem): {
		scene: Scene;
		previewBeats: number | null;
		contestable: boolean;
	} {
		const presenter = this.presenterOf(item);
		const flow = this.definitionOf(item).flow;
		return {
			scene: flow?.scene ?? presenter.scene,
			previewBeats: previewBeatsOf(this.definitionOf(item), presenter.previewBeats),
			contestable: flow?.contestable ?? presenter.contestable ?? false
		};
	}

	/** The instruction of an item's exercise, in `locale`; null without one. */
	howToOf(item: PlannedItem, locale: Locale): string | null {
		return this.definitionOf(item)?.howTo?.[locale] ?? null;
	}
}
