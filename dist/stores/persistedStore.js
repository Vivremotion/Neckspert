import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
const persistedStore = (key, initValue) => {
    const store = writable(initValue);
    if (!browser)
        return store;
    const storedValueStr = localStorage.getItem(key);
    if (storedValueStr != null)
        store.set(JSON.parse(storedValueStr));
    store.subscribe((value) => {
        if (!value) {
            localStorage.removeItem(key);
        }
        else {
            localStorage.setItem(key, JSON.stringify(value));
        }
    });
    return store;
};
export default persistedStore;
