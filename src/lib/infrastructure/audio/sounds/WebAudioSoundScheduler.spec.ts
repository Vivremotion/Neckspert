import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOKAHEAD_MS } from '../clock/WebAudioMetronome';
import {
	BEAT_CLICK,
	CLICK_DURATION_S,
	DEMO_SOUND,
	DOWNBEAT_CLICK,
	PLAY_ALONG_SOUND
} from './clickSound';
import { WebAudioSoundScheduler } from './WebAudioSoundScheduler';

class FakeParam {
	readonly calls: { method: string; value: number; time: number }[] = [];
	setValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'setValueAtTime', value, time });
		return this;
	}
	exponentialRampToValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'exponentialRampToValueAtTime', value, time });
		return this;
	}
}

class FakeNode {
	connect<T>(destination: T): T {
		return destination;
	}
}

class FakeBuffer {
	private readonly data: Float32Array;
	constructor(
		readonly length: number,
		readonly sampleRate: number
	) {
		this.data = new Float32Array(length);
	}
	getChannelData(): Float32Array {
		return this.data;
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
	readonly destination = {};
	readonly buffers: FakeBuffer[] = [];
	readonly sources: FakeBufferSource[] = [];
	readonly filters: FakeFilter[] = [];
	readonly gains: FakeGain[] = [];

	createBuffer(_channels: number, length: number, sampleRate: number): FakeBuffer {
		const buffer = new FakeBuffer(length, sampleRate);
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
		throw new Error('A sound must not use an oscillator');
	}
}

function setup() {
	const audio = new FakeAudioContext();
	const scheduler = new WebAudioSoundScheduler(() => audio as unknown as AudioContext);
	return { audio, scheduler };
}

function wakeAt(audio: FakeAudioContext, time: number): void {
	audio.currentTime = time;
	vi.advanceTimersByTime(DEFAULT_LOOKAHEAD_MS);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('WebAudioSoundScheduler play', () => {
	it('creates a source started at the requested time and logs it', () => {
		const { audio, scheduler } = setup();
		scheduler.play(2, 'click');
		expect(audio.sources).toHaveLength(1);
		expect(audio.sources[0].startTime).toBe(2);
		expect(audio.sources[0].stopTime).toBeCloseTo(2 + CLICK_DURATION_S);
		expect(scheduler.emitted()).toEqual([{ time: 2, sound: 'click' }]);
	});

	it('does not touch the audio context before the first sound', () => {
		const context = vi.fn((): AudioContext => {
			throw new Error('not resumed');
		});
		const scheduler = new WebAudioSoundScheduler(context);
		expect(scheduler.emitted()).toEqual([]);
		scheduler.cancelAll();
		expect(context).not.toHaveBeenCalled();
	});

	it('drops a sound whose time is past: not scheduled, not logged', () => {
		const { audio, scheduler } = setup();
		audio.currentTime = 3;
		scheduler.play(2.9, 'click');
		expect(audio.sources).toHaveLength(0);
		expect(scheduler.emitted()).toEqual([]);
	});

	it('gives the accent and the beat the timbres of the metronome', () => {
		const { audio, scheduler } = setup();
		scheduler.play(1, 'click-accent');
		scheduler.play(2, 'click');
		const [accent, beat] = audio.filters;
		expect(accent.type).toBe('bandpass');
		expect(accent.frequency.calls[0].value).toBe(DOWNBEAT_CLICK.filterHz);
		expect(audio.gains[0].gain.calls[0].value).toBe(DOWNBEAT_CLICK.gain);
		expect(beat.frequency.calls[0].value).toBe(BEAT_CLICK.filterHz);
		expect(audio.gains[1].gain.calls[0].value).toBe(BEAT_CLICK.gain);
	});

	it('gives the demo and the play-along one band, at 0.8 and 0.5, for 60 ms', () => {
		const { audio, scheduler } = setup();
		scheduler.play(1, 'demo');
		scheduler.play(2, 'play-along');
		expect(audio.filters.map((f) => f.frequency.calls[0].value)).toEqual([800, 800]);
		expect(audio.gains.map((g) => g.gain.calls[0].value)).toEqual([0.8, 0.5]);
		expect(DEMO_SOUND.gain).toBe(0.8);
		expect(PLAY_ALONG_SOUND.gain).toBe(0.5);
		expect(audio.sources[0].stopTime).toBeCloseTo(1.06);
		expect(audio.sources[1].stopTime).toBeCloseTo(2.06);
	});

	it('plays noise, never an oscillator, and shares one buffer per duration', () => {
		const { audio, scheduler } = setup();
		scheduler.play(1, 'click');
		scheduler.play(2, 'click-accent');
		scheduler.play(3, 'demo');
		expect(audio.buffers.map((b) => b.length)).toEqual([
			Math.round(48000 * CLICK_DURATION_S),
			Math.round(48000 * 0.06)
		]);
		expect(audio.sources[0].buffer).toBe(audio.sources[1].buffer);
		expect(new Set(audio.buffers[0].getChannelData()).size).toBeGreaterThan(100);
	});
});

describe('WebAudioSoundScheduler cancelAll', () => {
	it('stops the sounds yet to come, keeps the ones sounding, and empties the journal', () => {
		const { audio, scheduler } = setup();
		scheduler.play(1, 'click');
		scheduler.play(5, 'click');
		audio.currentTime = 1.01;
		scheduler.cancelAll();
		expect(audio.sources[0].stopTime).toBeCloseTo(1 + CLICK_DURATION_S);
		expect(audio.sources[1].stopTime).toBe(1.01);
		expect(scheduler.emitted()).toEqual([]);
	});
});

describe('WebAudioSoundScheduler at', () => {
	it('wakes once the audio clock reaches the time, never early, earliest first', () => {
		const { audio, scheduler } = setup();
		const woken: string[] = [];
		scheduler.at(2, () => woken.push('b'));
		scheduler.at(1, () => woken.push('a'));
		wakeAt(audio, 0.5);
		expect(woken).toEqual([]);
		wakeAt(audio, 2);
		expect(woken).toEqual(['a', 'b']);
		wakeAt(audio, 3);
		expect(woken).toEqual(['a', 'b']);
	});

	it('is at most one wake-up period late', () => {
		const { audio, scheduler } = setup();
		const woken: number[] = [];
		scheduler.at(1, () => woken.push(audio.currentTime));
		audio.currentTime = 1;
		vi.advanceTimersByTime(DEFAULT_LOOKAHEAD_MS - 1);
		expect(woken).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(woken).toEqual([1]);
	});

	it('can be cancelled by the returned function', () => {
		const { audio, scheduler } = setup();
		const callback = vi.fn();
		const cancel = scheduler.at(1, callback);
		cancel();
		wakeAt(audio, 2);
		expect(callback).not.toHaveBeenCalled();
	});

	it('forgets the wake-ups on cancelAll and stops its timer', () => {
		const { audio, scheduler } = setup();
		const callback = vi.fn();
		scheduler.at(1, callback);
		scheduler.cancelAll();
		expect(vi.getTimerCount()).toBe(0);
		wakeAt(audio, 2);
		expect(callback).not.toHaveBeenCalled();
	});

	it('keeps waking after a callback throws', () => {
		const { audio, scheduler } = setup();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const later = vi.fn();
		scheduler.at(1, () => {
			throw new Error('boom');
		});
		scheduler.at(1, later);
		wakeAt(audio, 1);
		expect(later).toHaveBeenCalledOnce();
	});

	it('lets a callback schedule a sound and another wake-up', () => {
		const { audio, scheduler } = setup();
		const woken: string[] = [];
		scheduler.at(1, () => {
			scheduler.play(1.5, 'demo');
			scheduler.at(1, () => woken.push('inner'));
			woken.push('outer');
		});
		wakeAt(audio, 1);
		expect(woken).toEqual(['outer', 'inner']);
		expect(scheduler.emitted()).toEqual([{ time: 1.5, sound: 'demo' }]);
	});
});
