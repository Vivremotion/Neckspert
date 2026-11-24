/**
 * Keys a definition file could write before issue #19, which nothing reads any more. A file that
 * still writes one is refused with what to write instead, rather than played without it.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The keys of `params.learning` that are gone, with nothing to write in their place. */
const RETIRED_LEARNING = ['presentAtOnce', 'aidFadeSuccesses'];

const AIDED_ADVICE =
	'presentation.aided is no longer read: write "presentation.detail" or "presentation.picture" in the params of the level that shows it';
const FADING_ADVICE =
	'presentation.fading is no longer read: no aid comes back after a miss; write "presentation.picture" in the params of the level that draws it';
const ANTI_BLOCKING_ADVICE =
	'flow.antiBlocking is no longer read: nothing is triggered after failures; a level says what it shows and plays, and its "drop" when the player leaves it';
const LISTEN_ADVICE = 'listen "aid" is no longer read: write "free"';

/** The advice for a retired slot of the presentation a level writes at `path`; null for any other. */
function presentationPathProblem(path: string, value: unknown): string | null {
	const within = (slot: string) => path === slot || path.startsWith(`${slot}.`);
	if (within('presentation.aided')) return AIDED_ADVICE;
	if (within('presentation.fading')) return FADING_ADVICE;
	// The whole presentation written at once: its slots are those of the root.
	if (path === 'presentation' && isRecord(value)) {
		if (Object.hasOwn(value, 'aided')) return AIDED_ADVICE;
		if (Object.hasOwn(value, 'fading')) return FADING_ADVICE;
	}
	return null;
}

/** The levels a definition writes, each list with the path that names it. */
function levelLists(
	definition: Record<string, unknown>,
	params: Record<string, unknown>
): [string, unknown[]][] {
	const lists: [string, unknown[]][] = [];
	if (Array.isArray(definition.levels)) lists.push(['levels', definition.levels]);
	if (Array.isArray(params.ladder)) lists.push(['params.ladder', params.ladder]);
	if (isRecord(params.ladders)) {
		for (const [mechanic, ladder] of Object.entries(params.ladders)) {
			if (Array.isArray(ladder)) lists.push([`params.ladders.${mechanic}`, ladder]);
		}
	}
	return lists;
}

/** Why a level writes a retired param, naming it; null when none of its levels does. */
function levelProblem(
	definition: Record<string, unknown>,
	params: Record<string, unknown>
): string | null {
	for (const [name, levels] of levelLists(definition, params)) {
		for (const [index, level] of levels.entries()) {
			if (!isRecord(level) || !isRecord(level.params)) continue;
			for (const [path, value] of Object.entries(level.params)) {
				const advice = presentationPathProblem(path, value);
				if (advice) return `${name}[${index}].params["${path}"]: ${advice}`;
			}
			if (level.params.listen === 'aid') return `${name}[${index}].params.${LISTEN_ADVICE}`;
		}
	}
	return null;
}

/** Why the definition writes a retired key, and what to write instead; null when it writes none. */
export function retiredProblem(definition: unknown): string | null {
	if (!isRecord(definition)) return null;
	const params = isRecord(definition.params) ? definition.params : {};
	if (Array.isArray(params.ladder)) {
		for (const [index, level] of params.ladder.entries()) {
			if (isRecord(level) && isRecord(level.params) && Object.hasOwn(level.params, 'aided')) {
				return `params.ladder[${index}].params.aided is no longer read: write what the level shows in the level, e.g. "presentation.detail" or "presentation.picture"`;
			}
		}
	}
	const presentation = definition.presentation;
	if (isRecord(presentation)) {
		if (Object.hasOwn(presentation, 'aided')) return AIDED_ADVICE;
		if (Object.hasOwn(presentation, 'fading')) return FADING_ADVICE;
	}
	if (isRecord(params.learning)) {
		const key = RETIRED_LEARNING.find((name) => Object.hasOwn(params.learning as object, name));
		if (key !== undefined) return `params.learning.${key} is no longer read: remove it`;
	}
	if (isRecord(definition.flow) && Object.hasOwn(definition.flow, 'antiBlocking')) {
		return ANTI_BLOCKING_ADVICE;
	}
	if (params.listen === 'aid') return `params.${LISTEN_ADVICE}`;
	return levelProblem(definition, params);
}
