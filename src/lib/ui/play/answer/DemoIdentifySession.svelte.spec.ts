import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pitchOnString } from '$lib/domain/music';
import { i18n } from '$lib/i18n/index.svelte';
import {
	DEMO_IDENTIFY_SCRIPT,
	DEMO_VERDICT_MS,
	DemoIdentifySession
} from './DemoIdentifySession.svelte';

describe('DemoIdentifySession', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});

	afterEach(() => {
		vi.useRealTimers();
		i18n.locale = 'fr';
	});

	it('starts idle with the twelve choices and no beat indexes', () => {
		const demo = new DemoIdentifySession();
		expect(demo.view.status).toBe('idle');
		expect(demo.view.answerChoices).toHaveLength(12);
		expect(demo.view.promptBeatIndex).toBeNull();
		expect(demo.view.targetBeatIndex).toBeNull();
		expect(demo.view.leadBeats).toBeNull();
	});

	it('shows a French identify prompt on start', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		expect(demo.view.status).toBe('awaiting');
		expect(demo.view.prompt).toEqual({
			primary: 'case 8',
			secondary: 'corde de A',
			aid: null,
			diagram: null
		});
	});

	it('follows the locale for prompts', async () => {
		i18n.locale = 'en';
		const demo = new DemoIdentifySession();
		await demo.start();
		expect(demo.view.prompt?.primary).toBe('fret 8');
		expect(demo.view.prompt?.secondary).toBe('A string');
	});

	it('judges a fast right answer perfect', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(900);
		demo.answer('F');
		expect(demo.view.status).toBe('verdict');
		expect(demo.view.lastVerdict?.verdict).toBe('perfect');
		expect(demo.view.lastVerdict?.offsetMs).toBeNull();
		expect(demo.view.lastVerdict?.reactionMs).toBeCloseTo(900, 0);
		expect(demo.view.lastVerdict?.answerLabel).toBe('F');
	});

	it('judges a slow right answer late', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(3100);
		demo.answer('F');
		expect(demo.view.lastVerdict?.verdict).toBe('late');
		expect(demo.view.lastVerdict?.reactionMs).toBeCloseTo(3100, 0);
	});

	it('judges a wrong name wrong and shows what was tapped', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(700);
		demo.answer('F#');
		expect(demo.view.lastVerdict?.verdict).toBe('wrong');
		expect(demo.view.lastVerdict?.answerLabel).toBe('F# / Gb');
	});

	it('keeps the first answer of a prompt only', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(800);
		demo.answer('F');
		demo.answer('G');
		expect(demo.view.lastVerdict?.verdict).toBe('perfect');
		expect(demo.view.lastVerdict?.answerLabel).toBe('F');
	});

	it('ignores answers before the start and while paused', async () => {
		const demo = new DemoIdentifySession();
		demo.answer('F');
		expect(demo.view.lastVerdict).toBeNull();
		await demo.start();
		demo.pause();
		demo.answer('F');
		expect(demo.view.status).toBe('paused');
		expect(demo.view.lastVerdict).toBeNull();
	});

	it('restarts the reaction time when resuming', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(5000);
		demo.pause();
		demo.resume();
		vi.advanceTimersByTime(900);
		demo.answer('F');
		expect(demo.view.lastVerdict?.verdict).toBe('perfect');
	});

	it('moves to the next prompt after the verdict', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		demo.answer('F');
		vi.advanceTimersByTime(DEMO_VERDICT_MS);
		expect(demo.view.status).toBe('awaiting');
		expect(demo.view.prompt?.primary).toBe('case 7');
		expect(demo.view.prompt?.secondary).toBe('corde de B');
	});

	it('finishes after the last prompt', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		for (const target of DEMO_IDENTIFY_SCRIPT) {
			demo.answer(pitchOnString(target.string, target.fret));
			expect(demo.view.lastVerdict?.verdict).toBe('perfect');
			vi.advanceTimersByTime(DEMO_VERDICT_MS);
		}
		expect(demo.view.status).toBe('finished');
		expect(demo.view.prompt).toBeNull();
	});

	it('cancels the next prompt on quit, and can start again', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		demo.answer('F');
		demo.quit();
		vi.advanceTimersByTime(DEMO_VERDICT_MS);
		expect(demo.view.status).toBe('finished');
		expect(demo.view.prompt).toBeNull();

		await demo.start();
		expect(demo.view.status).toBe('awaiting');
		expect(demo.view.prompt?.primary).toBe('case 8');
		expect(demo.view.lastVerdict).toBeNull();
	});
});
