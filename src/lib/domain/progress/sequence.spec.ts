import { describe, expect, it } from 'vitest';
import { SEQUENCE_LENGTH, SEQUENCE_MAX_DELAY, SEQUENCES_ENABLED } from './constants';
import { advance, announcesLead, fits, isOpen } from './sequence';

describe('sequence constants', () => {
	it('runs sequences of four prompts, a waiting note ending one after two prompts late', () => {
		expect(SEQUENCES_ENABLED).toBe(true);
		expect(SEQUENCE_LENGTH).toBe(4);
		expect(SEQUENCE_MAX_DELAY).toBe(2);
	});
});

describe('sequence', () => {
	it('accepts anything when no sequence is open', () => {
		expect(fits(null, 'locate', 8)).toBe(true);
		expect(fits({ mechanic: 'locate', lead: 2, count: SEQUENCE_LENGTH }, 'identify', null)).toBe(
			true
		);
	});

	it('keeps an open sequence to one scene and one lead', () => {
		const open = { mechanic: 'locate', lead: 2, count: 1 } as const;
		expect(fits(open, 'locate', 2)).toBe(true);
		expect(fits(open, 'locate', 4)).toBe(false);
		expect(fits(open, 'identify', null)).toBe(false);
	});

	it('counts prompts and starts a new sequence once full or on another lead', () => {
		let sequence = advance(null, 'locate', 2);
		for (let i = 1; i < SEQUENCE_LENGTH; i++) sequence = advance(sequence, 'locate', 2);
		expect(sequence.count).toBe(SEQUENCE_LENGTH);
		expect(isOpen(sequence)).toBe(false);
		expect(advance(sequence, 'locate', 2)).toEqual({ mechanic: 'locate', lead: 2, count: 1 });
		expect(advance({ mechanic: 'locate', lead: 2, count: 1 }, 'locate', 8).count).toBe(1);
	});

	it('announces a lead change between two guitar sequences only', () => {
		const two = { mechanic: 'locate', lead: 2, count: 4 } as const;
		expect(announcesLead(two, 'locate', 8)).toBe(true);
		expect(announcesLead(two, 'locate', 2)).toBe(false);
		expect(announcesLead(two, 'identify', null)).toBe(false);
		expect(announcesLead(null, 'locate', 8)).toBe(false);
	});
});
