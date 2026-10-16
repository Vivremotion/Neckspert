import { describe, expect, it } from 'vitest';
import { DEFAULT_ATTACK_CONFIG } from '../attacks/config';
import { AttackTracker } from '../attacks/AttackTracker';
import { appClick, feed } from '../attacks/testing/signals';
import { readWav } from '../chords/testing/wav';
import index from '../chords/fixtures/index.json';
import { loopLatency } from './compare';
import { LISTEN_MAX_SPREAD_MS, LISTEN_WINDOW_S, REFERENCE_ATTACK_CONFIG } from './config';

const RATE = 48000;
const BEAT_S = 0.75;
/** The corpus page's metronome sounded one beat after each excerpt's chord. */
const CORPUS_CLICK_AFTER_S = 0.75;

const WAVS = import.meta.glob<string>('../chords/fixtures/*.wav', {
	query: '?inline',
	import: 'default',
	eager: true
});

/** Deterministic ±1. */
function noiseAt(i: number): number {
	return (((i * 2654435761) >>> 0) / 4294967296) * 2 - 1;
}

/** Eight clicks of the listen phase at `level` of their app gain, over a quiet floor. */
function listenPhase(level: number): { signal: Float32Array; onsets: number[] } {
	const signal = new Float32Array(Math.round(7 * RATE));
	for (let i = 0; i < signal.length; i++) signal[i] = noiseAt(i) * 0.0005;
	const onsets: number[] = [];
	for (let k = 0; k < 8; k++) {
		// Off the 512-sample frame grid, by a different amount each time.
		const at = 0.5 + k * BEAT_S + ((k * 37) % 100) / 10000;
		onsets.push(at);
		const accent = k % 4 === 0;
		const click = appClick({
			rate: RATE,
			filterHz: accent ? 3000 : 1500,
			gain: (accent ? 0.9 : 0.7) * level,
			seed: k + 1
		});
		const start = Math.round(at * RATE);
		for (let i = 0; i < click.length; i++) signal[start + i] += click[i];
	}
	return { signal, onsets };
}

function heardDelaysMs(config: Partial<typeof DEFAULT_ATTACK_CONFIG>, level: number): number[] {
	const { signal, onsets } = listenPhase(level);
	const attacks = feed(new AttackTracker(RATE, config), signal, RATE);
	return onsets.flatMap((t) => {
		const a = attacks.find((x) => x.time >= t - 0.02 && x.time - t < 0.1);
		return a ? [(a.time - t) * 1000] : [];
	});
}

describe('the reference mic hears the clicks of the listen phase', () => {
	it('times a heard click within a millisecond of its onset, wherever it falls in a frame', () => {
		const delays = heardDelaysMs(REFERENCE_ATTACK_CONFIG, 0.3);
		expect(delays).toHaveLength(8);
		for (const d of delays) expect(Math.abs(d)).toBeLessThan(1);
	});

	it('hears clicks the default threshold does not let through (−27.5 dBFS peak)', () => {
		// The default `delta` stops cold under about −25 dBFS at the tracker (after the built-in
		// gain of 8, about −43 dBFS at the raw mic): a faint click is not heard at all.
		expect(heardDelaysMs(DEFAULT_ATTACK_CONFIG, 0.07)).toHaveLength(0);
		expect(heardDelaysMs(REFERENCE_ATTACK_CONFIG, 0.07)).toHaveLength(8);
	});

	it('on the real built-in mic takes, the listen pairing finds the corpus click at one common delay', () => {
		const micTakes = (
			index as Array<{ file: string; input: string; builtInGain: number; beatSec: number }>
		).filter((f) => f.input === 'micro');
		// The three takes laid end to end, 100 s apart: one click each, as one listen phase.
		const clicks: number[] = [];
		const heard: number[] = [];
		micTakes.forEach((f, i) => {
			const url = WAVS[`../chords/fixtures/${f.file}`];
			const binary = atob(url.slice(url.indexOf(',') + 1));
			const { sampleRate, samples } = readWav(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
			const gained = samples.map((v) => Math.max(-1, Math.min(1, v * f.builtInGain)));
			const attacks = feed(
				new AttackTracker(sampleRate, REFERENCE_ATTACK_CONFIG),
				gained,
				sampleRate
			);
			clicks.push(i * 100 + f.beatSec + CORPUS_CLICK_AFTER_S);
			heard.push(...attacks.map((a) => i * 100 + a.time));
		});
		const loop = loopLatency(clicks, heard, LISTEN_WINDOW_S);
		// 52.3, 53.4 and 53.4 ms: the loop latency of that setup (laptop speakers), steady.
		expect(loop.heardRatio).toBe(1);
		expect(loop.ms).toBeGreaterThan(50);
		expect(loop.ms).toBeLessThan(56);
		expect(loop.spreadMs).toBeLessThan(LISTEN_MAX_SPREAD_MS);
	});
});
