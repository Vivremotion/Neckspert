import { describe, expect, it } from 'vitest';
import { isBuiltInInput } from './isBuiltInInput';

describe('isBuiltInInput', () => {
	it('recognises common built-in microphone labels', () => {
		expect(isBuiltInInput({ label: 'Built-in Microphone' })).toBe(true);
		expect(isBuiltInInput({ label: 'MacBook Pro Microphone (Built-in)' })).toBe(true);
		expect(isBuiltInInput({ label: 'Internal Microphone' })).toBe(true);
		expect(isBuiltInInput({ label: 'default (Built-in Microphone)' })).toBe(true);
	});

	it('rejects external interfaces', () => {
		expect(isBuiltInInput({ label: 'Scarlett 2i2 USB' })).toBe(false);
		expect(isBuiltInInput({ label: 'Focusrite USB' })).toBe(false);
		expect(isBuiltInInput({ label: '' })).toBe(false);
	});
});
