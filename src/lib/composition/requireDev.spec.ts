import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { refuseUnlessDev } from './requireDev';

describe('refuseUnlessDev', () => {
	it('allows access in development', () => {
		expect(() => refuseUnlessDev(true)).not.toThrow();
	});

	it('returns 404 outside development', () => {
		try {
			refuseUnlessDev(false);
			expect.unreachable('expected error(404)');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			if (isHttpError(err)) {
				expect(err.status).toBe(404);
			}
		}
	});
});
