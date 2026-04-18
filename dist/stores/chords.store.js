import { DEFAULT_DURATION, durationToBeats, beatsToDuration } from '../domain/music';
import { shapesByQuality } from '../data/chordPositions';
import { normalizePitch } from '../domain/music';
import { shapeToVoicing } from '../domain/music';
import persistedStore from './persistedStore.js';
function findShapeForLegacy(quality, oldVoicing) {
    const shapes = shapesByQuality[quality];
    if (!shapes || shapes.length === 0)
        return undefined;
    // CAGED positions stored as 'C' | 'A' | 'G' | 'E' | 'D'
    const CAGED = ['C', 'A', 'G', 'E', 'D'];
    if (oldVoicing && CAGED.includes(oldVoicing)) {
        return shapes.find((s) => s.anchor.referencePitch === oldVoicing) ?? shapes[0];
    }
    // Non-CAGED patterns: fallback to first shape
    return shapes[0];
}
function migrateOldChord(old) {
    const root = normalizePitch(old.root);
    const quality = old.quality ?? '';
    const displayRoot = old.displayRoot;
    const shape = findShapeForLegacy(quality, old.voicing);
    const voicing = shape
        ? shapeToVoicing(shape, { root, quality }, displayRoot)
        : {
            id: `${root}${quality}-unknown`,
            chord: { root, quality },
            shape: {
                id: 'unknown',
                label: old.voicing ?? 'unknown',
                positions: [],
                anchor: { fret: 0, referencePitch: root }
            },
            baseFret: 0,
            positions: [],
            pitches: [],
            hpcp: new Array(12).fill(0),
            displayRoot
        };
    const duration = old.duration ?? (old.beats ? beatsToDuration(old.beats) : DEFAULT_DURATION);
    return {
        id: old.id ?? crypto.randomUUID(),
        voicing,
        duration
    };
}
function migrateState(raw) {
    // Already migrated
    if (raw.instances !== undefined) {
        return {
            instances: raw.instances,
            currentInstance: raw.currentInstance,
            currentInstanceIndex: raw.currentInstanceIndex
        };
    }
    // Old format: convert chords → instances
    const instances = (raw.chords ?? []).map(migrateOldChord);
    const currentIdx = raw.currentChordIndex ?? 0;
    return {
        instances,
        currentInstance: instances[currentIdx],
        currentInstanceIndex: instances.length > 0 ? currentIdx : undefined
    };
}
// ─── Store factory ────────────────────────────────────────────────────────────
function createProgressionStore() {
    const persisted = persistedStore('chordsState', { instances: [] });
    const { subscribe, update } = persisted;
    // Migrate persisted data on first load
    update((raw) => migrateState(raw));
    return {
        subscribe,
        addInstance(voicing) {
            const instance = {
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
        removeInstance(id) {
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
        reorderInstances(fromIndex, toIndex) {
            update((state) => {
                const reordered = [...state.instances];
                const [removed] = reordered.splice(fromIndex, 1);
                reordered.splice(toIndex, 0, removed);
                return { ...state, instances: reordered };
            });
        },
        setCurrentInstance(id) {
            update((state) => ({
                ...state,
                currentInstance: state.instances.find((i) => i.id === id),
                currentInstanceIndex: state.instances.findIndex((i) => i.id === id)
            }));
        },
        setInstanceDuration(id, duration) {
            update((state) => ({
                ...state,
                instances: state.instances.map((i) => (i.id === id ? { ...i, duration } : i)),
                currentInstance: state.currentInstance?.id === id
                    ? { ...state.currentInstance, duration }
                    : state.currentInstance
            }));
        }
    };
}
export const progressionStore = createProgressionStore();
/**
 * Alias kept for backward compatibility during migration.
 * Components should be updated to use progressionStore directly.
 */
export const chordStore = progressionStore;
