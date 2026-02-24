import type { Chord } from '$lib/models';
import { getChordBeats, getChordDuration } from '$lib/models';
import type { NoteDuration } from '$lib/models';

export interface BarChord {
	id: string;
	name: string;
	duration: NoteDuration;
	beats: number;
}

export interface Bar {
	chords: BarChord[];
	totalBeats: number;
}

export const BEATS_PER_BAR = 4;

export function chordToBarChord(chord: Chord): BarChord {
	return {
		id: chord.id!,
		name: `${chord.root}${chord.quality}`,
		duration: getChordDuration(chord),
		beats: getChordBeats(chord)
	};
}

export function groupIntoBars(chords: Chord[], beatsPerBar = BEATS_PER_BAR): Bar[] {
	if (chords.length === 0) return [];

	const bars: Bar[] = [];
	let currentBarChords: BarChord[] = [];
	let currentBeats = 0;

	for (const chord of chords) {
		const bc = chordToBarChord(chord);

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

export function findBarIndexForChord(bars: Bar[], chordId: string): number {
	return bars.findIndex((bar) => bar.chords.some((c) => c.id === chordId));
}

export function findChordIndexInBar(bar: Bar, chordId: string): number {
	return bar.chords.findIndex((c) => c.id === chordId);
}

export function generateRandomBar(
	availableChords: Chord[],
	beatsPerBar = BEATS_PER_BAR
): Bar {
	const barChords: BarChord[] = [];
	let remaining = beatsPerBar;

	while (remaining > 0 && availableChords.length > 0) {
		const chord = availableChords[Math.floor(Math.random() * availableChords.length)];
		const bc = chordToBarChord(chord);

		if (bc.beats <= remaining) {
			barChords.push({ ...bc, id: crypto.randomUUID() });
			remaining -= bc.beats;
		} else {
			break;
		}
	}

	if (barChords.length === 0 && availableChords.length > 0) {
		const chord = availableChords[Math.floor(Math.random() * availableChords.length)];
		const bc = chordToBarChord(chord);
		barChords.push({ ...bc, id: crypto.randomUUID() });
	}

	const totalBeats = barChords.reduce((sum, c) => sum + c.beats, 0);
	return { chords: barChords, totalBeats };
}
