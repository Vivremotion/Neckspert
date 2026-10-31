import { describe, expect, it } from 'vitest';
import type { NoteOnset, NoteRejection } from '$lib/application/ports';
import { AttackTracker } from '../attacks/AttackTracker';
import { DEFAULT_DETECTOR_CONFIG } from './config';
import { NoteTracker } from './NoteTracker';
import { synthesizePluck } from './synth';

const NOTES = {
	E2: { hz: 82.40689, midi: 40 },
	A2: { hz: 110, midi: 45 },
	B3: { hz: 246.9417, midi: 59 },
	E4: { hz: 329.6276, midi: 64 },
	/** 12th fret on low E = E3 */
	E3: { hz: 164.8138, midi: 52 }
} as const;

/** The signal played: its frames, and each attack the attack sensor hears told to the tracker. */
function pushAll(tracker: NoteTracker, signal: Float32Array, sampleRate: number): NoteOnset[] {
	const attacks = new AttackTracker(sampleRate);
	const notes: NoteOnset[] = [];
	for (let offset = 0; offset + 512 <= signal.length; offset += 512) {
		const frame = signal.subarray(offset, offset + 512);
		const frameTime = offset / sampleRate;
		notes.push(...tracker.push(frame, frameTime));
		for (const { time } of attacks.push(frame, frameTime)) tracker.attack(time);
	}
	return notes;
}

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
	return pushAll(tracker, signal, sampleRate);
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
		const onsets = pushAll(tracker, signal, sampleRate);
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

describe('NoteTracker told of attacks', () => {
	const sampleRate = 48000;
	const signal = synthesizePluck({
		frequencyHz: NOTES.A2.hz,
		sampleRate,
		durationS: 0.5,
		attackSample: 0
	});

	it('reads nothing without an attack', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		expect(tracker.push(signal, 0)).toEqual([]);
	});

	it('waits for the two windows after an attack, however late it is told', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		const window = DEFAULT_DETECTOR_CONFIG.windowSize;
		expect(tracker.push(signal.subarray(0, window), 0)).toEqual([]);
		tracker.attack(0);
		expect(tracker.push(signal.subarray(window, 2 * window - 1), window / sampleRate)).toEqual([]);
		const notes = tracker.push(
			signal.subarray(2 * window - 1, 2 * window + 511),
			(2 * window - 1) / sampleRate
		);
		expect(notes.map((note) => note.midi)).toEqual([NOTES.A2.midi]);
		expect(notes[0].time).toBe(0);
	});

	it('reads two attacks told together, oldest first', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		tracker.push(signal.subarray(0, 512), 0);
		tracker.attack(0);
		tracker.attack(0.005);
		const notes = tracker.push(signal.subarray(512), 512 / sampleRate);
		expect(notes.map((note) => note.time)).toEqual([0, expect.closeTo(0.005, 3)]);
	});

	it('still reads an attack told as late as the sensor tells one', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		const told = Math.round(0.16 * sampleRate);
		tracker.push(signal.subarray(0, told), 0);
		tracker.attack(0);
		const notes = tracker.push(signal.subarray(told, told + 512), told / sampleRate);
		expect(notes.map((note) => note.midi)).toEqual([NOTES.A2.midi]);
	});

	it('drops an attack older than the sound it keeps', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		tracker.attack(5);
		tracker.push(signal.subarray(0, 2 * DEFAULT_DETECTOR_CONFIG.windowSize + 512), 10);
		tracker.attack(9);
		const rest = signal.subarray(2 * DEFAULT_DETECTOR_CONFIG.windowSize + 512);
		expect(tracker.push(rest, 10.5)).toEqual([]);
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
		// One attack told: the sensor would hear a second where the sound changes.
		const rejections: NoteRejection[] = [];
		const tracker = new NoteTracker(
			{ ...DEFAULT_DETECTOR_CONFIG, clarityThreshold: 0.5, attackClarityThreshold: 0.5 },
			sampleRate,
			(rejection) => rejections.push(rejection)
		);
		tracker.push(signal.subarray(0, attackSample), 0);
		tracker.attack(attackSample / sampleRate);
		expect(tracker.push(signal.subarray(attackSample), attackSample / sampleRate)).toEqual([]);
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

describe('an attack that plays no new note', () => {
	const RATE = 48000;
	const A3 = 220;
	const G3 = 196;
	const string = (hz: number, t: number) =>
		Math.sin(2 * Math.PI * hz * t) + 0.5 * Math.sin(4 * Math.PI * hz * t);

	/** A short pitchless burst, like the click heard on the playing input. */
	function addClick(signal: Float32Array, atS: number, gain: number): void {
		const from = Math.round(atS * RATE);
		let seed = 1234567;
		for (let i = 0; i < 0.02 * RATE; i++) {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			signal[from + i] += gain * ((seed / 0x7fffffff) * 2 - 1) * Math.exp((-i / RATE) * 300);
		}
	}

	it('does not hear a note ringing again under a click', () => {
		const signal = new Float32Array(RATE * 4);
		for (let i = Math.round(0.2 * RATE); i < signal.length; i++) {
			const t = i / RATE - 0.2;
			signal[i] = 0.3 * Math.exp(-0.5 * t) * string(A3, t);
		}
		for (const at of [0.8, 1.4, 2, 2.6, 3.2]) addClick(signal, at, 0.2);
		const notes = pushAll(new NoteTracker(DEFAULT_DETECTOR_CONFIG, RATE), signal, RATE);
		expect(notes.map((note) => note.midi)).toEqual([57]);
	});

	it('does not hear a note in the open string a lifted finger leaves ringing', () => {
		const signal = new Float32Array(RATE * 2);
		const lift = Math.round(0.8 * RATE);
		for (let i = Math.round(0.2 * RATE); i < lift; i++) {
			const t = i / RATE - 0.2;
			signal[i] = 0.2 * Math.exp(-0.5 * t) * string(A3, t);
		}
		for (let i = lift; i < signal.length; i++) {
			signal[i] = 0.03 * Math.exp((-(i - lift) / RATE) * 2) * string(G3, (i - lift) / RATE);
		}
		const notes = pushAll(new NoteTracker(DEFAULT_DETECTOR_CONFIG, RATE), signal, RATE);
		expect(notes.map((note) => note.midi)).toEqual([57]);
	});

	it('hears the same note played again, softer than it first was', () => {
		const signal = new Float32Array(RATE * 3);
		[
			[0.2, 0.3],
			[1.0, 0.24],
			[1.8, 0.2]
		].forEach(([at, level]) => {
			for (let i = Math.round(at * RATE); i < signal.length; i++) {
				const t = i / RATE - at;
				signal[i] = level * Math.min(1, t / 0.001) * Math.exp(-1.5 * t) * string(A3, t);
			}
		});
		const notes = pushAll(new NoteTracker(DEFAULT_DETECTOR_CONFIG, RATE), signal, RATE);
		expect(notes.map((note) => note.midi)).toEqual([57, 57, 57]);
	});

	it('hears a soft note that stops a louder one', () => {
		const signal = new Float32Array(RATE * 2);
		const next = Math.round(0.8 * RATE);
		for (let i = Math.round(0.2 * RATE); i < next; i++) {
			const t = i / RATE - 0.2;
			signal[i] = 0.3 * Math.min(1, t / 0.001) * string(A3, t);
		}
		for (let i = next; i < signal.length; i++) {
			const t = (i - next) / RATE;
			signal[i] = 0.15 * Math.min(1, t / 0.001) * string(G3, t);
		}
		const notes = pushAll(new NoteTracker(DEFAULT_DETECTOR_CONFIG, RATE), signal, RATE);
		expect(notes.map((note) => note.midi)).toEqual([57, 55]);
	});
});

describe.each([96000, 176400, 192000])('NoteTracker at %s Hz', (sampleRate) => {
	it('reads an attack told as late as the attack sensor tells it', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		const signal = synthesizePluck({
			frequencyHz: NOTES.E4.hz,
			sampleRate,
			durationS: 1,
			attackSample: Math.round(0.2 * sampleRate)
		});
		const notes: NoteOnset[] = [];
		let told = false;
		for (let offset = 0; offset + 512 <= signal.length; offset += 512) {
			const frameTime = offset / sampleRate;
			notes.push(...tracker.push(signal.subarray(offset, offset + 512), frameTime));
			if (!told && frameTime >= 0.2 + 0.13) {
				tracker.attack(0.2);
				told = true;
			}
		}
		expect(notes.map((note) => note.midi)).toEqual([NOTES.E4.midi]);
	});
});
