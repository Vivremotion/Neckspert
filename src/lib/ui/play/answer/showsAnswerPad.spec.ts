import { describe, expect, it } from 'vitest';
import { showsAnswerPad } from './showsAnswerPad';

describe('showsAnswerPad', () => {
	it('shows the pad when the stage is set for the screen', () => {
		expect(showsAnswerPad({ scene: 'identify' })).toBe(true);
	});

	it('keeps the lane when the stage is set for the guitar', () => {
		expect(showsAnswerPad({ scene: 'locate' })).toBe(false);
	});
});
