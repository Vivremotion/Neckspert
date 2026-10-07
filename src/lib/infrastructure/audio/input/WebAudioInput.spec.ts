import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../detection/frame-processor.ts?worker&url', () => ({
	default: '/virtual/note-frame-processor.js'
}));

import { WebAudioInput, type AudioFrame } from './WebAudioInput';

class FakeNode {
	port = { onmessage: null as ((ev: MessageEvent) => void) | null };
	connect = vi.fn();
	disconnect = vi.fn();
}

class FakeContext {
	currentTime = 0;
	sampleRate = 48000;
	destination = {};
	audioWorklet = { addModule: vi.fn(async () => undefined) };
	createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
	createGain = vi.fn(() => ({
		gain: { setValueAtTime: vi.fn() },
		connect: vi.fn(),
		disconnect: vi.fn()
	}));
}

function install(label = '') {
	const track = { stop: vi.fn(), label, getSettings: () => ({ channelCount: 1 }) };
	const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: {
			userAgent: 'Mozilla/5.0 Chrome/140.0',
			mediaDevices: {
				getUserMedia: vi.fn(async () => stream),
				enumerateDevices: vi.fn(async () => [])
			}
		}
	});
	const node = new FakeNode();
	vi.stubGlobal(
		'AudioWorkletNode',
		vi.fn(function AudioWorkletNode() {
			return node;
		})
	);
	return node;
}

function send(node: FakeNode, samples: number[], frameTime: number) {
	node.port.onmessage?.({
		data: { samples: new Float32Array(samples), frameTime }
	} as MessageEvent);
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('WebAudioInput', () => {
	it('hands every frame to each subscriber', async () => {
		const node = install();
		const input = new WebAudioInput(() => new FakeContext() as unknown as AudioContext);
		const a: AudioFrame[] = [];
		const b: AudioFrame[] = [];
		input.onFrame((frame) => a.push(frame));
		input.onFrame((frame) => b.push(frame));
		await input.start(null);
		send(node, [0.1, -0.1], 1.5);
		expect(a).toHaveLength(1);
		expect(b).toEqual(a);
		expect(a[0].frameTime).toBe(1.5);
		expect(input.sampleRate).toBe(48000);
		input.stop();
	});

	it('applies the built-in mic gain to the frames', async () => {
		const node = install('MacBook Pro Microphone');
		const input = new WebAudioInput(() => new FakeContext() as unknown as AudioContext);
		const frames: AudioFrame[] = [];
		input.onFrame((frame) => frames.push(frame));
		input.setBuiltInGain(4);
		await input.start(null);
		send(node, [0.1], 0);
		expect(frames[0].samples[0]).toBeCloseTo(0.4, 6);
		input.stop();
	});

	it('hands nothing once stopped', async () => {
		const node = install();
		const input = new WebAudioInput(() => new FakeContext() as unknown as AudioContext);
		const frames: AudioFrame[] = [];
		input.onFrame((frame) => frames.push(frame));
		await input.start(null);
		const handler = node.port.onmessage;
		input.stop();
		handler?.({ data: { samples: new Float32Array([0.1]), frameTime: 0 } } as MessageEvent);
		expect(node.port.onmessage).toBeNull();
		expect(frames).toHaveLength(0);
	});
});
