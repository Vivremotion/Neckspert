import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./frame-processor.ts?worker&url', () => ({
	default: '/virtual/note-frame-processor.js'
}));

import { WebAudioNoteDetector } from './WebAudioNoteDetector';

class FakeNode {
	port = { onmessage: null as ((ev: MessageEvent) => void) | null };
	connect = vi.fn();
	disconnect = vi.fn();
}

class FakeContext {
	currentTime = 0;
	destination = {};
	audioWorklet = {
		addModule: vi.fn(async () => undefined)
	};
	createMediaStreamSource = vi.fn(() => ({
		connect: vi.fn(),
		disconnect: vi.fn()
	}));
	createGain = vi.fn(() => {
		const gain = { gain: { setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
		return gain;
	});
}

function installMedia(
	devices: MediaDeviceInfo[] = [],
	channelCount = 1,
	extras: { label?: string; userAgent?: string } = {}
) {
	const track = {
		stop: vi.fn(),
		label: extras.label ?? '',
		getSettings: () => ({ channelCount })
	};
	const stream = {
		getTracks: () => [track],
		getAudioTracks: () => [track]
	} as unknown as MediaStream;
	const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
		(installMedia as unknown as { lastConstraints: MediaStreamConstraints }).lastConstraints =
			constraints;
		return stream;
	});
	const enumerateDevices = vi.fn(async () => devices);
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: {
			userAgent: extras.userAgent ?? 'Mozilla/5.0 Chrome/140.0',
			mediaDevices: { getUserMedia, enumerateDevices }
		}
	});
	return { getUserMedia, stream, track };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('WebAudioNoteDetector', () => {
	it('lists audio inputs and skips unlabeled placeholders', async () => {
		installMedia([
			{
				deviceId: '',
				kind: 'audioinput',
				label: '',
				groupId: '',
				toJSON() {
					return this;
				}
			} as MediaDeviceInfo,
			{
				deviceId: 'in-1',
				kind: 'audioinput',
				label: 'Interface',
				groupId: 'g',
				toJSON() {
					return this;
				}
			} as MediaDeviceInfo
		]);
		const detector = new WebAudioNoteDetector(() => new FakeContext() as unknown as AudioContext);
		await expect(detector.listInputs()).resolves.toEqual([{ id: 'in-1', label: 'Interface' }]);
	});

	it('resumes the clock before the context and again after the mic opens', async () => {
		installMedia();
		const order: string[] = [];
		const fake = new FakeContext();
		vi.stubGlobal(
			'AudioWorkletNode',
			vi.fn(function AudioWorkletNode() {
				return new FakeNode();
			})
		);
		const detector = new WebAudioNoteDetector(
			() => {
				order.push('context');
				return fake as unknown as AudioContext;
			},
			{
				resume: async () => {
					order.push('resume');
				}
			}
		);
		await detector.start(null);
		expect(order).toEqual(['resume', 'context', 'resume']);
		detector.stop();
	});

	it('opens getUserMedia with raw-input constraints and loads the worklet', async () => {
		const { getUserMedia } = installMedia();
		const fake = new FakeContext();
		const node = new FakeNode();
		vi.stubGlobal(
			'AudioWorkletNode',
			vi.fn(function AudioWorkletNode() {
				return node;
			})
		);
		const detector = new WebAudioNoteDetector(() => fake as unknown as AudioContext);
		await detector.start(null);
		expect(getUserMedia).toHaveBeenCalledOnce();
		const audio = getUserMedia.mock.calls[0][0].audio as MediaTrackConstraints;
		expect(audio.echoCancellation).toBe(false);
		expect(audio.noiseSuppression).toBe(false);
		expect(audio.autoGainControl).toBe(false);
		expect(audio.channelCount).toBeUndefined();
		expect(fake.audioWorklet.addModule).toHaveBeenCalledOnce();
		detector.stop();
	});

	it('reopens a Firefox built-in mic with echo cancellation and noise suppression', async () => {
		const { getUserMedia, track } = installMedia([], 1, {
			label: 'Micro MacBook Pro',
			userAgent: 'Mozilla/5.0 (Macintosh; rv:143.0) Gecko/20100101 Firefox/143.0'
		});
		const fake = new FakeContext();
		vi.stubGlobal(
			'AudioWorkletNode',
			vi.fn(function AudioWorkletNode() {
				return new FakeNode();
			})
		);
		const detector = new WebAudioNoteDetector(() => fake as unknown as AudioContext);
		await detector.start('macbook');
		expect(getUserMedia).toHaveBeenCalledTimes(2);
		const first = getUserMedia.mock.calls[0][0].audio as MediaTrackConstraints;
		const second = getUserMedia.mock.calls[1][0].audio as MediaTrackConstraints;
		expect(first.echoCancellation).toBe(false);
		expect(second.echoCancellation).toBe(true);
		expect(second.noiseSuppression).toBe(true);
		expect(second.autoGainControl).toBe(false);
		expect(second.deviceId).toEqual({ exact: 'macbook' });
		expect(track.stop).toHaveBeenCalledOnce();
		detector.stop();
	});

	it('keeps an external interface raw on Firefox', async () => {
		const { getUserMedia } = installMedia([], 2, {
			label: 'Scarlett 2i2 USB',
			userAgent: 'Mozilla/5.0 (Macintosh; rv:143.0) Gecko/20100101 Firefox/143.0'
		});
		const fake = new FakeContext();
		vi.stubGlobal(
			'AudioWorkletNode',
			vi.fn(function AudioWorkletNode() {
				return new FakeNode();
			})
		);
		const detector = new WebAudioNoteDetector(() => fake as unknown as AudioContext);
		await detector.start('scarlett');
		expect(getUserMedia).toHaveBeenCalledOnce();
		const audio = getUserMedia.mock.calls[0][0].audio as MediaTrackConstraints;
		expect(audio.echoCancellation).toBe(false);
		expect(audio.noiseSuppression).toBe(false);
		detector.stop();
	});

	it.each([
		{ channelCount: 1, label: 'mono' },
		{ channelCount: 2, label: 'stereo' }
	])('opens the worklet on the $label input channel count', async ({ channelCount }) => {
		installMedia([], channelCount);
		const fake = new FakeContext();
		const Worklet = vi.fn(function AudioWorkletNode() {
			return new FakeNode();
		});
		vi.stubGlobal('AudioWorkletNode', Worklet);
		const detector = new WebAudioNoteDetector(() => fake as unknown as AudioContext);
		await detector.start(null);
		expect(Worklet).toHaveBeenCalledWith(
			fake,
			'note-frame-processor',
			expect.objectContaining({
				channelCount,
				channelCountMode: 'explicit',
				channelInterpretation: 'speakers'
			})
		);
		detector.stop();
	});

	it('boosts a built-in mic and leaves an interface untouched', async () => {
		const fake = new FakeContext();
		const node = new FakeNode();
		vi.stubGlobal(
			'AudioWorkletNode',
			vi.fn(function AudioWorkletNode() {
				return node;
			})
		);
		const frame = new Float32Array(512);
		frame.fill(0.1);

		installMedia([], 1, { label: 'Micro MacBook Pro' });
		const builtIn = new WebAudioNoteDetector(() => fake as unknown as AudioContext);
		const builtInLevels: number[] = [];
		builtIn.onLevel((rms) => builtInLevels.push(rms));
		builtIn.setBuiltInGain(4);
		await builtIn.start(null);
		node.port.onmessage!({ data: { samples: frame, frameTime: 1 } } as MessageEvent);
		expect(builtInLevels[0]).toBeCloseTo(0.4);
		builtIn.stop();

		installMedia([], 2, { label: 'Scarlett 2i2 USB' });
		const iface = new WebAudioNoteDetector(() => fake as unknown as AudioContext);
		const ifaceLevels: number[] = [];
		iface.onLevel((rms) => ifaceLevels.push(rms));
		iface.setBuiltInGain(4);
		await iface.start(null);
		node.port.onmessage!({ data: { samples: frame, frameTime: 2 } } as MessageEvent);
		expect(ifaceLevels[0]).toBeCloseTo(0.1);
		iface.stop();
	});

	it('forwards worklet frames to note and level listeners', async () => {
		installMedia();
		const fake = new FakeContext();
		const node = new FakeNode();
		vi.stubGlobal(
			'AudioWorkletNode',
			vi.fn(function AudioWorkletNode() {
				return node;
			})
		);
		const detector = new WebAudioNoteDetector(() => fake as unknown as AudioContext, {
			clarityThreshold: 0.5,
			minRms: 0.001,
			onsetRatio: 1.2,
			cooldownMs: 50
		});
		const levels: number[] = [];
		detector.onLevel((rms) => levels.push(rms));
		await detector.start(null);
		expect(node.port.onmessage).toBeTypeOf('function');

		const frame = new Float32Array(512);
		for (let i = 0; i < 512; i++) frame[i] = 0.2;
		node.port.onmessage!({ data: { samples: frame, frameTime: 1 } } as MessageEvent);
		expect(levels.length).toBe(1);
		expect(levels[0]).toBeGreaterThan(0);
		detector.stop();
	});
});
