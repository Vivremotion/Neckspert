import { describe, expect, it } from 'vitest';
import { gridById, gridChanges, type GridChange } from '$lib/domain/grid';
import { chordGridRules, type ChordGridItem } from '$lib/domain/mechanics';
import type { StringNumber } from '$lib/domain/music';
import type { ResponseValue } from '$lib/domain/time';
import type { LaneEntry } from '$lib/application/session/contract';
import { shapeAt, shapeId } from '$lib/testing/shapes';
import {
	chordGridPresenter,
	GESTURE_PRESENTERS,
	gridExpectation,
	type GridStageModel,
	type LinkLaneModel
} from './chordGrid';

const G_B_E: StringNumber[] = [3, 2, 1];
const D_G_B: StringNumber[] = [4, 3, 2];
const IOHEFY = gridChanges(gridById('iohefy-a'));
const LINK_D: GridChange[] = [0, 4, 8, 12, 16, 20, 24].map((at) => ({
	at,
	length: 4,
	symbol: 'D'
}));

function item(overrides: Partial<ChordGridItem>): ChordGridItem {
	return {
		rule: 'jam',
		element: 'jam:iohefy-a',
		passageId: 's:0',
		index: 0,
		changes: IOHEFY,
		symbol: 'Dm7',
		chord: 'D|min',
		sets: [G_B_E, D_G_B],
		previous: null,
		...overrides
	};
}

const link = (index: number, shape: string, previous: string | null = null) =>
	item({
		rule: 'link',
		element: 'link:D|maj:3,2,1',
		index,
		changes: LINK_D,
		symbol: 'D',
		chord: 'D|maj',
		sets: [G_B_E],
		shape,
		previous
	});

const climb = (direction: 'up' | 'down', previous: string | null, index = 0) =>
	item({
		rule: 'climb',
		element: 'climb:iohefy-a:3,2,1',
		sets: [G_B_E],
		direction,
		previous,
		index,
		symbol: IOHEFY[index].symbol
	});

const view = (frets: string, set: StringNumber[] = G_B_E) => ({
	notes: frets.split('-').map((fret, i) => ({ string: set[i], fret: Number(fret) }))
});

describe('chordGridPresenter', () => {
	it('is played on the guitar, heard by the chord sensor, contestable', () => {
		expect(chordGridPresenter).toMatchObject({
			rules: chordGridRules,
			scene: 'guitar',
			sensors: ['chord'],
			contestable: true
		});
		expect(GESTURE_PRESENTERS['chord-grid']).toBe(chordGridPresenter);
	});

	it('names the symbol, with the cue of its exercise', () => {
		const prompt = (it: ChordGridItem, locale: 'fr' | 'en' = 'fr') =>
			chordGridPresenter.prompt(it, { aid: 'none', stringAid: false }, locale, () => 0);
		expect(prompt(link(1, shapeId('D', 'maj', G_B_E, '7-7-5')))).toEqual({
			primary: 'D',
			secondary: 'fondamentale sur sol',
			detail: 'sol‑si‑mi',
			aid: null,
			diagram: null
		});
		expect(prompt(climb('down', null))).toMatchObject({
			primary: 'Dm7',
			secondary: '↓ en descendant',
			detail: 'sol‑si‑mi'
		});
		expect(prompt(item({ rule: 'zone', zone: { from: 5, to: 8 } }), 'en')).toMatchObject({
			secondary: 'frets 5 to 8'
		});
		expect(prompt(item({}))).toMatchObject({ primary: 'Dm7', secondary: '' });
		expect(
			chordGridPresenter.answerLabel(
				{ decided: shapeId('D', 'maj', G_B_E, '7-7-5') },
				link(0, ''),
				'fr',
				() => 0
			)
		).toBe('7‑7‑5');
	});

	describe('candidates', () => {
		const ids = (it: ChordGridItem) => gridExpectation(it, 3);

		it('link: the shape asked, its look-alikes near it, never the shape still ringing', () => {
			const ringing = shapeId('D', 'maj', G_B_E, '2-3-2');
			const expectation = ids(link(1, shapeId('D', 'maj', G_B_E, '7-7-5'), ringing));
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
			const expectation = ids(climb('up', ringing));
			expect(expectation.expected).toEqual([
				shapeId('D', 'min', G_B_E, '10-10-10'),
				shapeId('D', 'min', G_B_E, '14-15-13')
			]);
			expect(expectation.candidates.map((c) => c.id)).not.toContain(ringing);
		});

		it('zone: the shapes in the zone, on both sets', () => {
			const zone = item({ rule: 'zone', element: 'zone:iohefy-a', zone: { from: 5, to: 8 } });
			expect(ids(zone).expected).toEqual([
				shapeId('D', 'min', G_B_E, '7-6-5'),
				shapeId('D', 'min', D_G_B, '7-7-6')
			]);
		});

		it('jam: every shape of the chord, never the ringing one nor its twin on the other set', () => {
			const ringing = shapeId('D', 'min', G_B_E, '7-6-5');
			// The same pitches (D F A) on D-G-B: 12-10-10.
			const twin = shapeId('D', 'min', D_G_B, '12-10-10');
			const expectation = ids(item({ index: 1, symbol: 'G7', chord: 'G|maj', previous: ringing }));
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
	});

	describe('the screen model', () => {
		const stage = (
			it: ChordGridItem,
			answer: string | null = null,
			aid = 'show-position' as const
		) =>
			chordGridPresenter.stage!(
				it,
				answer === null ? null : { answer: { decided: answer }, verdict: 'perfect' },
				'fr',
				{ aid }
			).model as GridStageModel;

		it('link: the lane, the root then the way of each shape, the chord and its strings', () => {
			const model = chordGridPresenter.stage!(
				link(1, shapeId('D', 'maj', G_B_E, '7-7-5')),
				null,
				'fr',
				{ aid: 'none' }
			).model as LinkLaneModel;
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
				following: ['up', 'up', 'up', 'down', 'down', 'down'],
				changes: LINK_D,
				index: 1,
				beatsPerBar: 4,
				aid: null,
				anchorBeat: null,
				history: [],
				miss: null
			});
			const english = chordGridPresenter.stage!(link(1, ''), null, 'en', { aid: 'none' })
				.model as LinkLaneModel;
			expect(english).toMatchObject({ quality: 'major', set: 'G · B · E' });
		});

		it('link: a chained tour starts on an arrow, from the second shape', () => {
			const chained = { ...link(0, shapeId('D', 'maj', G_B_E, '7-7-5')), continued: true as const };
			const model = chordGridPresenter.stage!(
				{ ...chained, changes: LINK_D.slice(1) },
				null,
				'fr',
				{ aid: 'show-position' }
			).model as LinkLaneModel;
			expect(model.tiles).toEqual(['up', 'up', 'up', 'down', 'down', 'down']);
			expect(model.aid?.now.map((n) => n.fret)).toEqual([7, 7, 5]);
		});

		it('link: aided, the notes of the shape now and of the next one', () => {
			const model = chordGridPresenter.stage!(
				link(1, shapeId('D', 'maj', G_B_E, '7-7-5')),
				null,
				'fr',
				{ aid: 'show-position' }
			).model as LinkLaneModel;
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
			const last = chordGridPresenter.stage!(
				link(6, shapeId('D', 'maj', G_B_E, '2-3-2')),
				null,
				'fr',
				{ aid: 'show-position' }
			).model as LinkLaneModel;
			expect(last.aid?.next).toBeNull();
		});

		it('climb: the arrow, and the aid closest to the shape just heard', () => {
			const first = climb('up', null);
			expect(stage(first)).toMatchObject({
				title: 'I Only Have Eyes for You',
				index: 0,
				cue: { kind: 'climb', set: 'sol‑si‑mi', direction: 'up' }
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
			const zone = item({ rule: 'zone', element: 'zone:iohefy-a', zone: { from: 7, to: 10 } });
			expect(stage(zone)).toMatchObject({ cue: { kind: 'zone', from: 7, to: 10 } });
			expect(stage(zone).aid).toEqual(view('7-8-7'));
		});

		it('jam: the chords alone, no aid', () => {
			expect(stage(item({}))).toMatchObject({ cue: { kind: 'jam' }, aid: null });
		});
	});

	describe('on the target model', () => {
		const ringing = shapeId('D', 'maj', G_B_E, '7-7-5');
		const climbing = item({
			rule: 'climb',
			sets: [G_B_E],
			direction: 'up',
			chord: 'D|maj',
			symbol: 'D',
			previous: ringing
		});
		const higher = chordGridRules.judge(climbing, {
			decided: shapeId('D', 'maj', G_B_E, '11-10-10')
		});
		const lower = chordGridRules.judge(climbing, { decided: shapeId('D', 'maj', G_B_E, '2-3-2') });

		const valueOf = (
			verdict: ResponseValue['verdict'],
			judged: { answer: unknown; correct: boolean; confusion: unknown } | null,
			late = false
		): ResponseValue => ({
			verdict,
			timingOffsetMs: judged ? 12 : null,
			reactionMs: judged ? 400 : null,
			leadMs: 500,
			expectations: [
				{
					index: 0,
					answer: judged?.answer ?? null,
					correct: judged ? judged.correct : null,
					confusion: judged?.confusion ?? null,
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
			history: [{ beatIndex: 8, verdict: 'perfect' }] as readonly LaneEntry[]
		};
		/** What the model keeps of its place: the target and the history. */
		const placed = { anchorBeat: place.anchorBeat, history: place.history };

		it('draws the change and its verdict from a response value', () => {
			expect(lower.confusion).not.toBeNull();
			const items = [climbing, link(1, shapeId('D', 'maj', G_B_E, '7-7-5'))];
			for (const it of items) {
				for (const aid of ['none', 'show-position'] as const) {
					const before = chordGridPresenter.stageOf!(
						it,
						null,
						'fr',
						{ aid, stringAid: false },
						place,
						undefined,
						() => 0
					);
					expect(before.model).toEqual({
						...(chordGridPresenter.stage!(it, null, 'fr', { aid }).model as object),
						...placed,
						miss: null
					});
					for (const settled of cases) {
						const { answer } = settled.value.expectations[0];
						const old = chordGridPresenter.stage!(
							it,
							{ answer, verdict: settled.value.verdict },
							'fr',
							{ aid }
						).model;
						// The drawn miss is the target model's own (the old frame drew it apart).
						const model = chordGridPresenter.stageOf!(
							it,
							settled,
							'fr',
							{ aid, stringAid: false },
							place,
							undefined,
							() => 0
						).model as GridStageModel;
						// Drawn after a wrong chord or none, as the old verdict: an offbeat played the right one.
						expect(model.miss !== null).toBe(settled.value.verdict === 'wrong');
						expect(model).toEqual({ ...(old as object), ...placed, miss: model.miss });
					}
				}
			}
		});

		it('draws a miss as the old verdict did: heard, expected and gap, in the style given', () => {
			const jam = item({});
			const wrong = chordGridRules.judge(jam, { decided: shapeId('G', 'maj', G_B_E, '7-8-7') });
			const right = chordGridRules.judge(jam, { decided: shapeId('D', 'min', G_B_E, '7-6-5') });
			const missed = { value: valueOf('wrong', wrong), success: false };
			const played = { value: valueOf('perfect', right), success: true };
			const drawing = { chordDiagram: 'grid' as const };
			const stageOf = (settled: typeof missed | null) =>
				chordGridPresenter.stageOf!(
					jam,
					settled,
					'fr',
					{ aid: 'none', stringAid: false },
					place,
					drawing,
					() => 0
				).model as GridStageModel;
			const feedback = chordGridPresenter.feedback!(
				jam,
				{ answer: wrong.answer, confusion: wrong.confusion, verdict: 'wrong' },
				'fr'
			);
			expect(feedback?.heard).toBeTruthy();
			expect(feedback?.expected).toBeTruthy();
			expect(feedback?.gap).toBeTruthy();
			expect(stageOf(missed).miss).toEqual({ ...feedback, style: 'grid' });
			expect(stageOf(played).miss).toBeNull();
			expect(stageOf(null).miss).toBeNull();
			// The link draws it the same way.
			const linked = chordGridPresenter.stageOf!(
				link(0, shapeId('D', 'maj', G_B_E, '2-3-2')),
				{ value: valueOf('wrong', null), success: false },
				'fr',
				{ aid: 'none', stringAid: false },
				place,
				undefined,
				() => 0
			).model as LinkLaneModel;
			expect(linked.miss).toMatchObject({ heard: null, style: 'strings' });
		});

		it('keeps the attempt data a gesture attempt has today', () => {
			const today = (judged: { answer: unknown; confusion: unknown } | null) => ({
				item: climbing,
				answer: judged?.answer ?? null,
				confusion: judged?.confusion ?? null
			});
			expect(chordGridPresenter.attemptData!(climbing, cases[0].value)).toEqual(today(higher));
			expect(chordGridPresenter.attemptData!(climbing, cases[1].value)).toEqual(today(lower));
			expect(chordGridPresenter.attemptData!(climbing, cases[3].value)).toEqual(today(null));
		});

		it('leaves the place empty on the old path', () => {
			expect(chordGridPresenter.stage!(climbing, null, 'fr', { aid: 'none' }).model).toMatchObject({
				anchorBeat: null,
				history: []
			});
			expect(
				chordGridPresenter.stage!(link(0, ringing), null, 'fr', { aid: 'none' }).model
			).toMatchObject({ anchorBeat: null, history: [] });
		});
	});

	it('draws the shape heard and the closest admitted after a shape that does not climb', () => {
		const ringing = shapeId('D', 'maj', G_B_E, '7-7-5');
		const asked = item({
			rule: 'climb',
			sets: [G_B_E],
			direction: 'up',
			chord: 'D|maj',
			symbol: 'D',
			previous: ringing
		});
		const heard = shapeId('D', 'maj', G_B_E, '2-3-2');
		const judged = chordGridRules.judge(asked, { decided: heard });
		expect(judged.confusion?.kind).toBe('not-higher');
		expect(
			chordGridPresenter.feedback!(
				asked,
				{ answer: judged.answer, confusion: judged.confusion, verdict: 'wrong' },
				'fr'
			)
		).toEqual({ heard: view('2-3-2'), expected: view('11-10-10'), gap: 'pas plus haut' });
		expect(
			chordGridPresenter.feedback!(asked, { answer: null, confusion: null, verdict: 'wrong' }, 'en')
		).toMatchObject({ heard: null, gap: 'no chord heard' });
		expect(
			chordGridPresenter.feedback!(
				asked,
				{ answer: judged.answer, confusion: null, verdict: 'perfect' },
				'fr'
			)
		).toBeNull();
		expect(shapeAt('D', 'maj', G_B_E, '2-3-2').notes).toHaveLength(3);
	});
});
