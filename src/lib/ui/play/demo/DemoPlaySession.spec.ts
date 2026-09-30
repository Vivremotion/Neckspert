import { describe, expect, it } from 'vitest';
import { i18n } from '$lib/i18n/index.svelte';
import { DemoPlaySession, ManualDemoClock } from './DemoPlaySession.svelte';

describe('DemoPlaySession', () => {
	it('starts idle and enters count-in on start', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		expect(demo.view.status).toBe('idle');
		await demo.start();
		expect(demo.view.status).toBe('count-in');
		expect(demo.view.tempoBpm).toBe(80);
		expect(demo.view.beatsPerBar).toBe(4);
	});

	it('shows the prompt once the count-in elapses and tracks the timeline clock', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		expect(demo.view.status).toBe('awaiting');
		expect(demo.view.prompt?.primary).toBe('F');
		expect(demo.view.prompt?.secondary).toBe('corde de B');
		expect(demo.view.promptBeatIndex).toBe(4);
		expect(demo.view.targetBeatIndex).toBe(12);
		expect(demo.timeline.nowBeat()).toBe(4);
	});

	it('records a scripted verdict when the target beat is reached', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		clock.setBeat(12);
		demo.tick();
		expect(demo.view.status).toBe('verdict');
		expect(demo.view.lastVerdict?.verdict).toBe('perfect');
		expect(demo.view.history.at(-1)).toEqual({ beatIndex: 12, verdict: 'perfect' });
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
		expect(demo.view.history).toHaveLength(0);
		demo.resume();
		expect(demo.view.status).toBe('awaiting');
		demo.tick();
		expect(demo.view.status).toBe('verdict');
	});

	it('localizes the prompt secondary through defineMessages', async () => {
		const clock = new ManualDemoClock();
		i18n.locale = 'fr';
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		expect(demo.view.prompt?.secondary).toBe('corde de B');
		i18n.locale = 'en';
		demo.quit();
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		expect(demo.view.prompt?.secondary).toBe('B string');
		i18n.locale = 'fr';
	});
});
