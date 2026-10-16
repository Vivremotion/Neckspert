import { describe, expect, it, vi } from 'vitest';
import { RESPONSE_VERDICTS as ALL_VERDICTS, type ResponseVerdict } from '$lib/domain/types';
import { CUE_ATTACK_S, CUE_SILENCE, CUE_SPECS } from './cueSpecs';
import { WebAudioCues } from './WebAudioCues';

type AutomationMethod =
	'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime';

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

class FakeOscillator extends FakeNode {
	type = 'sine';
	readonly frequency = new FakeParam();
	startTime: number | null = null;
	stopTime: number | null = null;

	start(when = 0): void {
		this.startTime = when;
	}

	stop(when = 0): void {
		this.stopTime = when;
	}
}

class FakeGain extends FakeNode {
	readonly gain = new FakeParam();
}

class FakeAudioContext {
	currentTime = 0;
	readonly destination = { name: 'destination' };
	readonly oscillators: FakeOscillator[] = [];
	readonly gains: FakeGain[] = [];

	createOscillator(): FakeOscillator {
		const oscillator = new FakeOscillator();
		this.oscillators.push(oscillator);
		return oscillator;
	}

	createGain(): FakeGain {
		const gain = new FakeGain();
		this.gains.push(gain);
		return gain;
	}
}

const VERDICTS: readonly ResponseVerdict[] = ALL_VERDICTS;

function setup() {
	const audio = new FakeAudioContext();
	const cues = new WebAudioCues(() => audio as unknown as AudioContext);
	return { audio, cues };
}

describe('WebAudioCues', () => {
	it('does not touch the audio context until a cue plays', () => {
		const context = vi.fn((): AudioContext => {
			throw new Error('not resumed');
		});
		expect(() => new WebAudioCues(context)).not.toThrow();
		expect(context).not.toHaveBeenCalled();
	});

	it('plays one oscillator per tone of the verdict', () => {
		for (const verdict of VERDICTS) {
			const { audio, cues } = setup();
			cues.play(verdict, 2);
			expect(audio.oscillators.map((o) => o.type)).toEqual(
				CUE_SPECS[verdict].map((tone) => tone.waveform)
			);
		}
	});

	it('starts and stops each tone at its exact audio time', () => {
		const { audio, cues } = setup();
		cues.play('perfect', 2);
		const [root, third] = CUE_SPECS.perfect;
		expect(audio.oscillators.map((o) => [o.startTime, o.stopTime])).toEqual([
			[2 + root.offset, 2 + root.offset + root.duration],
			[2 + third.offset, 2 + third.offset + third.duration]
		]);
	});

	it('shapes each tone with a fast attack and a decay to silence', () => {
		const { audio, cues } = setup();
		cues.play('wrong', 1);
		const [tone] = CUE_SPECS.wrong;
		const start = 1 + tone.offset;
		expect(audio.gains[0].gain.calls).toEqual([
			{ method: 'setValueAtTime', value: 0, time: start },
			{ method: 'linearRampToValueAtTime', value: tone.peakGain, time: start + CUE_ATTACK_S },
			{ method: 'exponentialRampToValueAtTime', value: CUE_SILENCE, time: start + tone.duration }
		]);
		expect(audio.oscillators[0].connections[0]).toBe(audio.gains[0]);
		expect(audio.gains[0].connections[0]).toBe(audio.destination);
	});

	it('glides the pitch of early and holds the pitch of perfect', () => {
		const { audio, cues } = setup();
		cues.play('early', 1);
		cues.play('perfect', 1);
		const [early] = CUE_SPECS.early;
		const start = 1 + early.offset;
		expect(audio.oscillators[0].frequency.calls).toEqual([
			{ method: 'setValueAtTime', value: early.startHz, time: start },
			{ method: 'exponentialRampToValueAtTime', value: early.endHz, time: start + early.duration }
		]);
		expect(audio.oscillators[1].frequency.calls).toHaveLength(1);
	});

	it('plays immediately without a time, and never in the past', () => {
		const { audio, cues } = setup();
		audio.currentTime = 5;
		cues.play('late');
		cues.play('late', 4);
		const [late] = CUE_SPECS.late;
		expect(audio.oscillators.map((o) => o.startTime)).toEqual([5 + late.offset, 5 + late.offset]);
	});
});
