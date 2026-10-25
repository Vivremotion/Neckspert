import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoteLaneModel } from '$lib/application/mechanics/locate';
import type { NoteVerdictView } from '$lib/application/mechanics/noteVerdict';
import type { PlayView, PromptView } from '$lib/application/session/contract';
import { PLAY_VIEWS } from './index';
import NoteLaneView from './NoteLaneView.svelte';
import { StageController } from './testing/StageController.svelte';

afterEach(() => cleanup());

const F_ON_B: PromptView = { primary: 'F', secondary: 'corde de B', aid: null, diagram: null };

/** F on B, prompted on beat 0 for beat 8; `nowBeat` 1 unless said. */
function show(
	overrides: Partial<NoteLaneModel> = {},
	{ status = 'awaiting', nowBeat = 1 }: { status?: PlayView['status']; nowBeat?: number } = {}
) {
	const controller = new StageController();
	controller.view.status = status;
	controller.nowBeat = nowBeat;
	const model: NoteLaneModel = {
		prompt: F_ON_B,
		anchorBeat: 8,
		promptBeat: 0,
		history: [],
		verdict: null,
		...overrides
	};
	return render(NoteLaneView, { props: { controller, model } });
}

/** F on B settled on beat 8, read half a beat later. */
function settled(verdict: Partial<NoteVerdictView>) {
	return show(
		{
			history: [{ beatIndex: 8, verdict: verdict.verdict ?? 'wrong' }],
			verdict: {
				verdict: 'wrong',
				offsetMs: null,
				answerLabel: null,
				correction: null,
				...verdict
			}
		},
		{ status: 'verdict', nowBeat: 8.5 }
	);
}

function playedCell(container: HTMLElement): string {
	return container.querySelector('.lane .caption')?.textContent?.trim() ?? '';
}

describe('NoteLaneView', () => {
	it('is the view the frame shows for a note to play', () => {
		expect(PLAY_VIEWS['note-lane']).toBe(NoteLaneView);
	});

	it('renders the prompt, the note on its target tile and the string under it', () => {
		const { container } = show();
		expect(container.querySelector('.centre [data-size="hero"] .main')?.textContent).toBe('F');
		expect(screen.getByText('corde de B')).toBeTruthy();
		expect(container.querySelector('.lane [data-kind="target"]')?.textContent?.trim()).toBe('F');
	});

	it('marks the played cell with its verdict, not the note name', () => {
		const { container } = show(
			{ history: [{ beatIndex: 8, verdict: 'perfect' }] },
			{ status: 'verdict', nowBeat: 8.25 }
		);
		const played = container.querySelector('.lane [data-kind="history"]');
		expect(played?.querySelector('svg')).not.toBeNull();
		expect(played?.textContent).not.toContain('F');
	});

	it('writes the verdict over the played cell', () => {
		const { container } = settled({ verdict: 'late', offsetMs: 42, answerLabel: 'F' });
		expect(playedCell(container)).toBe('en retard · +42 ms');
	});

	it('writes what was played after a wrong note, with its offset when it has one', () => {
		expect(playedCell(settled({ verdict: 'wrong', answerLabel: 'F#' }).container)).toBe('F# joué');
		cleanup();
		expect(
			playedCell(settled({ verdict: 'wrong', answerLabel: 'F#', offsetMs: 30 }).container)
		).toBe('F# joué · +30 ms');
	});

	it('writes the offset signed with a true minus, and a zero without a sign', () => {
		expect(playedCell(settled({ verdict: 'perfect', offsetMs: -8 }).container)).toBe(
			'parfait · −8 ms'
		);
		cleanup();
		expect(playedCell(settled({ verdict: 'perfect', offsetMs: 0 }).container)).toBe(
			'parfait · 0 ms'
		);
	});

	it('says nothing was heard after a silent miss', () => {
		const { container } = settled({ verdict: 'wrong', answerLabel: null });
		expect(playedCell(container)).toBe('rien entendu');
	});

	it('puts the correction in place of the prompt, the note recalled alone above', () => {
		const { container } = settled({ verdict: 'wrong', correction: 'corde de B, case 6' });
		const centre = container.querySelector('.centre')!;
		expect(centre.querySelector('.recall')?.textContent).toBe('F');
		expect(centre.querySelector('.main')?.textContent).toBe('corde de B, case 6');
		expect(centre.querySelector('[data-size="correction"]')).not.toBeNull();
		expect(centre.querySelector('[data-size="hero"]')).toBeNull();
	});

	it('shows the verdict and its offset in place of the prompt after a hit', () => {
		const { container } = settled({ verdict: 'late', offsetMs: 42, answerLabel: 'F' });
		const centre = container.querySelector('.centre')!;
		expect(centre.querySelector('.hit')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'En retard · +42 ms'
		);
		expect(centre.querySelector('[data-size="hero"]')).toBeNull();
		expect(centre.textContent).not.toContain('corde de B');
	});

	it('says no verdict word in the centre after a miss', () => {
		const { container } = settled({
			verdict: 'wrong',
			offsetMs: 30,
			answerLabel: 'F#',
			correction: 'corde de B, case 6'
		});
		const centre = container.querySelector('.centre')!;
		expect(centre.querySelector('.hit')).toBeNull();
		expect(centre.textContent).not.toMatch(/ms/);
	});

	it('shows no reaction time', () => {
		const { container } = settled({ verdict: 'late', offsetMs: 42, answerLabel: 'F' });
		expect(container.textContent).not.toMatch(/1[,.]21/);
	});

	it('shows the position of an aided prompt, and no aid otherwise', () => {
		const aided = show({ prompt: { ...F_ON_B, aid: 'case 6' } });
		expect(aided.container.querySelector('.aid')?.textContent).toBe('case 6');
		cleanup();
		expect(show().container.querySelector('.aid')).toBeNull();
	});

	it('draws the string under the prompt only when it carries the aid', () => {
		const drawn = show({ prompt: { ...F_ON_B, diagram: { string: 2, label: 'B' } } });
		expect(drawn.container.querySelector('.diagram')?.getAttribute('data-string')).toBe('2');
		cleanup();
		expect(show().container.querySelector('.diagram')).toBeNull();
	});

	it('shows the string alone, drawn, before the note', () => {
		const { container } = show(
			{
				anchorBeat: null,
				promptBeat: null,
				prompt: { ...F_ON_B, diagram: { string: 2, label: 'B' } }
			},
			{ status: 'count-in' }
		);
		expect(screen.getByText('corde de B')).toBeTruthy();
		expect(screen.queryByText('F')).toBeNull();
		expect(container.querySelector('.centre [data-size="hero"]')).toBeNull();
		expect(container.querySelector('.lane [data-kind="target"]')).toBeNull();
		expect(container.querySelector('.diagram')?.getAttribute('data-string')).toBe('2');
	});
});
