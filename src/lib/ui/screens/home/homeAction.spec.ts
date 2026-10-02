import { describe, expect, it } from 'vitest';
import { homeSessionKind, isHomeActionEnabled } from './homeAction';

describe('homeSessionKind', () => {
	it('maps placement and session, and disables wait', () => {
		expect(homeSessionKind('placement')).toBe('placement');
		expect(homeSessionKind('session')).toBe('learn');
		expect(homeSessionKind('wait')).toBeNull();
	});
});

describe('isHomeActionEnabled', () => {
	it('enables placement and session only', () => {
		expect(isHomeActionEnabled('placement')).toBe(true);
		expect(isHomeActionEnabled('session')).toBe(true);
		expect(isHomeActionEnabled('wait')).toBe(false);
	});
});
