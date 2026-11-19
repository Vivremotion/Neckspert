/** Ids a skill or an exercise may not take: the code uses them for what is unknown. */
export const RESERVED_IDS = ['unknown'] as const;

/**
 * Ids an exercise may not take: `unknown`, and the old ids of the eight exercises version 13 of
 * the database renamed (`EXERCISE_IDS_V13`, a tripwire test beside it), which a backup refuses
 * on attempts and sessions: progress played under one could not be imported again.
 */
export const RESERVED_EXERCISE_IDS: readonly string[] = Object.freeze([
	...RESERVED_IDS,
	'locate-neck',
	'identify-neck',
	'triads-anchor',
	'triads-zone',
	'gesture-link',
	'gesture-climb',
	'gesture-zone',
	'gesture-jam'
]);

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** `id` itself when it may name a definition; throws the reason otherwise. */
export function checkedId(id: unknown, options: { reserved?: readonly string[] } = {}): string {
	const problem = idProblem(id, options);
	if (problem !== null || typeof id !== 'string') throw new Error(problem ?? 'id must be a string');
	return id;
}

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
