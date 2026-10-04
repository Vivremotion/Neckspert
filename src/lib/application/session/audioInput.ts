import type { NoteDetectorPort, SettingsRepositoryPort } from '$lib/application/ports';

/**
 * The remembered input is gone: device ids are per origin and per browser, so another port,
 * another machine, cleared site data or an imported backup leave a stale one.
 */
export function isMissingInput(error: unknown): boolean {
	const name = (error as { name?: unknown } | null)?.name;
	return name === 'OverconstrainedError' || name === 'NotFoundError';
}

/**
 * Opens the guitar input. A remembered device that no longer exists is forgotten in the
 * settings and the default input opens instead. Any other failure is rethrown.
 */
export async function openAudioInput(
	detector: Pick<NoteDetectorPort, 'start'>,
	settings: Pick<SettingsRepositoryPort, 'update'>,
	deviceId: string | null
): Promise<void> {
	try {
		await detector.start(deviceId);
	} catch (error) {
		if (deviceId === null || !isMissingInput(error)) throw error;
		await settings.update({ inputDeviceId: null });
		await detector.start(null);
	}
}
