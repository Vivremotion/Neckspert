import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../detection/frame-processor.ts?worker&url', () => ({
	default: '/virtual/note-frame-processor.js'
}));

import { FakeDiagnosticSink } from '$lib/testing/fakes';
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

function install(label = '', userAgent = 'Mozilla/5.0 Chrome/140.0') {
	const track = { stop: vi.fn(), label, getSettings: () => ({ channelCount: 1 }) };
	const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: {
			userAgent,
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

	it('opens a raw input on the Firefox built-in mic when asked, with no voice processing', async () => {
		install(
			'MacBook Pro Microphone',
			'Mozilla/5.0 (Macintosh; rv:143.0) Gecko/20100101 Firefox/143.0'
		);
		const input = new WebAudioInput(() => new FakeContext() as unknown as AudioContext, {
			raw: true
		});
		await input.start('mac');
		const getUserMedia = vi.mocked(navigator.mediaDevices.getUserMedia);
		expect(getUserMedia).toHaveBeenCalledOnce();
		expect(getUserMedia).toHaveBeenCalledWith({
			audio: {
				deviceId: { exact: 'mac' },
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false
			}
		});
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

	describe('with a diagnostic journal', () => {
		function journaled(label: string) {
			const node = install(label);
			const context = new FakeContext();
			context.currentTime = 12.5;
			const diagnostics = new FakeDiagnosticSink();
			let now = 1_000_000;
			const input = new WebAudioInput(() => context as unknown as AudioContext, {
				diagnostics,
				now: () => now
			});
			return { node, context, diagnostics, input, later: (ms: number) => (now += ms) };
		}

		it('opens a take with the input it opened, then writes input.opened', async () => {
			const { diagnostics, input } = journaled('USB Audio CODEC');
			await input.start(null);
			const info = { label: 'USB Audio CODEC', sampleRate: 48000, channelCount: 1, builtInGain: 1 };
			expect(diagnostics.takes).toEqual([
				{ opened: { startedAt: 1_000_000, startedAudioTime: 12.5, input: info }, endedAt: null }
			]);
			expect(diagnostics.events).toEqual([{ kind: 'input.opened', audioTime: 12.5, data: info }]);
			input.stop();
		});

		it('records the gain applied to a built-in mic', async () => {
			const { diagnostics, input } = journaled('MacBook Pro Microphone');
			await input.start(null);
			const opened = diagnostics.takes[0].opened as { input: { builtInGain: number } };
			expect(opened.input.builtInGain).toBe(8);
			input.stop();
		});

		it('records the sound of the take and closes it on stop', async () => {
			const { node, context, diagnostics, input, later } = journaled('USB Audio CODEC');
			await input.start(null);
			for (let i = 0; i < 10; i++) send(node, new Array(512).fill(0.1), 12.5 + (i * 512) / 48000);
			context.currentTime = 20;
			later(7500);
			input.stop();

			expect(diagnostics.chunks).toHaveLength(1);
			expect(diagnostics.chunks[0].sampleRate).toBe(16000);
			expect(diagnostics.events.at(-1)).toEqual({
				kind: 'input.closed',
				audioTime: 20,
				data: null
			});
			expect(diagnostics.takes[0].endedAt).toBe(1_007_500);
		});

		it('closes the take of a first opening before the next one', async () => {
			const { diagnostics, input } = journaled('USB Audio CODEC');
			await input.start(null);
			await input.start(null);
			input.stop();
			expect(diagnostics.takes).toHaveLength(2);
			expect(diagnostics.takes.every((take) => take.endedAt !== null)).toBe(true);
			expect(diagnostics.events.map((e) => e.kind)).toEqual([
				'input.opened',
				'input.closed',
				'input.opened',
				'input.closed'
			]);
		});

		it('writes nothing on a stop with no take open', () => {
			const { diagnostics, input } = journaled('USB Audio CODEC');
			input.stop();
			expect(diagnostics.events).toEqual([]);
			expect(diagnostics.takes).toEqual([]);
		});

		it('opens the input without waiting for the journal', async () => {
			const { node, diagnostics, input } = journaled('USB Audio CODEC');
			let settle: () => void = () => {};
			const opening = diagnostics.openTake.bind(diagnostics);
			diagnostics.openTake = (take) =>
				new Promise<void>((resolve) => (settle = () => void opening(take).then(resolve)));
			const frames: AudioFrame[] = [];
			input.onFrame((frame) => frames.push(frame));

			await input.start(null);
			send(node, new Array(512).fill(0.1), 12.5);
			expect(frames).toHaveLength(1);
			expect(diagnostics.events).toEqual([]);

			settle();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(diagnostics.events.map((e) => e.kind)).toEqual(['input.opened']);
			input.stop();
			expect(diagnostics.takes[0].endedAt).not.toBeNull();
		});

		it('records no sound when the journal is off', async () => {
			const { node, diagnostics, input } = journaled('USB Audio CODEC');
			diagnostics.enabled = false;
			await input.start(null);
			send(node, new Array(512).fill(0.1), 12.5);
			input.stop();
			expect(diagnostics.chunks).toEqual([]);
			expect(diagnostics.events).toEqual([]);
		});
	});
});
