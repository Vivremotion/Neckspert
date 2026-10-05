import { describe, expect, it } from 'vitest';
import type { Attempt } from '$lib/domain/types';
import { sessionGrade } from './grade';

function attempts(
	n: number,
	{ correct, perfect }: { correct: number; perfect: number }
): Attempt[] {
	const played = (midi: number) => ({
		item: { string: 2, pitch: 'F' },
		answer: { midi },
		confusion: null
	});
	const base: Attempt = {
		sessionId: 's1',
		exerciseId: 'locate-neck',
		mechanic: 'locate',
		cardKey: 'locate:2:F',
		phase: 'free',
		temperature: 'cold',
		aid: 'none',
		promptedAt: 0,
		tempoBpm: 80,
		leadBeats: null,
		timingOffsetMs: 0,
		reactionMs: 1000,
		correct: true,
		verdict: 'perfect',
		data: played(65)
	};

	const out: Attempt[] = [];
	for (let i = 0; i < n; i++) {
		if (i < correct) {
			const isPerfect = i < perfect;
			out.push({
				...base,
				correct: true,
				verdict: isPerfect ? 'perfect' : 'late',
				data: played(65)
			});
		} else {
			out.push({
				...base,
				correct: false,
				verdict: 'wrong',
				data: played(66)
			});
		}
	}
	return out;
}

describe('sessionGrade', () => {
	it.each([
		[0, 0, 0, null],
		[20, 0, 0, 'F+'],
		[20, 20, 10, 'S+'],
		[20, 20, 9, 'S'],
		[20, 16, 8, 'A+'],
		[20, 15, 15, 'B+'],
		[20, 11, 5, 'B'],
		[20, 6, 0, 'C'],
		[20, 5, 0, 'D'],
		[20, 1, 1, 'D+'],
		[2, 2, 1, 'S+']
	] as const)('n=%i justes=%i perfect=%i → %s', (n, correct, perfect, expected) => {
		expect(sessionGrade(attempts(n, { correct, perfect }))).toBe(expected);
	});

	it('ranks an off-beat answer between a timed one and a miss: half a miss', () => {
		const offbeat = attempts(4, { correct: 4, perfect: 0 }).map((attempt) => ({
			...attempt,
			verdict: 'offbeat' as const
		}));
		const wrong = attempts(4, { correct: 0, perfect: 0 });
		const late = attempts(4, { correct: 4, perfect: 0 });
		expect(sessionGrade(late)).toBe('S');
		expect(sessionGrade(offbeat)).toBe('C');
		expect(sessionGrade(wrong)).toBe('F+');
	});
});
