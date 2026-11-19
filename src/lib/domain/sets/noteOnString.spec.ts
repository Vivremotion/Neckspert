import { describe, expect, it } from 'vitest';
import { noteOnStringSet } from './noteOnString';

describe('noteOnStringSet', () => {
	it('keys its items', () => {
		expect(noteOnStringSet.itemKey({ string: 6, pitch: 'F' })).toBe('6:F');
		expect(noteOnStringSet.parseItem('6:F')).toEqual({ string: 6, pitch: 'F' });
		expect(() => noteOnStringSet.parseItem('7:F')).toThrow();
	});
});
