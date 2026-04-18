import type { ChordInstance } from '$lib/domain/music';

export interface ChordsStateSnapshot {
	readonly instances: ChordInstance[];
	readonly currentInstance?: ChordInstance;
}

/**
 * Driven port: provides progression state and allows setting the current instance.
 */
export interface ChordsStatePort {
	subscribe(listener: (state: ChordsStateSnapshot) => void): void;
	setCurrentChord(instanceId: string): void;
}
