import { describe, expect, it } from 'vitest';
import type { PromptView } from '$lib/application/session/contract';
import { identifyChoices } from './choices';
import { showsAnswerPad } from './showsAnswerPad';

const identify: PromptView = {
	direction: 'identify',
	primary: 'case 8',
	secondary: 'corde de A',
	aid: null
};
const locate: PromptView = {
	direction: 'locate',
	primary: 'F',
	secondary: 'corde de B',
	aid: null
};

describe('showsAnswerPad', () => {
	it('shows the pad for an identify prompt', () => {
		expect(showsAnswerPad({ prompt: identify, answerChoices: identifyChoices() })).toBe(true);
	});

	it('keeps the lane for a locate prompt, even when choices are present', () => {
		expect(showsAnswerPad({ prompt: locate, answerChoices: identifyChoices() })).toBe(false);
	});

	it('keeps the pad between identify prompts while mode 2 choices are on offer', () => {
		expect(showsAnswerPad({ prompt: null, answerChoices: identifyChoices() })).toBe(true);
	});

	it('keeps the lane with neither a prompt nor choices', () => {
		expect(showsAnswerPad({ prompt: null, answerChoices: null })).toBe(false);
	});
});
