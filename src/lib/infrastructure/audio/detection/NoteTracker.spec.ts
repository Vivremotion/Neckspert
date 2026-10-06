import { describe, expect, it } from 'vitest';
import type { NoteOnset, NoteRejection } from '$lib/application/ports';
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

describe('rejections', () => {
	const sampleRate = 48000;

	function run(config: Partial<typeof DEFAULT_DETECTOR_CONFIG>, signal: Float32Array) {
		const rejections: NoteRejection[] = [];
		const tracker = new NoteTracker(
			{ ...DEFAULT_DETECTOR_CONFIG, ...config },
			sampleRate,
			(rejection) => rejections.push(rejection)
		);
		const onsets = pushAll(tracker, signal, sampleRate);
		return { rejections, onsets };
	}

	it('never reports a valid pluck', () => {
		const signal = synthesizePluck({
			frequencyHz: NOTES.A2.hz,
			sampleRate,
			durationS: 1.2,
			attackSample: 4800
		});
		const { rejections, onsets } = run({}, signal);
		expect(onsets).toHaveLength(1);
		expect(rejections).toEqual([]);
	});

	it('reports an attack followed by noise as no-pitch, with finite readings', () => {
		const signal = new Float32Array(sampleRate);
		for (let i = 4800; i < signal.length; i++) {
			signal[i] = (i - 4800 < 48 ? 1 : 0) * 0.5;
		}
		const { rejections, onsets } = run({}, signal);
		expect(onsets).toEqual([]);
		expect(rejections.length).toBeGreaterThanOrEqual(1);
		const rejection = rejections[0];
		expect(rejection.reason).toBe('no-pitch');
		expect(Math.abs(rejection.time - 4800 / sampleRate)).toBeLessThan(0.01);
		expect(Number.isFinite(rejection.attack.frequencyHz)).toBe(true);
		expect(Number.isFinite(rejection.sustain.frequencyHz)).toBe(true);
		expect(JSON.parse(JSON.stringify(rejection))).toEqual(rejection);
	});

	it('reports a pitch below the clarity thresholds as unclear', () => {
		const signal = synthesizePluck({
			frequencyHz: NOTES.A2.hz,
			sampleRate,
			durationS: 1.2,
			attackSample: 4800
		});
		const { rejections, onsets } = run(
			{ clarityThreshold: 0.999999, attackClarityThreshold: 0.999999 },
			signal
		);
		expect(onsets).toEqual([]);
		expect(rejections).toHaveLength(1);
		const rejection = rejections[0];
		expect(rejection.reason).toBe('unclear');
		expect(Math.abs(rejection.time - 4800 / sampleRate)).toBeLessThan(0.01);
		expect(rejection.attack.frequencyHz).toBeGreaterThan(0);
		expect(rejection.sustain.frequencyHz).toBeGreaterThan(0);
		expect(rejection.attack.clarity).toBeLessThan(0.999999);
	});

	it('reports a pitch that moves between the two windows as unstable', () => {
		const attackSample = 4800;
		const window = DEFAULT_DETECTOR_CONFIG.windowSize;
		const signal = new Float32Array(sampleRate);
		const low = synthesizePluck({
			frequencyHz: NOTES.A2.hz,
			sampleRate,
			durationS: 1,
			attackSample: 0
		});
		const high = synthesizePluck({
			frequencyHz: NOTES.A2.hz * 1.5,
			sampleRate,
			durationS: 1,
			attackSample: 0
		});
		signal.set(low.subarray(0, window), attackSample);
		signal.set(high.subarray(window, window * 3), attackSample + window);
		const { rejections, onsets } = run(
			{ clarityThreshold: 0.5, attackClarityThreshold: 0.5 },
			signal
		);
		expect(onsets).toEqual([]);
		expect(rejections).toHaveLength(1);
		const rejection = rejections[0];
		expect(rejection.reason).toBe('unstable');
		expect(Math.abs(rejection.time - attackSample / sampleRate)).toBeLessThan(0.01);
		expect(rejection.attack.frequencyHz).toBeCloseTo(NOTES.A2.hz, -1);
		expect(rejection.sustain.frequencyHz).toBeGreaterThan(rejection.attack.frequencyHz * 1.2);
	});

	it('reports a pitch outside the guitar range as out-of-range', () => {
		const signal = synthesizePluck({
			frequencyHz: NOTES.E2.hz,
			sampleRate,
			durationS: 1.2,
			attackSample: 4800
		});
		const { rejections, onsets } = run({ minMidi: 60 }, signal);
		expect(onsets).toEqual([]);
		expect(rejections).toHaveLength(1);
		const rejection = rejections[0];
		expect(rejection.reason).toBe('out-of-range');
		expect(Math.abs(rejection.time - 4800 / sampleRate)).toBeLessThan(0.01);
		expect(rejection.attack.frequencyHz).toBeCloseTo(NOTES.E2.hz, 0);
		expect(rejection.sustain.frequencyHz).toBeCloseTo(NOTES.E2.hz, 0);
	});
});
