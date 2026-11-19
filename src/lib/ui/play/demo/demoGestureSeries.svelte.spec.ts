import { describe, expect, it } from 'vitest';
import type { LaneEntry } from '$lib/application/session/contract';
import { demoGestureSeries } from './demoGestureSeries';

async function run(demo: ReturnType<typeof demoGestureSeries>, seconds: number) {
	for (let t = 0; t < seconds; t += 0.01) {
		demo.advance(0.01);
		await Promise.resolve();
	}
}

const historyOf = (demo: ReturnType<typeof demoGestureSeries>) =>
	(demo.controller.view.stage?.model as { history?: LaneEntry[] } | undefined)?.history ?? [];

describe('demoGestureSeries', () => {
	it('is named as the first routine that plays passages, so it tells the changes’ start text', () => {
		const demo = demoGestureSeries('link', () => 'fr');
		expect(demo.controller.origin?.title.fr).toBe('Changements');
		expect(demo.controller.origin?.howTo?.fr).toMatch(/^Joue la grille sans t’arrêter/);
		demo.controller.quit();
	});

	it('plays the link on the session controller, the scripted player strumming each change', async () => {
		const demo = demoGestureSeries('link', () => 'fr');
		await demo.controller.start();
		expect(demo.controller.view.stage?.view).toBe('link-lane');
		// It starts at the aid level: the notes of E on G-B-E are drawn, string by string.
		const aid = (
			demo.controller.view.stage?.model as {
				aid: { notes: { string: number; name: string; next?: true }[] } | null;
			}
		).aid;
		const now = aid?.notes.filter((note) => !note.next) ?? [];
		expect(now.map((note) => note.string)).toEqual([3, 2, 1]);
		expect(now.map((note) => note.name).sort()).toEqual(['B', 'E', 'G#']);
		// ♩ = 80: a counted bar, then four changes of a bar each.
		await run(demo, 3 + 4 * 3);
		expect(historyOf(demo).map((entry) => entry.verdict)).toEqual([
			'perfect',
			'early',
			'perfect',
			'late'
		]);
		demo.controller.quit();
	});

	it('plays a climb on the scrolling grid', async () => {
		const demo = demoGestureSeries('climb', () => 'fr');
		await demo.controller.start();
		await run(demo, 6);
		expect(demo.controller.view.stage?.view).toBe('grid-scroll');
		expect(historyOf(demo).length).toBeGreaterThan(0);
		demo.controller.quit();
	});

	it('starts a new series after the end (« Rejouer »)', async () => {
		const demo = demoGestureSeries('link', () => 'fr');
		await demo.controller.start();
		const first = demo.controller.sessionId;
		demo.controller.quit();
		await run(demo, 0.1);
		expect(demo.controller.view.status).toBe('finished');
		await demo.controller.start();
		expect(demo.controller.sessionId).not.toBe(first);
		expect(demo.controller.view.status).toBe('count-in');
		demo.controller.quit();
	});
});
