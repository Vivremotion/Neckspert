/**
 * Exercises drawn at random from the registered pieces, and a bench that plays any response
 * exercise on a fixed list of items: the promise « every valid exercise plays » put to the test.
 */
import { NECK_PRESENTERS, TRIAD_PRESENTERS } from '$lib/application/mechanics';
import type { MechanicPresenter } from '$lib/application/mechanics/types';
import { ITEM_FIELDS } from '$lib/application/presentation/itemFields';
import { PICTURES } from '$lib/application/presentation/pictures';
import { lowestShape, shapeAt } from '$lib/application/presentation/triadWords';
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import type { PromptStageModel } from '$lib/application/presentation/promptStage';
import type { PlaySessionController } from '$lib/application/session/contract';
import { chordSensor, noteSensor, tapSensor } from '$lib/application/session/sensors';
import type { ResponseSeriesDeps } from '$lib/application/session/SessionDeps';
import { START_DELAY_S } from '$lib/application/session/transport';
import { ResponseSeriesController } from '$lib/application/session/series/ResponseSeriesController.svelte';
import { CONTENT_DERIVATIONS } from '$lib/domain/derivations';
import {
	exerciseById,
	TRIADS_ANCHOR,
	type ExerciseDefinition,
	type Ladder,
	type MechanicId,
	type PromptPresentation,
	type Slot
} from '$lib/domain/exercise';
import { previewBeatsOf } from '$lib/domain/exercise/pacing';
import { recallThresholdOf } from '$lib/domain/exercise/recall';
import { directRecallOf } from '$lib/domain/learning';
import { compileRound } from '$lib/domain/exercise/round';
import type { ExpectationTemplate, Position, RoundTemplate } from '$lib/domain/exercise/round';
import { CHORD_VOICING_CONTENT, NAME_CONTENT, NOTE_CONTENT } from '$lib/domain/judges';
import type { ChordVoicingContent } from '$lib/domain/judges';
import {
	acceptableMidis,
	locateItems,
	parseVoicingKey,
	pitchOnString,
	voicingKey,
	voicingOccurrences,
	type IdentifyItem,
	type LocateItem
} from '$lib/domain/music';
import { CHROMATIC_NOTES, type PitchName } from '$lib/domain/music/types';
import { createListSource } from '$lib/domain/progress';
import {
	BEAT_RESOLUTION,
	createTempoMap,
	Fraction,
	METER_4_4,
	type Meter,
	type RoundPlan
} from '$lib/domain/time';
import type { ExpectedContent } from '$lib/domain/time/plan';
import { occurrenceId, occurrencePosition, triadParams, triadVoicings } from '$lib/domain/triads';
import type { Attempt, PlannedItem } from '$lib/domain/types';
import {
	FakeChordVerifier,
	FakeClock,
	FakeNoteDetector,
	FakeSoundScheduler,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryLevelStateRepository,
	InMemoryProgressionRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from './fakes';

/** A seeded draw in [0, 1) (mulberry32): the same seed draws the same exercise. */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
	};
}

const pick = <T>(random: () => number, values: readonly T[]): T =>
	values[Math.floor(random() * values.length)];
const chance = (random: () => number, p: number) => random() < p;
const between = (random: () => number, min: number, max: number) =>
	min + Math.floor(random() * (max - min + 1));

/** The mechanics drawn: those a response exercise is written for today. */
export const RANDOM_MECHANICS: readonly MechanicId[] = [
	'locate',
	'identify',
	'triad-anchor',
	'triad-zone'
];

export const METER_2_4: Meter = { count: 2, unit: Fraction.of(1, 4), grouping: [1, 1] };
export const METER_3_4: Meter = { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] };
export const METER_6_8: Meter = { count: 6, unit: Fraction.of(1, 8), grouping: [3, 3] };
const METERS: readonly Meter[] = [METER_2_4, METER_3_4, METER_4_4, METER_6_8];

/** The sensor that hears each kind of content. */
export const SENSOR_OF_KIND: Readonly<Record<string, string>> = {
	[NOTE_CONTENT]: 'note',
	[CHORD_VOICING_CONTENT]: 'chord',
	[NAME_CONTENT]: 'tap'
};

/** The sensors a session of the bench has. */
export const BENCH_SENSORS: readonly string[] = ['note', 'chord', 'tap'];

/** Leads, positions and stretches, in beats of the meter: exact fractions of a beat. */
const LEADS = [0.5, 1, 1.5, 2, 3, 4, 6, 8];
const POSITIONS = [0, 0, 0.5, 1, 1.5, 2, 3, 1 / 3, 2 / 3, 4];
/** Where a stretch may end, in beats. */
const ENDS = [0.5, 1, 1.5, 2, 3, 4, 5, 2 / 3, 4 / 3];
const WINDOWS_MS = [0, 40, 80, 120, 200];

function slotOf(random: () => number, names: readonly string[]): Slot {
	const field = `{${pick(random, names)}}`;
	return chance(random, 0.5)
		? pick(random, [field, `→ ${field}`, `${field} !`])
		: { fr: `joue ${field}`, en: `play ${field}` };
}

/** A presentation made of the mechanic's fields; now and then a field or a picture it lacks. */
function randomPresentation(
	random: () => number,
	mechanic: MechanicId
): PromptPresentation | undefined {
	if (chance(random, 0.1)) return undefined;
	const own = ITEM_FIELDS[mechanic]?.names ?? [];
	const every = [...new Set(Object.values(ITEM_FIELDS).flatMap((fields) => fields.names))];
	const names = chance(random, 0.1) ? every : own;
	const optional = (p: number) => (chance(random, p) ? slotOf(random, names) : undefined);
	const pictures = Object.keys(PICTURES);
	const presentation: PromptPresentation = { primary: slotOf(random, names) };
	const slots = {
		secondary: optional(0.7),
		detail: optional(0.4),
		target: optional(0.3),
		band: optional(0.3),
		preview: optional(0.3)
	};
	for (const [key, slot] of Object.entries(slots)) {
		if (slot !== undefined) (presentation as unknown as Record<string, Slot>)[key] = slot;
	}
	if (chance(random, 0.5)) {
		const line = optional(0.7);
		const picture = chance(random, 0.5) ? pick(random, pictures) : undefined;
		presentation.aided = {
			...(line !== undefined && { line }),
			...(picture !== undefined && { picture })
		};
	}
	if (chance(random, 0.2)) presentation.fading = { picture: pick(random, pictures) };
	return presentation;
}

/** A ladder of one to three levels; now and then a level in free time. */
function randomLadder(random: () => number): Ladder {
	const levels = between(random, 1, 3);
	return Array.from({ length: levels }, (_, index) => ({
		params: {
			leadBeats: chance(random, 0.04) ? null : pick(random, LEADS),
			aided: chance(random, 0.4)
		},
		pass: { successes: between(random, 1, 3) },
		drop: { failures: between(random, 1, 2) },
		...(index === levels - 1 && chance(random, 0.5) && { success: 'direct-recall' as const })
	}));
}

/** A place in beats; now and then in bars. */
function randomPosition(random: () => number, beats: number): Position {
	return chance(random, 0.1) ? { bars: pick(random, [0, 1]) } : { beats };
}

/**
 * One or two expectations, each derived from the item by a derivation that reads the mechanic
 * (now and then one that does not) and heard by the sensor of its kind; in free time, or placed
 * on the beat (now and then the two mixed).
 */
function randomExpectations(random: () => number, mechanic: MechanicId): ExpectationTemplate[] {
	const all = Object.keys(CONTENT_DERIVATIONS).filter(
		(name) => CONTENT_DERIVATIONS[name].kind in SENSOR_OF_KIND
	);
	const reading = all.filter((name) => CONTENT_DERIVATIONS[name].reads.includes(mechanic));
	const count = between(random, 1, 2);
	const free = chance(random, mechanic === 'identify' ? 0.6 : 0.15);
	const mixed = count === 2 && chance(random, 0.05);
	// In the order they come, now and then not.
	const places = Array.from({ length: count }, () => pick(random, POSITIONS));
	if (chance(random, 0.85)) places.sort((a, b) => a - b);
	return places.map((beats, i) => {
		const from = chance(random, 0.05) ? pick(random, all) : pick(random, reading);
		const inFreeTime = mixed ? i === 0 : free;
		const window = chance(random, 0.3)
			? { ms: { param: 'windows.perfectMs' } }
			: { ms: pick(random, WINDOWS_MS) };
		const template: ExpectationTemplate = {
			at: inFreeTime ? null : randomPosition(random, beats),
			sensor: SENSOR_OF_KIND[CONTENT_DERIVATIONS[from].kind],
			content: { from },
			window
		};
		if (!inFreeTime && chance(random, 0.25)) {
			// Ending after it starts, now and then not.
			const after = ENDS.filter((end) => end > beats);
			const ends = chance(random, 0.9) && after.length > 0 ? after : ENDS;
			template.until = chance(random, 0.15) ? { bars: 1 } : { beats: pick(random, ends) };
		}
		return template;
	});
}

/** Beats from the prompt to the earliest point expectation at the shortest lead, when placed. */
function earliestPointBeats(
	expectations: readonly ExpectationTemplate[],
	leads: readonly number[],
	meter: Meter
): number | null {
	const points = expectations.flatMap((e) => {
		if (!e.at || e.until !== undefined) return [];
		if ('beats' in e.at) return typeof e.at.beats === 'number' ? [e.at.beats] : [];
		return typeof e.at.bars === 'number' ? [e.at.bars * meter.count] : [];
	});
	if (points.length === 0 || leads.length === 0) return null;
	return Math.min(...leads) + Math.min(...points);
}

/**
 * A definition drawn from the registered pieces only; it may be one `validateExercise` refuses.
 *
 * - its shape: a mechanic among `RANDOM_MECHANICS`, a meter among 2/4, 3/4, 4/4 and 6/8, a fixed
 *   tempo from 50 to 160;
 * - its expectations: one or two, each with a derivation that reads the mechanic and the sensor
 *   of its kind; places, stretches and windows in fractions of a beat;
 * - the rest: a length and a breath, a ladder of one to three levels, a place of the target and
 *   an end of the count, a presentation made of the mechanic's fields.
 *
 * Its round opens on a first answer: the window opens soon enough after the prompt that an answer
 * on the beat can be heard (a round no one can answer right proves nothing about the engine).
 */
export function randomExercise(random: () => number, id = 'random'): ExerciseDefinition {
	const mechanic = pick(random, RANDOM_MECHANICS);
	const meter = pick(random, METERS);
	const tempo = between(random, 50, 160);
	const ladder = randomLadder(random);
	const expectations = randomExpectations(random, mechanic);
	const free = expectations.every((e) => e.at === null);

	const writtenLead = chance(random, 0.3) ? pick(random, LEADS) : null;
	const leads =
		writtenLead !== null
			? [writtenLead]
			: ladder.flatMap((level) => (level.params.leadBeats ? [level.params.leadBeats] : []));
	const beatMs = 60_000 / tempo;
	const earliest = earliestPointBeats(expectations, leads, meter);
	const opensBy = earliest === null ? 300 : Math.min(300, earliest * beatMs * 0.5);
	const opens =
		free || chance(random, 0.6)
			? { afterPromptMs: Math.floor(random() * opensBy) }
			: { beforeMs: pick(random, [50, 100, 200]), maxBeats: pick(random, [0.25, 0.5, 1]) };
	const lateMs = chance(random, 0.3) ? { param: 'windows.lateMs' } : pick(random, [0, 100, 300]);
	const lateCapture = pick(random, [
		null,
		{ ms: 300 },
		{ ms: { param: 'windows.lateCaptureMs' } },
		'to-end'
	]);

	const preview = chance(random, 0.4) ? between(random, 0, 2) : undefined;
	const length: RoundTemplate['length'] = {};
	if (chance(random, 0.6)) length.bars = between(random, 0, 2);
	if (chance(random, 0.4)) length.beats = pick(random, [0.5, 1, 2, 3]);
	if (chance(random, 0.8)) length.breath = true;
	const round: RoundTemplate = {
		prompt: { lead: writtenLead ?? { param: 'leadBeats' } },
		expectations,
		length,
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: chance(random, 0.3),
			pairing: { mode: 'first-answer', opens, lateMs, lateCapture }
		}
	};
	if (chance(random, 0.3)) {
		// Its preview read as a param only when the exercise writes it.
		round.listenBeforeEnd =
			preview !== undefined && chance(random, 0.5)
				? { beats: { param: 'previewBeats' } }
				: { beats: pick(random, [0.5, 1, 2]) };
	}
	if (chance(random, 0.4)) {
		// Now and then a whole bar or more: no place within its bar.
		const steps = between(random, 0, chance(random, 0.1) ? meter.count : meter.count - 1);
		round.barOffset = meter.unit.mul(Fraction.of(steps)).toString();
	}
	if (chance(random, 0.5)) round.countEndsOn = pick(random, ['prompt', 'target'] as const);

	const presentation = randomPresentation(random, mechanic);
	return {
		id,
		version: 1,
		mechanic,
		view: mechanic === 'identify' && free ? 'answer-keys' : 'lane',
		meter,
		tempo: { fixed: tempo },
		...(preview !== undefined && { flow: { previewBeats: preview } }),
		...(presentation && { presentation }),
		round,
		params: {
			ladder,
			...(chance(random, 0.6) && { pacing: { respirationBars: between(random, 1, 2) } }),
			...(chance(random, 0.3) && {
				windows: { perfectMs: pick(random, WINDOWS_MS), lateMs: pick(random, [100, 200, 400]) }
			}),
			...(chance(random, 0.5) && { recallThresholdMs: between(random, 800, 3000) })
		}
	};
}

/** The voicings of the triads' catalog, by key. */
const TRIAD_VOICINGS = triadVoicings(triadParams(TRIADS_ANCHOR)).map(voicingKey);

/** An item of `mechanic` drawn at random. */
function randomItem(random: () => number, mechanic: MechanicId): unknown {
	switch (mechanic) {
		case 'locate':
			return pick(random, locateItems());
		case 'identify':
			return {
				string: pick(random, [1, 2, 3, 4, 5, 6]),
				fret: between(random, 1, 11)
			} satisfies IdentifyItem;
		case 'triad-anchor':
			return { voicingKey: pick(random, TRIAD_VOICINGS) };
		case 'triad-zone': {
			const key = pick(random, TRIAD_VOICINGS);
			const shape = pick(random, voicingOccurrences(parseVoicingKey(key)));
			return { voicingKey: key, position: occurrencePosition(shape) };
		}
		default:
			throw new Error(`No items drawn for mechanic ${mechanic}`);
	}
}

/** `count` items of `definition`'s mechanic, free-played at its first level's lead and aid. */
export function listItems(
	definition: ExerciseDefinition,
	random: () => number,
	count = 3
): PlannedItem[] {
	const [first] = definition.params.ladder as Ladder;
	return Array.from({ length: count }, () => ({
		exerciseId: definition.id,
		mechanic: definition.mechanic,
		item: randomItem(random, definition.mechanic),
		phase: 'free',
		temperature: 'hot',
		aid: first.params.aided ? 'show-position' : 'none',
		leadBeats: first.params.leadBeats ?? null
	}));
}

/** The payload a fake sensor sends for a right answer to `content`, by content kind. */
export function rightPayload(content: ExpectedContent): unknown {
	switch (content.kind) {
		case NOTE_CONTENT:
			return { midi: acceptableMidis(content.value as LocateItem)[0] };
		case NAME_CONTENT: {
			const item = content.value as IdentifyItem;
			return pitchOnString(item.string, item.fret);
		}
		case CHORD_VOICING_CONTENT: {
			const { voicingKey: key, position } = content.value as ChordVoicingContent;
			const voicing = parseVoicingKey(key);
			const shape = position === null ? lowestShape(voicing) : shapeAt(voicing, position);
			return { windowMs: 300, decided: occurrenceId(shape), final: true, variants: [] };
		}
		default:
			throw new Error(`No right payload for content kind ${content.kind}`);
	}
}

/** The payload a fake sensor sends for a wrong answer to `content`, by content kind. */
export function wrongPayload(content: ExpectedContent): unknown {
	switch (content.kind) {
		case NOTE_CONTENT:
			return { midi: acceptableMidis(content.value as LocateItem)[0] + 1 };
		case NAME_CONTENT: {
			const right = rightPayload(content) as PitchName;
			return CHROMATIC_NOTES[(CHROMATIC_NOTES.indexOf(right) + 1) % CHROMATIC_NOTES.length];
		}
		case CHORD_VOICING_CONTENT:
			return { windowMs: 300, decided: null, final: true, variants: [] };
		default:
			throw new Error(`No wrong payload for content kind ${content.kind}`);
	}
}

/** The presenters of every response mechanic the bench plays. */
export const BENCH_PRESENTERS: Record<string, MechanicPresenter> = {
	...NECK_PRESENTERS,
	...TRIAD_PRESENTERS
};

/** How each round is answered: every expectation right, or wrong, or nothing played. */
export type BenchAnswer = 'right' | 'wrong' | 'none';

/** A round as the bench met it: its item, its plan, when its target fell. */
export interface BenchRound {
	item: PlannedItem;
	plan: RoundPlan;
	/** Audio seconds each expectation was answered at, in order; null when it was not. */
	answeredAt: (number | null)[];
	/** The stage as the round opened, a plain copy. */
	stage: { view: string; model: unknown } | null;
}

/** A step of the clock: the scheduler wakes at least this often. */
const STEP_S = 0.05;
/** In free time, the answers come this long after the window opens. */
const FREE_REACTION_S = 0.3;

/**
 * A response series on fakes playing `definition` over a fixed list of `items`
 * (`createListSource`), on the real presenters of the response mechanics and a note, a chord and
 * a tap sensor.
 */
export function exerciseSeries(definition: ExerciseDefinition, items: readonly PlannedItem[]) {
	const clock = new FakeClock();
	const sounds = new FakeSoundScheduler(clock);
	const detector = new FakeNoteDetector();
	const verifier = new FakeChordVerifier();
	const source = createListSource(items);
	const attempts = new InMemoryAttemptRepository();
	const recorders: AttemptRecorder[] = [];
	const exercise = (id: string) => (id === definition.id ? definition : exerciseById(id));
	const deps: ResponseSeriesDeps = {
		clock,
		sounds,
		detector,
		sensors: { note: noteSensor(detector), chord: chordSensor(verifier), tap: tapSensor() },
		mechanics: BENCH_PRESENTERS,
		repositories: {
			attempts,
			sessions: new InMemorySessionRepository(),
			settings: new InMemorySettingsRepository(),
			progressions: new InMemoryProgressionRepository()
		},
		recorderFor: (sessionId) => {
			const recorder = new AttemptRecorder({
				attempts,
				cards: new InMemoryCardStateRepository(),
				clock,
				now: () => clock.toEpochMs(clock.now()),
				selector: source,
				sessionId,
				rules: (mechanic) => BENCH_PRESENTERS[mechanic].rules,
				// Direct recall as the exercise writes it, as the notes' free play reads it.
				recall: () => directRecallOf(recallThresholdOf(definition)),
				levels: new InMemoryLevelStateRepository()
			});
			recorders.push(recorder);
			return recorder;
		},
		exercise,
		locale: () => 'fr',
		newId: () => 'series-next',
		development: false,
		random: () => 0
	};
	const tempoBpm = definition.tempo && 'fixed' in definition.tempo ? definition.tempo.fixed : 80;
	const controller = new ResponseSeriesController(
		{ id: 'series-1', kind: 'free' },
		async () => ({
			source,
			executions: [{ exerciseId: definition.id, tempoBpm }]
		}),
		deps
	);
	const stored = async (): Promise<Attempt[]> => {
		await Promise.all(recorders.map((recorder) => recorder.settled()));
		return attempts.listBySession('series-1');
	};
	return {
		definition,
		items,
		clock,
		sounds,
		detector,
		verifier,
		controller,
		stored
	};
}

export type ExerciseBench = ReturnType<typeof exerciseSeries>;

/** Sends `payload` to the fake behind `sensor`, heard at `time`. */
function emit(bench: ExerciseBench, sensor: string, payload: unknown, time: number): void {
	switch (sensor) {
		case 'note':
			bench.detector.emitNote({
				time,
				...(payload as { midi: number }),
				frequencyHz: 0,
				clarity: 0.9
			});
			return;
		case 'chord':
			bench.verifier.emit({
				time,
				...(payload as Omit<Parameters<FakeChordVerifier['emit']>[0], 'time'>)
			});
			return;
		case 'tap':
			bench.controller.answer(payload as string);
			return;
		default:
			throw new Error(`The bench has no fake for sensor ${sensor}`);
	}
}

/**
 * The plan of `item`'s round as the series compiles it: in its exercise's meter, its preview its
 * exercise's or its presenter's.
 */
function planOf(definition: ExerciseDefinition, item: PlannedItem): RoundPlan {
	const presenter = BENCH_PRESENTERS[item.mechanic];
	return compileRound(definition, item, definition.meter ?? METER_4_4, {
		previewBeats: previewBeatsOf(definition, presenter.previewBeats) ?? 0
	});
}

/** The target the stage places, in beats of the series' map; null in free time. */
function anchorBeatOf(controller: PlaySessionController): number | null {
	const model = controller.view.stage?.model as Partial<PromptStageModel> | undefined;
	return model?.anchorBeat ?? null;
}

/**
 * Plays the bench's series to its end: each round, as it opens, answered as `answer` says,
 * each expectation at its place (on the beat; in free time, a moment after the window opens),
 * the clock stopping exactly there. A round in free time waits for its answer: unanswered, it
 * would never end, so `'none'` answers it wrong there. Returns the rounds met.
 */
export async function playExercise(
	bench: ExerciseBench,
	answer: BenchAnswer,
	options: { maxS?: number } = {}
): Promise<BenchRound[]> {
	const { clock, sounds, controller, definition, items } = bench;
	const rounds: BenchRound[] = [];
	let sends: { time: number; send: () => void }[] = [];
	const maxS = options.maxS ?? 600;
	const meter = definition.meter ?? METER_4_4;
	const tempo = definition.tempo && 'fixed' in definition.tempo ? definition.tempo.fixed : 80;
	// The series' tempo map, as its transport begins it: places fall on it to the float.
	const map = createTempoMap(clock.now() + START_DELAY_S, [
		{ at: Fraction.ZERO, bpm: tempo, unit: meter.unit }
	]);
	await controller.ready?.();
	await controller.start();

	const onOpened = () => {
		const item = items[rounds.length];
		if (!item) throw new Error(`Round ${rounds.length} opened, but the list has no such item`);
		const plan = planOf(definition, item);
		const stage = controller.view.stage;
		const round: BenchRound = {
			item,
			plan,
			answeredAt: plan.expectations.map(() => null),
			stage: stage && JSON.parse(JSON.stringify(stage))
		};
		rounds.push(round);
		const free = plan.expectations.every((e) => e.at === null);
		const now = clock.now();
		const anchorBeat = anchorBeatOf(controller);
		const pairing = plan.policy.pairing as unknown as { opens: { afterPromptMs?: number } };
		plan.expectations.forEach((expectation, index) => {
			if (answer === 'none' && !free) return;
			const content = expectation.content;
			if (!content) return;
			let time: number;
			if (free || expectation.at === null || anchorBeat === null) {
				time = now + (pairing.opens.afterPromptMs ?? 0) / 1000 + FREE_REACTION_S;
			} else {
				// The round starts its first expectation before the target the stage places.
				const target = meter.unit.mul(Fraction.fromNumber(anchorBeat, BEAT_RESOLUTION));
				const start = target.sub(plan.expectations[0].at as Fraction);
				time = map.toSeconds(start.add(expectation.at));
			}
			const payload = answer === 'right' ? rightPayload(content) : wrongPayload(content);
			sends.push({
				time,
				send: () => {
					round.answeredAt[index] = clock.now();
					emit(bench, expectation.sensor, payload, time);
				}
			});
		});
	};

	const sendDue = () => {
		const due = sends.filter((s) => s.time <= clock.now() + 1e-9);
		sends = sends.filter((s) => s.time > clock.now() + 1e-9);
		for (const s of due) s.send();
	};

	// A round opens awaiting, placed on its prompt: one may open in the flush that settles the
	// one before, so a new place tells it, not a change of status.
	let opened: string | null = null;
	const openedNow = () => {
		if (controller.view.status !== 'awaiting') return;
		const model = controller.view.stage?.model as Partial<PromptStageModel> | undefined;
		const place = JSON.stringify([model?.promptBeat ?? null, model?.anchorBeat ?? null]);
		if (place === opened) return;
		opened = place;
		onOpened();
		sendDue();
	};

	while (clock.now() < maxS && controller.view.status !== 'finished') {
		const next = Math.min(clock.now() + STEP_S, ...sends.map((s) => s.time));
		clock.time = Math.max(next, clock.now());
		sendDue();
		openedNow();
		sounds.flush();
		await Promise.resolve();
		openedNow();
	}
	for (let i = 0; i < 20; i++) await Promise.resolve();
	return rounds;
}
