import { directRecallOf, type DirectRecall } from '../learning/recall';
import { skillById } from '../skill/registry';
import type { ExerciseDefinition } from './types';

/** The direct recall of the skill an exercise practises; throws when the skill writes none. */
export function exerciseRecallOf(definition: ExerciseDefinition): DirectRecall {
	const recall = directRecallOf(skillById(definition.practices));
	if (recall === null) {
		throw new Error(
			`the ${definition.id} exercise practises ${definition.practices}, which writes no direct recall`
		);
	}
	return recall;
}
