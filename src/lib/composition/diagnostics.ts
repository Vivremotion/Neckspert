import type {
	AttackDetectorPort,
	DiagnosticSink,
	NoteDetectorPort,
	SettingsRepositoryPort
} from '$lib/application/ports';
import { resolveDiagnosticsEnabled } from '$lib/domain/types';
import { DexieDiagnosticSink } from '$lib/infrastructure/diagnostics';

/**
 * The diagnostic journal, reading its setting at each opening of the input: on by default in
 * development, off in a published build, until the player chooses.
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
				budgetMb: diagnostics.budgetMb
			};
		},
		newId: () => crypto.randomUUID()
	});
}

/**
 * Runs the pitchless attack detector in the shadow of the note detector, for comparing them from
 * the journal (`attackShadow.ts`). It holds one attack listener, so the detector listens whenever
 * the input is open: the detector journals its own `attack.detected`, and only when a take is
 * being recorded. Here the note detector's attacks are journaled beside them, at the time of the
 * attack: `note.attack` with the note, `note.rejected` with the reason. Returns the stop function.
 */
export function shadowAttacks(
	journal: DiagnosticSink,
	detector: NoteDetectorPort,
	attacks: AttackDetectorPort
): () => void {
	const stops = [
		attacks.onAttack(() => {}),
		detector.onNote(({ time, midi }) => {
			if (journal.enabled) journal.event('note.attack', time, { midi });
		}),
		detector.onRejected(({ time, reason }) => {
			if (journal.enabled) journal.event('note.rejected', time, { reason });
		})
	];
	return () => stops.forEach((stop) => stop());
}
