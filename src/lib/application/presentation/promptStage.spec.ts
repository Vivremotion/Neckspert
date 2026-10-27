import { describe, expect, it } from 'vitest';
import { IDENTIFY_NECK, LOCATE_NECK, TRIADS_ANCHOR } from '$lib/domain/exercise/catalog';
import { compileRound } from '$lib/domain/exercise/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { midiOnString, parseVoicingKey, voicingOccurrences } from '$lib/domain/music';
import { METER_4_4, type ResponseValue } from '$lib/domain/time';
import type { ExpectationResult } from '$lib/domain/time/modes/responseVerdict';
import { occurrenceId } from '$lib/domain/triads';
import type { PlannedItem, ResponseVerdict } from '$lib/domain/types';
import { identifyPresenter } from '$lib/application/mechanics/identify';
import { TRIAD_MESSAGES } from '$lib/application/mechanics/triadMessages';
import { presentPrompt } from './presentPrompt';
import { promptStage } from './promptStage';

const D_ON_B = 'D|maj|3:5,2:1,1:3';
const D_ON_G = 'D|maj|3:1,2:3,1:5';

function planned(definition: ExerciseDefinition, item: unknown): PlannedItem {
	return {
		exerciseId: definition.id,
		mechanic: definition.mechanic,
		item,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 8
	};
}

/** The id of the shape of a voicing whose frets, from the lowest string, are `frets`. */
function idAt(voicingKey: string, frets: [number, number, number]): string {
	const shape = voicingOccurrences(parseVoicingKey(voicingKey)).find((s) =>
		s.notes.every((note, i) => note.fret === frets[i])
	);
	if (!shape) throw new Error(`no shape ${frets}`);
	return occurrenceId(shape);
}

const shape = (frets: [number, number, number]) => ({
	kind: 'shape',
	notes: [
		{ string: 3, fret: frets[0] },
		{ string: 2, fret: frets[1] },
		{ string: 1, fret: frets[2] }
	]
});

function result(index: number, over: Partial<ExpectationResult> = {}): ExpectationResult {
	return {
		index,
		answer: null,
		correct: null,
		confusion: null,
		correction: null,
		late: false,
		...over
	};
}

function value(
	verdict: ResponseVerdict,
	expectations: ExpectationResult[],
	timingOffsetMs: number | null = null
): ResponseValue {
	return { verdict, timingOffsetMs, reactionMs: null, leadMs: null, expectations };
}

const PLACE = {
	anchorBeat: 12,
	promptBeat: 4,
	history: [{ beatIndex: 2, verdict: 'late' as const }],
	bands: [{ fromBeat: 13, untilBeat: 16 }]
};

function stage(
	definition: ExerciseDefinition,
	item: unknown,
	settled: { value: ResponseValue; success: boolean } | null,
	over: { choices?: { value: string; label: string }[] } = {}
) {
	const plannedItem = planned(definition, item);
	return promptStage({
		definition,
		item: plannedItem,
		plan: compileRound(definition, plannedItem, METER_4_4, { previewBeats: 0 }),
		settled,
		place: PLACE,
		beatsPerBar: 3,
		chordDiagram: 'grid',
		choices: over.choices ?? [],
		locale: 'fr',
		random: () => 0
	});
}

const ANCHOR = { voicingKey: D_ON_B };

describe('promptStage', () => {
	it('places the prompt, the target and the bands of the plan', () => {
		const item = { string: 2, pitch: 'F' };
		const model = stage(LOCATE_NECK, item, null);
		expect(model).toEqual({
			prompt: presentPrompt(LOCATE_NECK, planned(LOCATE_NECK, item), 'fr', () => 0),
			anchorBeat: 12,
			promptBeat: 4,
			history: [{ beatIndex: 2, verdict: 'late' }],
			bands: [{ fromBeat: 13, untilBeat: 16 }],
			beatsPerBar: 3,
			verdict: null,
			chordDiagram: 'grid',
			choices: []
		});
		expect(model.prompt.primary).toBe('F');
	});

	it('tells nothing of a success but its verdict and offset', () => {
		const item = { string: 2, pitch: 'F' };
		const played = value(
			'perfect',
			[result(0, { answer: { midi: midiOnString(2, 6) }, correct: true })],
			12
		);
		expect(stage(LOCATE_NECK, item, { value: played, success: true }).verdict).toEqual({
			verdict: 'perfect',
			offsetMs: 12,
			answerLabel: 'F',
			misses: []
		});
	});

	it('tells no miss of a right note heard off the beat, though the round did not pass', () => {
		const item = { string: 2, pitch: 'F' };
		const played = value('offbeat', [
			result(0, { answer: { midi: midiOnString(2, 6) }, correct: true, late: true })
		]);
		expect(stage(LOCATE_NECK, item, { value: played, success: false }).verdict?.misses).toEqual([]);
	});

	it("tells each missed expectation by its content: the root's position, the chord drawn", () => {
		const played = value('wrong', [
			result(0, {
				answer: { midi: midiOnString(2, 5) },
				correct: false,
				confusion: { kind: 'other', part: 'root' }
			}),
			result(1, {
				answer: { decided: idAt(D_ON_G, [7, 7, 5]) },
				correct: false,
				confusion: { kind: 'other-inversion', part: 'chord' }
			})
		]);
		const { verdict } = stage(TRIADS_ANCHOR, ANCHOR, { value: played, success: false });
		expect(verdict?.misses).toEqual([
			{ correction: 'corde de B, case 3', heard: null, expected: null, gap: null },
			{
				correction: '2‑3‑2 · A D F#',
				heard: shape([7, 7, 5]),
				expected: shape([2, 3, 2]),
				gap: TRIAD_MESSAGES.fr.gap['other-inversion']
			}
		]);
		// A note played wrong is written as it was played (D4), not as the target.
		expect(verdict?.answerLabel).toBe('E · 7‑7‑5');
	});

	it('draws the first wrong chord of a corrected round', () => {
		const played = value('corrected', [
			result(0, { answer: { midi: midiOnString(2, 3) }, correct: true }),
			result(1, {
				answer: { decided: idAt(D_ON_G, [7, 7, 5]) },
				correct: false,
				confusion: { kind: 'other-inversion', part: 'chord' },
				correction: { decided: idAt(D_ON_B, [2, 3, 2]) }
			})
		]);
		const { verdict } = stage(TRIADS_ANCHOR, ANCHOR, { value: played, success: false });
		expect(verdict?.verdict).toBe('corrected');
		expect(verdict?.misses).toHaveLength(1);
		expect(verdict?.misses[0].heard).toEqual(shape([7, 7, 5]));
		expect(verdict?.misses[0].expected).toEqual(shape([2, 3, 2]));
	});

	it('joins the answers heard in the order of the expectations', () => {
		const played = value('perfect', [
			result(1, { answer: { decided: idAt(D_ON_B, [2, 3, 2]) }, correct: true }),
			result(0, { answer: { midi: midiOnString(2, 3) }, correct: true })
		]);
		const { verdict } = stage(TRIADS_ANCHOR, ANCHOR, { value: played, success: true });
		expect(verdict).toEqual({
			verdict: 'perfect',
			offsetMs: null,
			answerLabel: 'D · 2‑3‑2',
			misses: []
		});
		const silent = value('wrong', [result(0), result(1)]);
		expect(
			stage(TRIADS_ANCHOR, ANCHOR, { value: silent, success: false }).verdict?.answerLabel
		).toBeNull();
	});

	it('gives the answer keys of a screen mechanic', () => {
		const choices = identifyPresenter.answerChoices!();
		const item = { string: 3, fret: 3 };
		const tapped = value('wrong', [
			result(0, { answer: { pitch: 'A' }, correct: false, confusion: null })
		]);
		const model = stage(IDENTIFY_NECK, item, { value: tapped, success: false }, { choices });
		expect(model.choices).toEqual(choices);
		expect(model.choices).toHaveLength(12);
		expect(model.prompt).toMatchObject({ primary: 'case 3', secondary: 'corde de G' });
		expect(model.verdict).toEqual({
			verdict: 'wrong',
			offsetMs: null,
			answerLabel: 'A',
			misses: [{ correction: 'A# / Bb', heard: null, expected: null, gap: null }]
		});
	});
});
