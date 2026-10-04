import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import StringDiagram, { STRING_DIAGRAM_AID } from './StringDiagram.svelte';

afterEach(() => cleanup());

describe('StringDiagram', () => {
	it('is switched on for the trial', () => {
		expect(STRING_DIAGRAM_AID).toBe(true);
	});

	it('draws six strings and marks the prompted one with its letter', () => {
		const { container } = render(StringDiagram, {
			props: { diagram: { string: 6, label: 'E' } }
		});
		const rows = container.querySelectorAll('.row');
		expect(rows).toHaveLength(6);
		const target = container.querySelector('.row.target');
		expect(target).toBe(rows[5]);
		expect(target?.querySelector('.letter')?.textContent).toBe('E');
		const letters = [...container.querySelectorAll('.letter')].map((el) => el.textContent?.trim());
		expect(letters.filter(Boolean)).toEqual(['E']);
	});

	it('draws nothing without a diagram', () => {
		const { container } = render(StringDiagram, { props: { diagram: null } });
		expect(container.querySelector('.diagram')).toBeNull();
	});
});
