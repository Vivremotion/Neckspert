import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { allExercises } from '$lib/domain/exercise/registry';
import { readZip } from '$lib/infrastructure/diagnostics/testing/readZip';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { TEST_PLACED_VOICING_SKILL } from '$lib/testing/testSkills';
import { CATALOG_FILES } from './catalogFiles';
import { createApp } from './createApp';
import { loadDefinitions } from './definitions';

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

/** A definition file of one arpeggio exercise `id`, with the skill it practises. */
function arpeggioFile(id: string): string {
	const { figures: _figures, ...rest } = ARPEGGIO_EXERCISE;
	return JSON.stringify({
		format: 0,
		skills: [TEST_PLACED_VOICING_SKILL],
		exercises: [
			{
				...JSON.parse(JSON.stringify(rest)),
				id,
				figures: [
					{ id: 'quarters', lilypond: 'c4 c c c' },
					{ id: 'eighths', lilypond: 'c8 c c c c c c c' }
				]
			}
		]
	});
}

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
		expect(typeof services.routines).toBe('function');
		expect(typeof services.sessionSummary).toBe('function');
		expect(typeof services.neckMap).toBe('function');
		expect(typeof services.startSession).toBe('function');
		expect(typeof services.startExercise).toBe('function');

		const settings = await services.settings.get();
		expect(settings.locale).toBe('fr');
		expect(settings).not.toHaveProperty('tempoBpm');
		expect(settings.inputDeviceId).toBeNull();
		expect(settings.latency).toEqual({});

		expect(await services.homeStats()).toEqual({ medianColdOffsetMs: null, trend: null });
		expect((await services.routines()).map((routine) => [routine.id, routine.open])).toEqual([
			['notes', true],
			['chords', true],
			['chords-zone', false],
			['changes', false]
		]);
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
		expect(file.version).toBe(9);
		expect(file.attempts).toEqual([]);
		expect(file.cards).toEqual([]);
		expect(file.sessions).toEqual([]);
	});

	it('exports the diagnostic journal with the learning backup, and clears it', async () => {
		const services = createApp({
			createContext: () => new StubAudioContext() as unknown as AudioContext,
			databaseName: crypto.randomUUID(),
			diagnosticsDatabaseName: crypto.randomUUID()
		});
		await services.settings.update({ locale: 'en' });

		expect(await services.diagnostics.usage()).toEqual({ bytes: 0, takes: 0 });
		const archive = await services.diagnostics.exportArchive();
		expect(archive.type).toBe('application/zip');
		// jsdom's Blob has neither arrayBuffer() nor stream().
		const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as ArrayBuffer);
			reader.onerror = () => reject(reader.error);
			reader.readAsArrayBuffer(archive);
		});
		const bytes = new Uint8Array(buffer);
		const entries = readZip(bytes);
		expect(entries.map((e) => e.path)).toEqual(['apprentissage.json']);
		const learning = JSON.parse(new TextDecoder().decode(entries[0].bytes));
		expect(learning.settings.locale).toBe('en');
		await expect(services.diagnostics.clear()).resolves.toBeUndefined();
	});

	it('loads the definition files of a backup it imports', async () => {
		const services = createApp({
			createContext: () => new StubAudioContext() as unknown as AudioContext,
			databaseName: crypto.randomUUID()
		});
		await services.definitions.ready();
		const file = JSON.parse(JSON.stringify(await services.backup.exportAll()));
		file.definitionFiles = [
			{ name: 'a.json', text: arpeggioFile('backup-arpeggio'), importedAt: 1 }
		];

		try {
			await services.backup.importAll(file);

			expect(allExercises().map((exercise) => exercise.id)).toContain('backup-arpeggio');
			expect((await services.definitions.files()).map((stored) => stored.exercises)).toEqual([
				['backup-arpeggio']
			]);
		} finally {
			loadDefinitions({ catalog: CATALOG_FILES });
		}
	});
});
