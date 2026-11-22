import { describe, expect, it, vi } from 'vitest';

describe('registerFiles, on a routine whose check throws', () => {
	it('refuses it with the error, registers the others, and never throws', async () => {
		vi.resetModules();
		vi.doMock('$lib/domain/routine/validate', () => ({
			routineProblem: (routine: { id: string }) => {
				if (routine.id === 'broken') throw new Error('the check broke');
				return null;
			}
		}));
		const { registerFiles } = await import('./register');
		const { routines } = await import('$lib/domain/routine/registry');
		const routine = (id: string) => ({ id, title: { fr: id, en: id }, exercises: ['e'] });
		const { refusals } = registerFiles(
			{ 'a.json': JSON.stringify({ format: 0, routines: [routine('broken'), routine('fine')] }) },
			{ exercise: () => null }
		);
		expect(refusals).toEqual([
			{ file: 'a.json', kind: 'routine', id: 'broken', reason: 'the check broke' }
		]);
		expect(routines().map((r) => r.id)).toEqual(['fine']);
		vi.doUnmock('$lib/domain/routine/validate');
		vi.resetModules();
	});
});
