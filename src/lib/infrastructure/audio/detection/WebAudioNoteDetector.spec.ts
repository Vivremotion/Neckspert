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

function installMedia(devices: MediaDeviceInfo[] = []) {
	const track = { stop: vi.fn() };
	const stream = { getTracks: () => [track] } as unknown as MediaStream;
	const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
		(installMedia as unknown as { lastConstraints: MediaStreamConstraints }).lastConstraints =
			constraints;
		return stream;
	});
	const enumerateDevices = vi.fn(async () => devices);
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: { mediaDevices: { getUserMedia, enumerateDevices } }
	});
	return { getUserMedia, stream, track };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('WebAudioNoteDetector', () => {
	it('lists audio inputs', async () => {
		installMedia([
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
		expect(fake.audioWorklet.addModule).toHaveBeenCalledOnce();
		detector.stop();
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
