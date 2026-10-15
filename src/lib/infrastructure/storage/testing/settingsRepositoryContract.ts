import { beforeEach, describe, expect, it } from 'vitest';
import type { SettingsRepositoryPort } from '$lib/application/ports';
import { DEFAULT_SETTINGS } from '$lib/domain/types';

/** Behaviour shared by every SettingsRepositoryPort implementation. */
export function settingsRepositoryContract(
	name: string,
	create: () => SettingsRepositoryPort
): void {
	describe(`${name} honours SettingsRepositoryPort`, () => {
		let repo: SettingsRepositoryPort;

		beforeEach(() => {
			repo = create();
		});

		it('returns the defaults when nothing is stored', async () => {
			expect(await repo.get()).toEqual(DEFAULT_SETTINGS);
		});

		it('returns the defaults merged with an update', async () => {
			const expected = { ...DEFAULT_SETTINGS, locale: 'en' };
			expect(await repo.update({ locale: 'en' })).toEqual(expected);
			expect(await repo.get()).toEqual(expected);
		});

		it('keeps earlier updates', async () => {
			await repo.update({ locale: 'en' });
			await repo.update({ clickBleed: true, inputDeviceId: 'usb-1' });
			expect(await repo.get()).toEqual({
				...DEFAULT_SETTINGS,
				locale: 'en',
				clickBleed: true,
				inputDeviceId: 'usb-1'
			});
		});

		it('keeps a latency per sensor with its provenance, replaced as a whole', async () => {
			expect((await repo.get()).latency).toEqual({});
			const latency = {
				attack: { ms: 12, provenance: 'system' as const },
				note: { ms: 40, provenance: 'system' as const }
			};
			await repo.update({ latency });
			expect((await repo.get()).latency).toEqual(latency);
			await repo.update({ latency: { note: { ms: 38, provenance: 'player' } } });
			expect((await repo.get()).latency).toEqual({ note: { ms: 38, provenance: 'player' } });
		});

		it('keeps diagnostics.nativeRate, and reads it as absent when never set', async () => {
			expect((await repo.get()).diagnostics.nativeRate).toBeUndefined();
			await repo.update({ diagnostics: { enabled: true, budgetMb: 100, nativeRate: true } });
			expect((await repo.get()).diagnostics).toEqual({
				enabled: true,
				budgetMb: 100,
				nativeRate: true
			});
		});

		it('clears a field set back to null', async () => {
			await repo.update({ inputDeviceId: 'usb-1' });
			await repo.update({ inputDeviceId: null });
			expect((await repo.get()).inputDeviceId).toBeNull();
		});
	});
}
