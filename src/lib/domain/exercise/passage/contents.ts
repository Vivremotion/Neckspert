import type { MemberContent } from '../../judges';
import type { PlannedItem } from '../../types';
import { roundParamsOf } from '../round/compile';
import { isFigureEntry } from '../round/types';
import { compileSelection } from '../selection/compile';
import { isSelectionTemplate, type SelectionTemplate } from '../selection/types';
import type { ExerciseDefinition } from '../types';

/** A member content of a round, with the selection its template writes. */
export interface RoundMemberContent {
	content: MemberContent;
	template: SelectionTemplate;
}

/**
 * The member contents the round of `item` judges, one per expectation whose content is a
 * selection, compiled as `compileRound` compiles them (its params at the item's levels, its
 * passage's params and values, its previous member); with `filters: false`, each selection's
 * filters left out (every member its order and take admit). Throws as `compileSelection` does.
 */
export function roundMemberContents(
	definition: ExerciseDefinition,
	item: PlannedItem,
	options: { filters?: boolean } = {}
): RoundMemberContent[] {
	const params = roundParamsOf(definition, item, { previewBeats: 0 });
	return (definition.round?.expectations ?? []).flatMap((expectation) => {
		if (isFigureEntry(expectation) || !isSelectionTemplate(expectation.content)) return [];
		const written = expectation.content;
		const { where: _where, ...unfiltered } = written;
		const template = options.filters === false ? unfiltered : written;
		return [{ content: compileSelection(definition, item, template, params), template: written }];
	});
}
