import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { createFakeAppServices } from './fakeServices';

describe('createFakeAppServices', () => {
	it('exposes P0 settings defaults and a controllable calibration', async () => {
		const services = createFakeAppServices();
		expect(await services.settings.get()).toEqual(DEFAULT_SETTINGS);
		services.calibration.nextOutcome = { ok: true, offsetMs: 42, spreadMs: 5 };
		const progress: number[] = [];
		const outcome = await services.calibration.run((p) => progress.push(p.hits));
		expect(outcome).toEqual({ ok: true, offsetMs: 42, spreadMs: 5 });
		expect(progress.length).toBeGreaterThan(0);
	});

	it('rejects an invalid backup on import', async () => {
		const services = createFakeAppServices();
		await expect(services.backup.importAll({ app: 'other' })).rejects.toThrow(
			'Not a Neckspert Play backup'
		);
	});
});
