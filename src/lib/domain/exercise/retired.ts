/**
 * Keys a definition file could write before issue #19, which nothing reads any more. A file that
 * still writes one is refused with what to write instead, rather than played without it.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The keys of `params.learning` that are gone, with nothing to write in their place. */
const RETIRED_LEARNING = ['presentAtOnce', 'aidFadeSuccesses'];

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
		if (Object.hasOwn(presentation, 'aided')) {
			return 'presentation.aided is no longer read: write "presentation.detail" or "presentation.picture" in the params of the level that shows it';
		}
		if (Object.hasOwn(presentation, 'fading')) {
			return 'presentation.fading is no longer read: no aid comes back after a miss; write "presentation.picture" in the params of the level that draws it';
		}
	}
	if (isRecord(params.learning)) {
		const key = RETIRED_LEARNING.find((name) => Object.hasOwn(params.learning as object, name));
		if (key !== undefined) return `params.learning.${key} is no longer read: remove it`;
	}
	return null;
}
