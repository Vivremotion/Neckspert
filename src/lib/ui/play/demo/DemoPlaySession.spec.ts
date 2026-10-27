import { describe, expect, it } from 'vitest';
import { i18n } from '$lib/i18n/index.svelte';
import { DemoPlaySession, ManualDemoClock } from './DemoPlaySession.svelte';

describe('DemoPlaySession', () => {
	it('starts idle and enters count-in on start, the first string on the note lane', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		expect(demo.view.status).toBe('idle');
		expect(demo.view.stage).toBeNull();
		await demo.start();
		expect(demo.view.status).toBe('count-in');
		expect(demo.view.tempoBpm).toBe(80);
		expect(demo.view.beatsPerBar).toBe(4);
		expect(demo.view.countdown).toBe(4);
		expect(demo.view.stage?.view).toBe('note-lane');
		expect(demo.lane).toMatchObject({
			prompt: { secondary: 'corde de B' },
			anchorBeat: null,
			promptBeat: null
		});
	});

	it('counts the bar down on the clock', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(2.5);
		demo.tick();
		expect(demo.view.countdown).toBe(2);
	});

	it('shows the note once the count-in elapses and tracks the timeline clock', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		expect(demo.view.status).toBe('awaiting');
		expect(demo.view.countdown).toBeNull();
		expect(demo.lane).toMatchObject({
			prompt: { primary: 'F', secondary: 'corde de B', aid: null, pictures: [] },
			promptBeat: 4,
			anchorBeat: 12,
			history: [],
			verdict: null
		});
		expect(demo.timeline.nowBeat()).toBe(4);
	});

	it('tells a scripted verdict at the target, through the breathing bar, then the next note', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		clock.setBeat(12);
		demo.tick();
		expect(demo.view.status).toBe('verdict');
		expect(demo.lane?.verdict).toEqual({
			verdict: 'perfect',
			offsetMs: 12,
			answerLabel: 'F',
			misses: []
		});
		expect(demo.lane?.history).toEqual([{ beatIndex: 12, verdict: 'perfect' }]);
		clock.setBeat(15);
		demo.tick();
		expect(demo.view.status).toBe('verdict');
		clock.setBeat(16);
		demo.tick();
		expect(demo.view.status).toBe('awaiting');
		expect(demo.lane).toMatchObject({
			prompt: { primary: 'C', secondary: 'corde de G' },
			promptBeat: 16,
			anchorBeat: 24,
			verdict: null,
			history: [{ beatIndex: 12, verdict: 'perfect' }]
		});
	});

	it('corrects a miss with the position', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		// Three notes, each a lead and a breath (12 beats): the fourth, E on the A string, is missed.
		for (let note = 0; note < 3; note++) {
			clock.setBeat(12 + note * 12);
			demo.tick();
			clock.setBeat(16 + note * 12);
			demo.tick();
		}
		clock.setBeat(48);
		demo.tick();
		expect(demo.lane?.verdict).toEqual({
			verdict: 'wrong',
			offsetMs: 40,
			answerLabel: 'A',
			misses: [{ correction: 'corde de A, case 7', heard: null, expected: null, gap: null }]
		});
	});

	it('pauses and resumes without advancing scripted judgements', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		demo.pause();
		expect(demo.view.status).toBe('paused');
		clock.setBeat(12);
		demo.tick();
		expect(demo.lane?.history).toHaveLength(0);
		demo.resume();
		expect(demo.view.status).toBe('awaiting');
		demo.tick();
		expect(demo.view.status).toBe('verdict');
	});

	it('localizes the prompt through the presenter', async () => {
		const clock = new ManualDemoClock();
		i18n.locale = 'fr';
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		expect(demo.lane?.prompt.secondary).toBe('corde de B');
		i18n.locale = 'en';
		demo.quit();
		expect(demo.view.stage).toBeNull();
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		expect(demo.lane?.prompt.secondary).toBe('B string');
		i18n.locale = 'fr';
	});
});
