import { previewBeatsOf } from '$lib/domain/exercise/pacing';
import type {
	ExerciseBriefing,
	ExerciseDefinition,
	ExerciseId,
	Scene
} from '$lib/domain/exercise/types';
import { cardKey, type CardKey, type Locale, type PlannedItem } from '$lib/domain/types';
import type { MechanicPresenter } from '$lib/application/mechanics/types';
import { mechanicOfSkill } from '$lib/domain/skill/bridge';

/** What a series reads of its items' data: their presenter, card key and exercise. */
export class SeriesItems {
	constructor(
		private readonly mechanics: Record<string, MechanicPresenter>,
		private readonly exercise: (id: ExerciseId) => ExerciseDefinition
	) {}

	presenterOf(item: PlannedItem): MechanicPresenter {
		const mechanic = mechanicOfSkill(item.skill);
		const presenter = this.mechanics[mechanic];
		if (!presenter) throw new Error(`No presenter for skill ${item.skill} (${mechanic})`);
		return presenter;
	}

	cardKeyOf(item: PlannedItem): CardKey {
		const { rules } = this.presenterOf(item);
		return cardKey(item.skill, rules.itemKey(item.item));
	}

	/** The definition of an item's exercise; an exercise the registry does not hold throws. */
	definitionOf(item: PlannedItem): ExerciseDefinition {
		return this.exercise(item.exerciseId);
	}

	/**
	 * The item's scene, preview, contest and briefing: its exercise's, else its mechanic's
	 * presenter's, else the default (an instruction told in each series).
	 */
	flowOf(item: PlannedItem): {
		scene: Scene;
		previewBeats: number | null;
		contestable: boolean;
		briefing: ExerciseBriefing;
	} {
		const presenter = this.presenterOf(item);
		const flow = this.definitionOf(item).flow;
		return {
			scene: flow?.scene ?? presenter.scene,
			previewBeats: previewBeatsOf(this.definitionOf(item), presenter.previewBeats),
			contestable: flow?.contestable ?? presenter.contestable ?? false,
			briefing: flow?.briefing ?? 'each-series'
		};
	}

	/** The instruction of an item's exercise, in `locale`; null without one. */
	howToOf(item: PlannedItem, locale: Locale): string | null {
		return this.definitionOf(item)?.howTo?.[locale] ?? null;
	}
}
