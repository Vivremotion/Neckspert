import type { ChordInstance } from '$lib/domain/music';
import { durationToBeats } from '$lib/domain/music';
import type { NoteDuration } from '$lib/domain/music';

export interface BarChord {
	/** Stable ID of the source ChordInstance. */
	id: string;
	/** Display label: root + quality (e.g. "Dm"). */
	name: string;
	duration: NoteDuration;
	beats: number;
	/** Direct reference to the source instance, used in random mode to avoid name-based lookup. */
	instanceRef: ChordInstance;
}

export interface Bar {
	chords: BarChord[];
	totalBeats: number;
}

export const BEATS_PER_BAR = 4;

export function instanceToBarChord(instance: ChordInstance): BarChord {
	const { voicing, duration } = instance;
	const beats = durationToBeats(duration);
	const name = `${voicing.chord.root}${voicing.chord.quality}`;
	return {
		id: instance.id,
		name,
		duration,
		beats,
		instanceRef: instance
	};
}

export function groupIntoBars(instances: ChordInstance[], beatsPerBar = BEATS_PER_BAR): Bar[] {
	if (instances.length === 0) return [];

	const bars: Bar[] = [];
	let currentBarChords: BarChord[] = [];
	let currentBeats = 0;

	for (const instance of instances) {
		const bc = instanceToBarChord(instance);

		if (currentBeats + bc.beats > beatsPerBar && currentBarChords.length > 0) {
			bars.push({ chords: currentBarChords, totalBeats: currentBeats });
			currentBarChords = [];
			currentBeats = 0;
		}

		currentBarChords.push(bc);
		currentBeats += bc.beats;

		if (currentBeats >= beatsPerBar) {
			bars.push({ chords: currentBarChords, totalBeats: currentBeats });
			currentBarChords = [];
			currentBeats = 0;
		}
	}

	if (currentBarChords.length > 0) {
		bars.push({ chords: currentBarChords, totalBeats: currentBeats });
	}

	return bars;
}

export function findBarIndexForChord(bars: Bar[], instanceId: string): number {
	return bars.findIndex((bar) => bar.chords.some((c) => c.id === instanceId));
}

export function findChordIndexInBar(bar: Bar, instanceId: string): number {
	return bar.chords.findIndex((c) => c.id === instanceId);
}

export function generateRandomBar(
	availableInstances: ChordInstance[],
	beatsPerBar = BEATS_PER_BAR
): Bar {
	const barChords: BarChord[] = [];
	let remaining = beatsPerBar;

	while (remaining > 0 && availableInstances.length > 0) {
		const instance =
			availableInstances[Math.floor(Math.random() * availableInstances.length)];
		const bc = instanceToBarChord(instance);

		if (bc.beats <= remaining) {
			// Give the bar chord a fresh id so it can be independently tracked
			barChords.push({ ...bc, id: crypto.randomUUID() });
			remaining -= bc.beats;
		} else {
			break;
		}
	}

	if (barChords.length === 0 && availableInstances.length > 0) {
		const instance =
			availableInstances[Math.floor(Math.random() * availableInstances.length)];
		const bc = instanceToBarChord(instance);
		barChords.push({ ...bc, id: crypto.randomUUID() });
	}

	const totalBeats = barChords.reduce((sum, c) => sum + c.beats, 0);
	return { chords: barChords, totalBeats };
}
