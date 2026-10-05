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
			await repo.update({ calibrationOffsetMs: 42, inputDeviceId: 'usb-1' });
			expect(await repo.get()).toEqual({
				...DEFAULT_SETTINGS,
				locale: 'en',
				calibrationOffsetMs: 42,
				inputDeviceId: 'usb-1'
			});
		});

		it('clears a field set back to null', async () => {
			await repo.update({ calibrationOffsetMs: 42 });
			await repo.update({ calibrationOffsetMs: null });
			expect((await repo.get()).calibrationOffsetMs).toBeNull();
		});
	});
}
