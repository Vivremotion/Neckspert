import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnswerKeysModel } from '$lib/application/mechanics/identify';
import type { NoteVerdictView } from '$lib/application/mechanics/noteVerdict';
import type { PlayView } from '$lib/application/session/contract';
import PlayFrame from '../PlayFrame.svelte';
import { identifyChoices } from '../answer/choices';
import AnswerKeysView from './AnswerKeysView.svelte';
import { PLAY_VIEWS } from './index';
import { StageController } from './testing/StageController.svelte';

afterEach(() => cleanup());

const PAD = { name: 'Nom de la note' };

function model(overrides: Partial<AnswerKeysModel> = {}): AnswerKeysModel {
	return {
		prompt: { primary: 'case 8', secondary: 'corde de A', aid: null, diagram: null },
		choices: identifyChoices(),
		verdict: null,
		...overrides
	};
}

function show(
	overrides: Partial<AnswerKeysModel> = {},
	{ status = 'awaiting', countdown = null }: Partial<Pick<PlayView, 'status' | 'countdown'>> = {}
) {
	const controller = new StageController();
	controller.view.status = status;
	controller.view.countdown = countdown;
	controller.view.scene = 'screen';
	const rendered = render(AnswerKeysView, { props: { controller, model: model(overrides) } });
	return { controller, ...rendered };
}

function settled(verdict: Partial<NoteVerdictView>) {
	return show(
		{
			verdict: {
				verdict: 'wrong',
				offsetMs: null,
				answerLabel: null,
				correction: null,
				...verdict
			}
		},
		{ status: 'verdict' }
	);
}

function isDisabled(element: HTMLElement): boolean {
	return (
		(element as HTMLButtonElement).disabled === true ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

describe('AnswerKeysView', () => {
	it('is the view the frame shows for a note to name', () => {
		expect(PLAY_VIEWS['answer-keys']).toBe(AnswerKeysView);
	});

	it('shows the fret and the string, and answers with the key pressed', async () => {
		const { controller, container } = show();
		expect(container.querySelector('.centre .main')?.textContent).toBe('case 8');
		expect(screen.getByText('corde de A')).toBeTruthy();
		const pad = within(screen.getByRole('group', PAD));
		expect(pad.getAllByRole('button')).toHaveLength(12);
		await fireEvent.click(pad.getByRole('button', { name: 'F' }));
		expect(controller.calls).toEqual(['answer F']);
	});

	it('disables the keys outside awaiting', () => {
		show({}, { status: 'verdict' });
		const buttons = within(screen.getByRole('group', PAD)).getAllByRole('button');
		expect(buttons.every(isDisabled)).toBe(true);
	});

	it('sets the keyboard on stage while counting down, the prompt not shown yet', () => {
		const { container } = show({}, { status: 'count-in', countdown: 4 });
		expect(screen.getByRole('group', PAD)).toBeTruthy();
		expect(container.querySelector('.lane')).toBeNull();
		expect(screen.queryByText('case 8')).toBeNull();
		expect(container.querySelector('.centre .countdown .main')?.textContent).toBe('4');
	});

	it('shows the note name of an aided prompt', () => {
		const { container } = show({
			prompt: { primary: 'case 8', secondary: 'corde de A', aid: 'F', diagram: null }
		});
		expect(container.querySelector('.aid')?.textContent).toBe('F');
	});

	it('shows a late verdict for a right but slow answer, without a timing offset', () => {
		settled({ verdict: 'late', answerLabel: 'F' });
		expect(screen.getAllByText(/en retard/i).length).toBeGreaterThan(0);
		expect(screen.queryAllByText(/[+\-−]\d+\s*ms/)).toHaveLength(0);
	});

	it('says what was answered after a miss, the whole prompt recalled above the name', () => {
		const { container } = settled({ verdict: 'wrong', answerLabel: 'G', correction: 'F# / Gb' });
		const centre = container.querySelector('.centre')!;
		expect(centre.querySelector('.recall')?.textContent).toBe('case 8 · corde de A');
		expect(centre.querySelector('.main')?.textContent).toBe('F# / Gb');
		expect(container.querySelector('.answer-caption')?.textContent).toBe('G joué');
	});

	it('does not pause when Space activates a key in the frame', async () => {
		const controller = new StageController();
		controller.view.status = 'awaiting';
		controller.view.stage = { view: 'answer-keys', model: model() };
		render(PlayFrame, { props: { controller, kind: 'learn' } });
		const key = within(screen.getByRole('group', PAD)).getByRole('button', { name: 'C' });
		key.focus();
		await fireEvent.keyDown(key, { key: ' ', code: 'Space' });
		expect(controller.calls).not.toContain('pause');
	});
});
