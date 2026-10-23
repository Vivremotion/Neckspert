import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BlockList, { type Block } from './BlockList.svelte';

afterEach(cleanup);

const blocks: Block[] = [
	{
		key: 'a',
		title: 'Notes',
		subtitle: 'corde de B',
		why: 'Parce que',
		duration: { text: '5′', spoken: '5 min' },
		href: '/play'
	},
	{ key: 'b', title: 'Rythme', onselect: () => {} },
	{ key: 'c', title: 'Accords' }
];

describe('BlockList', () => {
	it('is a named list with one item per block in order', () => {
		render(BlockList, { props: { label: 'Plan', blocks } });
		const list = screen.getByRole('list', { name: 'Plan' });
		const items = within(list).getAllByRole('listitem');
		expect(items).toHaveLength(3);
		expect(items[0].textContent).toContain('Notes');
		expect(items[2].textContent).toContain('Accords');
	});

	it('makes the title a link, a button or plain text', async () => {
		const onselect = vi.fn();
		render(BlockList, {
			props: { label: 'Plan', blocks: [blocks[0], { ...blocks[1], onselect }, blocks[2]] }
		});
		expect(screen.getByRole('link', { name: /Notes/ }).getAttribute('href')).toBe('/play');
		await fireEvent.click(screen.getByRole('button', { name: /Rythme/ }));
		expect(onselect).toHaveBeenCalledOnce();
		expect(screen.getByText('Accords').closest('a,button')).toBeNull();
	});

	it('follows the title with the subtitle after a dot', () => {
		render(BlockList, { props: { label: 'Plan', blocks } });
		expect(screen.getByRole('link').textContent).toContain('Notes · corde de B');
	});

	it('shows why and duration only when given', () => {
		render(BlockList, { props: { label: 'Plan', blocks } });
		expect(screen.getAllByText('Parce que')).toHaveLength(1);
		expect(screen.getAllByText('5′')).toHaveLength(1);
		expect(screen.getAllByText('5 min')).toHaveLength(1);
	});

	it('marks only the current block', () => {
		render(BlockList, { props: { label: 'Plan', blocks, current: 'b' } });
		const items = screen.getAllByRole('listitem');
		expect(items.map((i) => i.getAttribute('aria-current'))).toEqual([null, 'true', null]);
	});
});
