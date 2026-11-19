import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { passageMembers, passageIndices } from '$lib/domain/exercise/passage/indices';
import { compilePassageRound, firstEach, passageRound } from '$lib/domain/exercise/passage/round';
import type { ExerciseDefinition, PromptPresentation } from '$lib/domain/exercise/types';
import {
	FAMILIES,
	PASSAGE_DERIVATIONS,
	passageDerivation,
	type Family,
	type Member,
	type PassageDerivation
} from '$lib/domain/families';
import { chordShapes } from '$lib/domain/families/guitar/chordShapes';
import { GUITAR_ATTRIBUTES } from '$lib/domain/families/guitar/notes';
import { gridById, gridChanges, gridFromJson, registerGrid, triadOf } from '$lib/domain/grid';
import { CONTENT_JUDGES, type MemberContent } from '$lib/domain/judges';
import { itemSet } from '$lib/domain/sets';
import type { ResponseValue, RoundPlan } from '$lib/domain/time';
import type { PlannedItem, PlannedPassage } from '$lib/domain/types';
import { CHANGES_EXERCISES, alternatingGrid } from '$lib/testing/changesPassages';
import { GESTURE_CLIMB, GESTURE_JAM, GESTURE_LINK, GESTURE_ZONE } from '$lib/testing/catalog';
import { shapeId } from '$lib/testing/shapes';
import { passageStage } from './passageStage';
import type { Picture } from './pictures';

const G_B_E = [3, 2, 1] as const;

const LINK_PRESENTATION: PromptPresentation = {
	primary: '{chord}',
	secondary: '{quality}',
	detail: { fr: 'sur cordes {strings}', en: 'on strings {strings}' },
	target: '{chord}',
	aided: { picture: 'admitted' }
};

const CLIMB_PRESENTATION: PromptPresentation = {
	primary: '{symbol}',
	secondary: '{title}',
	detail: '{strings} · {toward}',
	target: '{symbol}',
	aided: { picture: 'admitted' }
};

const LINK: ExerciseDefinition = { ...GESTURE_LINK, presentation: LINK_PRESENTATION };
const CLIMB: ExerciseDefinition = { ...GESTURE_CLIMB, presentation: CLIMB_PRESENTATION };
const ZONE: ExerciseDefinition = GESTURE_ZONE;

/** Every round of a passage of `definition`, as its source serves them, sharing one list of items. */
function passageOf(
	definition: ExerciseDefinition,
	key: string,
	each: Record<string, unknown> = {},
	id = 's:0'
): (PlannedItem & { passage: PlannedPassage })[] {
	const index = passageIndices(definition).find((found) => found.key === key)!;
	const derivation = passageDerivation(definition.passages!.members.family)!;
	const items = passageMembers(definition, index, each).map((member) => derivation.itemOf(member));
	return items.map((item, rank) => {
		const base = passageRound(definition, index, each, item, rank, items.length);
		return { ...base, passage: { ...base.passage, id, items } };
	});
}

const PLACE = {
	anchorBeat: 12,
	promptBeat: 11,
	history: [{ beatIndex: 8, verdict: 'perfect' as const }],
	bands: []
};

function show(
	definition: ExerciseDefinition,
	item: PlannedItem,
	settled: { value: ResponseValue; success: boolean } | null = null,
	plan: RoundPlan = compilePassageRound(definition, item),
	locale: 'fr' | 'en' = 'fr'
) {
	return passageStage({
		definition,
		item,
		plan,
		settled,
		place: PLACE,
		beatsPerBar: 4,
		chordDiagram: 'grid',
		locale,
		random: () => 0
	});
}

/** A round settled with the shape `decided` (null: nothing heard), as the member judge judges it. */
function settledWith(plan: RoundPlan, decided: string | null) {
	const content = plan.expectations[0].content!.value as MemberContent;
	const judged = decided === null ? null : CONTENT_JUDGES.member.judge(content, { decided });
	const right = judged?.correct === true;
	const value: ResponseValue = {
		verdict: right ? 'perfect' : 'wrong',
		timingOffsetMs: right ? 0 : null,
		reactionMs: null,
		leadMs: null,
		expectations: [
			{
				index: 0,
				answer: judged?.answer ?? null,
				correct: judged ? judged.correct : null,
				confusion: judged?.confusion ?? null,
				correction: null,
				late: false
			}
		]
	};
	return { value, success: right };
}

const notesOf = (picture: Picture | null) =>
	picture?.kind === 'neck' ? picture.notes : expect.fail(`not a neck: ${JSON.stringify(picture)}`);

const placesOf = (shapes: readonly Member[]) =>
	shapes.flatMap((shape) =>
		(shape as ReturnType<typeof chordShapes.members>[number]).occurrence.notes.map(
			({ string, fret }) => `${string}-${fret}`
		)
	);

describe('passageStage: the line of a passage', () => {
	it('places each change of a grid where the grid writes it, with its symbol', () => {
		const rounds = passageOf(CLIMB, 'grid=iohefy-a;strings=3,2,1', { direction: 'up' });
		const model = show(CLIMB, rounds[2]);
		const changes = gridChanges(gridById('iohefy-a'));
		expect(model.rounds).toEqual(
			changes.map(({ at, length, symbol }) => ({ at, length, label: symbol, way: null }))
		);
		expect(model.index).toBe(2);
		expect(model.beatsPerBar).toBe(4);
	});

	it('gives a tour of shapes a bar each, the way of each shape from the one before', () => {
		const rounds = passageOf(LINK, 'chord=D;strings=3,2,1');
		const model = show(LINK, rounds[4]);
		expect(model.rounds.map(({ at, length }) => [at, length])).toEqual(
			rounds.map((_, i) => [i * 4, 4])
		);
		expect(model.rounds.map((round) => round.label)).toEqual(rounds.map(() => 'D'));
		// Four shapes up the neck, then back down the same way.
		expect(model.rounds.map((round) => round.way)).toEqual([
			null,
			'up',
			'up',
			'up',
			'down',
			'down',
			'down'
		]);
		expect(model.index).toBe(4);
	});

	it('finds again, by the key of its item, the member each round of a passage is', () => {
		// The way reads a round's member through its item's key: for every family that gives a
		// passage its members, member → item → key → member must give the member back.
		const met = new Set<string>();
		for (const definition of CHANGES_EXERCISES) {
			const id = definition.passages!.members.family;
			const family = FAMILIES[id];
			const derivation = passageDerivation(id)!;
			const set = itemSet(derivation.set);
			for (const index of passageIndices(definition)) {
				for (const member of passageMembers(definition, index, firstEach(definition))) {
					const back = family.member(set.itemKey(derivation.itemOf(member)));
					expect(back?.id).toBe(member.id);
				}
			}
			met.add(id);
		}
		// Every family of the registry but the test family this file registers below.
		const registered = Object.keys(PASSAGE_DERIVATIONS).filter((id) => id !== 'test-steps');
		expect([...met].sort()).toEqual(registered.sort());
	});
});

describe('passageStage: the prompt of the round on show', () => {
	it('says the change, the grid, the strings and the way it climbs', () => {
		const rounds = passageOf(CLIMB, 'grid=iohefy-a;strings=3,2,1', { direction: 'down' });
		const { prompt } = show(CLIMB, rounds[1]);
		expect(prompt).toMatchObject({
			primary: 'G7',
			secondary: 'I Only Have Eyes for You',
			detail: 'sol‑si‑mi · ↓ en descendant',
			target: 'G7'
		});
		expect(show(CLIMB, rounds[1], null, undefined, 'en').prompt.detail).toBe(
			'G‑B‑E · ↓ going down'
		);
	});

	it('says the chord of a tour, its quality and its strings', () => {
		const [first] = passageOf(LINK, 'chord=Ebm;strings=4,3,2');
		expect(show(LINK, first).prompt).toMatchObject({
			primary: 'Ebm',
			secondary: 'mineur',
			detail: 'sur cordes ré‑sol‑si'
		});
	});

	it('passes the place on the lane and the drawing style through', () => {
		const [first] = passageOf(LINK, 'chord=D;strings=3,2,1');
		expect(show(LINK, first)).toMatchObject({
			anchorBeat: 12,
			history: PLACE.history,
			chordDiagram: 'grid',
			verdict: null
		});
	});
});

describe('passageStage: the aid', () => {
	const aided = <I extends PlannedItem>(item: I): I => ({ ...item, exerciseLevel: -1 });

	it('draws nothing at level 1, nor at an aid level for a presentation that writes no aid', () => {
		const [first] = passageOf(LINK, 'chord=D;strings=3,2,1');
		expect(show(LINK, first).aid).toBeNull();
		const { aided: _aided, ...bare } = LINK_PRESENTATION;
		expect(show({ ...LINK, presentation: bare }, aided(first)).aid).toBeNull();
	});

	it("draws the link's shape now and the next one at the aid level, or when served aided", () => {
		const rounds = passageOf(LINK, 'chord=D;strings=3,2,1');
		const shapes = rounds.map((round) => (round.item as { frets: number[] }).frets.join('-'));
		const notes = notesOf(show(LINK, aided(rounds[1])).aid);
		const now = notes.filter((note) => !note.next).map((n) => n.fret);
		expect(now.join('-')).toBe(shapes[1]);
		expect(notes.filter((note) => note.next).length).toBeGreaterThan(0);
		expect(show(LINK, { ...rounds[1], aid: 'show-position' }).aid).toEqual(
			show(LINK, aided(rounds[1])).aid
		);
		// The tour's last shape has nothing next.
		const last = notesOf(show(LINK, aided(rounds.at(-1)!)).aid);
		expect(last.some((note) => note.next)).toBe(false);
	});

	it("draws the next change's shapes beyond the one ringing before the round is judged, beyond the one heard after", () => {
		const D_TOP = shapeId('D', 'min', G_B_E, '10-10-10');
		const rounds = passageOf(CLIMB, 'grid=iohefy-a;strings=3,2,1', { direction: 'up' });
		const round = aided({ ...rounds[0], passage: { ...rounds[0].passage, previous: null } });
		const plan = compilePassageRound(CLIMB, round);
		const G = chordShapes.members({ chord: triadOf('G7'), strings: [...G_B_E] });
		const beyond = (fret: number) => G.filter((shape) => GUITAR_ATTRIBUTES.position(shape) > fret);
		const nextPlaces = (picture: Picture | null) =>
			notesOf(picture)
				.filter((note) => note.next)
				.map((note) => `${note.string}-${note.fret}`)
				.sort();
		const nowPlaces = (picture: Picture | null) =>
			notesOf(picture)
				.filter((note) => !note.next)
				.map((n) => `${n.string}-${n.fret}`);
		const withoutNow = (shapes: readonly Member[], picture: Picture | null) => [
			...new Set(placesOf(shapes).filter((place) => !nowPlaces(picture).includes(place)))
		];

		// Nothing rang before the first change: every shape of G7 is next.
		const before = show(CLIMB, round, null, plan).aid;
		expect(nextPlaces(before)).toEqual(withoutNow(G, before).sort());
		// Dm heard high: the next change climbs beyond it.
		const after = show(CLIMB, round, settledWith(plan, D_TOP), plan).aid;
		expect(nextPlaces(after)).toEqual(withoutNow(beyond(10), after).sort());
		expect(nextPlaces(after)).not.toEqual(nextPlaces(before));
		// Nothing heard: the round's own previous still rings.
		const ringing = { ...round, passage: { ...round.passage, previous: D_TOP } };
		const ringingPlan = compilePassageRound(CLIMB, ringing);
		expect(
			nextPlaces(show(CLIMB, ringing, settledWith(ringingPlan, null), ringingPlan).aid)
		).toEqual(nextPlaces(after));
	});
});

describe('passageStage: the aid of the grids', () => {
	const aided = <I extends PlannedItem>(item: I): I => ({ ...item, exerciseLevel: -1 });
	const positionOf = (shape: Member) => GUITAR_ATTRIBUTES.position(shape as never) as number;
	const nextNotes = (picture: Picture | null) => notesOf(picture).filter((note) => note.next);

	it('turns with the climb where the neck runs out: the next shapes below the one heard', () => {
		// Em 16-17-15 heard going up: no Ebm above it, so the climb turns down (its next, Ebm7).
		const rounds = passageOf(CLIMB, 'grid=iohefy-a;strings=3,2,1', { direction: 'up' });
		const round = aided({
			...rounds[6],
			passage: { ...rounds[6].passage, previous: shapeId('G', 'maj', G_B_E, '12-12-10') }
		});
		const plan = compilePassageRound(CLIMB, round);
		const heard = shapeId('E', 'min', G_B_E, '16-17-15');
		const next = nextNotes(show(CLIMB, round, settledWith(plan, heard), plan).aid);
		// Nothing of Ebm lies above Em 16-17-15: without the turn, nothing would come next.
		const Eb = chordShapes.members({ chord: triadOf('Ebm7'), strings: [...G_B_E] });
		const at = positionOf(chordShapes.member(heard)!);
		expect(Eb.some((shape) => positionOf(shape) > at)).toBe(false);
		expect(next.length).toBeGreaterThan(0);
		const below = placesOf(Eb.filter((shape) => positionOf(shape) < at));
		expect(next.every((note) => below.includes(`${note.string}-${note.fret}`))).toBe(true);
	});

	it('zone: the shapes now and next in its frets, on its four strings', () => {
		const rounds = passageOf(ZONE, 'grid=iohefy-a', { zone: [7, 11] });
		const aid = show(ZONE, aided(rounds[0])).aid;
		expect(aid).toMatchObject({ kind: 'neck', strings: [4, 3, 2, 1] });
		const notes = notesOf(aid);
		expect(notes.some((note) => note.next)).toBe(true);
		// An open string counts inside a zone at fret 1 only: none here.
		expect(notes.every((note) => note.fret >= 7 && note.fret <= 11)).toBe(true);
	});
});

describe('passageStage: a miss', () => {
	it('tells the shape heard, the shape expected and the gap', () => {
		const rounds = passageOf(LINK, 'chord=D;strings=3,2,1');
		const plan = compilePassageRound(LINK, rounds[1]);
		const wrong = settledWith(plan, shapeId('D', 'maj', G_B_E, '2-3-2'));
		const { verdict } = show(LINK, rounds[1], wrong, plan, 'en');
		expect(verdict?.verdict).toBe('wrong');
		expect(verdict?.misses).toHaveLength(1);
		expect(verdict?.misses[0]).toMatchObject({
			gap: 'other shape',
			heard: { kind: 'shape', notes: [{ fret: 2 }, { fret: 3 }, { fret: 2 }] },
			expected: { kind: 'shape' },
			correction: null
		});
		const right = settledWith(
			plan,
			shapeId('D', 'maj', G_B_E, (rounds[1].item as { frets: number[] }).frets.join('-'))
		);
		expect(show(LINK, rounds[1], right, plan).verdict?.misses).toEqual([]);
		// The right shape too late: offbeat, a miss for its level, but nothing to draw.
		const offbeat = {
			value: { ...right.value, verdict: 'offbeat' as const },
			success: false
		};
		expect(show(LINK, rounds[1], offbeat, plan).verdict).toMatchObject({
			verdict: 'offbeat',
			misses: []
		});
	});

	it('refuses a round of a passage that came without the items of its passage', () => {
		const [first] = passageOf(LINK, 'chord=D;strings=3,2,1');
		const { items: _items, ...untold } = first.passage;
		expect(() => show(LINK, { ...first, passage: untold })).toThrow(
			/came without the items of its passage/
		);
	});
});

/** The positions of the changes of a test family's passage, by rank, read by a spy. */
const POSITIONS = [0, 2, 2, 1];
type Step = Member & { grid: string; rank: number };
const position = vi.fn((step: Step) => POSITIONS[step.rank % POSITIONS.length]);
/** A family the screen has no view of: a grid's changes, each a step at a position. */
const steps: Family<{ grid: string }, Step> = {
	id: 'test-steps',
	indexProblem: () => null,
	members: ({ grid }) =>
		gridChanges(gridById(grid)).map((_, rank) => ({ id: `${grid}#${rank}`, grid, rank })),
	member: (id) => {
		const at = id.lastIndexOf('#');
		return { id, grid: id.slice(0, at), rank: Number(id.slice(at + 1)) };
	},
	attributes: { position },
	recognise: () => null,
	heard: () => null,
	named: () => null,
	confusion: () => null,
	answer: () => null
};
const stepsDerivation: PassageDerivation = {
	set: 'change',
	passageIndex: (of) => ({ grid: of.grid }),
	itemOf: (member) => ({ grid: (member as Step).grid, index: (member as Step).rank })
};

/** The jam's round with no content, its passages of steps on `grid`. */
const stepsExercise = (grid: string): ExerciseDefinition => ({
	...GESTURE_JAM,
	id: 'test-steps',
	round: {
		...GESTURE_JAM.round!,
		expectations: [{ ...GESTURE_JAM.round!.expectations[0], content: null }] as never
	},
	passages: { of: { grid: [grid] }, members: { family: 'test-steps' } },
	presentation: { primary: '{symbol}', target: '{strings}', aided: { picture: 'admitted' } }
});

const SHORT_GRID = 'test-steps-grid';
const LONG_GRID = 'test-long-passage';

beforeAll(() => {
	registerGrid(gridFromJson(alternatingGrid(SHORT_GRID, POSITIONS.length)), 'test');
	registerGrid(gridFromJson(alternatingGrid(LONG_GRID, 256)), 'test');
	(FAMILIES as Record<string, Family>)['test-steps'] = steps as unknown as Family;
	(PASSAGE_DERIVATIONS as Record<string, PassageDerivation>)['test-steps'] = stepsDerivation;
});
afterAll(() => {
	delete (FAMILIES as Record<string, Family>)['test-steps'];
	delete (PASSAGE_DERIVATIONS as Record<string, PassageDerivation>)['test-steps'];
});

describe('passageStage: a family the screen has no view of', () => {
	it('draws the line with empty words and the way of its positions, no aid, without an error', () => {
		const STEPS = stepsExercise(SHORT_GRID);
		const rounds = passageOf(STEPS, `grid=${SHORT_GRID}`, {}, 's:steps');
		const model = show(STEPS, { ...rounds[1], aid: 'show-position' });
		expect(model.rounds).toEqual([
			{ at: 0, length: 4, label: '', way: null },
			{ at: 4, length: 4, label: '', way: 'up' },
			{ at: 8, length: 4, label: '', way: 'same' },
			{ at: 12, length: 4, label: '', way: 'down' }
		]);
		expect(model.prompt.primary).toBe('F');
		expect(model.aid).toBeNull();
	});
});

describe('passageStage: a long passage', () => {
	it('computes its line once, however many of its rounds are shown', () => {
		const LONG = stepsExercise(LONG_GRID);
		const rounds = passageOf(LONG, `grid=${LONG_GRID}`, {}, 's:long');
		expect(rounds).toHaveLength(256);
		const plan = compilePassageRound(LONG, rounds[0]);
		position.mockClear();
		for (const round of rounds) show(LONG, round, null, plan);
		// The line reads each member's position once, for the whole passage.
		expect(position).toHaveBeenCalledTimes(256);
		for (const round of rounds) show(LONG, round, null, plan);
		expect(position).toHaveBeenCalledTimes(256);
		const last = show(LONG, rounds[255], null, plan);
		expect(last.rounds).toHaveLength(256);
		expect(last.rounds[255]).toEqual({ at: 255 * 4, length: 4, label: '', way: 'down' });
		expect(last.index).toBe(255);
		// Another passage of the same index has its own line.
		show(LONG, passageOf(LONG, `grid=${LONG_GRID}`, {}, 's:again')[0], null, plan);
		expect(position).toHaveBeenCalledTimes(512);
	});
});
