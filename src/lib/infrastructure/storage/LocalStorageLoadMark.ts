import type { LoadMarkPort } from '$lib/application/ports';

export const LOAD_MARK_KEY = 'neckspert:definitions-loading';

type MarkStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The load mark in `localStorage`, kept across page loads. A storage that is absent or throws
 * (private browsing, blocked site data) is a mark never set: the guard is lost, never the start.
 */
export class LocalStorageLoadMark implements LoadMarkPort {
	constructor(
		private readonly storage: () => MarkStorage | undefined = () => globalThis.localStorage
	) {}

	set(): void {
		this.attempt((storage) => storage.setItem(LOAD_MARK_KEY, String(Date.now())));
	}

	clear(): void {
		this.attempt((storage) => storage.removeItem(LOAD_MARK_KEY));
	}

	isSet(): boolean {
		return this.attempt((storage) => storage.getItem(LOAD_MARK_KEY) !== null) ?? false;
	}

	private attempt<T>(use: (storage: MarkStorage) => T): T | undefined {
		try {
			const storage = this.storage();
			return storage === undefined ? undefined : use(storage);
		} catch {
			return undefined;
		}
	}
}
