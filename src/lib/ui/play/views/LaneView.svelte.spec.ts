import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { PromptStageModel } from '$lib/application/presentation';
import type { Picture } from '$lib/application/presentation/pictures';
import type { PlayView } from '$lib/application/session/contract';
import { PLAY_VIEWS } from './index';
import LaneView from './LaneView.svelte';
import { presented, stageModel, stageVerdict } from './testing/promptStage';
import { StageController } from './testing/StageController.svelte';

afterEach(() => cleanup());

const F_ON_B = presented({ primary: 'F', secondary: 'corde de B', preview: 'corde de B' });
/** The string drawn while it carries the aid. */
/** F# diminished: its root string and the strings it takes, the chord on its band. */
const CHORD = presented({
	primary: 'F#dim',
	secondary: 'fondamentale sur sol',
	detail: 'sol‑si‑mi',
	target: 'F#',
	band: 'F#dim',
	preview: 'fondamentale sur sol'
});
const SHAPE_A: Picture = {
	kind: 'shape',
	notes: [
		{ string: 3, fret: 11 },
		{ string: 2, fret: 10 },
		{ string: 1, fret: 10 }
	]
};
const SHAPE_B: Picture = {
	kind: 'shape',
	notes: [
		{ string: 3, fret: 4 },
		{ string: 2, fret: 3 },
		{ string: 1, fret: 2 }
	]
};
const B_DRAWN = [{ kind: 'string' as const, string: 2 as const, label: 'B' }];

/** F on B, prompted on beat 0 for beat 8; `nowBeat` 1 unless said. */
function show(
	overrides: Partial<PromptStageModel> = {},
	{
		status = 'awaiting',
		nowBeat = 1,
		countdown = null
	}: { status?: PlayView['status']; nowBeat?: number; countdown?: number | null } = {}
) {
	const controller = new StageController();
	controller.view.status = status;
	controller.view.countdown = countdown;
	controller.nowBeat = nowBeat;
	const model = stageModel({
		prompt: F_ON_B,
		anchorBeat: 8,
		promptBeat: 0,
		...overrides
	});
	return render(LaneView, { props: { controller, model } });
}

/** F on B settled on beat 8, read half a beat later. */
function settled(verdict: Parameters<typeof stageVerdict>[0]) {
	return show(
		{
			history: [{ beatIndex: 8, verdict: verdict?.verdict ?? 'wrong' }],
			verdict: stageVerdict(verdict)
		},
		{ status: 'verdict', nowBeat: 8.5 }
	);
}

function playedCell(container: HTMLElement): string {
	return container.querySelector('.lane .caption')?.textContent?.trim() ?? '';
}

describe('LaneView', () => {
	it('is the view the frame shows for a note to play', () => {
		expect(PLAY_VIEWS.lane).toBe(LaneView);
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
		const drawn = show({ prompt: { ...F_ON_B, pictures: B_DRAWN } });
		expect(drawn.container.querySelector('.diagram')?.getAttribute('data-string')).toBe('2');
		cleanup();
		expect(show().container.querySelector('.diagram')).toBeNull();
	});

	it('shows the string alone, drawn, before the note', () => {
		const { container } = show(
			{
				anchorBeat: null,
				promptBeat: null,
				prompt: { ...F_ON_B, pictures: B_DRAWN }
			},
			{ status: 'count-in' }
		);
		expect(screen.getByText('corde de B')).toBeTruthy();
		expect(screen.queryByText('F')).toBeNull();
		expect(container.querySelector('.centre [data-size="hero"]')).toBeNull();
		expect(container.querySelector('.lane [data-kind="target"]')).toBeNull();
		expect(container.querySelector('.diagram')?.getAttribute('data-string')).toBe('2');
	});

	it('counts the bar down in place of the prompt, the string under the count', () => {
		const { container } = show(
			{
				anchorBeat: null,
				promptBeat: null,
				prompt: { ...F_ON_B, pictures: B_DRAWN }
			},
			{ status: 'count-in', countdown: 3 }
		);
		const count = container.querySelector('.centre .countdown');
		expect(count?.getAttribute('aria-live')).toBe('polite');
		expect(count?.querySelector('.main')?.textContent).toBe('3');
		expect(count?.textContent).toContain('corde de B');
		expect(count?.querySelector('.diagram')?.getAttribute('data-string')).toBe('2');
		expect(screen.queryByText('F')).toBeNull();
	});

	it('shows the note and its string, and the string alone while it waits', () => {
		const prompting = show();
		expect(prompting.container.querySelector('.centre [data-size="hero"] .main')?.textContent).toBe(
			'F'
		);
		expect(screen.getByText('corde de B')).toBeTruthy();
		cleanup();
		const waiting = show({ anchorBeat: null, promptBeat: null }, { status: 'count-in' });
		expect(screen.getByText('corde de B')).toBeTruthy();
		expect(screen.queryByText('F')).toBeNull();
		expect(waiting.container.querySelector('.lane [data-kind="target"]')).toBeNull();
	});

	it('shows the chord, its root string and its strings, the root on the target and the chord on the band', () => {
		const { container } = show({
			prompt: { ...CHORD, pictures: [SHAPE_A] },
			bands: [{ fromBeat: 9, untilBeat: 12 }]
		});
		const centre = container.querySelector('.centre')!;
		expect(centre.querySelector('[data-size="hero"] .main')?.textContent).toBe('F#dim');
		expect(centre.textContent).toContain('fondamentale sur sol');
		expect(centre.querySelector('.detail')?.textContent).toBe('sol‑si‑mi');
		expect(container.querySelector('.lane [data-kind="target"]')?.textContent?.trim()).toBe('F#');
		expect(container.querySelector('.lane .band-name')?.textContent).toBe('F#dim');
		expect(centre.querySelectorAll('.chord-shape')).toHaveLength(1);
	});

	it('says no detail when the prompt has none', () => {
		expect(show().container.querySelector('.detail')).toBeNull();
	});

	it('draws the pictures of the prompt only when given', () => {
		const plain = show({ prompt: { ...CHORD, pictures: [] } });
		expect(plain.container.querySelector('.chord-shape, .diagram')).toBeNull();
		cleanup();
		const drawn = show({ prompt: { ...CHORD, pictures: [B_DRAWN[0], SHAPE_A] } });
		expect(drawn.container.querySelectorAll('.diagram')).toHaveLength(1);
		expect(drawn.container.querySelectorAll('.chord-shape')).toHaveLength(1);
	});

	it('draws one miss per missed expectation, and nothing after a success', () => {
		const miss = { correction: null, heard: SHAPE_A, expected: SHAPE_B, gap: 'une case plus haut' };
		const twice = show(
			{
				prompt: CHORD,
				history: [{ beatIndex: 8, verdict: 'wrong' }],
				verdict: { ...stageVerdict(), misses: [miss, { ...miss, gap: 'la corde de si' }] }
			},
			{ status: 'verdict', nowBeat: 8.5 }
		);
		const drawn = twice.container.querySelectorAll('[data-testid="miss"]');
		expect(drawn).toHaveLength(2);
		expect(drawn[0].querySelectorAll('.chord-shape')).toHaveLength(2);
		expect(drawn[0].textContent).toContain('une case plus haut');
		expect(drawn[1].textContent).toContain('la corde de si');
		cleanup();
		const success = settled({ verdict: 'perfect', offsetMs: 3 });
		expect(success.container.querySelector('[data-testid="miss"]')).toBeNull();
	});

	it('says what was missed when nothing was heard', () => {
		const { container } = show(
			{
				prompt: CHORD,
				history: [{ beatIndex: 8, verdict: 'wrong' }],
				verdict: {
					...stageVerdict(),
					misses: [{ correction: null, heard: null, expected: SHAPE_B, gap: 'rien entendu' }]
				}
			},
			{ status: 'verdict', nowBeat: 8.5 }
		);
		const miss = container.querySelector('[data-testid="miss"]')!;
		expect(miss.querySelectorAll('.chord-shape')).toHaveLength(1);
		expect(miss.textContent).toContain('rien entendu');
	});

	it('shows the countdown in its field', () => {
		const { container } = show({ prompt: CHORD }, { status: 'count-in', countdown: 2 });
		expect(container.querySelector('.lane-view .centre .countdown .main')?.textContent).toBe('2');
	});
});
