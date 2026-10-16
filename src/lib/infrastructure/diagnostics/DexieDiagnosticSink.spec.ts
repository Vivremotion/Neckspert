import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { DiagnosticInputInfo } from '$lib/application/ports';
import { DexieDiagnosticSink } from './DexieDiagnosticSink';

const MB = 1024 * 1024;
const INPUT: DiagnosticInputInfo = {
	label: 'USB Audio',
	sampleRate: 48000,
	channelCount: 1,
	builtInGain: 1
};

function journal(settings = { enabled: true, budgetMb: 300 }) {
	let id = 0;
	const sink = new DexieDiagnosticSink({
		name: crypto.randomUUID(),
		settings: async () => ({ ...settings }),
		newId: () => `take-${++id}`
	});
	return { sink, settings };
}

/** A chunk of `bytes` bytes of 16-bit sound. */
function chunk(audioTime: number, bytes: number) {
	return { audioTime, sampleRate: 16000, samples: new Int16Array(bytes / 2).fill(7) };
}

async function open(sink: DexieDiagnosticSink, startedAt: number): Promise<void> {
	await sink.openTake({ startedAt, startedAudioTime: startedAt / 1000, input: INPUT });
}

describe('DexieDiagnosticSink', () => {
	it('is disabled until a take opens, and after it closes', async () => {
		const { sink } = journal();
		expect(sink.enabled).toBe(false);
		await open(sink, 1000);
		expect(sink.enabled).toBe(true);
		await sink.closeTake(2000);
		expect(sink.enabled).toBe(false);
	});

	it('keeps a take with its events and its sound, read back in order', async () => {
		const { sink } = journal();
		await open(sink, 1000);
		sink.event('input.opened', 1, INPUT);
		sink.audio(chunk(1, 64));
		sink.event('chord.report', 1.5, { decided: 'c', spectrum: [1, 2] });
		sink.audio(chunk(11, 32));
		sink.event('input.closed', 12, null);
		await sink.closeTake(13000);

		const [take] = await sink.takes();
		expect(take).toMatchObject({
			id: 'take-1',
			startedAt: 1000,
			startedAudioTime: 1,
			endedAt: 13000,
			input: INPUT,
			truncated: false
		});
		expect(await sink.eventsOf('take-1')).toEqual([
			{ audioTime: 1, kind: 'input.opened', data: INPUT },
			{ audioTime: 1.5, kind: 'chord.report', data: { decided: 'c', spectrum: [1, 2] } },
			{ audioTime: 12, kind: 'input.closed', data: null }
		]);
		const audio = await sink.audioOf('take-1');
		expect(audio.map((c) => [c.audioTime, c.sampleRate, c.samples.length])).toEqual([
			[1, 16000, 32],
			[11, 16000, 16]
		]);
		expect(audio[0].samples).toBeInstanceOf(Int16Array);
		expect(audio[0].samples[0]).toBe(7);
	});

	it('counts the bytes of the sound and of the events as JSON', async () => {
		const { sink } = journal();
		await open(sink, 1000);
		sink.event('k', 2, { a: 1 });
		sink.audio(chunk(2, 100));
		await sink.closeTake(2000);
		const expected = 100 + JSON.stringify({ kind: 'k', audioTime: 2, data: { a: 1 } }).length;
		expect((await sink.takes())[0].bytes).toBe(expected);
		expect(await sink.usage()).toEqual({ bytes: expected, takes: 1 });
	});

	it('erases the oldest takes past the budget, whole, never the one just recorded', async () => {
		const { sink } = journal({ enabled: true, budgetMb: 1 });
		for (const startedAt of [1000, 2000, 3000]) {
			await open(sink, startedAt);
			sink.event('input.opened', startedAt / 1000, INPUT);
			sink.audio(chunk(startedAt / 1000, 0.4 * MB - ((0.4 * MB) % 2)));
			await sink.closeTake(startedAt + 500);
		}
		const takes = await sink.takes();
		expect(takes.map((t) => t.id)).toEqual(['take-2', 'take-3']);
		expect(await sink.eventsOf('take-1')).toEqual([]);
		expect(await sink.audioOf('take-1')).toEqual([]);
		expect((await sink.usage()).bytes).toBeLessThanOrEqual(MB);
	});

	it('never erases the take that opens while the last one closes', async () => {
		const { sink } = journal({ enabled: true, budgetMb: 1 });
		await open(sink, 1000);
		sink.audio(chunk(1, 0.6 * MB - ((0.6 * MB) % 2)));
		await sink.closeTake(1500);
		await open(sink, 2000);
		sink.audio(chunk(2, 0.6 * MB - ((0.6 * MB) % 2)));
		const closing = sink.closeTake(2500);
		const opening = open(sink, 3000);
		sink.event('input.opened', 3, INPUT);
		await Promise.all([closing, opening]);
		sink.audio(chunk(3, 0.6 * MB - ((0.6 * MB) % 2)));

		const ids = (await sink.takes()).map((t) => t.id);
		expect(ids).toEqual(['take-2', 'take-3']);
		expect(sink.enabled).toBe(true);
		expect((await sink.audioOf('take-3')).length).toBe(1);
	});

	it('stops keeping the sound of a take that alone exceeds the budget, but keeps its events', async () => {
		const { sink } = journal({ enabled: true, budgetMb: 1 });
		await open(sink, 1000);
		for (let i = 0; i < 6; i++) {
			sink.audio(chunk(i * 10, 0.25 * MB));
			sink.event('chord.report', i * 10 + 1, { i });
		}
		await sink.closeTake(2000);

		const [take] = await sink.takes();
		expect(take.truncated).toBe(true);
		expect(take.bytes).toBeLessThanOrEqual(MB);
		expect((await sink.audioOf('take-1')).length).toBe(3);
		expect((await sink.eventsOf('take-1')).map((e) => e.data)).toEqual(
			[0, 1, 2, 3, 4, 5].map((i) => ({ i }))
		);
	});

	it('writes nothing when the setting is off at the opening', async () => {
		const { sink } = journal({ enabled: false, budgetMb: 300 });
		await open(sink, 1000);
		expect(sink.enabled).toBe(false);
		sink.event('input.opened', 1, INPUT);
		sink.audio(chunk(1, 64));
		await sink.closeTake(2000);
		expect(await sink.takes()).toEqual([]);
		expect(await sink.usage()).toEqual({ bytes: 0, takes: 0 });
	});

	it('applies a setting changed during a take to the next take only', async () => {
		const { sink, settings } = journal({ enabled: true, budgetMb: 300 });
		await open(sink, 1000);
		settings.enabled = false;
		settings.budgetMb = 1;
		sink.audio(chunk(1, 2 * MB));
		sink.event('k', 1, null);
		expect(sink.enabled).toBe(true);
		await sink.closeTake(2000);
		expect(await sink.takes()).toHaveLength(1);
		expect((await sink.takes())[0].truncated).toBe(false);

		await open(sink, 3000);
		expect(sink.enabled).toBe(false);
		await sink.closeTake(4000);
		expect((await sink.takes()).map((t) => t.id)).toEqual(['take-1']);
	});

	it('tells whether the take being recorded keeps the native rate', async () => {
		const { sink, settings } = journal();
		expect(sink.nativeRate).toBe(false);
		await open(sink, 1000);
		expect(sink.nativeRate).toBe(false);
		await sink.closeTake(2000);

		Object.assign(settings, { nativeRate: true });
		await open(sink, 3000);
		expect(sink.nativeRate).toBe(true);
		await sink.closeTake(4000);
		expect(sink.nativeRate).toBe(false);
	});

	it('reports its usage and clears everything', async () => {
		const { sink } = journal();
		await open(sink, 1000);
		sink.audio(chunk(1, 64));
		await sink.closeTake(2000);
		await open(sink, 3000);
		sink.audio(chunk(3, 36));
		await sink.closeTake(4000);
		expect(await sink.usage()).toEqual({ bytes: 100, takes: 2 });

		await sink.clear();
		expect(await sink.usage()).toEqual({ bytes: 0, takes: 0 });
		expect(await sink.audioOf('take-1')).toEqual([]);
	});

	it('closes a take whose closing came before its opening settled', async () => {
		const { sink } = journal();
		const opening = open(sink, 1000);
		const closing = sink.closeTake(1500);
		await Promise.all([opening, closing]);
		expect(sink.enabled).toBe(false);
		const [take] = await sink.takes();
		expect(take.endedAt).toBe(1500);
	});

	it('lists takes oldest first', async () => {
		const { sink } = journal();
		for (const startedAt of [5000, 1000, 3000]) {
			await open(sink, startedAt);
			await sink.closeTake(startedAt + 1);
		}
		expect((await sink.takes()).map((t) => t.startedAt)).toEqual([1000, 3000, 5000]);
	});
});
