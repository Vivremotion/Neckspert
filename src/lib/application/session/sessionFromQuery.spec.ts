import { describe, expect, it } from 'vitest';
import { sessionFromQuery } from './sessionFromQuery';

const read = (search: string) => sessionFromQuery(new URLSearchParams(search));

describe('sessionFromQuery', () => {
	it('reads a routine, played freely with free=1', () => {
		expect(read('?routine=notes')).toEqual({ routine: 'notes' });
		expect(read('?routine=chords-zone')).toEqual({ routine: 'chords-zone' });
		expect(read('?routine=notes&free=1')).toEqual({ routine: 'notes', free: true });
		expect(read('?routine=notes&free=0')).toEqual({ routine: 'notes' });
	});

	it('reads an exercise played alone, any a file defines', () => {
		expect(read('?exercise=rhythm-offbeats')).toEqual({ exercise: 'rhythm-offbeats' });
		expect(read('?exercise=locate-note-string')).toEqual({ exercise: 'locate-note-string' });
		expect(read('?exercise=grid-reading')).toEqual({ exercise: 'grid-reading' });
	});

	it('reads one meaning of an address naming both: its routine, never the exercise instead', () => {
		expect(read('?routine=notes&exercise=rhythm-offbeats')).toEqual({ routine: 'notes' });
		expect(read('?routine=kazoo&exercise=rhythm-offbeats')).toBeNull();
	});

	it('finds nothing without a routine or an exercise, for an id no file defines, or by kind', () => {
		for (const search of [
			'',
			'?free=1',
			'?routine=',
			'?routine=kazoo',
			'?exercise=nope',
			'?exercise=',
			'?kind=learn',
			'?kind=free',
			'?kind=exercise&exercise=nope'
		]) {
			expect(read(search)).toBeNull();
		}
	});
});
