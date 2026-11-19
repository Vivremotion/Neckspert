import { it, expect } from 'vitest';
import { clearExercises } from '$lib/domain/exercise';
import { clearGrids } from '$lib/domain/grid';
import { clearRoutines } from '$lib/domain/routine';

const MODULES: [string, () => Promise<unknown>][] = [
	['neck', () => import('$lib/domain/progress/neck')],
	['stats', () => import('$lib/domain/progress/stats')],
	['played exercises', () => import('$lib/domain/session/played')],
	['summary misses', () => import('$lib/domain/session/misses')],
	['app services', () => import('$lib/application/services/createAppServices')],
	['demo play session', () => import('$lib/ui/play/demo/DemoPlaySession.svelte')],
	['demo gesture series', () => import('$lib/ui/play/demo/demoGestureSeries')],
	['demo identify session', () => import('$lib/ui/play/answer/DemoIdentifySession.svelte')]
];

it.each(MODULES)('%s imports with empty registries', async (_name, load) => {
	clearExercises();
	clearGrids();
	clearRoutines();
	await expect(load()).resolves.toBeDefined();
});
