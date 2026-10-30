import { mechanicRules } from '../mechanics';
import { MAX_PLAYABLE_FRET, STANDARD_TUNING, type StringNumber } from '../music/types';
import { attackNotes, validateFigure } from '../time/figure';
import { levelRange } from '../time/levels';
import { isBeatCount, METER_4_4, validateMeter } from '../time/meter';
import type { PlannedItem } from '../types';
import { levelConditionsProblem, validateLadder } from './ladder';
import { exerciseLevelsOf, exerciseParamsOf, overrideParams, type LevelOverrides } from './levels';
import { compileRound } from './round/compile';
import { roundProblem, type RoundCheckOptions } from './round/validate';
import { BRIEFINGS, type ExerciseDefinition, type Ladder } from './types';

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
	const pacing = params.pacing as Record<string, unknown> | undefined;
	// A round on the beat lasts its breath: 0 bars would make it last nothing.
	const bars = pacing?.respirationBars;
	if (bars !== undefined && !(naturalNumber(bars) && (bars as number) >= 1)) {
		return `params.pacing.respirationBars must be a positive integer, got ${bars}`;
	}
	const rounds = pacing?.roundsPerBreath;
	if (rounds !== undefined && !(naturalNumber(rounds) && (rounds as number) >= 1)) {
		return `params.pacing.roundsPerBreath must be a positive integer, got ${rounds}`;
	}
	const breathMs = pacing?.breathMinMs;
	if (
		breathMs !== undefined &&
		!(typeof breathMs === 'number' && Number.isFinite(breathMs) && breathMs >= 0)
	) {
		return `params.pacing.breathMinMs must be a non-negative number, got ${breathMs}`;
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
 * Why a figure the exercise writes cannot be played: a note written on a string where no fret
 * (0 to `MAX_PLAYABLE_FRET`) gives its pitch.
 */
function figuresProblem(definition: ExerciseDefinition): string | null {
	for (const [index, { id, figure }] of (definition.figures ?? []).entries()) {
		const invalid = validateFigure(figure);
		if (invalid !== null) return `figures[${index}] (${id}) is invalid: ${invalid}`;
		for (const voice of figure.voices) {
			for (const [k, { note }] of attackNotes(figure, voice.id).entries()) {
				if (note.pitch === undefined || note.string === undefined) continue;
				const fret = note.pitch - STANDARD_TUNING[note.string as StringNumber];
				if (fret < 0 || fret > MAX_PLAYABLE_FRET) {
					return `figures[${index}] (${id}) note ${k} has pitch ${note.pitch}, not on string ${note.string} (frets 0 to ${MAX_PLAYABLE_FRET})`;
				}
			}
		}
	}
	return null;
}

/**
 * Why an item the exercise lists cannot be played: an empty list, a key its mechanic cannot read
 * (`parseItem`), or an item its round cannot compile at one of its exercise levels (an occurrence
 * the neck does not hold, a pattern note beyond its shape…), naming the item and the level.
 * Checked once the round is known to be valid.
 */
function itemsProblem(definition: ExerciseDefinition): string | null {
	const { items, round } = definition;
	if (items === undefined) return null;
	if (items.length === 0) return 'items lists no item';
	const rules = mechanicRules(definition.mechanic);
	const meter = definition.meter ?? METER_4_4;
	const { lowest, highest } = levelRange(exerciseLevelsOf(definition));
	for (const [i, key] of items.entries()) {
		const field = `items[${i}] (${JSON.stringify(key)})`;
		let item: unknown;
		try {
			item = rules.parseItem(key);
		} catch (error) {
			return `${field}: ${(error as Error).message}`;
		}
		if (round === undefined) continue;
		for (let level = lowest; level <= highest; level++) {
			const planned: PlannedItem = {
				exerciseId: definition.id,
				mechanic: definition.mechanic,
				exerciseLevel: level,
				item,
				phase: 'free',
				temperature: 'hot',
				aid: 'none',
				leadBeats: null
			};
			try {
				compileRound(definition, planned, meter, {
					previewBeats: definition.flow?.previewBeats ?? 0,
					fromRunStart: null
				});
			} catch (error) {
				// The compiler names the exercise too: it is named once.
				const problem = (error as Error).message.replace(`${definition.id}: `, '');
				return `${field} does not compile at exercise level ${level}: ${problem}`;
			}
		}
	}
	return null;
}

/**
 * Null when the engine can run the exercise, else what it cannot run, naming the exercise and the
 * field: a tempo not positive, a ladder it cannot climb, a figure note impossible on its string,
 * levels it cannot resolve (`levelsProblem`),
 * windows or settings that are no counts, a malformed meter, a preview before nothing, a round
 * template (`roundProblem`; `options.sensors`: the sensors the session has), an item it lists
 * (`itemsProblem`). It never
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
		if (flow?.briefing !== undefined && !BRIEFINGS.includes(flow.briefing)) {
			return `flow.briefing must be one of ${BRIEFINGS.join(', ')}, got ${String(flow.briefing)}`;
		}
		const params = paramsProblem(definition);
		if (params !== null) return params;
		const levels = levelsProblem(definition);
		if (levels !== null) return levels;
		const figures = figuresProblem(definition);
		if (figures !== null) return figures;
		return roundProblem(definition, options) ?? itemsProblem(definition);
	})();
	return problem === null ? null : `${definition.id}: ${problem}`;
}
