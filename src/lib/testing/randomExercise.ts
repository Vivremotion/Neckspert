import { CHORD_ANCHOR_SKILL_ID } from '$lib/domain/exercise/catalogIds';
/**
 * Exercises drawn at random from the registered pieces, and a bench that plays any response
 * exercise on a fixed list of items: the promise « every valid exercise plays » put to the test.
 */
import { presenterOf, SET_PRESENTERS, VIEW_PRESENTERS } from '$lib/application/sets';
import { ITEM_FIELDS } from '$lib/application/presentation/itemFields';
import { PICTURES } from '$lib/application/presentation/pictures';
import { AttemptRecorder } from '$lib/application/session/AttemptRecorder';
import type { PromptStageModel } from '$lib/application/presentation/promptStage';
import type { PlaySessionController } from '$lib/application/session/contract';
import { chordSensor, noteSensor, tapSensor } from '$lib/application/session/sensors';
import type { SessionControllerDeps } from '$lib/application/session/SessionDeps';
import { START_DELAY_S } from '$lib/application/session/transport';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import { CONTENT_DERIVATIONS, ITEM_VALUES } from '$lib/domain/derivations';
import {
	exerciseById,
	tempoOf,
	type ExerciseDefinition,
	type Ladder,
	type PromptPresentation,
	type Slot
} from '$lib/domain/exercise';
import { previewBeatsOf } from '$lib/domain/exercise/pacing';
import { directRecallOf } from '$lib/domain/learning';
import { hasSkill, skillById } from '$lib/domain/skill/registry';
import { withoutRecall } from '$lib/testing/testSkills';
import { compileRound } from '$lib/domain/exercise/round';
import type {
	ExpectationTemplate,
	FigureExpectationTemplate,
	FigureRef,
	Position,
	RoundTemplate
} from '$lib/domain/exercise/round';
import {
	admittedMembers,
	MEMBER_CONTENT,
	NAME_CONTENT,
	PITCH_CONTENT,
	type MemberContent
} from '$lib/domain/judges';
import { INDEX_DERIVATIONS } from '$lib/domain/families';
import type { ChordShape } from '$lib/domain/families/guitar/chordShapes';
import type { NotePlace } from '$lib/domain/families/guitar/notePlaces';
import type { SelectionTemplate } from '$lib/domain/exercise/selection/types';
import {
	locateItems,
	parseVoicingKey,
	pitchOnString,
	voicingOccurrences,
	type IdentifyItem
} from '$lib/domain/music';
import {
	CHROMATIC_NOTES,
	STANDARD_TUNING,
	type PitchName,
	type StringNumber
} from '$lib/domain/music/types';
import { createListSource } from '$lib/domain/progress';
import { noteOnStringSet, placedNoteSet, voicingOnStringsSet } from '$lib/domain/sets';
import {
	BEAT_RESOLUTION,
	alignmentCapture,
	barLength,
	alignmentPairing,
	createTempoMap,
	Fraction,
	firstAnswerTimes,
	METER_4_4,
	ROUND_MODES,
	responseZones,
	roundTimes,
	type Figure,
	type FigureElement,
	type Meter,
	type ResponseZone,
	type RoundPlan,
	type TempoMap
} from '$lib/domain/time';
import type { ExpectedContent } from '$lib/domain/time/plan';
import { occurrencePosition } from '$lib/domain/triads';
import type { Attempt, PlannedItem } from '$lib/domain/types';
import {
	FakeChordVerifier,
	FakeClock,
	FakeNoteDetector,
	FakeSoundScheduler,
	FakeTakeBuffer,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryLevelStateRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from './fakes';
import { TRIAD_ORDER } from '$lib/testing/catalog';

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

/** One of `modes`, `usual` but with chance `p` of another (each of the others alike). */
function drawMode(
	random: () => number,
	modes: readonly string[],
	usual: string,
	p: number
): string {
	const others = modes.filter((mode) => mode !== usual);
	return others.length > 0 && chance(random, p) ? pick(random, others) : usual;
}

/** The skills drawn, each on its set: those a response exercise is written for today. */
export const RANDOM_SKILLS: readonly string[] = [
	'locate-note-string',
	'identify-note',
	'chord-anchor',
	'chord-zone'
];

/**
 * The skill without memory practised in place of each of `RANDOM_SKILLS`, on the same set, when
 * the draw asks for it (a round judged by cycle may practise only such a skill). Empty until
 * `registerRandomSkills` registers them.
 */
const WITHOUT_MEMORY = new Map<string, string>();

/** Registers a skill without memory beside each of `RANDOM_SKILLS`; call it before drawing. */
export function registerRandomSkills(): void {
	for (const skill of RANDOM_SKILLS) WITHOUT_MEMORY.set(skill, withoutRecall(skill));
}

/** The skill of `RANDOM_SKILLS` that `skill` is, or stands in for. */
function drawnSkill(skill: string): string {
	for (const [base, twin] of WITHOUT_MEMORY) if (twin === skill) return base;
	return skill;
}

export const METER_2_4: Meter = { count: 2, unit: Fraction.of(1, 4), grouping: [1, 1] };
export const METER_3_4: Meter = { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] };
export const METER_6_8: Meter = { count: 6, unit: Fraction.of(1, 8), grouping: [3, 3] };
const METERS: readonly Meter[] = [METER_2_4, METER_3_4, METER_4_4, METER_6_8];

/** The sensor that hears each kind of content a derivation gives. */
export const SENSOR_OF_KIND: Readonly<Record<string, string>> = {
	[NAME_CONTENT]: 'tap'
};

/** The sensor that hears the members of each family. */
export const SENSOR_OF_FAMILY: Readonly<Record<string, string>> = {
	'note-places': 'note',
	'chord-shapes': 'chord'
};

/** A content a point expectation may write: a derivation's, or a selection of a family's members. */
interface DrawnContent {
	content: { from: string } | SelectionTemplate;
	/** The sets whose items it reads. */
	reads: readonly string[];
	sensor: string;
}

/**
 * Every content a point expectation may draw: the derivations heard by a sensor, and for each
 * index derivation its family's members, all of them or (for a voicing's shapes) the one at the
 * fret the item names.
 */
function drawnContents(): DrawnContent[] {
	const derived = Object.keys(CONTENT_DERIVATIONS)
		.filter((name) => CONTENT_DERIVATIONS[name].kind in SENSOR_OF_KIND)
		.map((from) => ({
			content: { from },
			reads: CONTENT_DERIVATIONS[from].reads,
			sensor: SENSOR_OF_KIND[CONTENT_DERIVATIONS[from].kind]
		}));
	const selected = Object.entries(INDEX_DERIVATIONS).flatMap(([of, derivation]) => {
		const base = {
			reads: derivation.reads,
			sensor: SENSOR_OF_FAMILY[derivation.family]
		};
		const all = { ...base, content: { family: derivation.family, of } };
		return derivation.family === 'chord-shapes'
			? [all, { ...base, content: { ...all.content, where: [{ at: { item: 'fret' } }] } }]
			: [all];
	});
	return [...derived, ...selected];
}

/** The param a drawn zone may read its first fret in: 1 at the exercise, above its last fret at the ladder's last level. */
export const ZONE_FROM_PARAM = 'zoneFrom';
const ZONE_FROM = 1;
const ZONE_FROM_REVERSED = 13;
/** The last fret of a drawn zone: below some frets an item names, so that a zone comes out reversed. */
const ZONE_TO = 7;

/** A number an item of `reads` carries (`ITEM_VALUES`), or none. */
function itemNumberOf(reads: readonly string[]): string | undefined {
	return Object.keys(ITEM_VALUES).find(
		(name) =>
			ITEM_VALUES[name].kind === 'number' &&
			reads.some((set) => ITEM_VALUES[name].reads.includes(set))
	);
}

/**
 * Now and then a zone of frets added to a selection: its first fret written, read in the params
 * (reversed at the ladder's last level) or read on the item (reversed past `ZONE_TO`); a zone that
 * comes out reversed admits nothing.
 */
function withZone(random: () => number, drawn: DrawnContent): DrawnContent {
	if (!('family' in drawn.content) || !chance(random, 0.3)) return drawn;
	const item = itemNumberOf(drawn.reads);
	const from = pick(random, [
		ZONE_FROM,
		{ param: ZONE_FROM_PARAM },
		...(item !== undefined ? [{ item }] : [])
	]);
	const zone = { in: { frets: [from, ZONE_TO] as const } };
	return {
		...drawn,
		content: { ...drawn.content, where: [...(drawn.content.where ?? []), zone] }
	};
}

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

/** A presentation made of the set's fields; now and then a field or a picture it lacks. */
function randomPresentation(random: () => number, set: string): PromptPresentation | undefined {
	if (chance(random, 0.1)) return undefined;
	const own = ITEM_FIELDS[set]?.names ?? [];
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
 * One or two expectations, each derived from the item by a derivation, or a selection of a
 * family's members indexed by the item, that reads the set (now and then one that does not) and
 * heard by the sensor of its kind or family, or asking for no content
 * (a bare attack, heard by any sensor: mostly so under an alignment, which judges none); now and
 * then a judged rest; in free time, or placed on the beat (now and then the two mixed).
 */
function randomExpectations(
	random: () => number,
	set: string,
	aligned: boolean
): ExpectationTemplate[] {
	const all = drawnContents();
	const reading = all.filter((drawn) => drawn.reads.includes(set));
	const count = between(random, 1, 2);
	const free = chance(random, aligned ? 0.05 : set === 'placed-note' ? 0.6 : 0.15);
	// A bare attack's sensor: one for the whole round, now and then not.
	const bareSensor = pick(random, BENCH_SENSORS);
	const mixed = count === 2 && chance(random, 0.05);
	// In the order they come, now and then not.
	const places = Array.from({ length: count }, () => pick(random, POSITIONS));
	if (chance(random, 0.85)) places.sort((a, b) => a - b);
	return places.map((beats, i) => {
		const drawn = withZone(
			random,
			chance(random, 0.05) ? pick(random, all) : pick(random, reading)
		);
		const inFreeTime = mixed ? i === 0 : free;
		const window = chance(random, 0.3)
			? { ms: { param: 'windows.perfectMs' } }
			: { ms: pick(random, WINDOWS_MS) };
		const bare = chance(random, aligned ? 0.9 : 0.05);
		const template: ExpectationTemplate = {
			at: inFreeTime ? null : randomPosition(random, beats),
			sensor: bare
				? chance(random, 0.9)
					? bareSensor
					: pick(random, BENCH_SENSORS)
				: drawn.sensor,
			content: bare ? null : drawn.content,
			window
		};
		if (chance(random, 0.05)) template.role = 'judged-rest';
		if (!inFreeTime && chance(random, aligned ? 0.05 : 0.25)) {
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
		if (!e.at || ('until' in e && e.until !== undefined)) return [];
		if ('beats' in e.at) return typeof e.at.beats === 'number' ? [e.at.beats] : [];
		return typeof e.at.bars === 'number' ? [e.at.bars * meter.count] : [];
	});
	if (points.length === 0 || leads.length === 0) return null;
	return Math.min(...leads) + Math.min(...points);
}

/** The ids of the figures a drawn exercise writes. */
const FIGURE_IDS = ['one', 'two'];

/**
 * A one-bar figure in `meter`: its beats, or their halves, each a note or (now and then) a rest;
 * every note pitched, now and then on a string (and now and then on one that cannot play it).
 */
function randomFigure(random: () => number, meter: Meter): Figure {
	const step = chance(random, 0.5) ? meter.unit : meter.unit.div(Fraction.of(2));
	const count = barLength(meter).div(step).toNumber();
	const elements: FigureElement[] = Array.from({ length: count }, (_, i) => {
		if (i > 0 && chance(random, 0.25)) return { kind: 'rest', duration: step };
		const string = pick(random, [1, 2, 3, 4, 5, 6]) as StringNumber;
		const fret = chance(random, 0.02) ? -1 : between(random, 0, 12);
		const pitch = STANDARD_TUNING[string] + fret;
		return {
			kind: 'note',
			duration: step,
			content: null,
			pitch,
			...(chance(random, 0.3) && { string })
		};
	});
	return { schema: 2, meter, bars: 1, voices: [{ id: 'main', elements }] };
}

/**
 * A figure entry heard by `sensor`: one of the exercise's figures, named by its id, by a param
 * or (now and then, refused) by the item; mostly from the round's start; its window written or
 * read in the params; its content one of the three a figure takes (none, the pitches written in
 * its figure, or a derived list spread by a pattern).
 */
function randomFigureEntry(random: () => number, sensor: string): FigureExpectationTemplate {
	const ref: FigureRef = chance(random, 0.05)
		? { item: 'figure' }
		: chance(random, 0.3)
			? { param: 'figure' }
			: { id: pick(random, FIGURE_IDS) };
	const lists = Object.keys(CONTENT_DERIVATIONS).filter((name) => CONTENT_DERIVATIONS[name].list);
	const contents: FigureExpectationTemplate['content'][] = [
		null,
		{ from: 'figure' },
		...lists.map((from) =>
			chance(random, 0.5)
				? { from }
				: {
						from,
						pattern: Array.from({ length: between(random, 1, 4) }, () => between(random, 0, 4))
					}
		)
	];
	const content = pick(random, contents);
	return {
		figure: ref,
		at: chance(random, 0.85) ? { bars: 0 } : { beats: pick(random, POSITIONS) },
		sensor,
		content,
		window: chance(random, 0.3) ? { param: 'window' } : { ms: pick(random, WINDOWS_MS) }
	};
}

/**
 * The items a memory exercise of the draw lists, by set: a few distinct ones, written once and
 * drawing nothing, so the draws of the other fields stay as they were.
 */
function listedItems(skill: string): string[] | undefined {
	switch (skillById(skill).items) {
		case 'note-on-string':
			return locateItems()
				.slice(0, 6)
				.map((item) => noteOnStringSet.itemKey(item));
		case 'placed-note':
			return ([1, 2, 3, 4, 5, 6] as StringNumber[]).map((string) =>
				placedNoteSet.itemKey({ string, fret: 3 })
			);
		case 'voicing-on-strings':
			return TRIAD_VOICINGS.slice(0, 6).map((key) =>
				voicingOnStringsSet.itemKey({ voicingKey: key } as never)
			);
		default:
			return undefined;
	}
}

/**
 * A definition drawn from the registered pieces only; it may be one `validateExercise` refuses.
 *
 * - its shape: a skill among `RANDOM_SKILLS` or the one without memory beside it
 *   (`registerRandomSkills`), on its set, a meter among 2/4, 3/4, 4/4 and 6/8, a fixed
 *   tempo from 50 to 160;
 * - its expectations: one or two, each with a derivation or a selection that reads the set and
 *   the sensor of its kind or family; places, stretches and windows in fractions of a beat; now and then one of them
 *   a figure entry, over two one-bar figures the exercise writes;
 * - the rest: a length and a breath, a ladder of one to three levels, a place of the target and
 *   an end of the count, a presentation made of the set's fields.
 *
 * Its round opens on a first answer: the window opens soon enough after the prompt that an answer
 * on the beat can be heard (a round no one can answer right proves nothing about the engine).
 */
export function randomExercise(random: () => number, id = 'random'): ExerciseDefinition {
	const skill = pick(random, RANDOM_SKILLS);
	const set = skillById(skill).items;
	const meter = pick(random, METERS);
	const tempo = between(random, 50, 160);
	const ladder = randomLadder(random);
	const pairingMode = drawMode(random, Object.keys(ROUND_MODES.pairings), 'first-answer', 0.25);
	const aligned = pairingMode !== 'first-answer';
	const expectations: ExpectationTemplate[] = randomExpectations(random, set, aligned);
	const figured = chance(random, aligned ? 0.4 : 0.15);
	if (figured) {
		const replaced = between(random, 0, expectations.length - 1);
		expectations[replaced] = randomFigureEntry(random, expectations[replaced].sensor);
	}
	const figures = FIGURE_IDS.map((id) => ({ id, figure: randomFigure(random, meter) }));
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
	// A figure fills the round from its place: whole bars, mostly.
	if (chance(random, figured ? 0.05 : 0.4)) length.beats = pick(random, [0.5, 1, 2, 3]);
	if (chance(random, 0.8)) length.breath = true;
	const round: RoundTemplate = {
		...(!(figured && chance(random, 0.2)) && {
			prompt: { lead: writtenLead ?? { param: 'leadBeats' } }
		}),
		expectations,
		length,
		policy: {
			unit: chance(random, 0.05) ? 'cycle' : 'response',
			verdict: drawMode(random, Object.keys(ROUND_MODES.verdicts), 'response', 0.05),
			correction: chance(random, 0.3),
			pairing: aligned ? { mode: pairingMode } : { mode: pairingMode, opens, lateMs, lateCapture }
		}
	};
	if (chance(random, 0.05)) round.mutedBars = [between(random, 0, 1)];
	if (chance(random, 0.3)) {
		// Its preview read as a param, the exercise's or its presenter's.
		round.listenBeforeEnd = chance(random, 0.5)
			? { beats: { param: 'previewBeats' } }
			: { beats: pick(random, [0.5, 1, 2]) };
	}
	if (chance(random, 0.4)) {
		// Now and then a whole bar or more: no place within its bar.
		const steps = between(random, 0, chance(random, 0.1) ? meter.count : meter.count - 1);
		round.barOffset = meter.unit.mul(Fraction.of(steps)).toString();
	}
	if (chance(random, 0.5)) round.countEndsOn = pick(random, ['prompt', 'target'] as const);

	const presentation = randomPresentation(random, set);
	// Its view: the one that draws it, or none (the lane for a presentation); now and then one
	// that reads another model, or none the screen has.
	const view = chance(random, 0.05)
		? pick(random, ['grid-scroll', 'link-lane', 'figure', 'score'])
		: chance(random, 0.2)
			? undefined
			: set === 'placed-note' && free
				? 'answer-keys'
				: 'lane';
	// What a zone may read: its first fret, above its last at the ladder's last level.
	ladder[ladder.length - 1].params = {
		...ladder[ladder.length - 1].params,
		[ZONE_FROM_PARAM]: ZONE_FROM_REVERSED
	} as Ladder[number]['params'];
	const params: Record<string, unknown> = {
		ladder,
		[ZONE_FROM_PARAM]: ZONE_FROM,
		...(figured && {
			figure: pick(random, FIGURE_IDS),
			window: { ms: pick(random, WINDOWS_MS) }
		}),
		...(chance(random, 0.6) && { pacing: { respirationBars: between(random, 1, 2) } }),
		...(chance(random, 0.3) && {
			windows: { perfectMs: pick(random, WINDOWS_MS), lateMs: pick(random, [100, 200, 400]) }
		})
	};
	// A run of cycles breathes after so many: drawn last, so the other draws stay as they were.
	if (round.policy.unit === 'cycle') {
		params.pacing = { ...(params.pacing as object), roundsPerBreath: between(random, 1, 3) };
	}
	// Its skill without memory now and then, a round judged by cycle always when there is one:
	// drawn last, so the other draws stay as they were.
	const memoryless =
		WITHOUT_MEMORY.has(skill) && (round.policy.unit === 'cycle' || chance(random, 0.3));
	const practices = memoryless ? WITHOUT_MEMORY.get(skill)! : skill;
	const items = memoryless ? undefined : listedItems(skill);
	return {
		id,
		practices,
		...(view !== undefined && { view }),
		meter,
		tempo,
		...(preview !== undefined && { flow: { previewBeats: preview } }),
		...(presentation && { presentation }),
		...(figured && { figures }),
		round,
		params,
		...(items !== undefined && { items })
	};
}

/** The voicings of the triads' catalog, by key. */
const TRIAD_VOICINGS = TRIAD_ORDER;

/** An item of `skill`'s set drawn at random. */
function randomItem(random: () => number, skill: string): unknown {
	const set = skillById(skill).items;
	switch (set) {
		case 'note-on-string':
			return pick(random, locateItems());
		case 'placed-note':
			return {
				string: pick(random, [1, 2, 3, 4, 5, 6]),
				fret: between(random, 1, 11)
			} satisfies IdentifyItem;
		// The anchor's items carry no position; the zone's, the shape asked this time.
		case 'voicing-on-strings': {
			const key = pick(random, TRIAD_VOICINGS);
			if (drawnSkill(skill) === CHORD_ANCHOR_SKILL_ID) return { voicingKey: key };
			const shape = pick(random, voicingOccurrences(parseVoicingKey(key)));
			return { voicingKey: key, position: occurrencePosition(shape) };
		}
		default:
			throw new Error(`No items drawn for set ${set}`);
	}
}

/** `count` items of `definition`'s set, free-played at its first level's lead and aid. */
export function listItems(
	definition: ExerciseDefinition,
	random: () => number,
	count = 3
): PlannedItem[] {
	const [first] = definition.params.ladder as Ladder;
	return Array.from({ length: count }, () => ({
		exerciseId: definition.id,
		skill: definition.practices,
		exerciseLevel: 0,
		item: randomItem(random, definition.practices),
		phase: 'free',
		temperature: 'hot',
		aid: first.params.aided ? 'show-position' : 'none',
		leadBeats: first.params.leadBeats ?? null
	}));
}

/** The payload a fake sensor sends for a right answer to `content`, by content kind. */
export function rightPayload(content: ExpectedContent): unknown {
	switch (content.kind) {
		case MEMBER_CONTENT:
			return rightMember(content.value as MemberContent);
		case PITCH_CONTENT:
			return { midi: (content.value as { midi: number }).midi };
		case NAME_CONTENT: {
			const item = content.value as IdentifyItem;
			return pitchOnString(item.string, item.fret);
		}
		default:
			throw new Error(`No right payload for content kind ${content.kind}`);
	}
}

/** The payload a fake sensor sends for a wrong answer to `content`, by content kind. */
export function wrongPayload(content: ExpectedContent): unknown {
	switch (content.kind) {
		case MEMBER_CONTENT:
			return wrongMember(content.value as MemberContent);
		case PITCH_CONTENT:
			return { midi: (content.value as { midi: number }).midi + 1 };
		case NAME_CONTENT: {
			const right = rightPayload(content) as PitchName;
			return CHROMATIC_NOTES[(CHROMATIC_NOTES.indexOf(right) + 1) % CHROMATIC_NOTES.length];
		}
		default:
			throw new Error(`No wrong payload for content kind ${content.kind}`);
	}
}

/** A chord sensor's final reading of `decided`. */
const chordReading = (decided: string | null) => ({
	windowMs: 300,
	decided,
	final: true,
	variants: []
});

/** What a sensor sends for the first member a content admits: its lowest fretted shape, its note. */
function rightMember(content: MemberContent): unknown {
	const members = admittedMembers(content);
	// Nothing admitted (a zone that came out reversed): nothing is right.
	if (members.length === 0) return wrongMember(content);
	switch (content.family) {
		case 'note-places':
			return { midi: (members[0] as NotePlace).midi };
		case 'chord-shapes': {
			const shapes = members as ChordShape[];
			const shape = shapes.find((s) => occurrencePosition(s.occurrence) !== 'open') ?? shapes[0];
			return chordReading(shape.id);
		}
		default:
			throw new Error(`No right payload for family ${content.family}`);
	}
}

/** What a sensor sends that no member of the content is: a note a semitone off, no chord. */
function wrongMember(content: MemberContent): unknown {
	switch (content.family) {
		case 'note-places': {
			// The places of one note lie octaves apart: a semitone above the first is none of them.
			const [first] = admittedMembers(content) as NotePlace[];
			return { midi: (first?.midi ?? 60) + 1 };
		}
		case 'chord-shapes':
			return chordReading(null);
		default:
			throw new Error(`No wrong payload for family ${content.family}`);
	}
}

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
	/**
	 * Every expectation has a moment its zone holds in time, as the engine's pairing computes
	 * it: false when one opens only once the round has stopped listening (a window that opens a
	 * few ms before a place past the end of listening), which no answer can then pass; false too
	 * when a selection admits nothing (a zone that came out reversed).
	 */
	answerable: boolean;
}

/** A step of the clock: the scheduler wakes at least this often. */
const STEP_S = 0.05;
/** In free time, the answers come this long after the window opens. */
const FREE_REACTION_S = 0.3;

/**
 * A session controller on fakes playing `definition` over a fixed list of `items`
 * (`createListSource`), on the real presenters of the response sets and a note, a chord and
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
	const deps: SessionControllerDeps = {
		clock,
		sounds,
		detector,
		sensors: { note: noteSensor(detector), chord: chordSensor(verifier), tap: tapSensor() },
		presenters: SET_PRESENTERS,
		views: VIEW_PRESENTERS,
		plays: [definition.id],
		repositories: {
			attempts,
			sessions: new InMemorySessionRepository(),
			settings: new InMemorySettingsRepository()
		},
		levels: new InMemoryLevelStateRepository(),
		recorderFor: (sessionId) => {
			const recorder = new AttemptRecorder({
				attempts,
				cards: new InMemoryCardStateRepository(),
				clock,
				now: () => clock.toEpochMs(clock.now()),
				selector: source,
				sessionId,
				// Direct recall as the exercise's skill writes it, as the notes' free play reads it.
				recall: () =>
					(hasSkill(definition.practices) && directRecallOf(skillById(definition.practices))) ||
					(() => false),
				levels: new InMemoryLevelStateRepository()
			});
			recorders.push(recorder);
			return recorder;
		},
		exercise,
		locale: () => 'fr',
		newId: () => 'series-next',
		development: false,
		random: () => 0,
		takes: new FakeTakeBuffer(),
		memory: new SessionMemory()
	};
	const controller = new SessionController(
		{ id: 'series-1', kind: 'free' },
		async () => ({ source }),
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
	const presenter = presenterOf(definition);
	return compileRound(definition, item, definition.meter ?? METER_4_4, {
		previewBeats: previewBeatsOf(definition, presenter.previewBeats) ?? 0,
		fromRunStart: null
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
 * the clock stopping exactly there. A place the engine's zone does not hold in time (past the
 * end of listening) is answered as late in its zone as still in time; an expectation no moment
 * answers in time is not played (`BenchRound.answerable`). A round in free time waits for its answer: unanswered, it
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
	const tempo = tempoOf(definition, 0);
	// The series' tempo map, as its transport begins it: places fall on it to the float.
	const map = createTempoMap(clock.now() + START_DELAY_S, [
		{ at: Fraction.ZERO, bpm: tempo, unit: meter.unit }
	]);
	await controller.ready?.();
	await controller.start();

	/** The zone the engine gives each expectation of a timed round, as its pairing computes it. */
	const timedZones = (plan: RoundPlan, anchorBeat: number | null): ResponseZone[] | null => {
		if (anchorBeat === null || plan.expectations.some((e) => e.at === null)) return null;
		// The round starts its first expectation before the target the stage places.
		const target = meter.unit.mul(Fraction.fromNumber(anchorBeat, BEAT_RESOLUTION));
		const clock = { map, start: target.sub(plan.expectations[0].at as Fraction) };
		if (plan.policy.pairing.mode === alignmentPairing.id) return alignedZones(plan, clock);
		const times = firstAnswerTimes(plan, clock, false, roundTimes(plan, clock));
		return responseZones(plan, clock, times).map((zone) => ({
			...zone,
			captureEndS: Math.min(zone.captureEndS, times.listenUntilS)
		}));
	};

	const onOpened = () => {
		const item = items[rounds.length];
		if (!item) throw new Error(`Round ${rounds.length} opened, but the list has no such item`);
		const plan = planOf(definition, item);
		const stage = controller.view.stage;
		const round: BenchRound = {
			item,
			plan,
			answeredAt: plan.expectations.map(() => null),
			stage: stage && JSON.parse(JSON.stringify(stage)),
			answerable: true
		};
		rounds.push(round);
		const free = plan.expectations.every((e) => e.at === null);
		const now = clock.now();
		const anchorBeat = anchorBeatOf(controller);
		const pairing = plan.policy.pairing as unknown as { opens: { afterPromptMs?: number } };
		const zones = timedZones(plan, anchorBeat);
		const times = plan.expectations.map((_, index) =>
			free || anchorBeat === null ? null : answerTime(zones?.[index])
		);
		// A selection that admits nothing has no right answer.
		const admitsNone = plan.expectations.some(
			(e) =>
				e.content?.kind === MEMBER_CONTENT &&
				admittedMembers(e.content.value as MemberContent).length === 0
		);
		round.answerable = !admitsNone && (free || times.every((time) => time !== null));
		plan.expectations.forEach((expectation, index) => {
			if (answer === 'none' && !free) return;
			const content = expectation.content;
			let time: number;
			if (free || expectation.at === null || anchorBeat === null) {
				time = now + (pairing.opens.afterPromptMs ?? 0) / 1000 + FREE_REACTION_S;
			} else {
				const at = times[index];
				if (at === null) return;
				time = at;
			}
			// A bare attack asks for no content: any is right, none wrong.
			const payload =
				content === null
					? BARE_PAYLOAD[expectation.sensor]
					: answer === 'right'
						? rightPayload(content)
						: wrongPayload(content);
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

/** What a sensor sends for a bare attack, an expectation that asks for no content. */
const BARE_PAYLOAD: Readonly<Record<string, unknown>> = {
	note: { midi: 60 },
	chord: { windowMs: 300, decided: null, final: true, variants: [] },
	tap: 'C'
};

/**
 * The zones of a round paired by the alignment: each point on its place, in time while it lies
 * in the capture window the alignment keeps attacks in (`alignmentCapture`).
 */
function alignedZones(plan: RoundPlan, clock: { map: TempoMap; start: Fraction }): ResponseZone[] {
	const { map, start } = clock;
	const { opensS, closesS } = alignmentCapture(plan, map, start, roundTimes(plan, clock));
	return plan.expectations.map((e, index) => {
		const atS = map.toSeconds(start.add(e.at as Fraction));
		const inside = atS >= opensS && atS < closesS - BEFORE_ZONE_END_S;
		return {
			index,
			sensor: e.sensor,
			span: 'point',
			atS,
			// Only its place: no moment of it when the capture window leaves it out.
			opensS: inside ? atS : closesS,
			inTimeEndS: closesS,
			captureEndS: closesS
		};
	});
}

/** How long before the end of its zone an answer comes when its place lies past it. */
const BEFORE_ZONE_END_S = 0.005;

/**
 * When a right answer to an expectation comes: on its place when its zone holds it in time,
 * else as late in the zone as it is still in time (an early answer, as the engine pairs it);
 * null when no moment of its zone is in time.
 */
function answerTime(zone: ResponseZone | undefined): number | null {
	if (!zone || zone.atS === null) return null;
	const lo = zone.opensS;
	const hi = Math.min(zone.inTimeEndS, zone.captureEndS);
	if (hi <= lo) return null;
	if (zone.atS >= lo && zone.atS < hi - BEFORE_ZONE_END_S) return zone.atS;
	return Math.max(lo, hi - Math.min(BEFORE_ZONE_END_S, (hi - lo) / 2));
}
