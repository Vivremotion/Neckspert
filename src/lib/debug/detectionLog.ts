import { pitchOfMidi, type Midi } from '$lib/domain/music/types';

/** Browser traces for pitch detection and locate judgement. Silent under Vitest. */
export function logDetection(title: string, lines: readonly string[]): void {
	if (import.meta.env?.MODE === 'test') return;
	console.info([`[neckspert] ${title}`, ...lines.map((line) => `  ${line}`)].join('\n'));
}

/** A4 = 440 Hz, MIDI 69. */
export function midiToFrequency(midi: number): number {
	return 440 * 2 ** ((midi - 69) / 12);
}

function frequencyToExactMidi(frequencyHz: number): number {
	return 69 + 12 * Math.log2(frequencyHz / 440);
}

/** Scientific pitch with octave: MIDI 40 → E2. */
export function noteWithOctave(midi: number): string {
	const rounded = Math.round(midi);
	const octave = Math.floor(rounded / 12) - 1;
	return `${pitchOfMidi(rounded)}${octave}`;
}

export function signedCents(cents: number): string {
	const rounded = Math.round(cents);
	return rounded > 0 ? `+${rounded} ¢` : `${rounded} ¢`;
}

/** Heard frequency against the nearest MIDI note, before guitar-range clamping. */
export function describeFrequency(frequencyHz: number): string {
	if (!(frequencyHz > 0) || !Number.isFinite(frequencyHz)) return 'aucune fréquence';
	const exact = frequencyToExactMidi(frequencyHz);
	const midi = Math.round(exact);
	const cents = (exact - midi) * 100;
	return `${frequencyHz.toFixed(2)} Hz → ${noteWithOctave(midi)} (MIDI ${midi}, ${signedCents(cents)})`;
}

export function describeReading(
	reading: { frequencyHz: number; clarity: number },
	clarityThreshold: number
): string {
	const passes = reading.frequencyHz > 0 && reading.clarity >= clarityThreshold;
	const pitch =
		reading.frequencyHz > 0 ? describeFrequency(reading.frequencyHz) : 'fréquence invalide';
	const gate = passes ? 'au-dessus du seuil' : `sous le seuil ${clarityThreshold}`;
	return `${pitch}, clarté ${reading.clarity.toFixed(2)} (${gate})`;
}

/** Signed cents of `frequencyHz` relative to `midi`. Positive means sharp. */
export function detuneCents(frequencyHz: number, midi: number): number {
	return 1200 * Math.log2(frequencyHz / midiToFrequency(midi));
}

export function nearestAcceptable(
	frequencyHz: number,
	acceptable: readonly Midi[]
): { midi: Midi; cents: number } | null {
	if (!(frequencyHz > 0) || acceptable.length === 0) return null;
	let best = acceptable[0];
	let bestCents = detuneCents(frequencyHz, best);
	for (const midi of acceptable) {
		const cents = detuneCents(frequencyHz, midi);
		if (Math.abs(cents) < Math.abs(bestCents)) {
			best = midi;
			bestCents = cents;
		}
	}
	return { midi: best, cents: bestCents };
}

export function describeAcceptable(acceptable: readonly Midi[]): string {
	if (acceptable.length === 0) return 'aucune';
	return acceptable
		.map((midi) => `${noteWithOctave(midi)} MIDI ${midi} (${midiToFrequency(midi).toFixed(2)} Hz)`)
		.join(', ');
}
