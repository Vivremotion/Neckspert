import { definitionChecks } from '$lib/application/definitions/checks';
import type { LoadedDefinitions } from '$lib/application/definitions/service';
import { registerFiles, type RegisterResult, type Refusal } from '$lib/domain/definitions';
import { clearExercises } from '$lib/domain/exercise/registry';
import { clearGrids } from '$lib/domain/grid/registry';
import { clearRoutines } from '$lib/domain/routine/registry';
import { clearSkills } from '$lib/domain/skill/registry';

export type { LoadedDefinitions };

let loaded: LoadedDefinitions | null = null;

/** The console line of a refusal, `source` being where its file comes from. */
function refusalLine(source: string, { file, kind, id, reason }: Refusal): string {
	if (kind === 'file') return `[${source}] ${file} refused: ${reason}`;
	return `[${source}] ${file}, ${kind}${id === null ? '' : ` ${id}`} refused: ${reason}`;
}

/**
 * Empties the registries, then fills them: the catalog, then the imported files. Each refusal
 * goes to `console.error`, as `[catalog] <file> …` or `[imported] <file> …`. Never throws.
 */
export function loadDefinitions(input: {
	catalog: Readonly<Record<string, string>>;
	imported?: Readonly<Record<string, string>>;
}): LoadedDefinitions {
	const checks = definitionChecks();
	clearSkills();
	clearGrids();
	clearExercises();
	clearRoutines();
	const read = (source: string, files: Readonly<Record<string, string>>): RegisterResult => {
		const result = registerFiles(files, checks);
		for (const refusal of result.refusals) console.error(refusalLine(source, refusal));
		return result;
	};
	const catalog = read('catalog', input.catalog);
	const imported = read('imported', input.imported ?? {});
	loaded = { catalog, imported };
	return loaded;
}

/** The last load; null before any. */
export function loadedDefinitions(): LoadedDefinitions | null {
	return loaded;
}
