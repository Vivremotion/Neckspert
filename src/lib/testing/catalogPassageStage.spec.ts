/**
 * What the screen model of a passage says on the catalog's changes (plan 4c). Before the changes'
 * own screen models were deleted (Task 3), every exercise of the changes was played passage by
 * passage, on every index and every value of every passage param (84 passages, 660 rounds,
 * 22 336 shows), each round before it was judged and after a settlement of each kind, at level 1
 * and at the aid level, in French and in English, by the old models and by this one: the words,
 * the places, the tiles, the ways, the rank, the misses and the aid were equal, but for the link's
 * strings (« sol · si · mi » under « sur cordes » before, « sur cordes sol‑si‑mi » now, decided)
 * and the grids' aid (one shape before, every shape admitted now and next, D5). These rows,
 * captured from this model while that comparison held, keep it pinned. The jam's six aid rows
 * came later (plan 4c, Task 4: it gained its aid level, D7); the comparison saw no jam aid.
 */
import { describe, expect, it } from 'vitest';
import { passageIndices } from '$lib/domain/exercise/passage/indices';
import { compilePassageRound } from '$lib/domain/exercise/passage/round';
import { exerciseLevelsOf } from '$lib/domain/exercise/levels';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
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
import { changePresenter } from '$lib/application/sets/chordGrid';
import { stageModel } from '$lib/application/session/series/stage';
import { responseAttempt } from './attempts';
import { CHANGES_EXERCISES, ZONES } from './changesPassages';

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

/** The levels shown: level 1, and the aid level when the exercise writes one. */
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

const PLACE = { anchorBeat: 40, promptBeat: 39, history: [], bands: [] };

/** The screen model of a round, through the stage dispatch (no presenter draws a passage). */
function show(
	definition: ExerciseDefinition,
	item: PlannedItem,
	plan: RoundPlan,
	settled: Settlement['settled'],
	locale: 'fr' | 'en'
): unknown {
	return stageModel({
		definition,
		item,
		presenter: changePresenter,
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

/** The passages the frozen table holds: a few indices of each exercise, at each value of its passage params. */
const FROZEN_PASSAGES: readonly {
	exercise: string;
	index: string;
	each?: Record<string, unknown>;
}[] = [
	{ exercise: 'inversion-run', index: 'chord=C;strings=3,2,1' },
	{ exercise: 'inversion-run', index: 'chord=Ebm;strings=4,3,2' },
	{ exercise: 'inversion-run', index: 'chord=F#;strings=3,2,1' },
	...(['up', 'down'] as const).flatMap((direction) => [
		{ exercise: 'grid-in-direction', index: 'grid=iohefy-a;strings=3,2,1', each: { direction } },
		{ exercise: 'grid-in-direction', index: 'grid=blues-f;strings=4,3,2', each: { direction } }
	]),
	...ZONES.map((zone) => ({ exercise: 'grid-in-zone', index: 'grid=iohefy-a', each: { zone } })),
	{ exercise: 'grid-in-zone', index: 'grid=blues-f', each: { zone: ZONES[0] } },
	{ exercise: 'grid-reading', index: 'grid=iohefy-a' },
	{ exercise: 'grid-reading', index: 'grid=blues-f' }
];

const frets = (picture: Picture | null) =>
	picture?.kind === 'shape'
		? picture.notes.map(({ string, fret }) => `${string}:${fret}`).join(' ')
		: '-';

const neckOf = (picture: Picture | null) =>
	picture?.kind === 'neck'
		? `${picture.strings ? `strings ${picture.strings.join(',')} ` : ''}${picture.frets ? `[${picture.frets.low}-${picture.frets.high}] ` : ''}${picture.notes
				.map(({ string, fret, name, next }) => `${string}:${fret}:${name}${next ? '+' : ''}`)
				.join(' ')}`
		: '-';

/**
 * The rows of a passage on the screen model: its line; each round's words (in English too for
 * the first); at the second round, what each settlement tells (in English for nothing heard);
 * at the aid level, the aid of the first round, of the second once right, and of the last.
 */
function rowsOf(definition: ExerciseDefinition, label: string): string[] {
	const rows: string[] = [];
	const source = createPassageSource({
		exercises: [definition],
		cards: [],
		attempts: [],
		sessionId: 'frozen',
		durationMs: SESSION_MS
	});
	let clock = 1_000_000;
	const aidLevel = levelsOf(definition).includes(-1);
	for (
		let planned = source.next({ now: clock, elapsedMs: 0, fatigued: false });
		planned;
		planned = source.next({ now: clock, elapsedMs: 0, fatigued: false })
	) {
		const passage = planned.passage!;
		const { rank } = passage;
		const plan = compilePassageRound(definition, planned);
		const settlements = settlementsOf(memberContent(plan));
		const at = (locale: 'fr' | 'en', settled: Settlement['settled'], level = 0) =>
			show(
				definition,
				{ ...planned!, exerciseLevel: level },
				plan,
				settled,
				locale
			) as PassageStageModel;
		const words = ({ prompt }: PassageStageModel) =>
			`${prompt.primary} | ${prompt.secondary ?? '-'} | ${prompt.detail ?? '-'}`;
		const shown = at('fr', null);
		if (rank === 0) {
			rows.push(
				`${label} line: ${shown.rounds.map((round) => `${round.at}+${round.length} ${round.label}${round.way ? ` ${round.way}` : ''}`).join(', ')}`
			);
			rows.push(`${label} #0 en: ${words(at('en', null))}`);
		}
		rows.push(`${label} #${rank}: ${words(shown)}${shown.aid ? ' AID' : ''}`);
		if (rank === 1) {
			for (const { kind, settled } of settlements) {
				if (settled === null) continue;
				const model = at('fr', settled);
				const misses = model.verdict!.misses;
				rows.push(
					`${label} #1 ${kind}: ${model.verdict!.verdict} ${
						misses
							.map(
								(miss) =>
									`heard ${frets(miss.heard)} expected ${frets(miss.expected)} gap ${miss.gap ?? '-'}${miss.correction ? ` correction ${miss.correction}` : ''}`
							)
							.join('; ') || 'no miss'
					}`
				);
			}
			const nothing = settlements.find((each) => each.kind === 'nothing')!;
			const told = at('en', nothing.settled).verdict!.misses[0];
			rows.push(`${label} #1 nothing en: gap ${told?.gap ?? '-'}`);
		}
		if (aidLevel) {
			const last = rank === passage.length - 1;
			if (rank === 0 || last) rows.push(`${label} #${rank} aid: ${neckOf(at('fr', null, -1).aid)}`);
			if (rank === 1) {
				const right = settlements.find((each) => each.kind === 'right');
				if (right)
					rows.push(`${label} #1 aid once right: ${neckOf(at('fr', right.settled, -1).aid)}`);
			}
		}
		const right = settlements.find((each) => each.kind === 'right');
		clock += 1000;
		source.record(
			responseAttempt({
				sessionId: 'frozen',
				exerciseId: planned.exerciseId,
				skill: planned.skill,
				cardKey: `${planned.skill}:round-${rank}`,
				phase: 'free',
				temperature: 'hot',
				promptedAt: clock,
				tempoBpm: 80,
				leadBeats: null,
				timingOffsetMs: 0,
				reactionMs: 100,
				correct: true,
				verdict: 'perfect',
				data: {
					item: planned.item,
					answer: right?.answer ?? null,
					confusion: null,
					passage: { id: passage.id, index: passage.index, rank, each: passage.each }
				},
				observations: []
			}),
			clock
		);
		if (rank === passage.length - 1) break;
	}
	return rows;
}

/** The rows of every passage of the table, on the screen model of a passage. */
function frozenRows(): string[] {
	return FROZEN_PASSAGES.flatMap(({ exercise, index, each }) => {
		const definition = CHANGES_EXERCISES.find((found) => found.id === exercise)!;
		const of = passageIndices(definition).find((found) => found.key === index)!.of;
		const label = `${exercise} ${index}${each ? ` ${JSON.stringify(each)}` : ''}`;
		return rowsOf(onePassage(definition, of, each ?? {}), label);
	});
}

describe('the changes on the screen model of a passage', () => {
	it('say on the passages of the frozen table what they said when it was captured', () => {
		expect(frozenRows()).toEqual(FROZEN);
	});
});

/**
 * Captured from the screen model of a passage (plan 4c, Task 3) while the comparison above held
 * it equal to the old models on every passage: the words, the line, the misses and the aid.
 */
const FROZEN: readonly string[] = [
	'inversion-run chord=C;strings=3,2,1 line: 0+4 C, 4+4 C up, 8+4 C up, 12+4 C up, 16+4 C down, 20+4 C down, 24+4 C down',
	'inversion-run chord=C;strings=3,2,1 #0 en: C | major | on strings G‑B‑E',
	'inversion-run chord=C;strings=3,2,1 #0: C | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=C;strings=3,2,1 #0 aid: strings 3,2,1 [0-5] 3:0:G 2:1:C 1:0:E 3:5:C+ 2:5:E+ 1:3:G+',
	'inversion-run chord=C;strings=3,2,1 #1: C | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=C;strings=3,2,1 #1 right: perfect no miss',
	'inversion-run chord=C;strings=3,2,1 #1 offbeat: offbeat no miss',
	'inversion-run chord=C;strings=3,2,1 #1 nothing: wrong heard - expected 3:5 2:5 1:3 gap pas d’accord entendu',
	'inversion-run chord=C;strings=3,2,1 #1 wrong:unrecognised: wrong heard - expected 3:5 2:5 1:3 gap rien de reconnu',
	'inversion-run chord=C;strings=3,2,1 #1 wrong:other-shape: wrong heard 3:0 2:1 1:0 expected 3:5 2:5 1:3 gap autre forme',
	'inversion-run chord=C;strings=3,2,1 #1 wrong:other-set: wrong heard 4:2 3:0 2:1 expected 3:5 2:5 1:3 gap autres cordes',
	'inversion-run chord=C;strings=3,2,1 #1 wrong:other-quality: wrong heard 3:5 2:4 1:3 expected 3:5 2:5 1:3 gap autre qualité',
	'inversion-run chord=C;strings=3,2,1 #1 wrong:other-chord: wrong heard 3:3 2:2 1:2 expected 3:5 2:5 1:3 gap autre accord',
	'inversion-run chord=C;strings=3,2,1 #1 nothing en: gap no chord heard',
	'inversion-run chord=C;strings=3,2,1 #1 aid once right: strings 3,2,1 [3-9] 3:5:C 2:5:E 1:3:G 3:9:E+ 2:8:G+ 1:8:C+',
	'inversion-run chord=C;strings=3,2,1 #2: C | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=C;strings=3,2,1 #3: C | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=C;strings=3,2,1 #4: C | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=C;strings=3,2,1 #5: C | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=C;strings=3,2,1 #6: C | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=C;strings=3,2,1 #6 aid: strings 3,2,1 [0-1] 3:0:G 2:1:C 1:0:E',
	'inversion-run chord=Ebm;strings=4,3,2 line: 0+4 Ebm, 4+4 Ebm up, 8+4 Ebm up, 12+4 Ebm up, 16+4 Ebm down, 20+4 Ebm down, 24+4 Ebm down',
	'inversion-run chord=Ebm;strings=4,3,2 #0 en: Ebm | minor | on strings D‑G‑B',
	'inversion-run chord=Ebm;strings=4,3,2 #0: Ebm | mineur | sur cordes ré‑sol‑si',
	'inversion-run chord=Ebm;strings=4,3,2 #0 aid: strings 4,3,2 [3-8] 4:4:F# 3:3:A# 2:4:D# 4:8:A#+ 3:8:D#+ 2:7:F#+',
	'inversion-run chord=Ebm;strings=4,3,2 #1: Ebm | mineur | sur cordes ré‑sol‑si',
	'inversion-run chord=Ebm;strings=4,3,2 #1 right: perfect no miss',
	'inversion-run chord=Ebm;strings=4,3,2 #1 offbeat: offbeat no miss',
	'inversion-run chord=Ebm;strings=4,3,2 #1 nothing: wrong heard - expected 4:8 3:8 2:7 gap pas d’accord entendu',
	'inversion-run chord=Ebm;strings=4,3,2 #1 wrong:unrecognised: wrong heard - expected 4:8 3:8 2:7 gap rien de reconnu',
	'inversion-run chord=Ebm;strings=4,3,2 #1 wrong:other-set: wrong heard 3:3 2:4 1:2 expected 4:8 3:8 2:7 gap autres cordes',
	'inversion-run chord=Ebm;strings=4,3,2 #1 wrong:other-shape: wrong heard 4:4 3:3 2:4 expected 4:8 3:8 2:7 gap autre forme',
	'inversion-run chord=Ebm;strings=4,3,2 #1 wrong:other-quality: wrong heard 3:3 2:4 1:3 expected 4:8 3:8 2:7 gap autre qualité',
	'inversion-run chord=Ebm;strings=4,3,2 #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 4:8 3:8 2:7 gap autre accord',
	'inversion-run chord=Ebm;strings=4,3,2 #1 nothing en: gap no chord heard',
	'inversion-run chord=Ebm;strings=4,3,2 #1 aid once right: strings 4,3,2 [7-13] 4:8:A# 3:8:D# 2:7:F# 4:13:D#+ 3:11:F#+ 2:11:A#+',
	'inversion-run chord=Ebm;strings=4,3,2 #2: Ebm | mineur | sur cordes ré‑sol‑si',
	'inversion-run chord=Ebm;strings=4,3,2 #3: Ebm | mineur | sur cordes ré‑sol‑si',
	'inversion-run chord=Ebm;strings=4,3,2 #4: Ebm | mineur | sur cordes ré‑sol‑si',
	'inversion-run chord=Ebm;strings=4,3,2 #5: Ebm | mineur | sur cordes ré‑sol‑si',
	'inversion-run chord=Ebm;strings=4,3,2 #6: Ebm | mineur | sur cordes ré‑sol‑si',
	'inversion-run chord=Ebm;strings=4,3,2 #6 aid: strings 4,3,2 [3-4] 4:4:F# 3:3:A# 2:4:D#',
	'inversion-run chord=F#;strings=3,2,1 line: 0+4 F#, 4+4 F# up, 8+4 F# up, 12+4 F# up, 16+4 F# down, 20+4 F# down, 24+4 F# down',
	'inversion-run chord=F#;strings=3,2,1 #0 en: F# | major | on strings G‑B‑E',
	'inversion-run chord=F#;strings=3,2,1 #0: F# | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=F#;strings=3,2,1 #0 aid: strings 3,2,1 [2-7] 3:3:A# 2:2:C# 1:2:F# 3:6:C#+ 2:7:F#+ 1:6:A#+',
	'inversion-run chord=F#;strings=3,2,1 #1: F# | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=F#;strings=3,2,1 #1 right: perfect no miss',
	'inversion-run chord=F#;strings=3,2,1 #1 offbeat: offbeat no miss',
	'inversion-run chord=F#;strings=3,2,1 #1 nothing: wrong heard - expected 3:6 2:7 1:6 gap pas d’accord entendu',
	'inversion-run chord=F#;strings=3,2,1 #1 wrong:unrecognised: wrong heard - expected 3:6 2:7 1:6 gap rien de reconnu',
	'inversion-run chord=F#;strings=3,2,1 #1 wrong:other-shape: wrong heard 3:3 2:2 1:2 expected 3:6 2:7 1:6 gap autre forme',
	'inversion-run chord=F#;strings=3,2,1 #1 wrong:other-set: wrong heard 4:4 3:3 2:2 expected 3:6 2:7 1:6 gap autres cordes',
	'inversion-run chord=F#;strings=3,2,1 #1 wrong:other-quality: wrong heard 3:2 2:2 1:2 expected 3:6 2:7 1:6 gap autre qualité',
	'inversion-run chord=F#;strings=3,2,1 #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:6 2:7 1:6 gap autre accord',
	'inversion-run chord=F#;strings=3,2,1 #1 nothing en: gap no chord heard',
	'inversion-run chord=F#;strings=3,2,1 #1 aid once right: strings 3,2,1 [6-11] 3:6:C# 2:7:F# 1:6:A# 3:11:F#+ 2:11:A#+ 1:9:C#+',
	'inversion-run chord=F#;strings=3,2,1 #2: F# | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=F#;strings=3,2,1 #3: F# | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=F#;strings=3,2,1 #4: F# | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=F#;strings=3,2,1 #5: F# | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=F#;strings=3,2,1 #6: F# | majeur | sur cordes sol‑si‑mi',
	'inversion-run chord=F#;strings=3,2,1 #6 aid: strings 3,2,1 [2-3] 3:3:A# 2:2:C# 1:2:F#',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #0 en: Dm7 | I Only Have Eyes for You | G‑B‑E · ↑ going up',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #0: Dm7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #0 aid: strings 3,2,1 [1-16] 3:2:A 2:3:D 1:1:F 3:7:D 2:6:F 1:5:A 3:10:F 2:10:A 1:10:D 3:14:A 2:15:D 1:13:F 3:4:B+ 1:3:G+ 2:8:G+ 1:7:B+ 3:12:G+ 2:12:B+ 3:16:B+ 1:15:G+',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #1: G7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #1 right: perfect no miss',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #1 offbeat: offbeat no miss',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #1 nothing: wrong heard - expected 3:4 2:3 1:3 gap pas d’accord entendu',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #1 wrong:unrecognised: wrong heard - expected 3:4 2:3 1:3 gap rien de reconnu',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #1 wrong:other-set: wrong heard 4:0 3:0 2:0 expected 3:4 2:3 1:3 gap autres cordes',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:4 2:3 1:3 gap autre qualité',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:4 2:3 1:3 gap autre accord',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #1 nothing en: gap no chord heard',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #1 aid once right: strings 3,2,1 [3-16] 3:4:B 2:3:D 1:3:G 3:7:D 2:8:G 1:7:B 3:12:G 2:12:B 1:10:D 3:16:B 2:15:D 1:15:G 2:6:F+ 1:5:A+ 3:10:F+ 2:10:A+ 3:14:A+ 1:13:F+',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #2: Dm7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #3: G7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #4: Cmaj7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #5: F7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #6: Em7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #7: Ebm7 | I Only Have Eyes for You | sol‑si‑mi · ↓ en descendant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #8: Ab7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"up"} #8 aid: strings 3,2,1 [4-17] 3:5:C 2:4:Eb 1:4:Ab 3:8:Eb 2:9:Ab 1:8:C 3:13:Ab 2:13:C 1:11:Eb 3:17:C 2:16:Eb 1:16:Ab',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} line: 0+4 F7, 4+4 Bb7, 8+8 F7, 16+8 Bb7, 24+8 F7, 32+4 C7, 36+4 Bb7, 40+4 F7, 44+4 C7',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #0 en: F7 | Blues F | D‑G‑B · ↑ going up',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #0: F7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #0 aid: strings 4,3,2 [1-15] 4:3:F 3:2:A 2:1:C 4:7:A 3:5:C 2:6:F 4:10:C 3:10:F 2:10:A 4:15:F 3:14:A 2:13:C 3:3:Bb+ 2:3:D+ 4:8:Bb+ 3:7:D+ 4:12:D+ 2:11:Bb+ 3:15:Bb+ 2:15:D+',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #1: Bb7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #1 right: perfect no miss',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #1 offbeat: offbeat no miss',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #1 nothing: wrong heard - expected 4:3 3:3 2:3 gap pas d’accord entendu',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #1 wrong:unrecognised: wrong heard - expected 4:3 3:3 2:3 gap rien de reconnu',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #1 wrong:other-set: wrong heard 3:3 2:3 1:1 expected 4:3 3:3 2:3 gap autres cordes',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #1 wrong:other-quality: wrong heard 3:3 2:2 1:1 expected 4:3 3:3 2:3 gap autre qualité',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 4:3 3:3 2:3 gap autre accord',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #1 nothing en: gap no chord heard',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #1 aid once right: strings 4,3,2 [3-15] 4:3:F 3:3:Bb 2:3:D 4:8:Bb 3:7:D 2:6:F 4:12:D 3:10:F 2:11:Bb 4:15:F 3:15:Bb 2:15:D 4:7:A+ 3:5:C+ 4:10:C+ 2:10:A+ 3:14:A+ 2:13:C+',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #2: F7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #3: Bb7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #4: F7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #5: C7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #6: Bb7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #7: F7 | Blues F | ré‑sol‑si · ↓ en descendant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #8: C7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"up"} #8 aid: strings 4,3,2 [5-17] 4:5:G 3:5:C 2:5:E 4:10:C 3:9:E 2:8:G 4:14:E 3:12:G 2:13:C 4:17:G 3:17:C 2:17:E',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #0 en: Dm7 | I Only Have Eyes for You | G‑B‑E · ↓ going down',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #0: Dm7 | I Only Have Eyes for You | sol‑si‑mi · ↓ en descendant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #0 aid: strings 3,2,1 [1-16] 3:2:A 2:3:D 1:1:F 3:7:D 2:6:F 1:5:A 3:10:F 2:10:A 1:10:D 3:14:A 2:15:D 1:13:F 3:4:B+ 1:3:G+ 2:8:G+ 1:7:B+ 3:12:G+ 2:12:B+ 3:16:B+ 1:15:G+',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #1: G7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #1 right: perfect no miss',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #1 offbeat: offbeat no miss',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #1 nothing: wrong heard - expected 3:4 2:3 1:3 gap pas d’accord entendu',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #1 wrong:unrecognised: wrong heard - expected 3:4 2:3 1:3 gap rien de reconnu',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #1 wrong:other-set: wrong heard 4:0 3:0 2:0 expected 3:4 2:3 1:3 gap autres cordes',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:4 2:3 1:3 gap autre qualité',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:4 2:3 1:3 gap autre accord',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #1 nothing en: gap no chord heard',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #1 aid once right: strings 3,2,1 [3-16] 3:4:B 2:3:D 1:3:G 3:7:D 2:8:G 1:7:B 3:12:G 2:12:B 1:10:D 3:16:B 2:15:D 1:15:G 2:6:F+ 1:5:A+ 3:10:F+ 2:10:A+ 3:14:A+ 1:13:F+',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #2: Dm7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #3: G7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #4: Cmaj7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #5: F7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #6: Em7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #7: Ebm7 | I Only Have Eyes for You | sol‑si‑mi · ↓ en descendant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #8: Ab7 | I Only Have Eyes for You | sol‑si‑mi · ↑ en montant',
	'grid-in-direction grid=iohefy-a;strings=3,2,1 {"direction":"down"} #8 aid: strings 3,2,1 [4-17] 3:5:C 2:4:Eb 1:4:Ab 3:8:Eb 2:9:Ab 1:8:C 3:13:Ab 2:13:C 1:11:Eb 3:17:C 2:16:Eb 1:16:Ab',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} line: 0+4 F7, 4+4 Bb7, 8+8 F7, 16+8 Bb7, 24+8 F7, 32+4 C7, 36+4 Bb7, 40+4 F7, 44+4 C7',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #0 en: F7 | Blues F | D‑G‑B · ↓ going down',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #0: F7 | Blues F | ré‑sol‑si · ↓ en descendant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #0 aid: strings 4,3,2 [1-15] 4:3:F 3:2:A 2:1:C 4:7:A 3:5:C 2:6:F 4:10:C 3:10:F 2:10:A 4:15:F 3:14:A 2:13:C 3:3:Bb+ 2:3:D+ 4:8:Bb+ 3:7:D+ 4:12:D+ 2:11:Bb+ 3:15:Bb+ 2:15:D+',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #1: Bb7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #1 right: perfect no miss',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #1 offbeat: offbeat no miss',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #1 nothing: wrong heard - expected 4:3 3:3 2:3 gap pas d’accord entendu',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #1 wrong:unrecognised: wrong heard - expected 4:3 3:3 2:3 gap rien de reconnu',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #1 wrong:other-set: wrong heard 3:3 2:3 1:1 expected 4:3 3:3 2:3 gap autres cordes',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #1 wrong:other-quality: wrong heard 3:3 2:2 1:1 expected 4:3 3:3 2:3 gap autre qualité',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 4:3 3:3 2:3 gap autre accord',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #1 nothing en: gap no chord heard',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #1 aid once right: strings 4,3,2 [3-15] 4:3:F 3:3:Bb 2:3:D 4:8:Bb 3:7:D 2:6:F 4:12:D 3:10:F 2:11:Bb 4:15:F 3:15:Bb 2:15:D 4:7:A+ 3:5:C+ 4:10:C+ 2:10:A+ 3:14:A+ 2:13:C+',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #2: F7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #3: Bb7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #4: F7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #5: C7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #6: Bb7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #7: F7 | Blues F | ré‑sol‑si · ↓ en descendant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #8: C7 | Blues F | ré‑sol‑si · ↑ en montant',
	'grid-in-direction grid=blues-f;strings=4,3,2 {"direction":"down"} #8 aid: strings 4,3,2 [5-17] 4:5:G 3:5:C 2:5:E 4:10:C 3:9:E 2:8:G 4:14:E 3:12:G 2:13:C 4:17:G 3:17:C 2:17:E',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #0 en: Dm7 | I Only Have Eyes for You | frets 1 to 5',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #0: Dm7 | I Only Have Eyes for You | cases 1 à 5',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #0 aid: strings 4,3,2,1 [0-5] 3:2:A 2:3:D 1:1:F 4:3:F 4:0:D+ 3:0:G+ 2:0:B+ 3:4:B+ 1:3:G+ 4:5:G+',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #1: G7 | I Only Have Eyes for You | cases 1 à 5',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #1 nothing: wrong heard - expected 4:0 3:0 2:0 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #1 wrong:unrecognised: wrong heard - expected 4:0 3:0 2:0 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #1 wrong:out-of-zone: wrong heard 3:7 2:8 1:7 expected 3:4 2:3 1:3 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:4 2:3 1:3 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 4:0 3:0 2:0 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #1 aid once right: strings 4,3,2,1 [0-5] 4:0:D 3:0:G 2:0:B 3:4:B 2:3:D 1:3:G 4:5:G 3:2:A+ 1:1:F+ 4:3:F+',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #2: Dm7 | I Only Have Eyes for You | cases 1 à 5',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #3: G7 | I Only Have Eyes for You | cases 1 à 5',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #4: Cmaj7 | I Only Have Eyes for You | cases 1 à 5',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #5: F7 | I Only Have Eyes for You | cases 1 à 5',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #6: Em7 | I Only Have Eyes for You | cases 1 à 5',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #7: Ebm7 | I Only Have Eyes for You | cases 1 à 5',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #8: Ab7 | I Only Have Eyes for You | cases 1 à 5',
	'grid-in-zone grid=iohefy-a {"zone":[1,5]} #8 aid: strings 4,3,2,1 [1-5] 4:1:Eb 3:1:Ab 2:1:C 3:5:C 2:4:Eb 1:4:Ab',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #0 en: Dm7 | I Only Have Eyes for You | frets 6 to 10',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #0: Dm7 | I Only Have Eyes for You | cases 6 à 10',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #0 aid: strings 4,3,2,1 [6-10] 4:7:A 3:7:D 2:6:F 3:10:F 2:10:A 1:10:D 2:8:G+ 1:7:B+ 4:9:B+',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #1: G7 | I Only Have Eyes for You | cases 6 à 10',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #1 nothing: wrong heard - expected 3:7 2:8 1:7 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #1 wrong:unrecognised: wrong heard - expected 3:7 2:8 1:7 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #1 wrong:out-of-zone: wrong heard 3:4 2:3 1:3 expected 3:7 2:8 1:7 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:7 2:8 1:7 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:7 2:8 1:7 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #1 aid once right: strings 4,3,2,1 [6-10] 3:7:D 2:8:G 1:7:B 4:9:B 4:7:A+ 2:6:F+ 3:10:F+ 2:10:A+ 1:10:D+',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #2: Dm7 | I Only Have Eyes for You | cases 6 à 10',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #3: G7 | I Only Have Eyes for You | cases 6 à 10',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #4: Cmaj7 | I Only Have Eyes for You | cases 6 à 10',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #5: F7 | I Only Have Eyes for You | cases 6 à 10',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #6: Em7 | I Only Have Eyes for You | cases 6 à 10',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #7: Ebm7 | I Only Have Eyes for You | cases 6 à 10',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #8: Ab7 | I Only Have Eyes for You | cases 6 à 10',
	'grid-in-zone grid=iohefy-a {"zone":[6,10]} #8 aid: strings 4,3,2,1 [8-10] 3:8:Eb 2:9:Ab 1:8:C 4:10:C',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #0 en: Dm7 | I Only Have Eyes for You | frets 11 to 15',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #0: Dm7 | I Only Have Eyes for You | cases 11 à 15',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #0 aid: strings 4,3,2,1 [12-15] 3:14:A 2:15:D 1:13:F 4:15:F 4:12:D+ 3:12:G+ 2:12:B+',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #1: G7 | I Only Have Eyes for You | cases 11 à 15',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #1 nothing: wrong heard - expected 4:12 3:12 2:12 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #1 wrong:unrecognised: wrong heard - expected 4:12 3:12 2:12 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #1 wrong:out-of-zone: wrong heard 3:4 2:3 1:3 expected 4:12 3:12 2:12 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 4:12 3:12 2:12 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 4:12 3:12 2:12 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #1 aid once right: strings 4,3,2,1 [12-15] 4:12:D 3:12:G 2:12:B 3:14:A+ 2:15:D+ 1:13:F+ 4:15:F+',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #2: Dm7 | I Only Have Eyes for You | cases 11 à 15',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #3: G7 | I Only Have Eyes for You | cases 11 à 15',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #4: Cmaj7 | I Only Have Eyes for You | cases 11 à 15',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #5: F7 | I Only Have Eyes for You | cases 11 à 15',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #6: Em7 | I Only Have Eyes for You | cases 11 à 15',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #7: Ebm7 | I Only Have Eyes for You | cases 11 à 15',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #8: Ab7 | I Only Have Eyes for You | cases 11 à 15',
	'grid-in-zone grid=iohefy-a {"zone":[11,15]} #8 aid: strings 4,3,2,1 [11-13] 3:13:Ab 2:13:C 1:11:Eb 4:13:Eb',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #0 en: Dm7 | I Only Have Eyes for You | frets 3 to 7',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #0: Dm7 | I Only Have Eyes for You | cases 3 à 7',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #0 aid: strings 4,3,2,1 [3-7] 3:7:D 2:6:F 1:5:A 4:7:A 3:4:B+ 2:3:D+ 1:3:G+ 4:5:G+',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #1: G7 | I Only Have Eyes for You | cases 3 à 7',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #1 nothing: wrong heard - expected 3:4 2:3 1:3 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #1 wrong:unrecognised: wrong heard - expected 3:4 2:3 1:3 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #1 wrong:out-of-zone: wrong heard 3:7 2:8 1:7 expected 3:4 2:3 1:3 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:4 2:3 1:3 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:4 2:3 1:3 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #1 aid once right: strings 4,3,2,1 [3-7] 3:4:B 2:3:D 1:3:G 4:5:G 3:7:D+ 2:6:F+ 1:5:A+ 4:7:A+',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #2: Dm7 | I Only Have Eyes for You | cases 3 à 7',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #3: G7 | I Only Have Eyes for You | cases 3 à 7',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #4: Cmaj7 | I Only Have Eyes for You | cases 3 à 7',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #5: F7 | I Only Have Eyes for You | cases 3 à 7',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #6: Em7 | I Only Have Eyes for You | cases 3 à 7',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #7: Ebm7 | I Only Have Eyes for You | cases 3 à 7',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #8: Ab7 | I Only Have Eyes for You | cases 3 à 7',
	'grid-in-zone grid=iohefy-a {"zone":[3,7]} #8 aid: strings 4,3,2,1 [4-6] 3:5:C 2:4:Eb 1:4:Ab 4:6:Ab',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #0 en: Dm7 | I Only Have Eyes for You | frets 8 to 12',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #0: Dm7 | I Only Have Eyes for You | cases 8 à 12',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #0 aid: strings 4,3,2,1 [10-12] 3:10:F 2:10:A 1:10:D 4:12:D 3:12:G+ 2:12:B+',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #1: G7 | I Only Have Eyes for You | cases 8 à 12',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #1 nothing: wrong heard - expected 3:12 2:12 1:10 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #1 wrong:unrecognised: wrong heard - expected 3:12 2:12 1:10 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #1 wrong:out-of-zone: wrong heard 3:4 2:3 1:3 expected 3:12 2:12 1:10 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:12 2:12 1:10 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:12 2:12 1:10 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #1 aid once right: strings 4,3,2,1 [10-12] 3:12:G 2:12:B 1:10:D 4:12:D 3:10:F+ 2:10:A+',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #2: Dm7 | I Only Have Eyes for You | cases 8 à 12',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #3: G7 | I Only Have Eyes for You | cases 8 à 12',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #4: Cmaj7 | I Only Have Eyes for You | cases 8 à 12',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #5: F7 | I Only Have Eyes for You | cases 8 à 12',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #6: Em7 | I Only Have Eyes for You | cases 8 à 12',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #7: Ebm7 | I Only Have Eyes for You | cases 8 à 12',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #8: Ab7 | I Only Have Eyes for You | cases 8 à 12',
	'grid-in-zone grid=iohefy-a {"zone":[8,12]} #8 aid: strings 4,3,2,1 [8-10] 3:8:Eb 2:9:Ab 1:8:C 4:10:C',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #0 en: Dm7 | I Only Have Eyes for You | frets 13 to 17',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #0: Dm7 | I Only Have Eyes for You | cases 13 à 17',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #0 aid: strings 4,3,2,1 [13-17] 3:14:A 2:15:D 1:13:F 4:15:F 3:16:B+ 1:15:G+ 4:17:G+',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #1: G7 | I Only Have Eyes for You | cases 13 à 17',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #1 nothing: wrong heard - expected 3:16 2:15 1:15 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #1 wrong:unrecognised: wrong heard - expected 3:16 2:15 1:15 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #1 wrong:out-of-zone: wrong heard 3:4 2:3 1:3 expected 3:16 2:15 1:15 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:16 2:15 1:15 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:16 2:15 1:15 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #1 aid once right: strings 4,3,2,1 [13-17] 3:16:B 2:15:D 1:15:G 4:17:G 3:14:A+ 1:13:F+ 4:15:F+',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #2: Dm7 | I Only Have Eyes for You | cases 13 à 17',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #3: G7 | I Only Have Eyes for You | cases 13 à 17',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #4: Cmaj7 | I Only Have Eyes for You | cases 13 à 17',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #5: F7 | I Only Have Eyes for You | cases 13 à 17',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #6: Em7 | I Only Have Eyes for You | cases 13 à 17',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #7: Ebm7 | I Only Have Eyes for You | cases 13 à 17',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #8: Ab7 | I Only Have Eyes for You | cases 13 à 17',
	'grid-in-zone grid=iohefy-a {"zone":[13,17]} #8 aid: strings 4,3,2,1 [13-17] 4:13:Eb 3:13:Ab 2:13:C 3:17:C 2:16:Eb 1:16:Ab',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #0 en: Dm7 | I Only Have Eyes for You | frets 5 to 9',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #0: Dm7 | I Only Have Eyes for You | cases 5 à 9',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #0 aid: strings 4,3,2,1 [5-9] 3:7:D 2:6:F 1:5:A 4:7:A 2:8:G+ 1:7:B+ 4:9:B+',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #1: G7 | I Only Have Eyes for You | cases 5 à 9',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #1 nothing: wrong heard - expected 3:7 2:8 1:7 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #1 wrong:unrecognised: wrong heard - expected 3:7 2:8 1:7 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #1 wrong:out-of-zone: wrong heard 3:4 2:3 1:3 expected 3:7 2:8 1:7 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:7 2:8 1:7 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:7 2:8 1:7 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #1 aid once right: strings 4,3,2,1 [5-9] 3:7:D 2:8:G 1:7:B 4:9:B 2:6:F+ 1:5:A+ 4:7:A+',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #2: Dm7 | I Only Have Eyes for You | cases 5 à 9',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #3: G7 | I Only Have Eyes for You | cases 5 à 9',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #4: Cmaj7 | I Only Have Eyes for You | cases 5 à 9',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #5: F7 | I Only Have Eyes for You | cases 5 à 9',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #6: Em7 | I Only Have Eyes for You | cases 5 à 9',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #7: Ebm7 | I Only Have Eyes for You | cases 5 à 9',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #8: Ab7 | I Only Have Eyes for You | cases 5 à 9',
	'grid-in-zone grid=iohefy-a {"zone":[5,9]} #8 aid: strings 4,3,2,1 [8-9] 3:8:Eb 2:9:Ab 1:8:C',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #0 en: Dm7 | I Only Have Eyes for You | frets 10 to 14',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #0: Dm7 | I Only Have Eyes for You | cases 10 à 14',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #0 aid: strings 4,3,2,1 [10-12] 3:10:F 2:10:A 1:10:D 4:12:D 3:12:G+ 2:12:B+',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #1: G7 | I Only Have Eyes for You | cases 10 à 14',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #1 nothing: wrong heard - expected 3:12 2:12 1:10 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #1 wrong:unrecognised: wrong heard - expected 3:12 2:12 1:10 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #1 wrong:out-of-zone: wrong heard 3:4 2:3 1:3 expected 3:12 2:12 1:10 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:12 2:12 1:10 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:12 2:12 1:10 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #1 aid once right: strings 4,3,2,1 [10-12] 3:12:G 2:12:B 1:10:D 4:12:D 3:10:F+ 2:10:A+',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #2: Dm7 | I Only Have Eyes for You | cases 10 à 14',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #3: G7 | I Only Have Eyes for You | cases 10 à 14',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #4: Cmaj7 | I Only Have Eyes for You | cases 10 à 14',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #5: F7 | I Only Have Eyes for You | cases 10 à 14',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #6: Em7 | I Only Have Eyes for You | cases 10 à 14',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #7: Ebm7 | I Only Have Eyes for You | cases 10 à 14',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #8: Ab7 | I Only Have Eyes for You | cases 10 à 14',
	'grid-in-zone grid=iohefy-a {"zone":[10,14]} #8 aid: strings 4,3,2,1 [11-13] 3:13:Ab 2:13:C 1:11:Eb 4:13:Eb',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #0 en: Dm7 | I Only Have Eyes for You | frets 2 to 6',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #0: Dm7 | I Only Have Eyes for You | cases 2 à 6',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #0 aid: strings 4,3,2,1 [2-5] 4:3:F 3:2:A 2:3:D 3:4:B+ 1:3:G+ 4:5:G+',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #1: G7 | I Only Have Eyes for You | cases 2 à 6',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #1 nothing: wrong heard - expected 3:4 2:3 1:3 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #1 wrong:unrecognised: wrong heard - expected 3:4 2:3 1:3 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #1 wrong:out-of-zone: wrong heard 3:7 2:8 1:7 expected 3:4 2:3 1:3 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:4 2:3 1:3 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:4 2:3 1:3 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #1 aid once right: strings 4,3,2,1 [2-5] 3:4:B 2:3:D 1:3:G 4:5:G 4:3:F+ 3:2:A+',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #2: Dm7 | I Only Have Eyes for You | cases 2 à 6',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #3: G7 | I Only Have Eyes for You | cases 2 à 6',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #4: Cmaj7 | I Only Have Eyes for You | cases 2 à 6',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #5: F7 | I Only Have Eyes for You | cases 2 à 6',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #6: Em7 | I Only Have Eyes for You | cases 2 à 6',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #7: Ebm7 | I Only Have Eyes for You | cases 2 à 6',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #8: Ab7 | I Only Have Eyes for You | cases 2 à 6',
	'grid-in-zone grid=iohefy-a {"zone":[2,6]} #8 aid: strings 4,3,2,1 [4-6] 3:5:C 2:4:Eb 1:4:Ab 4:6:Ab',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #0 en: Dm7 | I Only Have Eyes for You | frets 7 to 11',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #0: Dm7 | I Only Have Eyes for You | cases 7 à 11',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #0 aid: strings 4,3,2,1 [7-10] 3:10:F 2:10:A 1:10:D 3:7:D+ 2:8:G+ 1:7:B+ 4:9:B+',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #1: G7 | I Only Have Eyes for You | cases 7 à 11',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #1 nothing: wrong heard - expected 3:7 2:8 1:7 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #1 wrong:unrecognised: wrong heard - expected 3:7 2:8 1:7 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #1 wrong:out-of-zone: wrong heard 3:4 2:3 1:3 expected 3:7 2:8 1:7 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:7 2:8 1:7 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:7 2:8 1:7 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #1 aid once right: strings 4,3,2,1 [7-10] 3:7:D 2:8:G 1:7:B 4:9:B 3:10:F+ 2:10:A+ 1:10:D+',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #2: Dm7 | I Only Have Eyes for You | cases 7 à 11',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #3: G7 | I Only Have Eyes for You | cases 7 à 11',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #4: Cmaj7 | I Only Have Eyes for You | cases 7 à 11',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #5: F7 | I Only Have Eyes for You | cases 7 à 11',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #6: Em7 | I Only Have Eyes for You | cases 7 à 11',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #7: Ebm7 | I Only Have Eyes for You | cases 7 à 11',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #8: Ab7 | I Only Have Eyes for You | cases 7 à 11',
	'grid-in-zone grid=iohefy-a {"zone":[7,11]} #8 aid: strings 4,3,2,1 [8-10] 3:8:Eb 2:9:Ab 1:8:C 4:10:C',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #0 en: Dm7 | I Only Have Eyes for You | frets 12 to 16',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #0: Dm7 | I Only Have Eyes for You | cases 12 à 16',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #0 aid: strings 4,3,2,1 [12-16] 3:14:A 2:15:D 1:13:F 4:15:F 4:12:D+ 3:12:G+ 2:12:B+ 3:16:B+ 1:15:G+',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #1: G7 | I Only Have Eyes for You | cases 12 à 16',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #1 nothing: wrong heard - expected 4:12 3:12 2:12 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #1 wrong:unrecognised: wrong heard - expected 4:12 3:12 2:12 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #1 wrong:out-of-zone: wrong heard 3:4 2:3 1:3 expected 4:12 3:12 2:12 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 4:12 3:12 2:12 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 4:12 3:12 2:12 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #1 aid once right: strings 4,3,2,1 [12-16] 4:12:D 3:12:G 2:12:B 3:16:B 2:15:D 1:15:G 3:14:A+ 1:13:F+ 4:15:F+',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #2: Dm7 | I Only Have Eyes for You | cases 12 à 16',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #3: G7 | I Only Have Eyes for You | cases 12 à 16',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #4: Cmaj7 | I Only Have Eyes for You | cases 12 à 16',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #5: F7 | I Only Have Eyes for You | cases 12 à 16',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #6: Em7 | I Only Have Eyes for You | cases 12 à 16',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #7: Ebm7 | I Only Have Eyes for You | cases 12 à 16',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #8: Ab7 | I Only Have Eyes for You | cases 12 à 16',
	'grid-in-zone grid=iohefy-a {"zone":[12,16]} #8 aid: strings 4,3,2,1 [13-13] 4:13:Eb 3:13:Ab 2:13:C',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #0 en: Dm7 | I Only Have Eyes for You | frets 4 to 8',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #0: Dm7 | I Only Have Eyes for You | cases 4 à 8',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #0 aid: strings 4,3,2,1 [5-8] 3:7:D 2:6:F 1:5:A 4:7:A 2:8:G+ 1:7:B+',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #1: G7 | I Only Have Eyes for You | cases 4 à 8',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #1 nothing: wrong heard - expected 3:7 2:8 1:7 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #1 wrong:unrecognised: wrong heard - expected 3:7 2:8 1:7 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #1 wrong:out-of-zone: wrong heard 3:4 2:3 1:3 expected 3:7 2:8 1:7 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:7 2:8 1:7 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:7 2:8 1:7 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #1 aid once right: strings 4,3,2,1 [5-8] 3:7:D 2:8:G 1:7:B 2:6:F+ 1:5:A+ 4:7:A+',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #2: Dm7 | I Only Have Eyes for You | cases 4 à 8',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #3: G7 | I Only Have Eyes for You | cases 4 à 8',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #4: Cmaj7 | I Only Have Eyes for You | cases 4 à 8',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #5: F7 | I Only Have Eyes for You | cases 4 à 8',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #6: Em7 | I Only Have Eyes for You | cases 4 à 8',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #7: Ebm7 | I Only Have Eyes for You | cases 4 à 8',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #8: Ab7 | I Only Have Eyes for You | cases 4 à 8',
	'grid-in-zone grid=iohefy-a {"zone":[4,8]} #8 aid: strings 4,3,2,1 [4-6] 3:5:C 2:4:Eb 1:4:Ab 4:6:Ab',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #0 en: Dm7 | I Only Have Eyes for You | frets 9 to 13',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #0: Dm7 | I Only Have Eyes for You | cases 9 à 13',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #0 aid: strings 4,3,2,1 [10-12] 3:10:F 2:10:A 1:10:D 4:12:D 3:12:G+ 2:12:B+',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #1: G7 | I Only Have Eyes for You | cases 9 à 13',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #1 right: perfect no miss',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #1 nothing: wrong heard - expected 3:12 2:12 1:10 gap pas d’accord entendu',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #1 wrong:unrecognised: wrong heard - expected 3:12 2:12 1:10 gap rien de reconnu',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #1 wrong:out-of-zone: wrong heard 3:4 2:3 1:3 expected 3:12 2:12 1:10 gap hors de la zone',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:12 2:12 1:10 gap autre qualité',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:12 2:12 1:10 gap autre accord',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #1 aid once right: strings 4,3,2,1 [10-12] 3:12:G 2:12:B 1:10:D 4:12:D 3:10:F+ 2:10:A+',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #2: Dm7 | I Only Have Eyes for You | cases 9 à 13',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #3: G7 | I Only Have Eyes for You | cases 9 à 13',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #4: Cmaj7 | I Only Have Eyes for You | cases 9 à 13',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #5: F7 | I Only Have Eyes for You | cases 9 à 13',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #6: Em7 | I Only Have Eyes for You | cases 9 à 13',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #7: Ebm7 | I Only Have Eyes for You | cases 9 à 13',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #8: Ab7 | I Only Have Eyes for You | cases 9 à 13',
	'grid-in-zone grid=iohefy-a {"zone":[9,13]} #8 aid: strings 4,3,2,1 [11-13] 3:13:Ab 2:13:C 1:11:Eb 4:13:Eb',
	'grid-in-zone grid=blues-f {"zone":[1,5]} line: 0+4 F7, 4+4 Bb7, 8+8 F7, 16+8 Bb7, 24+8 F7, 32+4 C7, 36+4 Bb7, 40+4 F7, 44+4 C7',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #0 en: F7 | Blues F | frets 1 to 5',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #0: F7 | Blues F | cases 1 à 5',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #0 aid: strings 4,3,2,1 [1-3] 3:2:A 2:1:C 1:1:F 4:3:F 3:3:Bb+ 2:3:D+',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #1: Bb7 | Blues F | cases 1 à 5',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #1 right: perfect no miss',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #1 offbeat: offbeat no miss',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #1 nothing: wrong heard - expected 3:3 2:3 1:1 gap pas d’accord entendu',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #1 wrong:unrecognised: wrong heard - expected 3:3 2:3 1:1 gap rien de reconnu',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #1 wrong:out-of-zone: wrong heard 3:7 2:6 1:6 expected 4:3 3:3 2:3 gap hors de la zone',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #1 wrong:other-quality: wrong heard 3:3 2:2 1:1 expected 3:3 2:3 1:1 gap autre qualité',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:3 2:3 1:1 gap autre accord',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #1 nothing en: gap no chord heard',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #1 aid once right: strings 4,3,2,1 [1-3] 3:3:Bb 2:3:D 1:1:F 4:3:F 3:2:A+ 2:1:C+',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #2: F7 | Blues F | cases 1 à 5',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #3: Bb7 | Blues F | cases 1 à 5',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #4: F7 | Blues F | cases 1 à 5',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #5: C7 | Blues F | cases 1 à 5',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #6: Bb7 | Blues F | cases 1 à 5',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #7: F7 | Blues F | cases 1 à 5',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #8: C7 | Blues F | cases 1 à 5',
	'grid-in-zone grid=blues-f {"zone":[1,5]} #8 aid: strings 4,3,2,1 [0-5] 3:0:G 2:1:C 1:0:E 4:2:E 3:5:C 2:5:E 1:3:G 4:5:G',
	'grid-reading grid=iohefy-a line: 0+4 Dm7, 4+4 G7, 8+4 Dm7, 12+4 G7, 16+6 Cmaj7, 22+2 F7, 24+4 Em7, 28+2 Ebm7, 30+2 Ab7',
	'grid-reading grid=iohefy-a #0 en: Dm7 | I Only Have Eyes for You | -',
	'grid-reading grid=iohefy-a #0: Dm7 | I Only Have Eyes for You | -',
	'grid-reading grid=iohefy-a #0 aid: strings 4,3,2,1 [0-17] 3:2:A 2:3:D 1:1:F 4:3:F 3:7:D 2:6:F 1:5:A 4:7:A 3:10:F 2:10:A 1:10:D 4:12:D 3:14:A 2:15:D 1:13:F 4:15:F 4:0:D+ 3:0:G+ 2:0:B+ 3:4:B+ 1:3:G+ 4:5:G+ 2:8:G+ 1:7:B+ 4:9:B+ 3:12:G+ 2:12:B+ 3:16:B+ 1:15:G+ 4:17:G+',
	'grid-reading grid=iohefy-a #1: G7 | I Only Have Eyes for You | -',
	'grid-reading grid=iohefy-a #1 right: perfect no miss',
	'grid-reading grid=iohefy-a #1 offbeat: offbeat no miss',
	'grid-reading grid=iohefy-a #1 nothing: wrong heard - expected 4:0 3:0 2:0 gap pas d’accord entendu',
	'grid-reading grid=iohefy-a #1 wrong:unrecognised: wrong heard - expected 4:0 3:0 2:0 gap rien de reconnu',
	'grid-reading grid=iohefy-a #1 wrong:other-quality: wrong heard 3:3 2:3 1:3 expected 3:4 2:3 1:3 gap autre qualité',
	'grid-reading grid=iohefy-a #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 4:0 3:0 2:0 gap autre accord',
	'grid-reading grid=iohefy-a #1 nothing en: gap no chord heard',
	'grid-reading grid=iohefy-a #1 aid once right: strings 4,3,2,1 [0-17] 4:0:D 3:0:G 2:0:B 3:4:B 2:3:D 1:3:G 4:5:G 3:7:D 2:8:G 1:7:B 4:9:B 3:12:G 2:12:B 1:10:D 4:12:D 3:16:B 2:15:D 1:15:G 4:17:G 3:2:A+ 1:1:F+ 4:3:F+ 2:6:F+ 1:5:A+ 4:7:A+ 3:10:F+ 2:10:A+ 3:14:A+ 1:13:F+ 4:15:F+',
	'grid-reading grid=iohefy-a #2: Dm7 | I Only Have Eyes for You | -',
	'grid-reading grid=iohefy-a #3: G7 | I Only Have Eyes for You | -',
	'grid-reading grid=iohefy-a #4: Cmaj7 | I Only Have Eyes for You | -',
	'grid-reading grid=iohefy-a #5: F7 | I Only Have Eyes for You | -',
	'grid-reading grid=iohefy-a #6: Em7 | I Only Have Eyes for You | -',
	'grid-reading grid=iohefy-a #7: Ebm7 | I Only Have Eyes for You | -',
	'grid-reading grid=iohefy-a #8: Ab7 | I Only Have Eyes for You | -',
	'grid-reading grid=iohefy-a #8 aid: strings 4,3,2,1 [1-17] 4:1:Eb 3:1:Ab 2:1:C 3:5:C 2:4:Eb 1:4:Ab 4:6:Ab 3:8:Eb 2:9:Ab 1:8:C 4:10:C 3:13:Ab 2:13:C 1:11:Eb 4:13:Eb 3:17:C 2:16:Eb 1:16:Ab',
	'grid-reading grid=blues-f line: 0+4 F7, 4+4 Bb7, 8+8 F7, 16+8 Bb7, 24+8 F7, 32+4 C7, 36+4 Bb7, 40+4 F7, 44+4 C7',
	'grid-reading grid=blues-f #0 en: F7 | Blues F | -',
	'grid-reading grid=blues-f #0: F7 | Blues F | -',
	'grid-reading grid=blues-f #0 aid: strings 4,3,2,1 [1-15] 3:2:A 2:1:C 1:1:F 4:3:F 3:5:C 2:6:F 1:5:A 4:7:A 3:10:F 2:10:A 1:8:C 4:10:C 3:14:A 2:13:C 1:13:F 4:15:F 3:3:Bb+ 2:3:D+ 3:7:D+ 1:6:Bb+ 4:8:Bb+ 2:11:Bb+ 1:10:D+ 4:12:D+ 3:15:Bb+ 2:15:D+',
	'grid-reading grid=blues-f #1: Bb7 | Blues F | -',
	'grid-reading grid=blues-f #1 right: perfect no miss',
	'grid-reading grid=blues-f #1 offbeat: offbeat no miss',
	'grid-reading grid=blues-f #1 nothing: wrong heard - expected 3:3 2:3 1:1 gap pas d’accord entendu',
	'grid-reading grid=blues-f #1 wrong:unrecognised: wrong heard - expected 3:3 2:3 1:1 gap rien de reconnu',
	'grid-reading grid=blues-f #1 wrong:other-quality: wrong heard 3:3 2:2 1:1 expected 3:3 2:3 1:1 gap autre qualité',
	'grid-reading grid=blues-f #1 wrong:other-chord: wrong heard 3:0 2:1 1:0 expected 3:3 2:3 1:1 gap autre accord',
	'grid-reading grid=blues-f #1 nothing en: gap no chord heard',
	'grid-reading grid=blues-f #1 aid once right: strings 4,3,2,1 [1-15] 3:3:Bb 2:3:D 1:1:F 4:3:F 3:7:D 2:6:F 1:6:Bb 4:8:Bb 3:10:F 2:11:Bb 1:10:D 4:12:D 3:15:Bb 2:15:D 1:13:F 4:15:F 3:2:A+ 2:1:C+ 3:5:C+ 1:5:A+ 4:7:A+ 2:10:A+ 1:8:C+ 4:10:C+ 3:14:A+ 2:13:C+',
	'grid-reading grid=blues-f #2: F7 | Blues F | -',
	'grid-reading grid=blues-f #3: Bb7 | Blues F | -',
	'grid-reading grid=blues-f #4: F7 | Blues F | -',
	'grid-reading grid=blues-f #5: C7 | Blues F | -',
	'grid-reading grid=blues-f #6: Bb7 | Blues F | -',
	'grid-reading grid=blues-f #7: F7 | Blues F | -',
	'grid-reading grid=blues-f #8: C7 | Blues F | -',
	'grid-reading grid=blues-f #8 aid: strings 4,3,2,1 [0-17] 3:0:G 2:1:C 1:0:E 4:2:E 3:5:C 2:5:E 1:3:G 4:5:G 3:9:E 2:8:G 1:8:C 4:10:C 3:12:G 2:13:C 1:12:E 4:14:E 3:17:C 2:17:E 1:15:G 4:17:G'
];
