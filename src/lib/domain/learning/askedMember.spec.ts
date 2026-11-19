import { describe, expect, it } from 'vitest';
import { cardKey, type Attempt } from '../types';
import { TRIADS_ZONE } from '$lib/testing/catalog';
import { exerciseSubject } from './exerciseSubject';
import { attemptOf } from './testing/fakeSubject';

/** A queue of numbers in [0, 1), recording how many were taken. */
function scripted(numbers: readonly number[]) {
	let taken = 0;
	return {
		random: () => {
			if (taken >= numbers.length) throw new Error('the script ran out');
			return numbers[taken++];
		},
		taken: () => taken
	};
}

type Asked = { voicingKey: string; position?: number | 'open'; fret?: number };

function previousAttempt(voicing: string, previous: Asked): Attempt {
	return attemptOf(
		{
			exerciseId: TRIADS_ZONE.id,
			skill: TRIADS_ZONE.practices,
			item: voicing,
			phase: 'review',
			temperature: 'cold'
		},
		{ at: 1, cardKey: cardKey(TRIADS_ZONE.practices, voicing), data: { item: previous } }
	);
}

/**
 * What the named draw this selection replaced asked, frozen when the selection replaced it (compared on
 * every voicing of chord-zone, with every previous position, before it was deleted): the voicing,
 * the position last asked (null: none), the numbers given, the item asked, the numbers taken.
 */
const FROZEN: readonly [string, number | 'open' | null, number[], Asked, number][] = [
	[
		'C|maj|3:5,2:1,1:3',
		null,
		[0.99, 0.5],
		{ voicingKey: 'C|maj|3:5,2:1,1:3', position: 12, fret: 13 },
		2
	],
	[
		'C|maj|3:5,2:1,1:3',
		12,
		[0.99, 0.5],
		{ voicingKey: 'C|maj|3:5,2:1,1:3', position: 1, fret: 1 },
		2
	],
	['C|maj|3:5,2:1,1:3', 1, [0, 0], { voicingKey: 'C|maj|3:5,2:1,1:3', position: 12, fret: 12 }, 2],
	// One shape: asked again.
	[
		'C|maj|3:3,2:5,1:1',
		8,
		[0.6, 0.99],
		{ voicingKey: 'C|maj|3:3,2:5,1:1', position: 8, fret: 9 },
		2
	],
	// A shape on open strings names no fret, and takes one number only.
	['E|min|3:b3,2:5,1:1', 12, [0.3, 0.3], { voicingKey: 'E|min|3:b3,2:5,1:1', position: 'open' }, 1],
	[
		'E|min|3:b3,2:5,1:1',
		'open',
		[0.3, 0.7],
		{ voicingKey: 'E|min|3:b3,2:5,1:1', position: 12, fret: 12 },
		2
	],
	// A position of no shape leaves nothing out.
	['E|min|3:b3,2:5,1:1', 99, [0.3, 0.7], { voicingKey: 'E|min|3:b3,2:5,1:1', position: 'open' }, 1]
];

describe('chord-zone asks a member as the draw it replaced did', () => {
	it.each(FROZEN)('%s after %j, given %j', (voicing, position, numbers, expected, taken) => {
		expect(TRIADS_ZONE.items).toContain(voicing);
		const subject = exerciseSubject({
			exercises: [TRIADS_ZONE],
			attempts:
				position === null ? [] : [previousAttempt(voicing, { voicingKey: voicing, position })]
		});
		const script = scripted(numbers);
		const item = subject.promptItem!(
			{ skill: TRIADS_ZONE.practices, item: { voicingKey: voicing } },
			script.random,
			0
		);
		expect([item, script.taken()]).toEqual([expected, taken]);
	});
});
