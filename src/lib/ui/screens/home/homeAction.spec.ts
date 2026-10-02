import { describe, expect, it } from 'vitest';
import { homeSessionKind } from './homeAction';

describe('homeSessionKind', () => {
	it('starts placement first, then learning', () => {
		expect(homeSessionKind('placement')).toBe('placement');
		expect(homeSessionKind('learn')).toBe('learn');
	});
});
