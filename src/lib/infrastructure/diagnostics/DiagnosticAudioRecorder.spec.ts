import { describe, expect, it } from 'vitest';
import type { AudioFrame } from '$lib/infrastructure/audio/input';
import type { FrameSource } from '$lib/infrastructure/audio/chords';
import { FakeDiagnosticSink } from '$lib/testing/fakes';
import { DIAGNOSTIC_CHUNK_S, DiagnosticAudioRecorder } from './DiagnosticAudioRecorder';

const RATE = 48000;
const FRAME = 512;

/** Sends frames of a constant level, at the audio times the test chooses. */
class FrameFeed implements FrameSource {
	readonly sampleRate = RATE;
	private readonly listeners = new Set<(frame: AudioFrame) => void>();

	get listening(): number {
		return this.listeners.size;
	}

	onFrame(callback: (frame: AudioFrame) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	/** Plays `seconds` of signal from `from`, in 512-sample frames (the last one shorter). */
	play(from: number, seconds: number, level = 0.25): void {
		const total = Math.round(seconds * RATE);
		for (let at = 0; at < total; at += FRAME) {
			const samples = new Float32Array(Math.min(FRAME, total - at)).fill(level);
			const frame = { samples, frameTime: from + at / RATE };
			this.listeners.forEach((listener) => listener(frame));
		}
	}
}

describe('DiagnosticAudioRecorder', () => {
	it('sends 10 s chunks at 16 kHz, at the audio time of their first sample', () => {
		expect(DIAGNOSTIC_CHUNK_S).toBe(10);
		const sink = new FakeDiagnosticSink();
		const feed = new FrameFeed();
		const recorder = new DiagnosticAudioRecorder(sink);
		recorder.start(feed);
		feed.play(0, 25);
		expect(sink.chunks).toHaveLength(2);
		recorder.stop();

		expect(sink.chunks.map((c) => c.sampleRate)).toEqual([16000, 16000, 16000]);
		const lengths = sink.chunks.map((c) => c.samples.length);
		expect(lengths[0]).toBe(160000);
		expect(lengths[1]).toBe(160000);
		expect(Math.abs(lengths[2] - 80000)).toBeLessThanOrEqual(1);
		sink.chunks.forEach((chunk, i) => {
			expect(Math.abs(chunk.audioTime - i * 10)).toBeLessThanOrEqual(0.001);
		});
		expect(feed.listening).toBe(0);
	});

	it('writes 16-bit samples, rounded and saturated', () => {
		const sink = new FakeDiagnosticSink();
		const feed = new FrameFeed();
		const recorder = new DiagnosticAudioRecorder(sink);
		recorder.start(feed);
		feed.play(0, 0.5, 0.25);
		feed.play(0.5, 0.5, 3);
		recorder.stop();
		const samples = sink.chunks[0].samples;
		expect(samples[4000]).toBe(Math.round(0.25 * 32767));
		expect(samples[12000]).toBe(32767);
	});

	it('marks a gap between frames, sends the cut chunk and starts a new one after it', () => {
		const sink = new FakeDiagnosticSink();
		const feed = new FrameFeed();
		const recorder = new DiagnosticAudioRecorder(sink);
		recorder.start(feed);
		feed.play(0, 2);
		feed.play(2.5, 1);
		recorder.stop();

		expect(sink.events).toHaveLength(1);
		const gap = sink.events[0];
		expect(gap.kind).toBe('input.gap');
		expect(gap.audioTime).toBeCloseTo(2, 6);
		const data = gap.data as { fromAudioTime: number; durationS: number };
		expect(data.fromAudioTime).toBeCloseTo(2, 6);
		expect(data.durationS).toBeCloseTo(0.5, 6);
		expect(sink.chunks).toHaveLength(2);
		expect(Math.abs(sink.chunks[0].samples.length - 32000)).toBeLessThanOrEqual(1);
		expect(Math.abs(sink.chunks[1].audioTime - 2.5)).toBeLessThanOrEqual(0.001);
		expect(Math.abs(sink.chunks[1].samples.length - 16000)).toBeLessThanOrEqual(1);
	});

	it('does not count a short frame as a gap', () => {
		const sink = new FakeDiagnosticSink();
		const feed = new FrameFeed();
		const recorder = new DiagnosticAudioRecorder(sink);
		recorder.start(feed);
		feed.play(0, 1);
		feed.play(1 + 200 / RATE, 1);
		recorder.stop();
		expect(sink.events).toEqual([]);
		expect(sink.chunks).toHaveLength(1);
	});

	it('does not subscribe when the journal is off', () => {
		const sink = new FakeDiagnosticSink(false);
		const feed = new FrameFeed();
		const recorder = new DiagnosticAudioRecorder(sink);
		recorder.start(feed);
		expect(feed.listening).toBe(0);
		feed.play(0, 1);
		recorder.stop();
		expect(sink.chunks).toEqual([]);
		expect(sink.events).toEqual([]);
	});

	it('records a second take from silence, after a stop', () => {
		const sink = new FakeDiagnosticSink();
		const feed = new FrameFeed();
		const recorder = new DiagnosticAudioRecorder(sink);
		recorder.start(feed);
		feed.play(0, 1);
		recorder.stop();
		recorder.start(feed);
		feed.play(30, 1);
		recorder.stop();
		expect(sink.events).toEqual([]);
		expect(sink.chunks).toHaveLength(2);
		expect(Math.abs(sink.chunks[1].audioTime - 30)).toBeLessThanOrEqual(0.001);
		expect(Array.from(sink.chunks[1].samples)).toEqual(Array.from(sink.chunks[0].samples));
	});
});
