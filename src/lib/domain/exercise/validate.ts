import { levelRange } from '../time/levels';
import { isBeatCount, validateMeter } from '../time/meter';
import { levelConditionsProblem, validateLadder } from './ladder';
import { exerciseLevelsOf, exerciseParamsOf, overrideParams, type LevelOverrides } from './levels';
import { roundProblem, type RoundCheckOptions } from './round/validate';
import type { ExerciseDefinition, Ladder } from './types';

const finite = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown) => finite(value) && value > 0;
const naturalNumber = (value: unknown) =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0;

const SCENES = ['guitar', 'screen'];

function tempoProblem(definition: ExerciseDefinition): string | null {
	const { tempo } = definition;
	if (tempo === undefined || positive(tempo)) return null;
	return `tempo must be a positive number, got ${tempo}`;
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

/** The ladders an exercise writes, by the field that holds them. */
function laddersOf(params: ExerciseDefinition['params']): [string, Ladder][] {
	const ladders: [string, Ladder][] = [];
	if (params.ladder !== undefined) ladders.push(['params.ladder', params.ladder as Ladder]);
	if (typeof params.ladders === 'object' && params.ladders !== null) {
		for (const [mechanic, ladder] of Object.entries(params.ladders)) {
			ladders.push([`params.ladders.${mechanic}`, ladder as Ladder]);
		}
	}
	return ladders;
}

/**
 * Why the levels cannot be run: exercise levels out of order or with conditions it cannot run, a
 * path of an exercise or item level through a value that is not an object (named by its level in
 * `levels`, aid levels counted, or on its ladder), a tempo a level resolves that is not positive.
 * A path no piece reads passes: it is without effect.
 */
function levelsProblem(definition: ExerciseDefinition): string | null {
	const { levels } = definition;
	if (levels !== undefined) {
		if (!Array.isArray(levels)) return 'levels is not a list of levels';
		try {
			levelRange(levels);
		} catch (error) {
			return `levels ${(error as Error).message}`;
		}
		for (const [index, level] of levels.entries()) {
			const conditions = levelConditionsProblem(level);
			if (conditions !== null) return `levels[${index}]: ${conditions}`;
		}
	}
	const params = exerciseParamsOf(definition);
	const resolved: Readonly<Record<string, unknown>>[] = [];
	for (const [index, level] of exerciseLevelsOf(definition).entries()) {
		const field = levels === undefined ? 'params' : `levels[${index}]`;
		let atLevel: Readonly<Record<string, unknown>>;
		try {
			atLevel = overrideParams(params, level.params);
		} catch (error) {
			return `${field} ${(error as Error).message}`;
		}
		if (!positive(atLevel.tempo)) {
			return `${field} resolves a tempo that is not a positive number, got ${atLevel.tempo}`;
		}
		resolved.push(atLevel);
	}
	for (const [field, ladder] of laddersOf(definition.params)) {
		for (const [index, level] of ladder.entries()) {
			for (const atLevel of resolved) {
				try {
					overrideParams(atLevel, level.params as LevelOverrides);
				} catch (error) {
					return `${field} level ${index}: ${(error as Error).message}`;
				}
			}
		}
	}
	return null;
}

/**
 * Null when the engine can run the exercise, else what it cannot run, naming the exercise and the
 * field: a tempo not positive, a ladder it cannot climb,
 * levels it cannot resolve (`levelsProblem`),
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
		const levels = levelsProblem(definition);
		if (levels !== null) return levels;
		return roundProblem(definition, options);
	})();
	return problem === null ? null : `${definition.id}: ${problem}`;
}
