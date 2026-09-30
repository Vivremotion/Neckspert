import { afterEach, describe, expect, it } from 'vitest';
import { defineMessages, i18n } from './index.svelte';

const messages = defineMessages({
	fr: { string: (name: string) => `corde de ${name}`, start: 'Commencer' },
	en: { string: (name: string) => `${name} string`, start: 'Start' }
});

describe('defineMessages', () => {
	afterEach(() => {
		i18n.locale = 'fr';
	});

	it('uses French by default', () => {
		expect(messages().start).toBe('Commencer');
		expect(messages().string('B')).toBe('corde de B');
	});

	it('follows the current locale', () => {
		i18n.locale = 'en';
		expect(messages().start).toBe('Start');
		expect(messages().string('B')).toBe('B string');
	});
});
