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
import { changePresenter, linkPresenter, VIEW_PRESENTERS } from './chordGrid';
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
});
