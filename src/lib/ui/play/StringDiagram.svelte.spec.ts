import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import StringDiagram, { STRING_DIAGRAM_AID } from './StringDiagram.svelte';

afterEach(() => cleanup());

describe('StringDiagram', () => {
	it('is switched on for the trial', () => {
		expect(STRING_DIAGRAM_AID).toBe(true);
	});

	it('draws six strings and marks the prompted one', () => {
		const { container } = render(StringDiagram, { props: { diagram: { string: 6 } } });
		const rows = container.querySelectorAll('.row');
		expect(rows).toHaveLength(6);
		expect(container.querySelector('.row.target')).toBe(rows[5]);
	});

	it('writes no letter beside the strings: the prompt names the string above', () => {
		const diagram = { string: 2 as const, label: 'B' };
		const { container } = render(StringDiagram, { props: { diagram } });
		expect(container.querySelector('.diagram')!.textContent!.trim()).toBe('');
		expect(container.querySelector('.letter')).toBeNull();
	});

	it('draws nothing without a diagram', () => {
		const { container } = render(StringDiagram, { props: { diagram: null } });
		expect(container.querySelector('.diagram')).toBeNull();
	});
});
