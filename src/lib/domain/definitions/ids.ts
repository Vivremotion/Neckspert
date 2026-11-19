/** Ids a skill or an exercise may not take: the code uses them for what is unknown. */
export const RESERVED_IDS = ['unknown'] as const;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Null when `id` may name a skill, a grid or an exercise; else why not. */
export function idProblem(
	id: unknown,
	options: { reserved?: readonly string[] } = {}
): string | null {
	if (typeof id !== 'string' || id === '') return 'id must be a string, not empty';
	if (!ID_PATTERN.test(id)) {
		return 'id must be made of letters, digits, "-", "_" or ".", and start with a letter or a digit';
	}
	if (options.reserved?.includes(id)) return `id "${id}" is reserved`;
	return null;
}
