import { describe, expect, it, vi } from 'vitest';
import { indexDerivation } from '../../families';
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

	it('tells an index its data cannot give as a selection that cannot be compiled', () => {
		// A voicing key that reads as no voicing: the data cannot be read.
		const compile = () =>
			compileSelection(
				TRIADS_ZONE,
				planned(TRIADS_ZONE.id, { voicingKey: 'nope' }),
				{ family: 'chord-shapes' },
				{}
			);
		expect(compile).toThrow(SelectionCompileError);
	});

	it('lets a programming error of an index derivation through', () => {
		const derivation = indexDerivation('chord-shapes', 'voicing-on-strings')!;
		const spy = vi.spyOn(derivation, 'index').mockImplementation(() => {
			throw new TypeError('a bug');
		});
		try {
			expect(() =>
				compileSelection(
					TRIADS_ZONE,
					planned(TRIADS_ZONE.id, { voicingKey: 'C|maj|3:1,2:3,1:5' }),
					{ family: 'chord-shapes' },
					{}
				)
			).toThrow(TypeError);
		} finally {
			spy.mockRestore();
		}
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

	it('reads the direction of a position in the params, failing on one neither up nor down', () => {
		const climbing = {
			family: 'chord-shapes',
			where: [{ position: { beyond: 'previous' as const, toward: { param: 'way' }, turns: true } }]
		};
		const item = planned(TRIADS_ZONE.id, { voicingKey: 'C|maj|3:1,2:3,1:5' });
		expect(compileSelection(TRIADS_ZONE, item, climbing, { way: 'down' }).selection.where).toEqual([
			{ position: { beyond: 'previous', toward: 'down', turns: true } }
		]);
		expect(() => compileSelection(TRIADS_ZONE, item, climbing, { way: 'left' })).toThrow(
			'where[0].position.toward must be up or down, got "left"'
		);
	});
});
