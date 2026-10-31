import { describe, expect, it } from 'vitest';
import type { NoteOnset, NoteRejection } from '$lib/application/ports';
import { AttackTracker } from '../attacks/AttackTracker';
import { readWav } from '../chords/testing/wav';
import { DEFAULT_DETECTOR_CONFIG } from './config';
import { NoteTracker } from './NoteTracker';

/** Each WAV as a base64 data URL, through Vite: no file system access in the spec. */
const WAVS = import.meta.glob<string>('../attacks/fixtures/*.wav', {
	query: '?inline',
	import: 'default',
	eager: true
});

/** The rate the app reads at; the fixtures, cut from the journal, are at 16 kHz. */
const RATE = 48000;
const FRAME = 512;

function played(file: string): Float32Array {
	const url = WAVS[`../attacks/fixtures/${file}`];
	const binary = atob(url.slice(url.indexOf(',') + 1));
	const { sampleRate, samples } = readWav(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
	const out = new Float32Array(Math.floor((samples.length * RATE) / sampleRate));
	for (let i = 0; i < out.length; i++) {
		const at = (i * sampleRate) / RATE;
		const first = Math.floor(at);
		const part = at - first;
		out[i] = samples[first] * (1 - part) + (samples[first + 1] ?? 0) * part;
	}
	return out;
}

function hear(signal: Float32Array) {
	const rejections: NoteRejection[] = [];
	const notes: NoteOnset[] = [];
	const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, RATE, (r) => rejections.push(r));
	const attacks = new AttackTracker(RATE);
	for (let offset = 0; offset + FRAME <= signal.length; offset += FRAME) {
		const frame = signal.subarray(offset, offset + FRAME);
		const frameTime = offset / RATE;
		notes.push(...tracker.push(frame, frameTime));
		for (const { time } of attacks.push(frame, frameTime)) tracker.attack(time);
	}
	return { notes, rejections };
}

/** Onsets are the player's labels in Audacity (see `attacks/realAttacks.spec.ts`). */
describe('notes picked through an interface', () => {
	it.each([
		['picked-notes-fm3.wav', [0.2665, 0.6267, 1.342]],
		['pre-attacks-fm3.wav', [0.1906, 0.5574, 0.9318]],
		['pre-attack-far-fm3.wav', [0.2786]]
	])('reads one note per attack in %s, the touch of the pick apart', (file, onsets) => {
		const { notes, rejections } = hear(played(file));
		expect(rejections).toEqual([]);
		expect(notes).toHaveLength(onsets.length);
		notes.forEach((note, index) => expect(Math.abs(note.time - onsets[index])).toBeLessThan(0.01));
	});
});
