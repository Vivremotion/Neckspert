import type {
	DiagnosticSink,
	NoteDetectorPort,
	SettingsRepositoryPort
} from '$lib/application/ports';
import { resolveDiagnosticsEnabled } from '$lib/domain/types';
import { DexieDiagnosticSink } from '$lib/infrastructure/diagnostics';

/**
 * The diagnostic journal, reading its setting at each opening of the input: on by default in
 * development, off in a published build, until the player chooses. The native rate is a
 * development tool: a published build ignores the setting, so an imported backup cannot raise it.
 */
export function createDiagnosticJournal(
	settings: SettingsRepositoryPort,
	options: { name?: string; buildDefault?: boolean } = {}
): DexieDiagnosticSink {
	const buildDefault = options.buildDefault ?? import.meta.env.DEV;
	return new DexieDiagnosticSink({
		name: options.name,
		settings: async () => {
			const { diagnostics } = await settings.get();
			return {
				enabled: resolveDiagnosticsEnabled(diagnostics, buildDefault),
				budgetMb: diagnostics.budgetMb,
				nativeRate: buildDefault && diagnostics.nativeRate === true
			};
		},
		newId: () => crypto.randomUUID()
	});
}

/**
 * Journals what the note detector tells while a take is being recorded: `note.attack` with the
 * note, `note.rejected` with the reason, at the time of the attack. Returns the stop function.
 */
export function journalNotes(journal: DiagnosticSink, detector: NoteDetectorPort): () => void {
	const stops = [
		detector.onNote(({ time, midi }) => {
			if (journal.enabled) journal.event('note.attack', time, { midi });
		}),
		detector.onRejected(({ time, reason }) => {
			if (journal.enabled) journal.event('note.rejected', time, { reason });
		})
	];
	return () => stops.forEach((stop) => stop());
}
