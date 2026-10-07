import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { InMemorySettingsRepository } from '$lib/testing/fakes';
import { createDiagnosticJournal } from './diagnostics';

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
