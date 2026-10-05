import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './createApp';

class StubAudioContext {
	currentTime = 0;
	state: AudioContextState = 'suspended';
	destination = {} as AudioDestinationNode;

	async resume(): Promise<void> {
		this.state = 'running';
	}

	createGain(): GainNode {
		return {
			gain: { value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
			connect: () => ({}),
			disconnect: () => {}
		} as unknown as GainNode;
	}

	createOscillator(): OscillatorNode {
		return {
			frequency: { value: 440, setValueAtTime: () => {} },
			connect: () => ({}),
			disconnect: () => {},
			start: () => {},
			stop: () => {}
		} as unknown as OscillatorNode;
	}

	createBuffer(): AudioBuffer {
		return {
			getChannelData: () => new Float32Array(128),
			length: 128,
			numberOfChannels: 1,
			sampleRate: 48000,
			duration: 128 / 48000
		} as unknown as AudioBuffer;
	}

	createBufferSource(): AudioBufferSourceNode {
		return {
			buffer: null,
			connect: () => ({}),
			disconnect: () => {},
			start: () => {},
			stop: () => {}
		} as unknown as AudioBufferSourceNode;
	}

	createBiquadFilter(): BiquadFilterNode {
		return {
			type: 'bandpass',
			frequency: { value: 2000, setValueAtTime: () => {} },
			Q: { value: 1, setValueAtTime: () => {} },
			connect: () => ({}),
			disconnect: () => {}
		} as unknown as BiquadFilterNode;
	}

	close(): Promise<void> {
		this.state = 'closed';
		return Promise.resolve();
	}
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('createApp', () => {
	it('wires AppServices without creating an AudioContext at construction', async () => {
		const factory = vi.fn(() => new StubAudioContext() as unknown as AudioContext);
		const services = createApp({
			createContext: factory,
			databaseName: crypto.randomUUID()
		});

		expect(factory).not.toHaveBeenCalled();
		expect(services.settings).toBeDefined();
		expect(services.backup).toBeDefined();
		expect(services.detector).toBeDefined();
		expect(services.calibration).toBeDefined();
		expect(typeof services.homeStats).toBe('function');
		expect(typeof services.sessionSummary).toBe('function');
		expect(typeof services.neckMap).toBe('function');
		expect(typeof services.startSession).toBe('function');

		const settings = await services.settings.get();
		expect(settings.locale).toBe('fr');
		expect(settings).not.toHaveProperty('tempoBpm');
		expect(settings.inputDeviceId).toBeNull();
		expect(settings.calibrationOffsetMs).toBeNull();

		const stats = await services.homeStats();
		expect(stats.dueCount).toBe(0);
		expect(factory).not.toHaveBeenCalled();
	});

	it('reads the calibration device id from settings', async () => {
		const factory = vi.fn(() => new StubAudioContext() as unknown as AudioContext);
		const services = createApp({
			createContext: factory,
			databaseName: crypto.randomUUID()
		});

		await services.settings.update({ inputDeviceId: 'usb-interface-1' });
		const again = await services.settings.get();
		expect(again.inputDeviceId).toBe('usb-interface-1');
		expect(factory).not.toHaveBeenCalled();
	});

	it('keeps repositories and backup on one database', async () => {
		const name = crypto.randomUUID();
		const services = createApp({
			createContext: () => new StubAudioContext() as unknown as AudioContext,
			databaseName: name
		});

		await services.settings.update({ locale: 'en' });
		const file = await services.backup.exportAll();
		expect(file.settings.locale).toBe('en');
		expect(file.progressions).toEqual([]);
		expect(file.attempts).toEqual([]);
		expect(file.cards).toEqual([]);
		expect(file.sessions).toEqual([]);
	});
});
