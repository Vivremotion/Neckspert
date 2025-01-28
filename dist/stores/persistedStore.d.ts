import type { Writable } from 'svelte/store';
declare const persistedStore: <T>(key: string, initValue: T) => Writable<T>;
export default persistedStore;
