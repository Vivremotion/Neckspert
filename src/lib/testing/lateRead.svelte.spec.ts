import { it, expect } from 'vitest';
import { clearExercises } from '$lib/domain/exercise';
import { clearGrids } from '$lib/domain/grid';

const MODULES: [string, () => Promise<unknown>][] = [
	['neck', () => import('$lib/domain/progress/neck')],
	['stats', () => import('$lib/domain/progress/stats')],
	['gesture summary', () => import('$lib/domain/gesture/summary')],
	['app services', () => import('$lib/application/services/createAppServices')],
	['demo play session', () => import('$lib/ui/play/demo/DemoPlaySession.svelte')],
	['demo gesture series', () => import('$lib/ui/play/demo/demoGestureSeries')],
	['demo identify session', () => import('$lib/ui/play/answer/DemoIdentifySession.svelte')]
];

it.each(MODULES)('%s imports with empty registries', async (_name, load) => {
	clearExercises();
	clearGrids();
	await expect(load()).resolves.toBeDefined();
});
