import { browser } from '$app/environment';
import type { Writable } from 'svelte/store';
import { writable, get } from 'svelte/store'

const persistedStore = <T>(key: string, initValue: T): Writable<T> => {
    const store = writable(initValue);
    if (!browser) return store;

    const storedValueStr = localStorage.getItem(key);
    if (storedValueStr != null) store.set(JSON.parse(storedValueStr));

    store.subscribe((value) => {
        if (!value) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(value))
        }
    });

    return store;
}

export default persistedStore;