import { mechanicRules } from '../mechanics';
import { FORM_ITEM_SEPARATOR } from '../mechanics/formFigure';
import { fretOf } from '../music/fretboard';
import { MAX_PLAYABLE_FRET } from '../music/types';
import { attackNotes, validateFigure } from '../time/figure';
import { levelRange } from '../time/levels';
import { isBeatCount, METER_4_4, validateMeter } from '../time/meter';
import type { PlannedItem } from '../types';
import { levelConditionsProblem, validateLadder } from './ladder';
import { exerciseLevelsOf, exerciseParamsOf, overrideParams, type LevelOverrides } from './levels';
import { compileRound } from './round/compile';
import { roundProblem, type RoundCheckOptions } from './round/validate';
import { BRIEFINGS, LEVEL_CHANGES, type ExerciseDefinition, type Ladder } from './types';

const finite = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown) => finite(value) && value > 0;
const naturalNumber = (value: unknown) =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0;

const SCENES = ['guitar', 'screen'];

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

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Why the values of params cannot be run, named by their path: the params an exercise writes
 * (with its `tempo`, `read` `'params'`), and alike the params resolved at each of its levels
 * (`read` `'level'`), so that a value is checked the same wherever it is written. At a level only
 * what the engine reads from the resolved params is checked (tempo, windows, pacing); the
 * learning settings and the recall threshold are read from the exercise's params alone. A value
 * left out passes: its default is runnable.
 */
function valuesProblem(
	values: Readonly<Record<string, unknown>>,
	read: 'params' | 'level'
): string | null {
	const { tempo } = values;
	if (tempo !== undefined && !positive(tempo)) {
		return `tempo must be a positive number, got ${tempo}`;
	}
	if (values.windows !== undefined) {
		if (!isObject(values.windows)) return 'params.windows must map windows to numbers';
		for (const [field, value] of Object.entries(values.windows)) {
			if (!finite(value) || value < 0) {
				return `params.windows.${field} must be a non-negative number, got ${value}`;
			}
		}
		// Placed on the beat: an exact fraction of one.
		const anchor = values.windows.anchorChordFromBeats;
		if (anchor !== undefined && !isBeatCount(anchor)) {
			return `params.windows.anchorChordFromBeats must be an exact fraction of a beat, got ${anchor}`;
		}
	}
	if (values.pacing !== undefined) {
		if (!isObject(values.pacing)) return `params.pacing must be an object, got ${values.pacing}`;
		const pacing = values.pacing;
		// A round on the beat lasts its breath: 0 bars would make it last nothing.
		const bars = pacing.respirationBars;
		if (bars !== undefined && !(naturalNumber(bars) && (bars as number) >= 1)) {
			return `params.pacing.respirationBars must be a positive integer, got ${bars}`;
		}
		const rounds = pacing.roundsPerBreath;
		if (rounds !== undefined && !(naturalNumber(rounds) && (rounds as number) >= 1)) {
			return `params.pacing.roundsPerBreath must be a positive integer, got ${rounds}`;
		}
		const breathMs = pacing.breathMinMs;
		if (breathMs !== undefined && !(finite(breathMs) && breathMs >= 0)) {
			return `params.pacing.breathMinMs must be a non-negative number, got ${breathMs}`;
		}
		const listenIn = pacing.listenInBars;
		if (listenIn !== undefined && !naturalNumber(listenIn)) {
			return `params.pacing.listenInBars must be a non-negative integer, got ${listenIn}`;
		}
		const countIn = pacing.countIn;
		if (countIn !== undefined && typeof countIn !== 'boolean') {
			return `params.pacing.countIn must be true or false, got ${countIn}`;
		}
	}
	// Read from the exercise's own params only (`itemLearningOf`, `recallThresholdOf`): what a
	// level writes there is without effect.
	if (read === 'level') return null;
	if (values.learning !== undefined) {
		if (!isObject(values.learning)) return 'params.learning must be an object';
		const gaps = values.learning.retestGaps;
		if (
			gaps !== undefined &&
			!(Array.isArray(gaps) && gaps.length === 2 && gaps.every(naturalNumber))
		) {
			return `params.learning.retestGaps must be two non-negative integers, got ${JSON.stringify(gaps)}`;
		}
		const fade = values.learning.aidFadeSuccesses;
		if (fade !== undefined && !naturalNumber(fade)) {
			return `params.learning.aidFadeSuccesses must be a non-negative integer, got ${fade}`;
		}
	}
	if (values.recallThresholdMs !== undefined && !positive(values.recallThresholdMs)) {
		return `params.recallThresholdMs must be a positive number, got ${values.recallThresholdMs}`;
	}
	return null;
}

function paramsProblem(definition: ExerciseDefinition): string | null {
	return (
		valuesProblem({ ...definition.params, tempo: definition.tempo }, 'params') ??
		ladderProblem(definition.params)
	);
}

/**
 * Why a run could not start or end at a level's resolved params, once their values are known to
 * be runnable: neither a listen-in nor a counted bar (`checkStart` at run start; the listen-in is
 * 0 by default, the counted bar on by default), or a round judged by cycle with no
 * `pacing.roundsPerBreath`, whose run would never breathe.
 */
function runProblem(
	definition: ExerciseDefinition,
	atLevel: Readonly<Record<string, unknown>>
): string | null {
	const pacing = atLevel.pacing as Record<string, unknown>;
	const listenIn = pacing.listenInBars ?? 0;
	const countIn = pacing.countIn ?? true;
	if (!countIn && listenIn === 0) {
		return 'resolves params.pacing.countIn false with no listen-in bar: a run needs one or the other';
	}
	if (definition.round?.policy?.unit === 'cycle' && pacing.roundsPerBreath === undefined) {
		return 'resolves no rounds per breath: params.pacing.roundsPerBreath is required for a round judged by cycle';
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
 * Why the levels cannot be run: exercise levels out of order or with conditions it cannot run, an
 * exercise or item level whose paths cannot be applied (`overrideParams`) or whose resolved params
 * hold a tempo, windows or pacing the engine could not run (`valuesProblem` at a level), named by
 * its level in `levels` (aid levels counted) or on its ladder, a run a level could not start or
 * end (`runProblem`). A path no piece reads at a level passes, the learning settings and the
 * recall threshold among them: it is without effect.
 */
function levelsProblem(definition: ExerciseDefinition): string | null {
	const { levels } = definition;
	if (levels !== undefined) {
		if (!Array.isArray(levels)) return 'levels is not a list of levels';
		for (const [index, level] of levels.entries()) {
			if (!isObject(level)) return `levels[${index}] must be an object`;
			if (!isObject(level.params)) return `levels[${index}].params must be an object`;
		}
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
		const values = valuesProblem(atLevel, 'level');
		if (values !== null) return `${field}: ${values}`;
		const run = runProblem(definition, atLevel);
		if (run !== null) return `${field} ${run}`;
		resolved.push(atLevel);
	}
	for (const [field, ladder] of laddersOf(definition.params)) {
		for (const [index, level] of ladder.entries()) {
			for (const atLevel of resolved) {
				let atItemLevel: Readonly<Record<string, unknown>>;
				try {
					atItemLevel = overrideParams(atLevel, level.params as LevelOverrides);
				} catch (error) {
					return `${field} level ${index}: ${(error as Error).message}`;
				}
				const values = valuesProblem(atItemLevel, 'level');
				if (values !== null) return `${field} level ${index}: ${values}`;
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
				if ('problem' in fretOf(note.pitch, note.string)) {
					return `figures[${index}] (${id}) note ${k} has pitch ${note.pitch}, not on string ${note.string} (frets 0 to ${MAX_PLAYABLE_FRET})`;
				}
			}
		}
	}
	return null;
}

/**
 * Why a form the exercise writes cannot be played: an id already taken or that no item key could
 * name, no note, or a note written on a string where no fret gives its pitch.
 */
function formsProblem(definition: ExerciseDefinition): string | null {
	const forms = definition.forms ?? [];
	for (const [index, { id, notes }] of forms.entries()) {
		const field = `forms[${index}] (${id})`;
		const same = forms.findIndex((form) => form.id === id);
		if (same !== index) return `${field} has the id of forms[${same}]`;
		if (id.includes(FORM_ITEM_SEPARATOR)) {
			return `${field} has an id with "${FORM_ITEM_SEPARATOR}", which separates the parts of an item key`;
		}
		if (notes.length === 0) return `${field} has no note`;
		for (const [k, { midi, string }] of notes.entries()) {
			const place = fretOf(midi, string);
			if ('problem' in place) return `${field} note ${k} ${place.problem}`;
		}
	}
	return null;
}

/**
 * Why an item the exercise lists cannot be played: an empty list, a key its mechanic cannot read
 * (`parseItem`), or an item its round cannot compile at one of its exercise levels (an occurrence
 * the neck does not hold, a form moved off it, a pattern note beyond its notes…), naming the item
 * and the level. What the round does not derive it does not need. Checked once the round is known
 * to be valid.
 */
function itemsProblem(definition: ExerciseDefinition): string | null {
	const { items, round } = definition;
	if (items === undefined) return null;
	if (!Array.isArray(items)) return 'items must be a list';
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
 * field: a tempo not positive, a ladder it cannot climb, a figure or form note impossible on its
 * string, forms with one id or no note (`formsProblem`), levels it cannot resolve (`levelsProblem`),
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
		if (flow?.levelChange !== undefined && !LEVEL_CHANGES.includes(flow.levelChange)) {
			return `flow.levelChange must be one of ${LEVEL_CHANGES.join(', ')}, got ${String(flow.levelChange)}`;
		}
		if (flow?.demonstration !== undefined && typeof flow.demonstration !== 'boolean') {
			return `flow.demonstration must be true or false, got ${String(flow.demonstration)}`;
		}
		const params = paramsProblem(definition);
		if (params !== null) return params;
		const levels = levelsProblem(definition);
		if (levels !== null) return levels;
		const figures = figuresProblem(definition);
		if (figures !== null) return figures;
		const forms = formsProblem(definition);
		if (forms !== null) return forms;
		return roundProblem(definition, options) ?? itemsProblem(definition);
	})();
	return problem === null ? null : `${definition.id}: ${problem}`;
}
