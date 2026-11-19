import { describe, expect, it } from 'vitest';
import type { ChordExpectation } from '$lib/application/ports';
import { passageIndices, passageMembers } from '$lib/domain/exercise/passage/indices';
import { passageRound } from '$lib/domain/exercise/passage/round';
import { compileRound } from '$lib/domain/exercise/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { passageDerivation } from '$lib/domain/families';
import type { ChordGridConfusion } from '$lib/domain/families/guitar/chordShapes';
import { contentJudges } from '$lib/domain/judges';
import type { StringNumber } from '$lib/domain/music';
import { changeSet, placedVoicingSet, type ChangeItem } from '$lib/domain/sets';
import { METER_4_4, type ResponseValue } from '$lib/domain/time';
import { DEFAULT_SETTINGS, type PlannedItem } from '$lib/domain/types';
import type { LaneEntry } from '$lib/application/session/contract';
import { GESTURE_CLIMB, GESTURE_JAM, GESTURE_LINK, GESTURE_ZONE } from '$lib/testing/catalog';
import { shapeAt, shapeId } from '$lib/testing/shapes';
import type { PresentedRound, StagePlace } from './types';
import {
	changePresenter,
	linkPresenter,
	VIEW_PRESENTERS,
	type GridStageModel,
	type LinkLaneModel
} from './chordGrid';
import { SET_PRESENTERS } from './index';

const G_B_E: StringNumber[] = [3, 2, 1];
const D_G_B: StringNumber[] = [4, 3, 2];

/** A round of a passage of `definition`, as the passage source serves it, `previous` heard before. */
function served(
	definition: ExerciseDefinition,
	key: string,
	rank: number,
	each: Record<string, unknown> = {},
	previous: string | null = null
): { planned: PlannedItem; round: PresentedRound } {
	const index = passageIndices(definition).find((found) => found.key === key)!;
	const derivation = passageDerivation(definition.passages!.members.family)!;
	const items = passageMembers(definition, index, each).map((member) => derivation.itemOf(member));
	const base = passageRound(definition, index, each, items[rank], rank, items.length);
	const planned = { ...base, passage: { ...base.passage, id: 's:0', previous, items } };
	const plan = compileRound(definition, planned, METER_4_4, {
		previewBeats: 0,
		fromRunStart: null
	});
	return { planned, round: { passage: planned.passage, expectations: plan.expectations } };
}

const link = (rank: number, previous: string | null = null) =>
	served(GESTURE_LINK, 'chord=D;strings=3,2,1', rank, {}, previous);
const climb = (direction: 'up' | 'down', previous: string | null, rank = 0) =>
	served(GESTURE_CLIMB, 'grid=iohefy-a;strings=3,2,1', rank, { direction }, previous);
const zone = (frets: [number, number], rank = 0) =>
	served(GESTURE_ZONE, 'grid=iohefy-a', rank, { zone: frets });
const jam = (rank = 0, previous: string | null = null) =>
	served(GESTURE_JAM, 'grid=iohefy-a', rank, {}, previous);

/** A shape judged as the round judges it: by its member content. */
function judged({ round }: { round: PresentedRound }, decided: string | null) {
	const { content } = round.expectations[0];
	return contentJudges(content!.kind).judge(content!.value, { decided }) as {
		correct: boolean;
		answer: { decided: string | null };
		confusion: ChordGridConfusion | null;
	};
}

const view = (frets: string, set: StringNumber[] = G_B_E) => ({
	notes: frets.split('-').map((fret, i) => ({ string: set[i], fret: Number(fret) }))
});

/** The chord sensor's expectation of a round, opening at 3 s. */
function told({ planned, round }: { planned: PlannedItem; round: PresentedRound }) {
	const presenter = planned.exerciseId === GESTURE_LINK.id ? linkPresenter : changePresenter;
	return presenter.expectation!(planned.item as never, { ...round, opensAt: 3, previous: null })
		.chord as ChordExpectation;
}

describe('the presenters of the changes', () => {
	it('are played on the guitar, heard by the chord sensor, contestable', () => {
		expect(changePresenter).toMatchObject({
			set: changeSet,
			scene: 'guitar',
			sensors: ['chord'],
			contestable: true
		});
		expect(linkPresenter).toMatchObject({ set: placedVoicingSet, sensors: ['chord'] });
		// A grid's change is found by its set; the link's shape by its view, its set having another.
		expect(SET_PRESENTERS.change).toBe(changePresenter);
		expect(VIEW_PRESENTERS).toEqual({ 'link-lane': linkPresenter });
	});

	describe('candidates', () => {
		it('link: the shape asked, its look-alikes near it, never the shape still ringing', () => {
			const ringing = shapeId('D', 'maj', G_B_E, '2-3-2');
			const expectation = told(link(1, ringing));
			expect(expectation).toMatchObject({
				opensAt: 3,
				expected: [shapeId('D', 'maj', G_B_E, '7-7-5')],
				style: 'unknown'
			});
			const candidates = expectation.candidates.map((c) => c.id);
			expect(candidates).not.toContain(ringing);
			expect(candidates).toContain(shapeId('D', 'min', G_B_E, '7-6-5'));
			// 14-15-14 is beyond NEIGHBOUR_FRETS of 5 to 7.
			expect(candidates).not.toContain(shapeId('D', 'maj', G_B_E, '14-15-14'));
		});

		it('climb: the shapes above the one heard before, which is not one', () => {
			const ringing = shapeId('D', 'min', G_B_E, '7-6-5');
			const expectation = told(climb('up', ringing));
			expect(expectation.expected).toEqual([
				shapeId('D', 'min', G_B_E, '10-10-10'),
				shapeId('D', 'min', G_B_E, '14-15-13')
			]);
			expect(expectation.candidates.map((c) => c.id)).not.toContain(ringing);
		});

		it('zone: the shapes in the zone, on both groups', () => {
			expect(told(zone([5, 9])).expected).toEqual([
				shapeId('D', 'min', G_B_E, '7-6-5'),
				shapeId('D', 'min', D_G_B, '7-7-6')
			]);
		});

		it('jam: every shape of the chord, never the ringing one nor its twin on the other group', () => {
			const ringing = shapeId('D', 'min', G_B_E, '7-6-5');
			// The same pitches (D F A) on D-G-B: 12-10-10.
			const twin = shapeId('D', 'min', D_G_B, '12-10-10');
			const expectation = told(jam(1, ringing));
			// G: four shapes on G-B-E, five on D-G-B (0-0-0 among them).
			expect(expectation.expected).toHaveLength(9);
			const candidates = expectation.candidates.map((c) => c.id);
			expect(candidates).not.toContain(ringing);
			expect(candidates).not.toContain(twin);
			expect(candidates).toContain(shapeId('D', 'min', G_B_E, '10-10-10'));
			expect(
				expectation.candidates.find((c) => c.id === shapeId('C', 'maj', G_B_E, '5-5-3'))?.kind
			).toBe('other-chord');
		});

		it('tells nothing for a round with no chord shapes', () => {
			const { planned } = jam();
			expect(
				changePresenter.expectation!(planned.item as ChangeItem, {
					opensAt: 3,
					previous: null,
					expectations: []
				})
			).toEqual({});
		});
	});

	describe('the screen model', () => {
		/** Not placed yet: waiting for its round. */
		const UNPLACED = { anchorBeat: null, promptBeat: null, history: [], bands: [] };
		/**
		 * The model of a round, settled on the shape `answer` when given, played at a level that
		 * writes `shapes` (its aid) or not.
		 */
		const modelOf = (
			{ planned, round }: { planned: PlannedItem; round: PresentedRound },
			answer: string | null = null,
			shapes = true,
			locale: 'fr' | 'en' = 'fr'
		) =>
			(planned.exerciseId === GESTURE_LINK.id ? linkPresenter : changePresenter).stageOf(
				planned.item as never,
				answer === null
					? null
					: {
							value: {
								verdict: 'perfect',
								timingOffsetMs: 0,
								reactionMs: 400,
								leadMs: 500,
								expectations: [
									{
										index: 0,
										answer: { decided: answer },
										correct: true,
										confusion: null,
										correction: null,
										late: false
									}
								]
							},
							success: true
						},
				locale,
				{ aid: 'none', stringAid: false },
				UNPLACED,
				undefined,
				() => 0,
				{ ...round, params: { shapes } }
			).model;
		const stage = (served: { planned: PlannedItem; round: PresentedRound }, answer?: string) =>
			modelOf(served, answer ?? null) as GridStageModel;

		it('link: the lane, the root then the way of each shape, the chord and its strings', () => {
			const model = modelOf(link(1), null, false) as LinkLaneModel;
			expect(model).toEqual({
				kind: 'link-lane',
				root: 'D',
				quality: 'majeur',
				set: 'sol · si · mi',
				strings: [
					{ string: 3, name: 'sol' },
					{ string: 2, name: 'si' },
					{ string: 1, name: 'mi' }
				],
				tiles: ['root', 'up', 'up', 'up', 'down', 'down', 'down'],
				// A tour no longer chains to the next: nothing is drawn after its last bar.
				following: [],
				changes: [0, 4, 8, 12, 16, 20, 24].map((at) => ({ at, length: 4, symbol: 'D' })),
				index: 1,
				beatsPerBar: 4,
				aid: null,
				anchorBeat: null,
				history: [],
				miss: null
			});
			const english = modelOf(link(1), null, false, 'en') as LinkLaneModel;
			expect(english).toMatchObject({ quality: 'major', set: 'G · B · E' });
		});

		it('link: refuses to draw a shape whose passage does not tell its tour', () => {
			const { planned, round } = link(1);
			const { items: _items, ...untold } = round.passage!;
			expect(() =>
				linkPresenter.stageOf(
					planned.item as never,
					null,
					'fr',
					{ aid: 'none', stringAid: false },
					UNPLACED,
					undefined,
					() => 0,
					{ ...round, passage: untold }
				)
			).toThrow(/a link's shape is drawn in its tour/);
		});

		it('link: aided, the notes of the shape now and of the next one', () => {
			const model = modelOf(link(1)) as LinkLaneModel;
			expect(model.aid).toEqual({
				now: [
					{ string: 3, fret: 7, name: 'D' },
					{ string: 2, fret: 7, name: 'F#' },
					{ string: 1, fret: 5, name: 'A' }
				],
				next: [
					{ string: 3, fret: 11, name: 'F#' },
					{ string: 2, fret: 10, name: 'A' },
					{ string: 1, fret: 10, name: 'D' }
				]
			});
			const last = modelOf(link(6)) as LinkLaneModel;
			expect(last.aid?.next).toBeNull();
		});

		it('climb: the arrow, and the aid closest to the shape just heard', () => {
			const first = climb('up', null);
			expect(stage(first)).toMatchObject({
				title: 'I Only Have Eyes for You',
				index: 0,
				cue: { kind: 'climb', set: 'sol‑si‑mi', direction: 'up' },
				// The player's style when the exercise and the settings say none.
				chordDiagram: DEFAULT_SETTINGS.chordDiagram
			});
			// Before an answer, G from the bottom; once Dm 7-6-5 is heard, the G just above it.
			expect(stage(first).aid).toEqual(view('4-3-3'));
			expect(stage(first, shapeId('D', 'min', G_B_E, '7-6-5')).aid).toEqual(view('7-8-7'));
		});

		it('climb: the aid turns with the climb where the neck runs out', () => {
			// Em 16-17-15 heard going up: no Ebm above it, so the climb turns down to 15-16-14.
			const em = climb('up', shapeId('G', 'maj', G_B_E, '12-12-10'), 6);
			expect(stage(em, shapeId('E', 'min', G_B_E, '16-17-15')).aid).toEqual(view('15-16-14'));
		});

		it('zone: the frets, and the lowest shape of the next chord in them', () => {
			const inZone = zone([7, 11]);
			expect(stage(inZone)).toMatchObject({ cue: { kind: 'zone', from: 7, to: 11 } });
			expect(stage(inZone).aid).toEqual(view('7-8-7'));
		});

		it('jam: the chords alone, no aid', () => {
			expect(stage(jam())).toMatchObject({ cue: { kind: 'jam' }, aid: null });
		});

		it('draws its aid only at a level that writes shapes, whatever the item says', () => {
			const linkAid = {
				now: [
					{ string: 3, fret: 7, name: 'D' },
					{ string: 2, fret: 7, name: 'F#' },
					{ string: 1, fret: 5, name: 'A' }
				],
				next: [
					{ string: 3, fret: 11, name: 'F#' },
					{ string: 2, fret: 10, name: 'A' },
					{ string: 1, fret: 10, name: 'D' }
				]
			};
			const cases = [
				[link(1), linkAid],
				[climb('up', null), view('4-3-3')],
				[zone([7, 11]), view('7-8-7')]
			] as const;
			for (const [served, aid] of cases) {
				expect(modelOf(served, null, true)).toMatchObject({ aid });
				expect(modelOf(served, null, false)).toMatchObject({ aid: null });
				// The item's aid draws nothing: only the level's params do.
				const presenter =
					served.planned.exerciseId === GESTURE_LINK.id ? linkPresenter : changePresenter;
				for (const params of [undefined, {}, { shapes: 'yes' }]) {
					const model = presenter.stageOf(
						served.planned.item as never,
						null,
						'fr',
						{ aid: 'show-position', stringAid: false },
						UNPLACED,
						undefined,
						() => 0,
						{ ...served.round, ...(params && { params }) }
					).model as { aid: unknown };
					expect(model.aid).toBeNull();
				}
			}
		});
	});

	describe('on the target model', () => {
		const ringing = shapeId('D', 'maj', G_B_E, '7-7-5');
		// iohefy-a has no D major: the climb is asked on the blues' F after a ringing D.
		const climbing = served(
			GESTURE_CLIMB,
			'grid=blues-f;strings=3,2,1',
			0,
			{ direction: 'up' },
			ringing
		);
		const higher = judged(climbing, shapeId('F', 'maj', G_B_E, '10-10-8'));
		const lower = judged(climbing, shapeId('F', 'maj', G_B_E, '2-1-1'));

		const valueOf = (
			verdict: ResponseValue['verdict'],
			result: { answer: unknown; correct: boolean; confusion: unknown } | null,
			late = false
		): ResponseValue => ({
			verdict,
			timingOffsetMs: result ? 12 : null,
			reactionMs: result ? 400 : null,
			leadMs: 500,
			expectations: [
				{
					index: 0,
					answer: result?.answer ?? null,
					correct: result ? result.correct : null,
					confusion: result?.confusion ?? null,
					correction: null,
					late
				}
			]
		});

		/** Right, wrong with a confusion, offbeat, unanswered. */
		const cases = [
			{ value: valueOf('perfect', higher), success: true },
			{ value: valueOf('wrong', lower), success: false },
			{ value: valueOf('offbeat', higher, true), success: false },
			{ value: valueOf('wrong', null), success: false }
		];
		const place = {
			anchorBeat: 12,
			promptBeat: 11,
			history: [{ beatIndex: 8, verdict: 'perfect' }] as readonly LaneEntry[],
			bands: []
		};
		/** What the model keeps of its place: the target and the history. */
		const placed = { anchorBeat: place.anchorBeat, history: place.history };

		it('places the change where the series says, and draws a miss after a wrong chord or none only', () => {
			expect(higher.correct).toBe(true);
			expect(lower.confusion).toEqual({ kind: 'not-higher', part: 'chord' });
			const unplaced: StagePlace = { anchorBeat: null, promptBeat: null, history: [], bands: [] };
			for (const each of [climbing, link(1)]) {
				const presenter =
					each.planned.exerciseId === GESTURE_LINK.id ? linkPresenter : changePresenter;
				for (const shapes of [false, true]) {
					const modelOf = (settled: (typeof cases)[number] | null, at: StagePlace = place) =>
						presenter.stageOf(
							each.planned.item as never,
							settled,
							'fr',
							{ aid: 'none', stringAid: false },
							at,
							undefined,
							() => 0,
							{ ...each.round, params: { shapes } }
						).model as GridStageModel;
					expect(modelOf(null)).toEqual({ ...modelOf(null, unplaced), ...placed });
					expect(modelOf(null, unplaced)).toMatchObject({ anchorBeat: null, history: [] });
					for (const settled of cases) {
						const model = modelOf(settled);
						// Drawn after a wrong chord or none: an offbeat played the right one.
						expect(model.miss !== null).toBe(settled.value.verdict === 'wrong');
						expect(model).toMatchObject(placed);
					}
				}
			}
		});

		it('draws a miss as the old verdict did: heard, expected and gap, in the style given', () => {
			const asked = jam();
			const wrong = judged(asked, shapeId('G', 'maj', G_B_E, '7-8-7'));
			const right = judged(asked, shapeId('D', 'min', G_B_E, '7-6-5'));
			const missed = { value: valueOf('wrong', wrong), success: false };
			const played = { value: valueOf('perfect', right), success: true };
			const drawing = { chordDiagram: 'grid' as const };
			const stageOf = (settled: typeof missed | null) =>
				changePresenter.stageOf!(
					asked.planned.item as ChangeItem,
					settled,
					'fr',
					{ aid: 'none', stringAid: false },
					place,
					drawing,
					() => 0,
					asked.round
				).model as GridStageModel;
			const feedback = changePresenter.feedback!(
				asked.planned.item as ChangeItem,
				{ answer: wrong.answer, confusion: wrong.confusion, verdict: 'wrong' },
				'fr',
				asked.round
			);
			expect(feedback?.heard).toBeTruthy();
			expect(feedback?.expected).toBeTruthy();
			expect(feedback?.gap).toBeTruthy();
			expect(stageOf(missed).miss).toEqual({ ...feedback, style: 'grid' });
			expect(stageOf(played).miss).toBeNull();
			expect(stageOf(null).miss).toBeNull();
			// The link draws it the same way.
			const linked = link(0);
			const lane = linkPresenter.stageOf!(
				linked.planned.item as never,
				{ value: valueOf('wrong', null), success: false },
				'fr',
				{ aid: 'none', stringAid: false },
				place,
				undefined,
				() => 0,
				linked.round
			).model as LinkLaneModel;
			expect(lane.miss).toMatchObject({ heard: null, style: 'strings' });
		});

		it('keeps an attempt’s item, its passage, the shape heard and what went wrong', () => {
			const { planned, round } = climbing;
			const data = (result: { answer: unknown; confusion: unknown } | null) => ({
				item: { grid: 'blues-f', index: 0 },
				passage: {
					id: 's:0',
					index: 'grid=blues-f;strings=3,2,1',
					rank: 0,
					each: { direction: 'up' }
				},
				answer: result?.answer ?? null,
				confusion: result?.confusion ?? null
			});
			const item = planned.item as ChangeItem;
			expect(changePresenter.attemptData!(item, cases[0].value, round)).toEqual(data(higher));
			expect(changePresenter.attemptData!(item, cases[1].value, round)).toEqual(data(lower));
			expect(changePresenter.attemptData!(item, cases[3].value, round)).toEqual(data(null));
			// Outside a passage, none.
			expect(changePresenter.attemptData!(item, cases[3].value)).toMatchObject({ passage: null });
		});
	});

	it('draws the shape heard and the closest admitted after a shape that does not climb', () => {
		const ringing = shapeId('F', 'maj', G_B_E, '5-6-5');
		const asked = served(
			GESTURE_CLIMB,
			'grid=blues-f;strings=3,2,1',
			0,
			{ direction: 'up' },
			ringing
		);
		const heard = shapeId('F', 'maj', G_B_E, '2-1-1');
		const result = judged(asked, heard);
		expect(result.confusion?.kind).toBe('not-higher');
		const item = asked.planned.item as ChangeItem;
		expect(
			changePresenter.feedback!(
				item,
				{ answer: result.answer, confusion: result.confusion, verdict: 'wrong' },
				'fr',
				asked.round
			)
		).toEqual({ heard: view('2-1-1'), expected: view('10-10-8'), gap: 'pas plus haut' });
		expect(
			changePresenter.feedback!(
				item,
				{ answer: null, confusion: null, verdict: 'wrong' },
				'en',
				asked.round
			)
		).toMatchObject({ heard: null, gap: 'no chord heard' });
		expect(
			changePresenter.feedback!(
				item,
				{ answer: result.answer, confusion: null, verdict: 'perfect' },
				'fr',
				asked.round
			)
		).toBeNull();
		expect(shapeAt('F', 'maj', G_B_E, '2-1-1').notes).toHaveLength(3);
	});

	it('tells a miss whose confusion says nothing without a gap, and without throwing', () => {
		const asked = jam();
		const heard = shapeId('D', 'min', G_B_E, '7-6-5');
		const item = asked.planned.item as ChangeItem;
		expect(
			changePresenter.feedback!(
				item,
				{ answer: { decided: heard }, confusion: null, verdict: 'wrong' },
				'fr',
				asked.round
			)
		).toEqual({ heard: view('7-6-5'), expected: view('7-6-5'), gap: null });
		// Nothing compiled to read: no shape due.
		expect(
			changePresenter.feedback!(
				item,
				{ answer: { decided: heard }, confusion: { kind: 'unknown' }, verdict: 'wrong' },
				'fr'
			)
		).toEqual({ heard: view('7-6-5'), expected: null, gap: null });
	});
});
