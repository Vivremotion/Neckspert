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

	it('starts idle, nothing on stage', () => {
		const demo = new DemoIdentifySession();
		expect(demo.view.status).toBe('idle');
		expect(demo.view.stage).toBeNull();
	});

	it('shows the answer keys with a French identify prompt on start', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		expect(demo.view.status).toBe('awaiting');
		expect(demo.view.stage?.view).toBe('answer-keys');
		expect(demo.keys?.choices).toHaveLength(12);
		expect(demo.keys?.verdict).toBeNull();
		expect(demo.keys?.prompt).toEqual({
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
		expect(demo.keys?.prompt.primary).toBe('fret 8');
		expect(demo.keys?.prompt.secondary).toBe('A string');
	});

	it('judges a fast right answer perfect', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(900);
		demo.answer('F');
		expect(demo.view.status).toBe('verdict');
		expect(demo.keys?.verdict).toEqual({
			verdict: 'perfect',
			offsetMs: null,
			answerLabel: 'F',
			correction: null
		});
	});

	it('judges a slow right answer late', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(3100);
		demo.answer('F');
		expect(demo.keys?.verdict?.verdict).toBe('late');
	});

	it('judges a wrong name wrong and shows what was tapped', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(700);
		demo.answer('F#');
		expect(demo.keys?.verdict).toMatchObject({
			verdict: 'wrong',
			answerLabel: 'F# / Gb',
			correction: 'F'
		});
	});

	it('keeps the first answer of a prompt only', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(800);
		demo.answer('F');
		demo.answer('G');
		expect(demo.keys?.verdict).toMatchObject({ verdict: 'perfect', answerLabel: 'F' });
	});

	it('ignores answers before the start and while paused', async () => {
		const demo = new DemoIdentifySession();
		demo.answer('F');
		expect(demo.view.stage).toBeNull();
		await demo.start();
		demo.pause();
		demo.answer('F');
		expect(demo.view.status).toBe('paused');
		expect(demo.keys?.verdict).toBeNull();
	});

	it('restarts the reaction time when resuming', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		vi.advanceTimersByTime(5000);
		demo.pause();
		demo.resume();
		vi.advanceTimersByTime(900);
		demo.answer('F');
		expect(demo.keys?.verdict?.verdict).toBe('perfect');
	});

	it('moves to the next prompt after the verdict', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		demo.answer('F');
		vi.advanceTimersByTime(DEMO_VERDICT_MS);
		expect(demo.view.status).toBe('awaiting');
		expect(demo.keys?.prompt.primary).toBe('case 7');
		expect(demo.keys?.prompt.secondary).toBe('corde de B');
		expect(demo.keys?.verdict).toBeNull();
	});

	it('finishes after the last prompt', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		for (const target of DEMO_IDENTIFY_SCRIPT) {
			demo.answer(pitchOnString(target.string, target.fret));
			expect(demo.keys?.verdict?.verdict).toBe('perfect');
			vi.advanceTimersByTime(DEMO_VERDICT_MS);
		}
		expect(demo.view.status).toBe('finished');
		expect(demo.view.stage).toBeNull();
	});

	it('cancels the next prompt on quit, and can start again', async () => {
		const demo = new DemoIdentifySession();
		await demo.start();
		demo.answer('F');
		demo.quit();
		vi.advanceTimersByTime(DEMO_VERDICT_MS);
		expect(demo.view.status).toBe('finished');
		expect(demo.view.stage).toBeNull();

		await demo.start();
		expect(demo.view.status).toBe('awaiting');
		expect(demo.keys?.prompt.primary).toBe('case 8');
		expect(demo.keys?.verdict).toBeNull();
	});
});
