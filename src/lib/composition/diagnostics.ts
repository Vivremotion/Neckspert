import type { SettingsRepositoryPort } from '$lib/application/ports';
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
