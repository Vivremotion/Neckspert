import { definitionChecks } from '$lib/application/definitions/checks';
import { registerFiles, type Refusal } from '$lib/domain/definitions';

let refused: Refusal[] | null = null;

/** The console line of a refusal, `source` being where its file comes from. */
function refusalLine(source: string, { file, kind, id, reason }: Refusal): string {
	if (kind === 'file') return `[${source}] ${file} refused: ${reason}`;
	return `[${source}] ${file}, ${kind}${id === null ? '' : ` ${id}`} refused: ${reason}`;
}

/**
 * Fills the registries once: the catalog, then the local files. Each refusal goes to
 * `console.error`, as `[catalog] <file> …` or `[exercises.local] <file> …`. Called again, it
 * returns what the first call refused.
 */
export function loadDefinitions(input: {
	catalog: Readonly<Record<string, string>>;
	local?: Readonly<Record<string, string>>;
}): readonly Refusal[] {
	if (refused) return refused;
	const checks = definitionChecks();
	const sources: [string, Readonly<Record<string, string>> | undefined][] = [
		['catalog', input.catalog],
		['exercises.local', input.local]
	];
	refused = [];
	for (const [source, files] of sources) {
		if (!files) continue;
		for (const refusal of registerFiles(files, checks)) {
			console.error(refusalLine(source, refusal));
			refused.push(refusal);
		}
	}
	return refused;
}

/** What `loadDefinitions` refused, none before it ran. */
export function refusedDefinitions(): readonly Refusal[] {
	return refused ?? [];
}
