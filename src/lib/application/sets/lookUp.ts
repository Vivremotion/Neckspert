import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { hasSkill, skillById } from '$lib/domain/skill/registry';
import type { SetPresenter } from './types';

/**
 * Presenters by set id, and by view: a set with more than one presenter (the link's placed
 * voicings, which the sequence's figures present too) has the others found by the view.
 */
export interface PresenterRegistries {
	presenters: Readonly<Record<string, SetPresenter>>;
	views: Readonly<Record<string, SetPresenter>>;
}

/**
 * The presenter an exercise finds in `registries`: the one registered for its view when it
 * presents its skill's set, else its set's; undefined when none. It listens with the sensors
 * its round names, the set's where it names none (D5).
 */
export function lookUpPresenter(
	definition: ExerciseDefinition,
	{ presenters, views }: PresenterRegistries
): SetPresenter | undefined {
	const { view } = definition;
	const set = hasSkill(definition.practices) ? skillById(definition.practices).items : null;
	const byView = view !== undefined && Object.hasOwn(views, view) ? views[view] : undefined;
	const found =
		byView !== undefined && byView.set.id === set
			? byView
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
