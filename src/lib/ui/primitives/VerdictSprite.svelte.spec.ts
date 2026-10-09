import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import VerdictSprite from './VerdictSprite.svelte';

afterEach(() => cleanup());

const drawing = (verdict: 'corrected' | 'wrong' | 'offbeat') =>
	render(VerdictSprite, { props: { verdict } }).container.innerHTML;

describe('VerdictSprite', () => {
	it('draws corrected apart from wrong and off beat', () => {
		const corrected = drawing('corrected');
		expect(corrected).not.toBe(drawing('wrong'));
		expect(corrected).not.toBe(drawing('offbeat'));
	});
});
