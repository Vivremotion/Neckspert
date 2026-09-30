import { describe, expect, it } from 'vitest';
import type { NoteOnset } from '$lib/application/ports';
import { DEFAULT_DETECTOR_CONFIG } from './config';
import { NoteTracker } from './NoteTracker';
import { pushAll, synthesizePluck } from './synth';

const NOTES = {
	E2: { hz: 82.40689, midi: 40 },
	A2: { hz: 110, midi: 45 },
	B3: { hz: 246.9417, midi: 59 },
	E4: { hz: 329.6276, midi: 64 },
	/** 12th fret on low E = E3 */
	E3: { hz: 164.8138, midi: 52 }
} as const;

function expectOnset(
	onsets: NoteOnset[],
	expectedMidi: number,
	attackSample: number,
	sampleRate: number,
	startTime = 0
) {
	expect(onsets.length).toBeGreaterThanOrEqual(1);
	const onset = onsets[0];
	const expectedTime = startTime + attackSample / sampleRate;
	expect(Math.abs(onset.time - expectedTime)).toBeLessThan(0.01);
	expect(onset.midi).toBe(expectedMidi);
}

function runPluck(frequencyHz: number, sampleRate: number, attackSample = 4800): NoteOnset[] {
	const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
	const signal = synthesizePluck({
		frequencyHz,
		sampleRate,
		durationS: 1.2,
		attackSample
	});
	return pushAll(tracker, signal, sampleRate) as NoteOnset[];
}

describe.each([44100, 48000])('NoteTracker at %s Hz', (sampleRate) => {
	it('detects E2 (low E) with onset within 10 ms and no octave error', () => {
		const onsets = runPluck(NOTES.E2.hz, sampleRate);
		expectOnset(onsets, NOTES.E2.midi, 4800, sampleRate);
	});

	it('detects A2', () => {
		expectOnset(runPluck(NOTES.A2.hz, sampleRate), NOTES.A2.midi, 4800, sampleRate);
	});

	it('detects B3', () => {
		expectOnset(runPluck(NOTES.B3.hz, sampleRate), NOTES.B3.midi, 4800, sampleRate);
	});

	it('detects E4', () => {
		expectOnset(runPluck(NOTES.E4.hz, sampleRate), NOTES.E4.midi, 4800, sampleRate);
	});

	it('detects the 12th-fret E3 on the low string', () => {
		expectOnset(runPluck(NOTES.E3.hz, sampleRate), NOTES.E3.midi, 4800, sampleRate);
	});

	it('detects two notes in a row', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		const firstAttack = 4000;
		const secondAttack = Math.floor(sampleRate * 0.55);
		const total = Math.floor(sampleRate * 1.4);
		const signal = new Float32Array(total);
		const first = synthesizePluck({
			frequencyHz: NOTES.A2.hz,
			sampleRate,
			durationS: 0.5,
			attackSample: 0
		});
		const second = synthesizePluck({
			frequencyHz: NOTES.E4.hz,
			sampleRate,
			durationS: 0.7,
			attackSample: 0
		});
		signal.set(first.subarray(0, Math.min(first.length, secondAttack - firstAttack)), firstAttack);
		signal.set(second.subarray(0, Math.min(second.length, total - secondAttack)), secondAttack);
		const onsets = pushAll(tracker, signal, sampleRate) as NoteOnset[];
		expect(onsets.length).toBe(2);
		expect(onsets[0].midi).toBe(NOTES.A2.midi);
		expect(onsets[1].midi).toBe(NOTES.E4.midi);
		expect(Math.abs(onsets[0].time - firstAttack / sampleRate)).toBeLessThan(0.01);
		expect(Math.abs(onsets[1].time - secondAttack / sampleRate)).toBeLessThan(0.01);
	});

	it('emits nothing on silence', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		const silence = new Float32Array(sampleRate);
		expect(pushAll(tracker, silence, sampleRate)).toEqual([]);
	});

	it('emits nothing on broadband noise', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		const noise = new Float32Array(sampleRate);
		for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 2 - 1) * 0.2;
		expect(pushAll(tracker, noise, sampleRate)).toEqual([]);
	});
});
