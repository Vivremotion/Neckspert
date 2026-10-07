import { describe, expect, it } from 'vitest';
import type { DiagnosticAudioChunk } from '$lib/application/ports';
import { readWav } from '$lib/infrastructure/audio/chords/testing/wav';
import type { DiagnosticTakeRow } from './diagnosticsDb';
import { buildDiagnosticArchive } from './exportArchive';
import { readZip } from './testing/readZip';

const STARTED_AT = Date.UTC(2026, 9, 7, 10, 15, 30, 250);
const FOLDER = 'prises/2026-10-07T10-15-30.250Z';

function take(overrides: Partial<DiagnosticTakeRow> = {}): DiagnosticTakeRow {
	return {
		id: 't1',
		startedAt: STARTED_AT,
		startedAudioTime: 99.5,
		endedAt: STARTED_AT + 4000,
		input: { label: 'USB', sampleRate: 48000, channelCount: 1, builtInGain: 1 },
		bytes: 1234,
		truncated: false,
		...overrides
	};
}

function journal(
	takes: DiagnosticTakeRow[],
	events: Record<string, { audioTime: number; kind: string; data: unknown }[]>,
	audio: Record<string, DiagnosticAudioChunk[]>
) {
	return {
		takes: async () => takes,
		eventsOf: async (id: string) => events[id] ?? [],
		audioOf: async (id: string) => audio[id] ?? []
	};
}

function filled(audioTime: number, seconds: number, value: number): DiagnosticAudioChunk {
	return { audioTime, sampleRate: 16000, samples: new Int16Array(seconds * 16000).fill(value) };
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('buildDiagnosticArchive', () => {
	it('lays out the learning backup and each take, its sound with the gap filled with silence', async () => {
		const learning = { app: 'neckspert-play', version: 3, attempts: [] };
		const events = [
			{ audioTime: 100, kind: 'input.opened', data: { label: 'USB' } },
			{ audioTime: 101.2, kind: 'input.gap', data: { fromAudioTime: 101, durationS: 1 } }
		];
		const archive = await buildDiagnosticArchive(
			journal([take()], { t1: events }, { t1: [filled(100, 1, 16384), filled(102, 0.5, -8192)] }),
			learning
		);
		const entries = readZip(archive);
		expect(entries.map((e) => e.path)).toEqual([
			'apprentissage.json',
			`${FOLDER}/prise.json`,
			`${FOLDER}/audio.wav`,
			`${FOLDER}/evenements.jsonl`
		]);
		const file = (path: string) => entries.find((e) => e.path === path)!.bytes;

		expect(JSON.parse(decode(file('apprentissage.json')))).toEqual(learning);
		expect(JSON.parse(decode(file(`${FOLDER}/prise.json`)))).toEqual({
			...take(),
			audioStartTime: 100,
			gaps: [{ atS: 1, durationS: 1 }]
		});
		const lines = decode(file(`${FOLDER}/evenements.jsonl`))
			.trimEnd()
			.split('\n');
		expect(lines.map((line) => JSON.parse(line))).toEqual(events);

		const wav = readWav(file(`${FOLDER}/audio.wav`));
		expect(wav.sampleRate).toBe(16000);
		expect(wav.samples.length).toBe(2.5 * 16000);
		expect(wav.samples[8000]).toBeCloseTo(0.5, 6);
		expect(wav.samples.slice(16000, 32000).every((v) => v === 0)).toBe(true);
		expect(wav.samples[32000 + 4000]).toBeCloseTo(-0.25, 6);
	});

	it('writes no audio.wav for a take without sound', async () => {
		const archive = await buildDiagnosticArchive(
			journal([take({ truncated: true })], { t1: [{ audioTime: 1, kind: 'k', data: null }] }, {}),
			{}
		);
		const entries = readZip(archive);
		expect(entries.map((e) => e.path)).toEqual([
			'apprentissage.json',
			`${FOLDER}/prise.json`,
			`${FOLDER}/evenements.jsonl`
		]);
		const row = JSON.parse(decode(entries[1].bytes));
		expect(row.gaps).toEqual([]);
		expect(row.audioStartTime).toBeNull();
	});

	it('keeps takes apart, oldest first, and writes an empty event file for a silent take', async () => {
		const second = take({ id: 't2', startedAt: STARTED_AT + 60_000 });
		const archive = await buildDiagnosticArchive(journal([take(), second], {}, {}), {});
		const paths = readZip(archive).map((e) => e.path);
		expect(paths).toEqual([
			'apprentissage.json',
			`${FOLDER}/prise.json`,
			`${FOLDER}/evenements.jsonl`,
			'prises/2026-10-07T10-16-30.250Z/prise.json',
			'prises/2026-10-07T10-16-30.250Z/evenements.jsonl'
		]);
	});
});
