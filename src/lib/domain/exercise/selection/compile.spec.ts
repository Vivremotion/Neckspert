import { describe, expect, it } from 'vitest';
import { LOCATE_NECK, TRIADS_ZONE } from '$lib/testing/catalog';
import type { PlannedItem } from '../../types';
import { compileSelection, SelectionCompileError } from './compile';

const planned = (exerciseId: string, item: unknown): PlannedItem => ({
	exerciseId,
	skill: exerciseId,
	exerciseLevel: 0,
	item,
	phase: 'learning',
	temperature: 'hot',
	aid: 'none',
	leadBeats: 4
});

describe('compileSelection', () => {
	it('gives the family, the index and the selection resolved', () => {
		expect(
			compileSelection(
				LOCATE_NECK,
				planned(LOCATE_NECK.id, { string: 2, pitch: 'F' }),
				{
					family: 'note-places',
					where: [{ in: { strings: { item: 'string' }, frets: { param: 'zone' } } }],
					take: { param: 'n' }
				},
				{ zone: [3, 7], n: 1 }
			)
		).toEqual({
			family: 'note-places',
			index: { pitch: 'F', string: 2 },
			selection: {
				family: 'note-places',
				where: [{ in: { strings: [2], frets: [3, 7] } }],
				take: 1
			}
		});
	});

	it('leaves out a filter whose value the item does not carry', () => {
		const item = { voicingKey: 'C|maj|3:1,2:3,1:5' };
		const compiled = compileSelection(
			TRIADS_ZONE,
			planned(TRIADS_ZONE.id, item),
			{ family: 'chord-shapes', where: [{ at: { item: 'fret' } }] },
			{}
		);
		expect(compiled.selection).toEqual({ family: 'chord-shapes', where: [] });
	});

	it('throws naming the selection’s own field', () => {
		const compile = () =>
			compileSelection(
				LOCATE_NECK,
				planned(LOCATE_NECK.id, { string: 2, pitch: 'F' }),
				{ family: 'note-places', take: { param: 'n' } },
				{}
			);
		expect(compile).toThrow(SelectionCompileError);
		try {
			compile();
		} catch (error) {
			expect((error as SelectionCompileError).field).toBe('take');
			expect((error as SelectionCompileError).text).toMatch(
				/^reads param "n", absent for note-on-string item /
			);
		}
	});
});
