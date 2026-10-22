import type { AnswerChoice } from '$lib/application/session/contract';
import { orderChoices } from './choices';

export type KeyboardKey = {
	choice: AnswerChoice;
	color: 'white' | 'black';
	/** Rank of the white key, 0 to 6; for a black key, the white key on its left. */
	whiteIndex: number;
};

/** One octave of a piano, C to B, from the chromatic choices in any order. */
export function keyboardKeys(choices: readonly AnswerChoice[]): KeyboardKey[] {
	let whiteIndex = -1;
	return orderChoices(choices).map((choice) => {
		const color = choice.value.includes('#') ? 'black' : 'white';
		if (color === 'white') whiteIndex += 1;
		return { choice, color, whiteIndex };
	});
}
