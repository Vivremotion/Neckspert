import type {
	AttackDetectorPort,
	DiagnosticSink,
	DiagnosticTakeNotices,
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
				budgetMb: diagnostics.budgetMb,
				nativeRate: diagnostics.nativeRate === true
			};
		},
		newId: () => crypto.randomUUID()
	});
}

/**
 * Runs the pitchless attack detector in the shadow of the note detector, for comparing them from
 * the journal (`attackShadow.ts`), while a take is being recorded: at each take that opens with
 * the journal on it listens to the attacks (the detector journals its own `attack.detected`) and
 * journals the note detector's attacks beside them, at the time of the attack: `note.attack` with
 * the note, `note.rejected` with the reason. At the take's closing, or with the journal off, it
 * listens to nothing, so no frame is analysed for nothing. Returns the stop function.
 */
export function shadowAttacks(
	journal: DiagnosticSink & DiagnosticTakeNotices,
	detector: NoteDetectorPort,
	attacks: AttackDetectorPort
): () => void {
	let release: (() => void) | null = null;
	const hold = () => {
		release?.();
		release = null;
	};
	const stopTakes = journal.onTake((enabled) => {
		hold();
		if (!enabled) return;
		const stops = [
			attacks.onAttack(() => {}),
			detector.onNote(({ time, midi }) => {
				if (journal.enabled) journal.event('note.attack', time, { midi });
			}),
			detector.onRejected(({ time, reason }) => {
				if (journal.enabled) journal.event('note.rejected', time, { reason });
			})
		];
		release = () => stops.forEach((stop) => stop());
	});
	return () => {
		stopTakes();
		hold();
	};
}
