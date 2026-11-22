import { describe, expect, it } from 'vitest';
import { LOAD_MARK_KEY, LocalStorageLoadMark } from './LocalStorageLoadMark';

/** A storage of strings in memory, as `localStorage` is. */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
	const values = new Map<string, string>();
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value),
		removeItem: (key) => void values.delete(key)
	};
}

describe('LocalStorageLoadMark', () => {
	it('keeps the mark under its key until cleared', () => {
		expect(LOAD_MARK_KEY).toBe('neckspert:definitions-loading');
		const storage = memoryStorage();
		const mark = new LocalStorageLoadMark(() => storage);
		expect(mark.isSet()).toBe(false);
		mark.set();
		expect(storage.getItem(LOAD_MARK_KEY)).not.toBeNull();
		expect(new LocalStorageLoadMark(() => storage).isSet()).toBe(true);
		mark.clear();
		expect(mark.isSet()).toBe(false);
		expect(storage.getItem(LOAD_MARK_KEY)).toBeNull();
	});

	it('behaves as never set when the storage is absent or throws', () => {
		const throwing = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			},
			removeItem: () => {
				throw new Error('denied');
			}
		};
		for (const storage of [
			() => undefined,
			() => {
				throw new Error('denied');
			},
			() => throwing
		]) {
			const mark = new LocalStorageLoadMark(storage);
			expect(() => mark.set()).not.toThrow();
			expect(mark.isSet()).toBe(false);
			expect(() => mark.clear()).not.toThrow();
		}
	});

	it('reads the page’s localStorage by default, absent here', () => {
		expect(new LocalStorageLoadMark().isSet()).toBe(false);
	});
});
