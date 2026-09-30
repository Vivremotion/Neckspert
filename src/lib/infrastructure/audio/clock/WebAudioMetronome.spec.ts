import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeatEvent } from '$lib/application/ports';
import {
	BEAT_CLICK,
	CLICK_DURATION_S,
	CLICK_FILTER_Q,
	CLICK_SILENCE,
	DEFAULT_LOOKAHEAD_MS,
	DOWNBEAT_CLICK,
	MAX_TEMPO_BPM,
	MIN_TEMPO_BPM,
	WebAudioMetronome,
	type MetronomeOptions
} from './WebAudioMetronome';

type AutomationMethod =
	| 'setValueAtTime'
	| 'linearRampToValueAtTime'
	| 'exponentialRampToValueAtTime';

interface AutomationCall {
	method: AutomationMethod;
	value: number;
	time: number;
}

class FakeParam {
	value = 0;
	readonly calls: AutomationCall[] = [];

	setValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'setValueAtTime', value, time });
		return this;
	}

	linearRampToValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'linearRampToValueAtTime', value, time });
		return this;
	}

	exponentialRampToValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'exponentialRampToValueAtTime', value, time });
		return this;
	}
}

class FakeNode {
	readonly connections: unknown[] = [];

	connect<T>(destination: T): T {
		this.connections.push(destination);
		return destination;
	}
}

class FakeBuffer {
	private readonly channels: Float32Array[];

	constructor(
		readonly numberOfChannels: number,
		readonly length: number,
		readonly sampleRate: number
	) {
		this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
	}

	getChannelData(channel: number): Float32Array {
		return this.channels[channel];
	}
}

class FakeBufferSource extends FakeNode {
	buffer: FakeBuffer | null = null;
	startTime: number | null = null;
	stopTime: number | null = null;

	start(when = 0): void {
		this.startTime = when;
	}

	stop(when = 0): void {
		this.stopTime = when;
	}
}

class FakeFilter extends FakeNode {
	type = 'lowpass';
	readonly frequency = new FakeParam();
	readonly Q = new FakeParam();
}

class FakeGain extends FakeNode {
	readonly gain = new FakeParam();
}

class FakeAudioContext {
	currentTime = 0;
	readonly sampleRate = 48000;
	readonly destination = { name: 'destination' };
	readonly buffers: FakeBuffer[] = [];
	readonly sources: FakeBufferSource[] = [];
	readonly filters: FakeFilter[] = [];
	readonly gains: FakeGain[] = [];
	oscillatorCount = 0;

	createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeBuffer {
		const buffer = new FakeBuffer(numberOfChannels, length, sampleRate);
		this.buffers.push(buffer);
		return buffer;
	}

	createBufferSource(): FakeBufferSource {
		const source = new FakeBufferSource();
		this.sources.push(source);
		return source;
	}

	createBiquadFilter(): FakeFilter {
		const filter = new FakeFilter();
		this.filters.push(filter);
		return filter;
	}

	createGain(): FakeGain {
		const gain = new FakeGain();
		this.gains.push(gain);
		return gain;
	}

	createOscillator(): never {
		this.oscillatorCount++;
		throw new Error('The click must not use an oscillator');
	}
}

function setup(options?: MetronomeOptions) {
	const audio = new FakeAudioContext();
	const metronome = new WebAudioMetronome(() => audio as unknown as AudioContext, options);
	const beats: BeatEvent[] = [];
	metronome.onBeat((beat) => beats.push(beat));
	return { audio, metronome, beats };
}

/** Moves the audio clock, then lets the wake-up timer fire once. */
function wakeAt(audio: FakeAudioContext, time: number): void {
	audio.currentTime = time;
	vi.advanceTimersByTime(DEFAULT_LOOKAHEAD_MS);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('WebAudioMetronome tempo', () => {
	it('starts at the default tempo', () => {
		const { metronome } = setup();
		expect(metronome.getTempo()).toBe(80);
		expect(metronome.secondsPerBeat()).toBe(0.75);
	});

	it('rejects tempos outside the supported range', () => {
		const { metronome } = setup();
		expect(() => metronome.setTempo(MIN_TEMPO_BPM - 1)).toThrow(RangeError);
		expect(() => metronome.setTempo(MAX_TEMPO_BPM + 1)).toThrow(RangeError);
		expect(() => metronome.setTempo(Number.NaN)).toThrow(RangeError);
		metronome.setTempo(120);
		expect(metronome.secondsPerBeat()).toBe(0.5);
	});

	it('refuses a tempo change while running, so beat times stay linear', () => {
		const { audio, metronome } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		expect(() => metronome.setTempo(90)).toThrow(/Stop the metronome/);
		expect(metronome.beatTime(10)).toBe(6);
		metronome.stop();
		metronome.setTempo(90);
		expect(metronome.getTempo()).toBe(90);
	});

	it('rejects invalid options', () => {
		const audio = new FakeAudioContext();
		const context = () => audio as unknown as AudioContext;
		expect(() => new WebAudioMetronome(context, { lookaheadMs: 200, scheduleAheadS: 0.1 })).toThrow(
			RangeError
		);
		expect(() => new WebAudioMetronome(context, { beatsPerBar: 0 })).toThrow(RangeError);
	});
});

describe('WebAudioMetronome scheduling', () => {
	it('does not touch the audio context before start()', () => {
		const context = vi.fn((): AudioContext => {
			throw new Error('not resumed');
		});
		const metronome = new WebAudioMetronome(context);
		metronome.setTempo(100);
		expect(context).not.toHaveBeenCalled();
		expect(metronome.isRunning()).toBe(false);
	});

	it('keeps emitting beats but schedules no click while silent', () => {
		const { audio, metronome, beats } = setup();
		metronome.setTempo(120);
		metronome.setAudible(false);
		audio.currentTime = 0.95;
		metronome.start(1);
		wakeAt(audio, 1.47);
		expect(beats.map((beat) => beat.index)).toEqual([0, 1]);
		expect(audio.sources).toHaveLength(0);

		metronome.setAudible(true);
		wakeAt(audio, 1.93);
		expect(beats.map((beat) => beat.index)).toEqual([0, 1, 2]);
		expect(audio.sources.map((source) => source.startTime)).toEqual([2]);
	});

	it('schedules the first beat as soon as it enters the horizon', () => {
		const { audio, metronome, beats } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		expect(metronome.isRunning()).toBe(true);
		expect(beats).toEqual([{ index: 0, time: 1, isDownbeat: true }]);
		expect(audio.sources).toHaveLength(1);
		expect(audio.sources[0].startTime).toBe(1);
	});

	it('gives each beat its exact audio time, ahead of it, whenever the timer wakes', () => {
		const { audio, metronome, beats } = setup();
		const calledAt: number[] = [];
		metronome.onBeat(() => calledAt.push(audio.currentTime));
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		wakeAt(audio, 1.2);
		wakeAt(audio, 1.47);
		wakeAt(audio, 1.93);
		expect(beats.map((b) => [b.index, b.time])).toEqual([
			[0, 1],
			[1, 1.5],
			[2, 2]
		]);
		expect(calledAt).toEqual([0.95, 1.47, 1.93]);
		expect(audio.sources.map((s) => s.startTime)).toEqual([1, 1.5, 2]);
		expect(metronome.beatTime(3)).toBe(2.5);
	});

	it('accents the downbeat with level and a brighter filter, not with a pitch', () => {
		const { audio, metronome, beats } = setup({ beatsPerBar: 3 });
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		for (const time of [1.45, 1.95, 2.45]) wakeAt(audio, time);
		expect(beats.map((b) => b.isDownbeat)).toEqual([true, false, false, true]);
		expect(audio.filters.map((f) => f.frequency.calls[0].value)).toEqual([
			DOWNBEAT_CLICK.filterHz,
			BEAT_CLICK.filterHz,
			BEAT_CLICK.filterHz,
			DOWNBEAT_CLICK.filterHz
		]);
		expect(audio.gains.map((g) => g.gain.calls[0].value)).toEqual([
			DOWNBEAT_CLICK.gain,
			BEAT_CLICK.gain,
			BEAT_CLICK.gain,
			DOWNBEAT_CLICK.gain
		]);
		expect(DOWNBEAT_CLICK.filterHz).toBeGreaterThan(BEAT_CLICK.filterHz);
		expect(DOWNBEAT_CLICK.gain).toBeGreaterThan(BEAT_CLICK.gain);
		expect(audio.oscillatorCount).toBe(0);
	});

	it('plays a short band-passed noise burst routed to the speakers', () => {
		const { audio, metronome } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		const [source] = audio.sources;
		const [filter] = audio.filters;
		const [gain] = audio.gains;
		expect(source.buffer).toBe(audio.buffers[0]);
		expect(source.connections[0]).toBe(filter);
		expect(filter.connections[0]).toBe(gain);
		expect(gain.connections[0]).toBe(audio.destination);
		expect(filter.type).toBe('bandpass');
		expect(filter.Q.calls).toEqual([{ method: 'setValueAtTime', value: CLICK_FILTER_Q, time: 1 }]);
		expect(CLICK_FILTER_Q).toBeLessThanOrEqual(2);
		expect(source.stopTime).toBe(1 + CLICK_DURATION_S);
		expect(gain.gain.calls).toEqual([
			{ method: 'setValueAtTime', value: DOWNBEAT_CLICK.gain, time: 1 },
			{ method: 'exponentialRampToValueAtTime', value: CLICK_SILENCE, time: 1 + CLICK_DURATION_S }
		]);
	});

	it('generates one white-noise buffer per context and reuses it for every click', () => {
		const { audio, metronome } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		wakeAt(audio, 1.45);
		wakeAt(audio, 1.95);
		expect(audio.buffers).toHaveLength(1);
		const [buffer] = audio.buffers;
		expect(buffer.numberOfChannels).toBe(1);
		expect(buffer.sampleRate).toBe(audio.sampleRate);
		expect(buffer.length).toBe(Math.round(audio.sampleRate * CLICK_DURATION_S));
		const samples = [...buffer.getChannelData(0)];
		expect(samples.every((sample) => sample >= -1 && sample <= 1)).toBe(true);
		expect(new Set(samples).size).toBeGreaterThan(samples.length / 2);
		expect(audio.sources.map((s) => s.buffer)).toEqual([buffer, buffer, buffer]);
	});

	it('drops beats that are already in the past', () => {
		const { audio, metronome, beats } = setup();
		metronome.setTempo(120);
		audio.currentTime = 1.2;
		metronome.start(1);
		wakeAt(audio, 1.45);
		expect(beats.map((b) => b.index)).toEqual([1]);
		expect(audio.sources.map((s) => s.startTime)).toEqual([1.5]);
	});

	it('stops scheduling and cancels its timer on stop()', () => {
		const { audio, metronome, beats } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		metronome.stop();
		expect(metronome.isRunning()).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		wakeAt(audio, 1.45);
		expect(beats).toHaveLength(1);
		expect(() => metronome.beatTime(0)).toThrow(/not running/);
	});

	it('restarts from beat 0 when started again', () => {
		const { audio, metronome, beats } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		audio.currentTime = 2.95;
		metronome.start(3);
		expect(beats.map((b) => [b.index, b.time])).toEqual([
			[0, 1],
			[0, 3]
		]);
		expect(metronome.beatTime(1)).toBe(3.5);
		expect(vi.getTimerCount()).toBe(1);
	});

	it('stops calling a listener after it unsubscribes', () => {
		const { audio, metronome } = setup();
		const seen: number[] = [];
		const unsubscribe = metronome.onBeat((beat) => seen.push(beat.index));
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		unsubscribe();
		wakeAt(audio, 1.45);
		expect(seen).toEqual([0]);
	});

	it('keeps the click track going when a listener throws', () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { audio, metronome, beats } = setup();
		metronome.onBeat(() => {
			throw new Error('listener bug');
		});
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		wakeAt(audio, 1.45);
		expect(beats.map((b) => b.index)).toEqual([0, 1]);
		expect(errors).toHaveBeenCalledTimes(2);
	});

	it('lets a listener stop the metronome from inside a beat', () => {
		const { audio, metronome, beats } = setup({ scheduleAheadS: 1.2 });
		metronome.onBeat((beat) => {
			if (beat.index === 1) metronome.stop();
		});
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		expect(beats.map((b) => b.index)).toEqual([0, 1]);
		expect(metronome.isRunning()).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
});
