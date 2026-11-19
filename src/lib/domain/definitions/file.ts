import { exerciseFromJson, type ExerciseDefinition } from '$lib/domain/exercise';
import { gridFromJson, type ChordGrid } from '$lib/domain/grid';
import { routineFromJson, type RoutineDefinition } from '$lib/domain/routine';
import { skillFromJson, type SkillDefinition } from '$lib/domain/skill';

/** The version of the definition file format; unstable until it moves off 0. */
export const DEFINITION_FORMAT = 0;
export const MAX_DEFINITION_FILE_CHARS = 1_000_000;

export type DefinitionKind = 'file' | 'skill' | 'grid' | 'exercise' | 'routine';

/** What an author reads to fix a file. `id` is null when the entry has none (or the file as a whole is refused). */
export interface Refusal {
	file: string;
	kind: DefinitionKind;
	id: string | null;
	reason: string;
}

export interface DefinitionFile {
	skills: SkillDefinition[];
	grids: ChordGrid[];
	exercises: ExerciseDefinition[];
	routines: RoutineDefinition[];
	refusals: Refusal[];
}

const LISTS = ['skills', 'grids', 'exercises', 'routines'] as const;
const KEYS: readonly string[] = ['format', ...LISTS];

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function idOf(entry: unknown): string | null {
	if (!isObject(entry)) return null;
	return typeof entry.id === 'string' && entry.id !== '' ? entry.id : null;
}

/** Reads each entry of a list; the first of two entries with one id is kept. */
function readEntries<T>(
	file: string,
	kind: Exclude<DefinitionKind, 'file'>,
	entries: unknown[],
	read: (entry: unknown) => T,
	refusals: Refusal[]
): T[] {
	const kept: T[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const id = idOf(entry);
		if (id !== null && seen.has(id)) {
			refusals.push({ file, kind, id, reason: 'this id is used twice in the file' });
			continue;
		}
		try {
			kept.push(read(entry));
			if (id !== null) seen.add(id);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			refusals.push({ file, kind, id, reason });
		}
	}
	return kept;
}

/** The first problem that makes the whole file unreadable, if any. */
function fileProblem(text: string): { problem: string } | { json: Record<string, unknown> } {
	if (text.length > MAX_DEFINITION_FILE_CHARS) {
		return { problem: `the file is longer than ${MAX_DEFINITION_FILE_CHARS} characters` };
	}
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error) {
		return { problem: `the file is not JSON: ${(error as Error).message}` };
	}
	if (!isObject(json)) {
		return {
			problem: 'the file must be a JSON object { format, skills, grids, exercises, routines }'
		};
	}
	if (json.format !== DEFINITION_FORMAT) {
		return { problem: `format must be ${DEFINITION_FORMAT}, got ${JSON.stringify(json.format)}` };
	}
	const unknown = Object.keys(json).find((key) => !KEYS.includes(key));
	if (unknown !== undefined) return { problem: `unknown key "${unknown}"` };
	for (const key of LISTS) {
		if (json[key] !== undefined && !Array.isArray(json[key])) {
			return { problem: `${key} must be a list` };
		}
	}
	return { json };
}

/** Never throws. A `file` refusal means nothing of the file was read. */
export function readDefinitionFile(file: string, text: string): DefinitionFile {
	const checked = fileProblem(text);
	if ('problem' in checked) {
		return {
			skills: [],
			grids: [],
			exercises: [],
			routines: [],
			refusals: [{ file, kind: 'file', id: null, reason: checked.problem }]
		};
	}
	const { json } = checked;
	const refusals: Refusal[] = [];
	const skills = readEntries(
		file,
		'skill',
		(json.skills as unknown[]) ?? [],
		skillFromJson,
		refusals
	);
	const grids = readEntries(file, 'grid', (json.grids as unknown[]) ?? [], gridFromJson, refusals);
	const exercises = readEntries(
		file,
		'exercise',
		(json.exercises as unknown[]) ?? [],
		exerciseFromJson,
		refusals
	);
	const routines = readEntries(
		file,
		'routine',
		(json.routines as unknown[]) ?? [],
		routineFromJson,
		refusals
	);
	return { skills, grids, exercises, routines, refusals };
}
