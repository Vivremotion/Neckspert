import { isBeatCount, validateMeter } from '../time/meter';
import { validateLadder } from './ladder';
import { roundProblem, type RoundCheckOptions } from './round/validate';
import type { ExerciseDefinition, Ladder } from './types';

const finite = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown) => finite(value) && value > 0;
const naturalNumber = (value: unknown) =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0;

const SCENES = ['guitar', 'screen'];

function tempoProblem(definition: ExerciseDefinition): string | null {
	if (definition.startTempoBpm !== undefined && !positive(definition.startTempoBpm)) {
		return `startTempoBpm must be a positive number, got ${definition.startTempoBpm}`;
	}
	const tempo = definition.tempo;
	if (tempo === undefined) return null;
	if ('fixed' in tempo) {
		return positive(tempo.fixed)
			? null
			: `tempo.fixed must be a positive number, got ${tempo.fixed}`;
	}
	for (const field of ['start', 'min', 'max', 'step'] as const) {
		if (!positive(tempo[field])) {
			return `tempo.${field} must be a positive number, got ${tempo[field]}`;
		}
	}
	if (tempo.min > tempo.max) return `tempo.min ${tempo.min} is above tempo.max ${tempo.max}`;
	if (tempo.start < tempo.min || tempo.start > tempo.max) {
		return `tempo.start must lie within ${tempo.min}–${tempo.max}, got ${tempo.start}`;
	}
	for (const field of ['raiseAt', 'lowerAt'] as const) {
		if (!finite(tempo[field])) return `tempo.${field} must be a number, got ${tempo[field]}`;
	}
	if (!naturalNumber(tempo.minPrompts)) {
		return `tempo.minPrompts must be a non-negative integer, got ${tempo.minPrompts}`;
	}
	return null;
}

function ladderProblem(params: ExerciseDefinition['params']): string | null {
	if (params.ladder !== undefined) {
		const invalid = validateLadder(params.ladder as Ladder);
		if (invalid !== null) return `params.ladder ${invalid}`;
	}
	if (params.ladders !== undefined) {
		if (typeof params.ladders !== 'object' || params.ladders === null) {
			return 'params.ladders must map mechanics to ladders';
		}
		for (const [mechanic, ladder] of Object.entries(params.ladders)) {
			const invalid = validateLadder(ladder as Ladder);
			if (invalid !== null) return `params.ladders.${mechanic} ${invalid}`;
		}
	}
	return null;
}

function paramsProblem(definition: ExerciseDefinition): string | null {
	const { params } = definition;
	const ladder = ladderProblem(params);
	if (ladder !== null) return ladder;
	if (params.windows !== undefined) {
		if (typeof params.windows !== 'object' || params.windows === null) {
			return 'params.windows must map windows to numbers';
		}
		for (const [field, value] of Object.entries(params.windows)) {
			if (!finite(value) || value < 0) {
				return `params.windows.${field} must be a non-negative number, got ${value}`;
			}
		}
		// Placed on the beat: an exact fraction of one.
		const anchor = (params.windows as Record<string, unknown>).anchorChordFromBeats;
		if (anchor !== undefined && !isBeatCount(anchor)) {
			return `params.windows.anchorChordFromBeats must be an exact fraction of a beat, got ${anchor}`;
		}
	}
	if (params.learning !== undefined) {
		const learning = params.learning as Record<string, unknown>;
		const gaps = learning.retestGaps;
		if (
			gaps !== undefined &&
			!(Array.isArray(gaps) && gaps.length === 2 && gaps.every(naturalNumber))
		) {
			return `params.learning.retestGaps must be two non-negative integers, got ${JSON.stringify(gaps)}`;
		}
		const fade = learning.aidFadeSuccesses;
		if (fade !== undefined && !naturalNumber(fade)) {
			return `params.learning.aidFadeSuccesses must be a non-negative integer, got ${fade}`;
		}
	}
	const pacing = params.pacing as { respirationBars?: unknown } | undefined;
	// A round on the beat lasts its breath: 0 bars would make it last nothing.
	const bars = pacing?.respirationBars;
	if (pacing !== undefined && !(naturalNumber(bars) && (bars as number) >= 1)) {
		return `params.pacing.respirationBars must be a positive integer, got ${bars}`;
	}
	if (params.recallThresholdMs !== undefined && !positive(params.recallThresholdMs)) {
		return `params.recallThresholdMs must be a positive number, got ${params.recallThresholdMs}`;
	}
	return null;
}

/**
 * Null when the engine can run the exercise, else what it cannot run, naming the exercise and the
 * field: a tempo not positive or a range that cannot hold its start, a ladder it cannot climb,
 * windows or settings that are no counts, a malformed meter, a preview before nothing, a round
 * template (`roundProblem`; `options.sensors`: the sensors the session has). It never
 * judges what an exercise is worth: anything runnable passes.
 */
export function validateExercise(
	definition: ExerciseDefinition,
	options: RoundCheckOptions = {}
): string | null {
	const problem = ((): string | null => {
		if (definition.meter !== undefined) {
			const meter = validateMeter(definition.meter);
			if (meter !== null) return `meter ${meter}`;
		}
		const tempo = tempoProblem(definition);
		if (tempo !== null) return tempo;
		const flow = definition.flow;
		// Beats are counted whole on the transport.
		if (flow?.previewBeats !== undefined && !naturalNumber(flow.previewBeats)) {
			return `flow.previewBeats must be a non-negative integer, got ${flow.previewBeats}`;
		}
		if (flow?.scene !== undefined && !SCENES.includes(flow.scene)) {
			return `flow.scene must be one of ${SCENES.join(', ')}, got ${flow.scene}`;
		}
		const params = paramsProblem(definition);
		if (params !== null) return params;
		return roundProblem(definition, options);
	})();
	return problem === null ? null : `${definition.id}: ${problem}`;
}
