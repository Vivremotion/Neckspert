import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { RESPONSE_VERDICTS } from '$lib/domain/types';
import { playMessages } from '$lib/ui/play/messages';
import VerdictMark from './VerdictMark.svelte';

afterEach(cleanup);

describe('VerdictMark', () => {
	it('names every verdict', () => {
		for (const verdict of RESPONSE_VERDICTS) {
			const { unmount } = render(VerdictMark, { props: { verdict } });
			const mark = screen.getByRole('img', { name: playMessages().verdict[verdict] });
			expect(mark.getAttribute('data-verdict')).toBe(verdict);
			unmount();
		}
	});

	it('draws a different shape per verdict', () => {
		const shapes = RESPONSE_VERDICTS.map((verdict) => {
			const { container, unmount } = render(VerdictMark, { props: { verdict } });
			const inner = container.querySelector('svg')!.innerHTML;
			unmount();
			return inner;
		});
		expect(new Set(shapes).size).toBe(RESPONSE_VERDICTS.length);
	});
});
