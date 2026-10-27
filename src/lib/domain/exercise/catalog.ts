import { GESTURE_EXERCISES } from '$lib/domain/gesture/exercises';
import { RHYTHM_EXERCISES } from './rhythmCatalog';
import { LEARN_SUCCESSES } from '$lib/domain/progress/constants';
import { IDENTIFY_RECALL_THRESHOLD_MS, RECALL_THRESHOLD_MS } from '$lib/domain/types';
import type { RoundTemplate } from './round/types';
import type { ExerciseDefinition, ExerciseId, Ladder } from './types';

/**
 * Leads on the beat, at 80 bpm: 8 beats with the answer shown, then 4, then 2 (1 500 ms, the
 * recall threshold), where only a direct recall counts and `LEARN_SUCCESSES` learn the item.
 */
function leadsLadder(): Ladder {
	return [
		{ params: { leadBeats: 8, aided: true }, pass: { successes: 1 }, drop: { failures: 1 } },
		{ params: { leadBeats: 4, aided: false }, pass: { successes: 1 }, drop: { failures: 1 } },
		{
			params: { leadBeats: 2, aided: false },
			pass: { successes: LEARN_SUCCESSES },
			drop: { failures: 1 },
			success: 'direct-recall'
		}
	];
}

/** In free time: the answer shown, then unaided, where only a direct recall counts. */
function freeTimeLadder(): Ladder {
	return [
		{ params: { leadBeats: null, aided: true }, pass: { successes: 1 }, drop: { failures: 1 } },
		{
			params: { leadBeats: null, aided: false },
			pass: { successes: LEARN_SUCCESSES },
			drop: { failures: 1 },
			success: 'direct-recall'
		}
	];
}

/** A first answer on the beat: the window opens after the prompt, a late note is captured. */
function onTheBeat(correction: boolean): RoundTemplate['policy'] {
	return {
		unit: 'response',
		verdict: 'response',
		correction,
		pairing: {
			mode: 'first-answer',
			opens: { afterPromptMs: { param: 'windows.minResponseMs' } },
			lateMs: { param: 'windows.lateMs' },
			lateCapture: { ms: { param: 'windows.lateCaptureMs' } }
		}
	};
}

/**
 * A note answered on the beat at the item's lead, then the breath: judged by the content its item
 * derives, heard by `sensor`. It stops listening when the next prompt's preview shows, unless
 * `listen` is false.
 */
function beatRound(derivation: string, sensor: string, listen: boolean): RoundTemplate {
	return {
		prompt: { lead: { param: 'leadBeats' } },
		expectations: [
			{
				at: { beats: 0 },
				sensor,
				content: { from: derivation },
				window: { ms: { param: 'windows.perfectMs' } }
			}
		],
		length: { breath: true },
		...(listen && { listenBeforeEnd: { beats: { param: 'previewBeats' } } }),
		policy: onTheBeat(false)
	};
}

/** The anchor: the root on the beat, then the whole chord from the anchor's beat to the end of the bar. */
function anchorRound(): RoundTemplate {
	return {
		prompt: { lead: { param: 'leadBeats' } },
		expectations: [
			{
				at: { beats: 0 },
				sensor: 'note',
				content: { from: 'voicing-root' },
				window: { ms: { param: 'windows.perfectMs' } }
			},
			{
				at: { beats: { param: 'windows.anchorChordFromBeats' } },
				until: { bars: 1 },
				sensor: 'chord',
				content: { from: 'voicing-anywhere' },
				window: { ms: { param: 'windows.perfectMs' } }
			}
		],
		length: { bars: 1, breath: true },
		policy: onTheBeat(true)
	};
}

/** A note named in free time, within the exercise's recall threshold. */
function freeNameRound(): RoundTemplate {
	return {
		prompt: { lead: 0 },
		expectations: [
			{
				at: null,
				sensor: 'tap',
				content: { from: 'name-of-item' },
				window: { ms: { param: 'recallThresholdMs' } }
			}
		],
		length: { bars: 1 },
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: { mode: 'first-answer', opens: { afterPromptMs: 0 }, lateMs: 0, lateCapture: null }
		}
	};
}

export const LOCATE_NECK: ExerciseDefinition = {
	id: 'locate-neck',
	version: 1,
	mechanic: 'locate',
	view: 'note-lane',
	tempo: { fixed: 80 },
	presentation: {
		primary: '{note}',
		secondary: '{string}',
		preview: '{string}',
		aided: { line: '{fret}' },
		fading: { picture: 'string' }
	},
	round: beatRound('note-of-item', 'note', true),
	params: { recallThresholdMs: RECALL_THRESHOLD_MS, ladder: leadsLadder() }
};

export const IDENTIFY_NECK: ExerciseDefinition = {
	id: 'identify-neck',
	version: 1,
	mechanic: 'identify',
	view: 'answer-keys',
	presentation: { primary: '{fret}', secondary: '{string}', aided: { line: '{name}' } },
	round: freeNameRound(),
	params: { recallThresholdMs: IDENTIFY_RECALL_THRESHOLD_MS, ladder: freeTimeLadder() }
};

/** The triads of the memory track: close major and minor triads on G-B-E, then D-G-B. */
function triadsParams() {
	return {
		stringSets: [
			[3, 2, 1],
			[4, 3, 2]
		],
		qualities: ['maj', 'min'],
		pacing: { respirationBars: 1 },
		recallThresholdMs: RECALL_THRESHOLD_MS,
		ladder: leadsLadder()
	};
}

/** Find a triad from its root on a named string (spec 2026-10-08, section 1). */
export const TRIADS_ANCHOR: ExerciseDefinition = {
	id: 'triads-anchor',
	version: 1,
	mechanic: 'triad-anchor',
	tempo: { fixed: 80 },
	presentation: {
		primary: '{chord}',
		secondary: { fr: 'fondamentale sur {rootString}', en: 'root on {rootString}' },
		detail: '{strings}',
		target: '{root}',
		band: '{chord}',
		aided: { picture: 'lowest-shape' }
	},
	round: anchorRound(),
	params: triadsParams()
};

/** Find a triad in a named position. */
export const TRIADS_ZONE: ExerciseDefinition = {
	id: 'triads-zone',
	version: 1,
	mechanic: 'triad-zone',
	tempo: { fixed: 80 },
	presentation: {
		primary: '{chord}',
		secondary: '{around}',
		detail: '{strings}',
		aided: { line: { fr: 'fondamentale sur {rootString}', en: 'root on {rootString}' } }
	},
	round: beatRound('voicing-at-position', 'chord', false),
	params: triadsParams()
};

export const EXERCISES: readonly ExerciseDefinition[] = [
	LOCATE_NECK,
	IDENTIFY_NECK,
	TRIADS_ANCHOR,
	TRIADS_ZONE,
	...GESTURE_EXERCISES,
	...RHYTHM_EXERCISES
];

export function exerciseById(id: ExerciseId): ExerciseDefinition {
	const found = EXERCISES.find((exercise) => exercise.id === id);
	if (!found) throw new Error(`Unknown exercise: ${id}`);
	return found;
}
