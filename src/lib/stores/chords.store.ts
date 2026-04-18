import type { ChordInstance, Voicing, NoteDuration } from '$lib/domain/music';
import { DEFAULT_DURATION, durationToBeats, beatsToDuration } from '$lib/domain/music';
import { shapesByQuality } from '$lib/data/chordPositions';
import type { PitchName } from '$lib/domain/music';
import type { Shape } from '$lib/domain/music';
import persistedStore from './persistedStore.js';

// ─── State ────────────────────────────────────────────────────────────────────

export interface ProgressionState {
	instances: ChordInstance[];
	currentInstance?: ChordInstance;
	currentInstanceIndex?: number;
}

function findShapeForLegacy(quality: string, oldVoicing: string | undefined): Shape | undefined {
	const shapes = shapesByQuality[quality];
	if (!shapes || shapes.length === 0) return undefined;

	// CAGED positions stored as 'C' | 'A' | 'G' | 'E' | 'D'
	const CAGED = ['C', 'A', 'G', 'E', 'D'] as const;
	if (oldVoicing && (CAGED as readonly string[]).includes(oldVoicing)) {
		return shapes.find((s) => s.anchor.referencePitch === (oldVoicing as PitchName)) ?? shapes[0];
	}

	// Non-CAGED patterns: fallback to first shape
	return shapes[0];
}




// ─── Store factory ────────────────────────────────────────────────────────────

function createProgressionStore() {
	const persisted = persistedStore<ProgressionState>('chordsState', { instances: [] });
	const { subscribe, update } = persisted;

	return {
		subscribe,

		addInstance(voicing: Voicing): void {
			const instance: ChordInstance = {
				id: crypto.randomUUID(),
				voicing,
				duration: DEFAULT_DURATION
			};
			update((state) => ({
				...state,
				currentInstance: instance,
				currentInstanceIndex: state.instances.length,
				instances: [...state.instances, instance]
			}));
		},

		removeInstance(id: string): void {
			update((state) => {
				const updated = state.instances.filter((i) => i.id !== id);
				const wasCurrent = state.currentInstance?.id === id;
				return {
					...state,
					instances: updated,
					currentInstance: wasCurrent ? updated.at(-1) : state.currentInstance,
					currentInstanceIndex: wasCurrent ? updated.length - 1 : state.currentInstanceIndex
				};
			});
		},

		reorderInstances(fromIndex: number, toIndex: number): void {
			update((state) => {
				const reordered = [...state.instances];
				const [removed] = reordered.splice(fromIndex, 1);
				reordered.splice(toIndex, 0, removed);
				return { ...state, instances: reordered };
			});
		},

		setCurrentInstance(id: string): void {
			update((state) => ({
				...state,
				currentInstance: state.instances.find((i) => i.id === id),
				currentInstanceIndex: state.instances.findIndex((i) => i.id === id)
			}));
		},

		setInstanceDuration(id: string, duration: NoteDuration): void {
			update((state) => ({
				...state,
				instances: state.instances.map((i) => (i.id === id ? { ...i, duration } : i)),
				currentInstance:
					state.currentInstance?.id === id
						? { ...state.currentInstance, duration }
						: state.currentInstance
			}));
		}
	};
}

export const progressionStore = createProgressionStore();
