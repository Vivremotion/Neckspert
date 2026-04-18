import type { ChordInstance, Voicing, NoteDuration } from '../domain/music';
export interface ProgressionState {
    instances: ChordInstance[];
    currentInstance?: ChordInstance;
    currentInstanceIndex?: number;
}
export declare const progressionStore: {
    subscribe: (this: void, run: import("svelte/store").Subscriber<ProgressionState>, invalidate?: () => void) => import("svelte/store").Unsubscriber;
    addInstance(voicing: Voicing): void;
    removeInstance(id: string): void;
    reorderInstances(fromIndex: number, toIndex: number): void;
    setCurrentInstance(id: string): void;
    setInstanceDuration(id: string, duration: NoteDuration): void;
};
/**
 * Alias kept for backward compatibility during migration.
 * Components should be updated to use progressionStore directly.
 */
export declare const chordStore: {
    subscribe: (this: void, run: import("svelte/store").Subscriber<ProgressionState>, invalidate?: () => void) => import("svelte/store").Unsubscriber;
    addInstance(voicing: Voicing): void;
    removeInstance(id: string): void;
    reorderInstances(fromIndex: number, toIndex: number): void;
    setCurrentInstance(id: string): void;
    setInstanceDuration(id: string, duration: NoteDuration): void;
};
