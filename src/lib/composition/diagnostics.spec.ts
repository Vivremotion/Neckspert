import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
	FakeAttackDetector,
	FakeDiagnosticSink,
	FakeNoteDetector,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import { createDiagnosticJournal, shadowAttacks } from './diagnostics';

const INPUT = { label: 'USB', sampleRate: 48000, channelCount: 1, builtInGain: 1 };

async function enabledAfterOpening(
	enabled: boolean | null,
	buildDefault: boolean
): Promise<boolean> {
	const settings = new InMemorySettingsRepository();
	await settings.update({ diagnostics: { enabled, budgetMb: 300 } });
	const journal = createDiagnosticJournal(settings, { name: crypto.randomUUID(), buildDefault });
	await journal.openTake({ startedAt: 1, startedAudioTime: 0, input: INPUT });
	return journal.enabled;
}

describe('createDiagnosticJournal', () => {
	it('follows the build default until the player chooses', async () => {
		expect(await enabledAfterOpening(null, true)).toBe(true);
		expect(await enabledAfterOpening(null, false)).toBe(false);
		expect(await enabledAfterOpening(false, true)).toBe(false);
		expect(await enabledAfterOpening(true, false)).toBe(true);
	});

	it('reads the budget from the settings at each opening', async () => {
		const settings = new InMemorySettingsRepository();
		await settings.update({ diagnostics: { enabled: true, budgetMb: 100 } });
		const journal = createDiagnosticJournal(settings, {
			name: crypto.randomUUID(),
			buildDefault: false
		});
		await journal.openTake({ startedAt: 1, startedAudioTime: 0, input: INPUT });
		journal.audio({ audioTime: 0, sampleRate: 16000, samples: new Int16Array(60 * 1024 * 1024) });
		await journal.closeTake(2);
		expect((await journal.takes())[0].truncated).toBe(true);
	});
});

describe('createDiagnosticJournal native rate', () => {
	async function nativeAfterOpening(nativeRate: boolean | undefined): Promise<boolean> {
		const settings = new InMemorySettingsRepository();
		await settings.update({ diagnostics: { enabled: true, budgetMb: 300, nativeRate } });
		const journal = createDiagnosticJournal(settings, { name: crypto.randomUUID() });
		await journal.openTake({ startedAt: 1, startedAudioTime: 0, input: INPUT });
		return journal.nativeRate;
	}

	it('hands the setting to the sink, off when absent', async () => {
		expect(await nativeAfterOpening(undefined)).toBe(false);
		expect(await nativeAfterOpening(false)).toBe(false);
		expect(await nativeAfterOpening(true)).toBe(true);
	});
});

const OPENING = { startedAt: 1, startedAudioTime: 0, input: INPUT };

function shadow(enabled = true) {
	const journal = new FakeDiagnosticSink(enabled);
	const notes = new FakeNoteDetector();
	const attacks = new FakeAttackDetector();
	const stop = shadowAttacks(journal, notes, attacks);
	return { journal, notes, attacks, stop };
}

describe('shadowAttacks', () => {
	it('listens to nothing before a take opens', async () => {
		const { attacks, notes, journal } = shadow();
		await notes.start(null);
		notes.emitNote({ time: 1, midi: 64, frequencyHz: 329.6, clarity: 0.9 });
		expect(attacks.listeners).toBe(0);
		expect(journal.events).toEqual([]);
	});

	it('keeps one attack listener and journals note attacks while a take is open', async () => {
		const { journal, notes, attacks } = shadow();
		await notes.start(null);
		await journal.openTake(OPENING);
		expect(attacks.listeners).toBe(1);

		notes.emitNote({ time: 1.25, midi: 64, frequencyHz: 329.6, clarity: 0.9 });
		notes.emitRejection({
			time: 2.5,
			reason: 'unclear',
			attack: { frequencyHz: 0, clarity: 0 },
			sustain: { frequencyHz: 0, clarity: 0 }
		});
		expect(journal.events).toEqual([
			{ kind: 'note.attack', audioTime: 1.25, data: { midi: 64 } },
			{ kind: 'note.rejected', audioTime: 2.5, data: { reason: 'unclear' } }
		]);

		await journal.closeTake(2);
		expect(attacks.listeners).toBe(0);
		notes.emitNote({ time: 3, midi: 60, frequencyHz: 261.6, clarity: 0.9 });
		expect(journal.events).toHaveLength(2);
	});

	it('listens again at the next take', async () => {
		const { journal, attacks } = shadow();
		await journal.openTake(OPENING);
		await journal.closeTake(2);
		await journal.openTake(OPENING);
		expect(attacks.listeners).toBe(1);
	});

	it('listens to nothing when the take opens with the journal off', async () => {
		const { journal, attacks, notes } = shadow(false);
		await notes.start(null);
		await journal.openTake(OPENING);
		notes.emitNote({ time: 1, midi: 64, frequencyHz: 329.6, clarity: 0.9 });
		expect(attacks.listeners).toBe(0);
		expect(journal.events).toEqual([]);
	});

	it('releases everything when stopped, and ignores later takes', async () => {
		const { journal, attacks, notes, stop } = shadow();
		await notes.start(null);
		await journal.openTake(OPENING);
		stop();
		expect(attacks.listeners).toBe(0);
		notes.emitNote({ time: 1, midi: 64, frequencyHz: 329.6, clarity: 0.9 });
		expect(journal.events).toEqual([]);
		await journal.closeTake(2);
		await journal.openTake(OPENING);
		expect(attacks.listeners).toBe(0);
	});
});

describe('DexieDiagnosticSink.onTake', () => {
	async function journalWith(enabled: boolean) {
		const settings = new InMemorySettingsRepository();
		await settings.update({ diagnostics: { enabled, budgetMb: 300 } });
		const journal = createDiagnosticJournal(settings, {
			name: crypto.randomUUID(),
			buildDefault: false
		});
		const seen: boolean[] = [];
		const off = journal.onTake((on) => seen.push(on));
		return { journal, seen, off };
	}

	it('tells whether the take is recorded once its opening has settled, and false at its closing', async () => {
		const { journal, seen } = await journalWith(true);
		const opening = journal.openTake(OPENING);
		expect(seen).toEqual([]);
		await opening;
		expect(seen).toEqual([true]);
		await journal.closeTake(2);
		expect(seen).toEqual([true, false]);
	});

	it('tells false for a take opened with the journal off', async () => {
		const { journal, seen } = await journalWith(false);
		await journal.openTake(OPENING);
		expect(seen).toEqual([false]);
	});

	it('stops telling once unsubscribed', async () => {
		const { journal, seen, off } = await journalWith(true);
		off();
		await journal.openTake(OPENING);
		expect(seen).toEqual([]);
	});
});
