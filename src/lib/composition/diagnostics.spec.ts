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

describe('shadowAttacks', () => {
	it('journals note attacks and keeps one attack listener while the journal is on', async () => {
		const journal = new FakeDiagnosticSink(true);
		const notes = new FakeNoteDetector();
		await notes.start(null);
		const attacks = new FakeAttackDetector();
		const stop = shadowAttacks(journal, notes, attacks);
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

		stop();
		expect(attacks.listeners).toBe(0);
		notes.emitNote({ time: 3, midi: 60, frequencyHz: 261.6, clarity: 0.9 });
		expect(journal.events).toHaveLength(2);
	});

	it('writes nothing while the journal is off', async () => {
		const journal = new FakeDiagnosticSink(false);
		const notes = new FakeNoteDetector();
		await notes.start(null);
		shadowAttacks(journal, notes, new FakeAttackDetector());
		notes.emitNote({ time: 1, midi: 64, frequencyHz: 329.6, clarity: 0.9 });
		expect(journal.events).toEqual([]);
	});
});
