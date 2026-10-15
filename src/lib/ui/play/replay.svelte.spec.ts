import { afterEach, describe, expect, it, vi } from 'vitest';
import { replayOf } from './replay.svelte';
import { FigureStageController } from './views/testing/FigureStageController.svelte';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('replayOf', () => {
	it('is one gate per session: a second ask while one plays starts nothing', async () => {
		const controller = new FigureStageController();
		replayOf(controller).run();
		replayOf(controller).run();
		expect(controller.calls).toEqual(['replay']);
		expect(replayOf(controller).pending).toBe(true);
		controller.finishReplay();
		await vi.waitFor(() => expect(replayOf(controller).pending).toBe(false));
	});

	it('says so when a replay fails, and lets the next one go', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const controller = new FigureStageController();
		const failure = new Error('no take');
		controller.replay = () => Promise.reject(failure);
		const gate = replayOf(controller);
		gate.run();
		await vi.waitFor(() => expect(gate.pending).toBe(false));
		expect(warn).toHaveBeenCalledWith(expect.any(String), failure);
	});
});
