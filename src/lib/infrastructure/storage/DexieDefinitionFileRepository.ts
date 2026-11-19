import type { DefinitionFileRecord, DefinitionFileRepositoryPort } from '$lib/application/ports';
import type { NeckspertDb } from './db';

/** One row per imported definition file, keyed by its name. */
export class DexieDefinitionFileRepository implements DefinitionFileRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	/** The primary key is the name: the table reads in its order. */
	all(): Promise<DefinitionFileRecord[]> {
		return this.db.definitionFiles.toArray();
	}

	async put(file: DefinitionFileRecord): Promise<void> {
		await this.db.definitionFiles.put({ ...file });
	}

	async delete(name: string): Promise<void> {
		await this.db.definitionFiles.delete(name);
	}
}
