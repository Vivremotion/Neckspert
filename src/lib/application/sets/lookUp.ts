import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { hasSkill, skillById } from '$lib/domain/skill/registry';
import type { SetPresenter } from './types';

/** Presenters by set id, and by view for the exercises a view presents (D6). */
export interface PresenterRegistries {
	presenters: Readonly<Record<string, SetPresenter>>;
	views: Readonly<Record<string, SetPresenter>>;
}

/**
 * The presenter an exercise finds in `registries`: its view's, else its skill's set's; undefined
 * when none. It listens with the sensors its round names, the set's where it names none (D5).
 */
export function lookUpPresenter(
	definition: ExerciseDefinition,
	{ presenters, views }: PresenterRegistries
): SetPresenter | undefined {
	const { view } = definition;
	const set = hasSkill(definition.practices) ? skillById(definition.practices).items : null;
	const found =
		view !== undefined && Object.hasOwn(views, view)
			? views[view]
			: set !== null && Object.hasOwn(presenters, set)
				? presenters[set]
				: undefined;
	if (!found) return undefined;
	const sensors = [...new Set(definition.round?.expectations.map((entry) => entry.sensor) ?? [])];
	return sensors.length > 0 ? { ...found, sensors } : found;
}

/** The presenter an exercise finds in `registries`; throws, naming the set and the skill, when none. */
export function requirePresenter(
	definition: ExerciseDefinition,
	registries: PresenterRegistries
): SetPresenter {
	const found = lookUpPresenter(definition, registries);
	if (found) return found;
	const set = hasSkill(definition.practices) ? skillById(definition.practices).items : '?';
	throw new Error(`No presenter for the item set "${set}" of skill "${definition.practices}"`);
}
