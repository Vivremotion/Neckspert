import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
	FakeDiagnosticSink,
	FakeNoteDetector,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import { createDiagnosticJournal, journalNotes } from './diagnostics';

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
	async function nativeAfterOpening(
		nativeRate: boolean | undefined,
		buildDefault = true
	): Promise<boolean> {
		const settings = new InMemorySettingsRepository();
		await settings.update({ diagnostics: { enabled: true, budgetMb: 300, nativeRate } });
		const journal = createDiagnosticJournal(settings, { name: crypto.randomUUID(), buildDefault });
		await journal.openTake({ startedAt: 1, startedAudioTime: 0, input: INPUT });
		return journal.nativeRate;
	}

	it('hands the setting to the sink, off when absent', async () => {
		expect(await nativeAfterOpening(undefined)).toBe(false);
		expect(await nativeAfterOpening(false)).toBe(false);
		expect(await nativeAfterOpening(true)).toBe(true);
	});

	it('ignores the setting in a published build, whatever a backup carried', async () => {
		expect(await nativeAfterOpening(true, false)).toBe(false);
	});
});

describe('journalNotes', () => {
	const REJECTION = {
		time: 2.5,
		reason: 'unclear' as const,
		attack: { frequencyHz: 0, clarity: 0 },
		sustain: { frequencyHz: 0, clarity: 0 }
	};

	it('journals what the note detector tells, at the time of the attack', async () => {
		const journal = new FakeDiagnosticSink();
		const detector = new FakeNoteDetector();
		journalNotes(journal, detector);
		await detector.start(null);
		detector.emitNote({ time: 1.25, midi: 64, frequencyHz: 329.6, clarity: 0.9 });
		detector.emitRejection(REJECTION);
		expect(journal.events).toEqual([
			{ kind: 'note.attack', audioTime: 1.25, data: { midi: 64 } },
			{ kind: 'note.rejected', audioTime: 2.5, data: { reason: 'unclear' } }
		]);
	});

	it('journals nothing with the journal off, or once stopped', async () => {
		const detector = new FakeNoteDetector();
		await detector.start(null);
		const off = new FakeDiagnosticSink(false);
		journalNotes(off, detector);
		detector.emitRejection(REJECTION);
		expect(off.events).toEqual([]);

		const on = new FakeDiagnosticSink();
		journalNotes(on, detector)();
		detector.emitRejection(REJECTION);
		expect(on.events).toEqual([]);
	});
});
