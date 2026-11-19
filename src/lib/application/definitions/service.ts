import type {
	DefinitionFileRecord,
	DefinitionFileRepositoryPort,
	LoadMarkPort
} from '$lib/application/ports';
import {
	MAX_DEFINITION_FILE_CHARS,
	type RegisterResult,
	type Refusal
} from '$lib/domain/definitions';

/** What a load gave, the catalog's files apart from the imported ones. */
export interface LoadedDefinitions {
	catalog: RegisterResult;
	imported: RegisterResult;
}

/** An imported file as the last load read it. */
export interface ImportedFile {
	name: string;
	importedAt: number;
	/** What was registered of it, by kind, in the order read. */
	skills: string[];
	grids: string[];
	exercises: string[];
	refusals: Refusal[];
}

export interface DefinitionsService {
	/** Resolves once the imported files are read and registered. Never rejects. */
	ready(): Promise<void>;
	/** The imported files, by name. */
	files(): Promise<ImportedFile[]>;
	/** Stores each file under its name (replacing one of that name), reloads; the files as stored. A file too long is not stored: it comes back in `refused`. */
	import(
		files: readonly { name: string; text: string }[]
	): Promise<{ stored: ImportedFile[]; refused: Refusal[] }>;
	/** Removes the file and reloads. Stored progress is untouched. */
	remove(name: string): Promise<void>;
	/** Reads the table again and reloads (after a backup was imported). */
	reload(): Promise<void>;
	/** The refusals of the imported files at the last load; of the catalog too when `catalog` is true. */
	refusals(options?: { catalog?: boolean }): readonly Refusal[];
}

/** Where a refusal of the imported files as a whole points: no file of that name can be stored. */
const IMPORTED_FILES = 'imported files';

/** The refusal of a start whose last load of the imported files never finished. */
const UNFINISHED_LOAD: Refusal = {
	file: IMPORTED_FILES,
	kind: 'file',
	id: null,
	reason:
		'the last load of the imported files did not finish: they are not loaded this time. Remove the file added last if this happens again'
};

/**
 * The imported definition files: kept in `files`, registered through `load` (which empties the
 * registries, then fills them from the catalog and the files it is given). The table is read
 * once at `ready()`, again at `reload()` and after each change. `mark` is set around every load
 * of the imported files: found set at `ready()`'s read, the last load never finished, and that start
 * loads the catalog alone (the files listed, so that one can be removed), the next one trying again.
 */
export function createDefinitionsService(deps: {
	files: DefinitionFileRepositoryPort;
	load(imported: Readonly<Record<string, string>>): LoadedDefinitions;
	now(): number;
	mark: LoadMarkPort;
}): DefinitionsService {
	let stored: DefinitionFileRecord[] = [];
	let loaded: LoadedDefinitions | null = null;
	/** The refusal of the imported files as a whole at the last load (unread or not loaded), else null. */
	let whole: Refusal | null = null;
	let started: Promise<void> | null = null;

	/**
	 * Reads the table and loads its files; on a table that cannot be read, the catalog alone; at
	 * the read of `ready()` (`start`) after a load that never finished, the catalog alone too.
	 */
	const read = async (start = false) => {
		try {
			stored = await deps.files.all();
			whole = null;
		} catch (error) {
			stored = [];
			const message = error instanceof Error ? error.message : String(error);
			whole = {
				file: IMPORTED_FILES,
				kind: 'file',
				id: null,
				reason: `the imported files could not be read: ${message}`
			};
			console.error(`[imported] ${whole.reason}`);
		}
		if (start && deps.mark.isSet()) {
			deps.mark.clear();
			whole = UNFINISHED_LOAD;
			console.error(`[imported] ${whole.reason}`);
			loaded = deps.load({});
			return;
		}
		deps.mark.set();
		loaded = deps.load(Object.fromEntries(stored.map((file) => [file.name, file.text])));
		deps.mark.clear();
	};

	const describe = (file: DefinitionFileRecord): ImportedFile => {
		const imported = loaded?.imported ?? { registered: [], refusals: [] };
		const ids = (kind: 'skill' | 'grid' | 'exercise') =>
			imported.registered
				.filter((object) => object.file === file.name && object.kind === kind)
				.map((object) => object.id);
		return {
			name: file.name,
			importedAt: file.importedAt,
			skills: ids('skill'),
			grids: ids('grid'),
			exercises: ids('exercise'),
			refusals: imported.refusals.filter((refusal) => refusal.file === file.name)
		};
	};

	/** The service's operations, one after the other in the order asked; a failed one does not stop the next. */
	let queue: Promise<unknown> = Promise.resolve();
	const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
		const run = queue.then(operation);
		queue = run.catch(() => {});
		return run;
	};

	/**
	 * A change to the table, then a read of it whether the change went through or not, then what
	 * `told` says of the load, all in one operation.
	 */
	const changing = <T>(change: () => Promise<void>, told: () => T): Promise<T> =>
		enqueue(async () => {
			try {
				await change();
			} finally {
				await read();
			}
			return told();
		});

	/** What `ready()` resolves on: the first operation's read, never rejecting. */
	const settle = (run: Promise<unknown>) => {
		started ??= run.then(
			() => {},
			(error) => console.error('[imported] load failed', error)
		);
	};
	const ready = () => {
		if (started === null) settle(enqueue(() => read(true)));
		return started!;
	};
	/**
	 * An operation that reads the table itself: when it comes first, `ready()` resolves on it, so the
	 * table is read and loaded once, not once for `ready()` and once for it. Only `ready()`'s own read
	 * heeds the mark: an operation the player asks loads the files.
	 */
	const reading = <T>(run: Promise<T>): Promise<T> => {
		settle(run);
		return run;
	};

	return {
		ready,

		async files() {
			void ready();
			return enqueue(async () => stored.map(describe));
		},

		async import(files) {
			// Two files of one name in one call: the last one wins.
			const byName = new Map(files.map((file) => [file.name, file.text]));
			const refused: Refusal[] = [];
			const names: string[] = [];
			return reading(
				changing(
					async () => {
						for (const [name, text] of byName) {
							if (text.length > MAX_DEFINITION_FILE_CHARS) {
								refused.push({
									file: name,
									kind: 'file',
									id: null,
									reason: `the file is longer than ${MAX_DEFINITION_FILE_CHARS} characters`
								});
								continue;
							}
							await deps.files.put({ name, text, importedAt: deps.now() });
							names.push(name);
						}
					},
					() => ({
						stored: stored.filter((file) => names.includes(file.name)).map(describe),
						refused
					})
				)
			);
		},

		async remove(name) {
			await reading(
				changing(
					() => deps.files.delete(name),
					() => undefined
				)
			);
		},

		async reload() {
			await reading(enqueue(() => read()));
		},

		refusals(options = {}) {
			const imported = [...(whole ? [whole] : []), ...(loaded?.imported.refusals ?? [])];
			return options.catalog ? [...(loaded?.catalog.refusals ?? []), ...imported] : imported;
		}
	};
}
