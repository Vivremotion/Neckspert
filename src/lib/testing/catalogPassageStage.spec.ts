/**
 * The comparison that lets plan 4c delete the changes' own screen models (Task 2). Every exercise
 * of the changes, written again in memory with the presentation the catalog will write (Task 3),
 * is played passage by passage, on every index and every value of every passage param, by the
 * real passage source; each round, before it is judged and after a settlement of each kind (a
 * right shape, a right shape too late, nothing heard, a shape of each confusion the round can
 * produce), at level 1 and at the aid level, in French and in English, is shown by the old
 * models (`changePresenter.stageOf`, `linkPresenter.stageOf`, through the stage dispatch) and by
 * the new one (`passageStage`, through the same dispatch). The words, the places, the tiles, the
 * rank, the miss and the aid are compared; every difference is collected, never absorbed.
 */
import { describe, expect, it } from 'vitest';
import { passageIndices } from '$lib/domain/exercise/passage/indices';
import { compilePassageRound } from '$lib/domain/exercise/passage/round';
import { exerciseLevelsOf } from '$lib/domain/exercise/levels';
import type { ExerciseDefinition, PromptPresentation } from '$lib/domain/exercise/types';
import { chordShapes, type ChordShapesIndex } from '$lib/domain/families/guitar/chordShapes';
import { triadOf } from '$lib/domain/grid';
import {
	CONTENT_JUDGES,
	MEMBER_CONTENT,
	admittedMembers,
	type MemberContent
} from '$lib/domain/judges';
import { qualityById, type StringNumber } from '$lib/domain/music';
import { createPassageSource } from '$lib/domain/session/passageSource';
import { SESSION_MS } from '$lib/domain/session/policy';
import { levelRange, type ResponseValue, type RoundPlan } from '$lib/domain/time';
import type { PlannedItem, ResponseVerdict } from '$lib/domain/types';
import type { PassageStageModel } from '$lib/application/presentation/passageStage';
import type { Picture } from '$lib/application/presentation/pictures';
import {
	changePresenter,
	linkPresenter,
	type DrawnMiss,
	type GridStageModel,
	type LinkLaneModel
} from '$lib/application/sets/chordGrid';
import type { SetPresenter } from '$lib/application/sets/types';
import { stageModel } from '$lib/application/session/series/stage';
import { i18n } from '$lib/i18n/index.svelte';
import { viewMessages } from '$lib/ui/play/views/messages';
import { responseAttempt } from './attempts';
import { CHANGES_EXERCISES } from './changesPassages';

/** The presentations Task 3 writes in the catalog (plan 4c, Task 2's context). */
export const CHANGES_PRESENTATIONS: Readonly<Record<string, PromptPresentation>> = {
	'inversion-run': {
		primary: '{chord}',
		secondary: '{quality}',
		detail: { fr: 'sur cordes {strings}', en: 'on strings {strings}' },
		target: '{chord}',
		aided: { picture: 'admitted' }
	},
	'grid-in-direction': {
		primary: '{symbol}',
		secondary: '{title}',
		detail: '{strings} · {toward}',
		target: '{symbol}',
		aided: { picture: 'admitted' }
	},
	'grid-in-zone': {
		primary: '{symbol}',
		secondary: '{title}',
		detail: { fr: 'cases {frets}', en: 'frets {frets}' },
		target: '{symbol}',
		aided: { picture: 'admitted' }
	},
	'grid-reading': {
		primary: '{symbol}',
		secondary: '{title}',
		target: '{symbol}',
		aided: { picture: 'admitted' }
	}
};

/** The exercise as Task 3 writes it: its presentation, and no `shapes` at its levels (D6). */
function rewritten(definition: ExerciseDefinition): ExerciseDefinition {
	return {
		...definition,
		presentation: CHANGES_PRESENTATIONS[definition.id],
		levels: definition.levels?.map((level) => {
			const { shapes: _shapes, ...params } = (level.params ?? {}) as Record<string, unknown>;
			return { ...level, params };
		})
	};
}

/** The exercise with one index and one value of each passage param, open: one passage to play. */
function onePassage(
	definition: ExerciseDefinition,
	of: Readonly<Record<string, unknown>>,
	each: Readonly<Record<string, unknown>>
): ExerciseDefinition {
	const passages = definition.passages!;
	return {
		...definition,
		passages: {
			...passages,
			of: Object.fromEntries(Object.entries(of).map(([name, value]) => [name, [value]])),
			each: Object.fromEntries(Object.entries(each).map(([name, value]) => [name, [value]])),
			opens: undefined
		}
	};
}

/** Every combination of the values of the passage params. */
function eachValues(definition: ExerciseDefinition): Record<string, unknown>[] {
	let all: Record<string, unknown>[] = [{}];
	for (const [name, values] of Object.entries(definition.passages?.each ?? {})) {
		all = all.flatMap((each) => values.map((value) => ({ ...each, [name]: value })));
	}
	return all;
}

/** The levels compared: level 1, and the aid level when the exercise writes one. */
function levelsOf(definition: ExerciseDefinition): number[] {
	const { lowest } = levelRange(exerciseLevelsOf(definition));
	return lowest < 0 ? [0, -1] : [0];
}

function memberContent(plan: RoundPlan): MemberContent {
	const found = plan.expectations.find(({ content }) => content?.kind === MEMBER_CONTENT);
	if (!found) throw new Error('a change judges a member');
	return found.content!.value as MemberContent;
}

interface Settlement {
	kind: string;
	settled: { value: ResponseValue; success: boolean } | null;
	/** The shape heard, for the source; null when none. */
	answer: unknown;
}

/**
 * A response value of one expectation, the shape `decided` judged by the member judge: `null`,
 * nothing heard; `'unrecognised'`, an attack the chord sensor recognised no shape in.
 */
function settledOf(
	content: MemberContent,
	decided: string | null | 'unrecognised',
	verdict: ResponseVerdict | null = null
): Settlement['settled'] {
	const judged =
		decided === null
			? null
			: CONTENT_JUDGES.member.judge(content, {
					decided: decided === 'unrecognised' ? null : decided
				});
	const right = judged?.correct === true;
	const said: ResponseVerdict = verdict ?? (right ? 'perfect' : 'wrong');
	return {
		value: {
			verdict: said,
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
					late: said === 'offbeat'
				}
			]
		},
		success: right && said !== 'offbeat'
	};
}

/** The groups of three strings the shapes heard are drawn from. */
const GROUPS: StringNumber[][] = [
	[3, 2, 1],
	[4, 3, 2]
];

/**
 * The settlements of a round: none yet, a right shape, a right shape too late, nothing heard, and
 * the first shape of each kind of confusion among the shapes of its chord, of its other quality
 * and of two other chords on both groups.
 */
function settlementsOf(content: MemberContent): Settlement[] {
	const right = admittedMembers(content)[0];
	const { chord } = content.index as ChordShapesIndex;
	const other = {
		root: chord.root,
		quality: qualityById(chord.quality.id === 'maj' ? 'min' : 'maj')
	};
	const pool = [chord, other, triadOf('C'), triadOf('F#')].flatMap((each) =>
		GROUPS.flatMap((strings) => chordShapes.members({ chord: each, strings }))
	);
	const byKind = new Map<string, Settlement>();
	for (const shape of pool) {
		const settled = settledOf(content, shape.id)!;
		const [result] = settled.value.expectations;
		if (result.correct) continue;
		const kind = `wrong:${(result.confusion as { kind?: string } | null)?.kind ?? 'null'}`;
		if (!byKind.has(kind)) byKind.set(kind, { kind, settled, answer: result.answer });
	}
	return [
		{ kind: 'unsettled', settled: null, answer: null },
		...(right
			? [
					{ kind: 'right', settled: settledOf(content, right.id), answer: { decided: right.id } },
					{
						kind: 'offbeat',
						settled: settledOf(content, right.id, 'offbeat'),
						answer: { decided: right.id }
					}
				]
			: []),
		{ kind: 'nothing', settled: settledOf(content, null), answer: null },
		{
			kind: 'wrong:unrecognised',
			settled: settledOf(content, 'unrecognised'),
			answer: { decided: null }
		},
		...byKind.values()
	];
}

/** What is compared, counted. */
const counts = {
	passages: 0,
	unplayable: 0,
	rounds: 0,
	shows: 0,
	headers: 0,
	cells: 0,
	tiles: 0,
	misses: 0,
	linkAids: 0,
	gridAids: 0,
	/** The grid's aid drawn where the old drew none (D5: the shapes now are drawn too). */
	gridAidsAdded: 0,
	/** Next notes on a place a note of now takes, drawn once by the new picture. */
	sharedPlaces: 0,
	/** Words equal but for separators the view lays out. */
	layout: new Map<string, string>(),
	kinds: new Set<string>()
};

/** Every difference: what, where, old and new. */
const differences: string[] = [];

function differ(where: string, field: string, old: unknown, now: unknown) {
	differences.push(`${where} ${field}: old ${JSON.stringify(old)} / new ${JSON.stringify(now)}`);
}

/** The words, put apart from the separators a view lays out (« · », the non-breaking hyphen). */
const words = (text: string | null) =>
	(text ?? '').replace(/[·‑]/g, ' ').split(/\s+/).filter(Boolean).join(' ');

function sameWords(where: string, field: string, old: string | null, now: string | null) {
	if (old === now) return;
	if (words(old) === words(now)) {
		counts.layout.set(field, `old ${JSON.stringify(old)} / new ${JSON.stringify(now)}`);
		return;
	}
	differ(where, field, old, now);
}

const shape = (view: { notes: { string: number; fret: number }[] } | null) =>
	view && { kind: 'shape', notes: view.notes.map(({ string, fret }) => ({ string, fret })) };

function sameMiss(where: string, old: DrawnMiss | null, now: PassageStageModel) {
	const misses = now.verdict?.misses ?? [];
	counts.misses++;
	if (old === null) {
		if (misses.length > 0) differ(where, 'miss', null, misses);
		return;
	}
	if (misses.length !== 1) return differ(where, 'miss', old, misses);
	const [told] = misses;
	if (JSON.stringify(shape(old.heard)) !== JSON.stringify(told.heard)) {
		differ(where, 'miss.heard', old.heard, told.heard);
	}
	if (JSON.stringify(shape(old.expected)) !== JSON.stringify(told.expected)) {
		differ(where, 'miss.expected', old.expected, told.expected);
	}
	if (old.gap !== told.gap) differ(where, 'miss.gap', old.gap, told.gap);
	if (old.style !== now.chordDiagram) differ(where, 'miss.style', old.style, now.chordDiagram);
}

const neckNotes = (picture: Picture | null) => (picture?.kind === 'neck' ? picture.notes : []);
const placeOf = ({ string, fret }: { string: number; fret: number }) => `${string}-${fret}`;

function compareGrid(where: string, old: GridStageModel, now: PassageStageModel, aided: boolean) {
	const t = viewMessages();
	counts.headers++;
	sameWords(where, 'title', old.title, now.prompt.secondary);
	sameWords(where, 'symbol', old.changes[old.index]?.symbol ?? null, now.prompt.primary);
	const { cue } = old;
	const cueWords =
		cue.kind === 'climb'
			? `${cue.set} · ${cue.direction === 'up' ? t.up : t.down}`
			: cue.kind === 'zone'
				? t.zone(cue.from, cue.to)
				: null;
	sameWords(where, 'cue', cueWords, now.prompt.detail);
	if (old.index !== now.index) differ(where, 'index', old.index, now.index);
	if (old.changes.length !== now.rounds.length) {
		differ(where, 'cells', old.changes.length, now.rounds.length);
	}
	old.changes.forEach((change, i) => {
		const round = now.rounds[i];
		counts.cells++;
		if (!round || round.at !== change.at || round.length !== change.length) {
			differ(where, `cell ${i} place`, change, round);
		}
		if (round?.label !== change.symbol)
			differ(where, `cell ${i} symbol`, change.symbol, round?.label);
	});
	if (old.anchorBeat !== now.anchorBeat)
		differ(where, 'anchorBeat', old.anchorBeat, now.anchorBeat);
	if (old.history !== now.history) differ(where, 'history', old.history, now.history);
	if (!aided) {
		if (old.aid !== null || now.aid !== null) differ(where, 'aid at level 1', old.aid, now.aid);
		return;
	}
	if (old.aid === null) {
		if (now.aid !== null) counts.gridAidsAdded++;
		return;
	}
	counts.gridAids++;
	const drawn = new Set(neckNotes(now.aid).map(placeOf));
	const missing = old.aid.notes.filter((note) => !drawn.has(placeOf(note)));
	if (missing.length > 0) differ(where, 'grid aid', old.aid, now.aid);
}

function compareLink(where: string, old: LinkLaneModel, now: PassageStageModel, aided: boolean) {
	const t = viewMessages();
	counts.headers++;
	sameWords(where, 'root', old.root, now.prompt.primary);
	sameWords(where, 'quality', old.quality, now.prompt.secondary);
	sameWords(where, 'set', `${t.onStrings} ${old.set}`, now.prompt.detail);
	if (old.index !== now.index) differ(where, 'index', old.index, now.index);
	if (old.tiles.length !== now.rounds.length) differ(where, 'tiles', old.tiles, now.rounds);
	old.tiles.forEach((tile, i) => {
		const round = now.rounds[i];
		const change = old.changes[i];
		counts.tiles++;
		if (!round || round.at !== change.at || round.length !== change.length) {
			differ(where, `tile ${i} place`, change, round);
		}
		if (round?.label !== change.symbol)
			differ(where, `tile ${i} label`, change.symbol, round?.label);
		const way = tile === 'root' ? null : tile;
		if (round?.way !== way) differ(where, `tile ${i} way`, tile, round?.way);
	});
	if (old.following.length > 0) differ(where, 'following', old.following, []);
	if (old.anchorBeat !== now.anchorBeat)
		differ(where, 'anchorBeat', old.anchorBeat, now.anchorBeat);
	if (old.history !== now.history) differ(where, 'history', old.history, now.history);
	if (!aided) {
		if (old.aid !== null || now.aid !== null) differ(where, 'aid at level 1', old.aid, now.aid);
		return;
	}
	if (old.aid === null) return differ(where, 'link aid', null, now.aid);
	counts.linkAids++;
	const notes = neckNotes(now.aid);
	const nowNotes = notes
		.filter((note) => !note.next)
		.map(({ string, fret, name }) => ({ string, fret, name }));
	if (JSON.stringify(nowNotes) !== JSON.stringify(old.aid.now)) {
		differ(where, 'link aid now', old.aid.now, nowNotes);
	}
	const taken = new Set(old.aid.now.map(placeOf));
	const oldNext = old.aid.next ?? [];
	counts.sharedPlaces += oldNext.filter((note) => taken.has(placeOf(note))).length;
	const expectedNext = oldNext.filter((note) => !taken.has(placeOf(note)));
	const nextNotes = notes
		.filter((note) => note.next)
		.map(({ string, fret, name }) => ({ string, fret, name }));
	if (JSON.stringify(nextNotes) !== JSON.stringify(expectedNext)) {
		differ(where, 'link aid next', old.aid.next, nextNotes);
	}
}

const PLACE = { anchorBeat: 40, promptBeat: 39, history: [], bands: [] };

function show(
	definition: ExerciseDefinition,
	presenter: SetPresenter,
	item: PlannedItem,
	plan: RoundPlan,
	settled: Settlement['settled'],
	locale: 'fr' | 'en'
): unknown {
	return stageModel({
		definition,
		item,
		presenter,
		plan,
		settled,
		place: PLACE,
		beatsPerBar: 4,
		chordDiagram: 'strings',
		locale,
		random: () => 0,
		moment: { phase: 'round', barInRound: 0, beat: 0, fromRunStart: 0, muted: false },
		runRounds: [],
		endedSessions: 0,
		played: null,
		live: null,
		coming: null
	});
}

/** Plays one passage of `old` and its rewriting, comparing every round on every settlement. */
function comparePassage(old: ExerciseDefinition, now: ExerciseDefinition, label: string) {
	const presenter = old.view === 'link-lane' ? linkPresenter : changePresenter;
	const source = createPassageSource({
		exercises: [old],
		cards: [],
		attempts: [],
		sessionId: 'compare',
		durationMs: SESSION_MS
	});
	let clock = 1_000_000;
	const first = source.next({ now: clock, elapsedMs: 0, fatigued: false });
	if (first === null) {
		counts.unplayable++;
		return;
	}
	counts.passages++;
	for (let planned: PlannedItem | null = first; planned;) {
		const passage = planned.passage!;
		counts.rounds++;
		let recorded: Settlement | null = null;
		for (const exerciseLevel of levelsOf(old)) {
			const item = { ...planned, exerciseLevel };
			const plan = compilePassageRound(old, item);
			const settlements = settlementsOf(memberContent(plan));
			recorded ??= settlements.find((each) => each.kind === 'right') ?? settlements[0];
			for (const { kind, settled } of settlements) {
				counts.kinds.add(kind);
				for (const locale of ['fr', 'en'] as const) {
					i18n.locale = locale;
					const where = `${label} rank ${passage.rank} level ${exerciseLevel} ${kind} ${locale}:`;
					const before = show(old, presenter, item, plan, settled, locale);
					const after = show(now, presenter, item, plan, settled, locale) as PassageStageModel;
					counts.shows++;
					if (!('rounds' in after)) throw new Error(`${where} the new model is not a passage's`);
					if (presenter === linkPresenter) {
						compareLink(where, before as LinkLaneModel, after, exerciseLevel < 0);
					} else {
						compareGrid(where, before as GridStageModel, after, exerciseLevel < 0);
					}
					sameMiss(where, (before as { miss: DrawnMiss | null }).miss, after);
				}
			}
		}
		// The passage goes on with the right shape heard.
		clock += 1000;
		source.record(
			responseAttempt({
				sessionId: 'compare',
				exerciseId: planned.exerciseId,
				skill: planned.skill,
				cardKey: `${planned.skill}:round-${passage.rank}`,
				phase: 'free',
				temperature: 'hot',
				aid: 'none',
				promptedAt: clock,
				tempoBpm: 80,
				leadBeats: null,
				timingOffsetMs: 0,
				reactionMs: 100,
				correct: true,
				verdict: 'perfect',
				data: {
					item: planned.item,
					answer: recorded?.answer ?? null,
					confusion: null,
					passage: { id: passage.id, index: passage.index, rank: passage.rank, each: passage.each }
				},
				observations: []
			}),
			clock
		);
		if (passage.rank === passage.length - 1) break;
		planned = source.next({ now: clock, elapsedMs: 0, fatigued: false });
	}
}

describe('the changes on the screen model of a passage', () => {
	it('say the same words and draw the same misses as their old models, on every passage', () => {
		let tried = 0;
		for (const definition of CHANGES_EXERCISES) {
			for (const index of passageIndices(definition)) {
				for (const each of eachValues(definition)) {
					tried++;
					const old = onePassage(definition, index.of, each);
					const now = onePassage(rewritten(definition), index.of, each);
					comparePassage(old, now, `${definition.id} ${index.key} ${JSON.stringify(each)}`);
				}
			}
		}
		i18n.locale = 'fr';
		// 84 passages, 660 rounds, 22 336 shows when this was written (plan 4c, Task 2).
		// Not vacuous: every exercise played, every kind of comparison made.
		expect(counts.passages).toBeGreaterThan(0);
		// Every index, on every value of its passage params, played a passage.
		expect(counts.passages + counts.unplayable).toBe(tried);
		expect(counts.rounds).toBeGreaterThan(0);
		expect(counts.headers).toBeGreaterThan(0);
		expect(counts.cells).toBeGreaterThan(0);
		expect(counts.tiles).toBeGreaterThan(0);
		expect(counts.misses).toBeGreaterThan(0);
		expect(counts.linkAids).toBeGreaterThan(0);
		expect(counts.gridAids).toBeGreaterThan(0);
		expect([...counts.kinds].filter((kind) => kind.startsWith('wrong:')).length).toBeGreaterThan(5);
		// The one difference of separators, which the view lays out (Task 3): the link's set,
		// « sol · si · mi » under « sur cordes » before, « sur cordes sol‑si‑mi » now.
		expect([...counts.layout.keys()]).toEqual(['set']);
		expect(differences.slice(0, 40)).toEqual([]);
		expect(differences).toHaveLength(0);
	}, 600_000);
});
