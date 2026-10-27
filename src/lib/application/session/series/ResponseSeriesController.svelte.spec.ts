import { describe, expect, it, vi } from 'vitest';
import {
	CONTENT_DERIVATIONS,
	ITEM_NUMBERS,
	type ContentDerivation,
	type ItemNumber
} from '$lib/domain/derivations';
import { exerciseById, LOCATE_NECK } from '$lib/domain/exercise';
import type { RoundTemplate } from '$lib/domain/exercise/round';
import { NAME_CONTENT, NOTE_CONTENT } from '$lib/domain/judges';
import { acceptableMidis } from '$lib/domain/music';
import { GESTURE_EXERCISES } from '$lib/domain/gesture';
import { triadShapes, type ChordGridItem } from '$lib/domain/mechanics';
import { createGestureSelector } from '$lib/domain/progress';
import { SESSION_MS } from '$lib/domain/session';
import { Fraction, type LevelState, type Meter } from '$lib/domain/time';
import { occurrenceId } from '$lib/domain/triads';
import type { Attempt, LeadBeats, PlannedItem } from '$lib/domain/types';
import { triadCards } from '$lib/testing/shapes';
import { GESTURE_PRESENTERS } from '$lib/application/mechanics/chordGrid';
import type { MechanicPresenter, StagePlace } from '$lib/application/mechanics/types';
import type { Observation, SensorFactory } from '../sensors';
import {
	G_B_E,
	type Ctx,
	ScriptedSource,
	change,
	clicksBetween,
	drain,
	expectationsAsked,
	gestureSeries as setup,
	model,
	passage,
	rightShape,
	roles
} from '$lib/testing/gestureSeries';

/** The gesture's exercises as the catalog writes them, their round edited. */
const withRound = (edit: (round: RoundTemplate) => RoundTemplate) => (id: string) => {
	const definition = exerciseById(id);
	return { ...definition, round: edit(definition.round as RoundTemplate) };
};
/** Listening ends at 3.5 beats; nothing hands over. */
const withoutHandover = withRound((round) => {
	const edited: RoundTemplate = { ...round, listenBeforeEnd: { beats: 0.5 } };
	delete edited.handover;
	return edited;
});

describe('ResponseSeriesController', () => {
	describe('start', () => {
		it('tells the first exercise’s instruction on the start screen, before any sound', async () => {
			const ctx = setup(passage());
			await ctx.controller.ready();
			expect(ctx.controller.view.status).toBe('idle');
			expect(ctx.controller.view.briefing?.text).toMatch(/grille/);
			expect(ctx.sounds.emitted()).toEqual([]);
			expect(ctx.prepared).toEqual(['series-1']);
		});

		it('counts a bar at the first tempo, then opens the first change a beat before its target on the next 1', async () => {
			const ctx = setup(passage());
			await ctx.controller.ready();
			await ctx.controller.start();
			// Prepared once: start takes what ready prepared, its instruction already told.
			expect(ctx.prepared).toEqual(['series-1']);
			expect(ctx.controller.view.briefing).toBeNull();
			expect(ctx.controller.view.status).toBe('count-in');
			expect(ctx.controller.view.tempoBpm).toBe(120);
			// The counted bar: four clicks on bar 0.
			expect(clicksBetween(ctx, 0, ctx.bar(1))).toEqual([0.1, 0.6, 1.1, 1.6]);
			ctx.runTo(ctx.bar(0.75) - 0.01);
			expect(expectationsAsked(ctx)).toEqual([]);
			// Waiting for its round, the change is not placed yet: the view places it on the count.
			expect(model(ctx)).toMatchObject({ index: 0, anchorBeat: null });
			ctx.runTo(ctx.bar(0.75));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(expectationsAsked(ctx)).toHaveLength(1);
			expect(model(ctx).anchorBeat).toBe(4);
			expect(model(ctx).index).toBe(0);
			// The change is heard on its target.
			ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
			const [attempt] = await ctx.stored();
			expect(attempt.success).toBe(true);
			expect(attempt.tempoBpm).toBe(120);
		});
	});

	describe('chaining', () => {
		it('opens the next change of a passage at the handover, without a gap or a counted bar', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(2) - 0.21);
			expect(expectationsAsked(ctx)).toHaveLength(1);
			ctx.runTo(ctx.bar(2) - 0.2);
			// Withdrawn, then the next change asked at once.
			expect(ctx.verifier.expectations.slice(-2)).toEqual([null, expect.anything()]);
			expect(model(ctx).index).toBe(1);
			expect(model(ctx).anchorBeat).toBe(8);
			expect(ctx.controller.view.countdown).toBeNull();
			// The click goes on: bar 1 clicked, then bar 2.
			expect(clicksBetween(ctx, ctx.bar(1), ctx.bar(3))).toEqual([
				2.1, 2.6, 3.1, 3.6, 4.1, 4.6, 5.1, 5.6
			]);
		});

		it('counts a bar after a passage, in silence first when the next one asks for rest bars', async () => {
			const ctx = setup([...passage(), ...passage({ passage: 's:1', restBars: 1 })]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) - 0.2);
			expect(ctx.controller.view.status).toBe('count-in');
			// Bar 3 silent, bar 4 counted, the next passage's first change on bar 5.
			expect(clicksBetween(ctx, ctx.bar(3), ctx.bar(4))).toEqual([]);
			expect(clicksBetween(ctx, ctx.bar(4), ctx.bar(5))).toEqual([8.1, 8.6, 9.1, 9.6]);
			ctx.runTo(ctx.bar(4.75));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(model(ctx).anchorBeat).toBe(20);
		});

		it('places the next round after its breath when a round has no handover, without a counted bar, on the first bar whose prompt is still to come', async () => {
			const ctx = setup(passage(), { exercise: withoutHandover });
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1.875));
			// Settled at its end of listening: its verdict stays, nothing is counted.
			expect(ctx.controller.view.status).toBe('verdict');
			expect(await ctx.stored()).toHaveLength(1);
			// Its end is bar 2, but the prompt a beat before it is past: the second change on bar 3,
			// bar 2 clicked as the click goes on.
			expect(clicksBetween(ctx, ctx.bar(2), ctx.bar(3))).toEqual([4.1, 4.6, 5.1, 5.6]);
			ctx.runTo(ctx.bar(2) + 0.01);
			expect(ctx.controller.view.countdown).toBeNull();
			ctx.runTo(ctx.bar(2.75));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(model(ctx).anchorBeat).toBe(12);
		});

		it('moves a round counted to its target to the next bar when its prompt would come before now', async () => {
			// A lead of two bars, the count ending on the target: on the bar after the count, its
			// prompt would be a bar before the count began.
			const exercise = withRound((round) => ({ ...round, prompt: { lead: 8 } }));
			const ctx = setup(passage(), { exercise });
			await ctx.controller.start();
			expect(clicksBetween(ctx, 0, ctx.bar(1))).toEqual([0.1, 0.6, 1.1, 1.6]);
			ctx.runTo(ctx.bar(0) + 0.01);
			// Its prompt on the counted bar, its target on bar 2.
			expect(expectationsAsked(ctx)).toHaveLength(1);
			expect(model(ctx).anchorBeat).toBe(8);
			ctx.play(ctx.bar(2) + 0.02, rightShape(change(0)));
			const [attempt] = await ctx.stored();
			expect(attempt.success).toBe(true);
		});
	});

	describe('tempo scopes', () => {
		it('plays each passage at its scope’s tempo, changing tempo after a counted bar (ballad then blues then ballad)', async () => {
			const ctx = setup([
				...passage(),
				...passage({ passage: 's:1', scope: 'blues-f' }),
				...passage({ passage: 's:2' })
			]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) - 0.19);
			expect(ctx.controller.view.tempoBpm).toBe(60);
			// At ♩ = 60 from bar 3 (6.1 s): the counted bar lasts 4 s, its clicks a second apart.
			expect(clicksBetween(ctx, ctx.bar(3), 10.1)).toEqual([6.1, 7.1, 8.1, 9.1]);
			// The blues' first change falls on 10.1 s, its prompt a beat (1 s) before.
			ctx.runTo(9.1);
			expect(ctx.controller.view.status).toBe('awaiting');
			ctx.runTo(10.13);
			ctx.play(10.12, rightShape(change(0)));
			// Two bars at ♩ = 60 (8 s), then the ballad again at ♩ = 120 after a counted bar.
			ctx.runTo(18.1 - 0.19);
			expect(ctx.controller.view.tempoBpm).toBe(120);
			expect(clicksBetween(ctx, 18.1, 20.1)).toEqual([18.1, 18.6, 19.1, 19.6]);
			ctx.runTo(20.1 + 0.03);
			ctx.play(20.12, rightShape(change(0)));
			const attempts = await ctx.stored();
			expect(attempts.map((a) => [a.tempoBpm, a.scope, a.success])).toEqual([
				[120, 'iohefy-a', false],
				[120, 'iohefy-a', false],
				[60, 'blues-f', true],
				[60, 'blues-f', false],
				[120, 'iohefy-a', true]
			]);
		});
	});

	describe('instruction', () => {
		it('stops before the first passage of another exercise: nothing plays until resume, which counts a bar at its tempo', async () => {
			const ctx = setup([...passage(), ...passage({ passage: 's:1', exerciseId: 'gesture-zone' })]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) - 0.2);
			expect(ctx.controller.view.status).toBe('paused');
			expect(ctx.controller.view.briefing?.text).toMatch(/zone/);
			expect(ctx.controller.view.countdown).toBeNull();
			// Nothing scheduled, nothing to wake: the screen may stay on the instruction for ever.
			const before = ctx.sounds.emitted().length;
			ctx.runTo(30);
			expect(ctx.sounds.emitted()).toHaveLength(before);
			expect(ctx.controller.view.status).toBe('paused');
			ctx.controller.resume();
			await drain();
			expect(ctx.controller.view.briefing).toBeNull();
			expect(ctx.controller.view.tempoBpm).toBe(60);
			// A fresh map from 30.1 s at ♩ = 60: the counted bar, then the change on 34.1 s.
			expect(clicksBetween(ctx, 30, 34.1)).toEqual([30.1, 31.1, 32.1, 33.1]);
			ctx.runTo(33.11);
			expect(ctx.controller.view.status).toBe('awaiting');
			expect((model(ctx) as unknown as { cue: { kind: string } }).cue.kind).toBe('jam');
		});
	});

	describe('pause', () => {
		it('mid-passage: cancels the handover, drops a round that heard nothing, and resumes on the next change after a counted bar', async () => {
			const ctx = setup([...passage(), ...passage({ passage: 's:1' })]);
			await ctx.controller.start();
			// Inside the first change's prompt beat, before its window opens.
			ctx.runTo(ctx.bar(0.8));
			ctx.controller.pause();
			expect(ctx.controller.view.status).toBe('paused');
			expect(ctx.verifier.expectations.at(-1)).toBeNull();
			const asked = expectationsAsked(ctx).length;
			ctx.runTo(10);
			// No handover, no other change.
			expect(expectationsAsked(ctx)).toHaveLength(asked);
			expect(await ctx.stored()).toEqual([]);
			ctx.controller.resume();
			await drain();
			expect(ctx.controller.view.status).toBe('count-in');
			// From 10.1 s: the counted bar, then the passage's second change on 12.1 s.
			expect(clicksBetween(ctx, 10, 12.1)).toEqual([10.1, 10.6, 11.1, 11.6]);
			ctx.runTo(11.61);
			expect(model(ctx).index).toBe(1);
			expect(ctx.controller.view.status).toBe('awaiting');
		});

		it('settles a round that heard an answer when paused, and closes its span', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.5);
			// Another chord than the one asked.
			ctx.play(ctx.bar(1) + 0.02, occurrenceId(triadShapes(change(1).item as ChordGridItem)[0]));
			ctx.controller.pause();
			await drain();
			const [attempt] = await ctx.stored();
			expect(attempt.success).toBe(false);
			expect(attempt.correct).toBe(false);
			expect(attempt.observations?.map((o) => o.fate)).toEqual(['answer']);
		});

		it('forgets the lane on resume: its beats are numbered from 0 again', async () => {
			const ctx = setup([...passage(), ...passage({ passage: 's:1' })]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.03);
			ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
			expect(model(ctx).history).toEqual([{ beatIndex: 4, verdict: 'perfect' }]);
			ctx.controller.pause();
			ctx.controller.resume();
			await drain();
			// An old verdict would sit on the new change's beat 4 and hide it.
			expect(model(ctx).history).toEqual([]);
			ctx.runTo(ctx.clock.now() + 2.1);
			expect(model(ctx)).toMatchObject({ index: 1, anchorBeat: 4, history: [] });
		});
	});

	describe('the end', () => {
		it('finishes when the source has nothing more, the passage played to its end', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) - 0.2);
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			expect(await ctx.stored()).toHaveLength(2);
			const [session] = await ctx.repositories.sessions.list();
			expect(session.endedAt).not.toBeNull();
			// One execution per exercise and scope met, at the tempo of its first round.
			expect(session.executions).toEqual([
				{ exerciseId: 'gesture-jam', scope: 'iohefy-a', tempoBpm: 120 }
			]);
		});

		it('finishes the passage begun once SESSION_MS is spent, and begins no other', async () => {
			const ctx = setup([...passage(), ...passage({ passage: 's:1' })]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1));
			// Wall time runs on: the series has lasted its time in the middle of the passage.
			ctx.clock.epochAtZero += SESSION_MS;
			ctx.runTo(ctx.bar(2) - 0.2);
			expect(model(ctx).index).toBe(1);
			expect(ctx.controller.view.status).toBe('awaiting');
			ctx.runTo(ctx.bar(3) - 0.2);
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			expect(ctx.controller.view.briefing ?? null).toBeNull();
			expect(await ctx.stored()).toHaveLength(2);
			expect(ctx.source.asked.at(-1)?.elapsedMs).toBeGreaterThanOrEqual(SESSION_MS);
		});

		it('ends after the duration its preparation gives', async () => {
			const durationMs = 60_000;
			const ctx = setup([...passage(), ...passage({ passage: 's:1' })], { durationMs });
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1));
			// Wall time runs on: the series has lasted the time it was given, well before SESSION_MS.
			expect(durationMs).toBeLessThan(SESSION_MS);
			ctx.clock.epochAtZero += durationMs;
			ctx.runTo(ctx.bar(3) - 0.2);
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			expect(await ctx.stored()).toHaveLength(2);
		});

		it('writes the session and finishes on quit, the round under way settled', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.5);
			ctx.controller.quit();
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			const attempts = await ctx.stored();
			expect(attempts.map((a) => a.success)).toEqual([false]);
			const [session] = await ctx.repositories.sessions.list();
			expect(session.endedAt).not.toBeNull();
		});
	});

	describe('screen', () => {
		it('counts 4 3 2 1 over the counted bar and follows the transport’s beats', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			const counts: (number | null)[] = [];
			for (let beat = 0; beat <= 4; beat++) {
				ctx.runTo(ctx.bar(beat / 4) + 0.01);
				counts.push(ctx.controller.view.countdown);
			}
			expect(counts).toEqual([4, 3, 2, 1, null]);
			expect(ctx.controller.timeline.nowBeat()).toBeCloseTo(4.02, 2);
		});

		it('spells an item alike from its preview to its settlement', async () => {
			const seen: number[] = [];
			const presenter: MechanicPresenter = {
				...GESTURE_PRESENTERS['chord-grid'],
				stageOf: (_item, _settled, _locale, _aids, _place, _drawing, random) => {
					seen.push(random());
					return { model: {} };
				}
			};
			let drawn = 0;
			const ctx = setup(passage(), {
				mechanics: { 'chord-grid': presenter },
				random: () => ++drawn / 100
			});
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.03);
			ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
			ctx.runTo(ctx.bar(2) - 0.2);
			expect(seen.length).toBeGreaterThan(2);
			// One draw per item taken: the first item's preview, round and settlement share it.
			expect(seen[0]).toBe(0.01);
			expect(seen.filter((v) => v === 0.01).length).toBeGreaterThanOrEqual(3);
		});

		it('names its exercise’s view and places the settled changes in its history', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.03);
			ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
			expect(ctx.controller.view.stage?.view).toBe('grid-scroll');
			expect(ctx.controller.view.status).toBe('verdict');
			expect(model(ctx).history).toEqual([{ beatIndex: 4, verdict: 'perfect' }]);
			ctx.runTo(ctx.bar(2) - 0.2);
			expect(model(ctx)).toMatchObject({
				index: 1,
				anchorBeat: 8,
				history: [{ beatIndex: 4, verdict: 'perfect' }]
			});
		});
	});

	describe('recording', () => {
		it('keeps what is heard before the first round opens out of every attempt', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			// In the counted bar, before the first change opens.
			ctx.runTo(ctx.bar(0.25));
			ctx.play(ctx.bar(0.25), rightShape(change(0)));
			ctx.runTo(ctx.bar(1) + 0.03);
			ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
			ctx.controller.quit();
			await drain();
			const [first] = await ctx.stored();
			expect(first.observations?.map((o) => o.fate)).toEqual(['answer']);
		});

		it('writes each settled change, tells the source, and completes its observations when the next change opens', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.03);
			ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
			// After its settlement, still in its span.
			ctx.play(ctx.bar(1) + 1, null);
			expect(ctx.source.recorded).toHaveLength(1);
			expect(ctx.source.recorded[0]).toMatchObject({
				success: true,
				correct: true,
				exerciseId: 'gesture-jam',
				scope: 'iohefy-a'
			});
			await drain();
			expect((await ctx.stored())[0].observations).toHaveLength(1);
			ctx.runTo(ctx.bar(2) - 0.2);
			await drain();
			const [first] = await ctx.stored();
			expect(first.observations?.map((o) => o.fate)).toEqual(['answer', 'settled']);
			expect(first.verdict.relation).toBe('response');
			expect(first.plan).toMatchObject({ handover: '1' });
		});

		it('files an observation arriving at the handover in the next change, and a window cut short in the change that ends', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(2) - 0.25);
			// The window attacked 1.25 bars in reports when it is withdrawn: into the first change.
			ctx.verifier.onWithdraw = () => ctx.play(ctx.bar(1.6), rightShape(change(0)));
			ctx.runTo(ctx.bar(2) - 0.2);
			// Right after the handover: the second change's.
			ctx.play(ctx.bar(2) - 0.2, rightShape(change(1)));
			ctx.runTo(ctx.bar(3) - 0.2);
			await drain();
			const [first, second] = await ctx.stored();
			expect(first.observations?.map((o) => [o.fate, o.correct])).toEqual([['answer', true]]);
			expect(first.success).toBe(false);
			expect(second.observations?.map((o) => [o.fate, o.correct])).toEqual([['answer', true]]);
			expect(second.timingOffsetMs).toBe(-200);
		});
	});

	describe('a round without a handover', () => {
		const exercise = withoutHandover;

		it('withdraws its expectation before the next round opens: a report then lands in the round that ends', async () => {
			const ctx = setup(passage(), { exercise });
			await ctx.controller.start();
			// Settled (nothing heard) at its end of listening, the next change counted in.
			ctx.runTo(ctx.bar(2.75) - 0.01);
			expect(await ctx.stored()).toHaveLength(1);
			ctx.verifier.onWithdraw = () => ctx.play(ctx.bar(2.7), rightShape(change(0)));
			ctx.runTo(ctx.bar(2.75));
			expect(ctx.verifier.expectations.slice(-2)).toEqual([null, expect.anything()]);
			ctx.runTo(ctx.bar(3) + 0.03);
			ctx.play(ctx.bar(3) + 0.02, rightShape(change(1)));
			ctx.controller.quit();
			await drain();
			await new Promise((resolve) => setTimeout(resolve, 0));
			const [first, second] = await ctx.stored();
			expect(first.observations?.map((o) => o.fate)).toEqual(['settled']);
			expect(second.observations?.map((o) => o.fate)).toEqual(['answer']);
		});

		it('withdraws its expectation before the end: a report then lands in the round that ends', async () => {
			const ctx = setup(passage(), { exercise });
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1.875) + 0.01);
			expect(await ctx.stored()).toHaveLength(1);
			ctx.verifier.onWithdraw = () => ctx.play(ctx.bar(1.85), rightShape(change(0)));
			ctx.controller.quit();
			await drain();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(ctx.verifier.expectations.at(-1)).toBeNull();
			const [first] = await ctx.stored();
			expect(first.observations?.map((o) => o.fate)).toEqual(['settled']);
		});
	});

	describe('« Joué juste »', () => {
		it('offers it after a miss in development, until the next change', async () => {
			const ctx = setup(passage(), { development: true });
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.5);
			expect(ctx.controller.view.contest).toBe('available');
			ctx.controller.contest();
			expect(ctx.controller.view.contest).toBe('done');
			ctx.runTo(ctx.bar(2) - 0.2);
			expect(ctx.controller.view.contest).toBeNull();
			await drain();
			const [attempt] = await ctx.stored();
			expect(attempt.contested).toBe(true);
		});

		it('never offers it outside development', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(2) - 0.2);
			expect(ctx.controller.view.contest).toBeNull();
			ctx.controller.contest();
			await drain();
			expect((await ctx.stored())[0].contested).toBeUndefined();
		});
	});

	describe('trace', () => {
		it('keeps the series, its rests, counted bars, rounds, instructions and pauses', async () => {
			const ctx = setup([
				...passage(),
				...passage({ passage: 's:1', restBars: 1 }),
				...passage({ passage: 's:2', exerciseId: 'gesture-zone' })
			]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(5.5));
			ctx.controller.pause();
			ctx.controller.resume();
			await drain();
			ctx.runTo(ctx.bar(5.5) + 2 * 2);
			ctx.runTo(30);
			expect(ctx.controller.view.briefing).not.toBeNull();
			ctx.controller.quit();
			await drain();
			expect(roles(ctx.controller.trace)).toEqual([
				'count-in',
				'round',
				'round',
				'rest',
				'count-in',
				'round',
				'pause',
				'count-in',
				'round',
				'briefing'
			]);
			const series = ctx.controller.trace?.children[0];
			expect(series?.role).toBe('series');
			expect(series?.reason).toBe('quit');
		});
	});

	describe('the session record', () => {
		it('stores the latency of the note sensor with the session, zero when it is not calibrated', async () => {
			const calibrated = setup(passage());
			await calibrated.repositories.settings.update({
				latency: { note: { ms: 42, provenance: 'player' }, chord: { ms: 7, provenance: 'system' } }
			});
			await calibrated.controller.start();
			expect((await calibrated.repositories.sessions.get('series-1'))?.latencyMs).toBe(42);
			calibrated.controller.quit();
			await drain();
			const ended = await calibrated.repositories.sessions.get('series-1');
			expect(ended).toMatchObject({ latencyMs: 42, endedAt: expect.any(Number) });

			// Uncalibrated, the onsets were taken as heard: the latency applied was zero.
			const plain = setup(passage());
			await plain.controller.start();
			expect((await plain.repositories.sessions.get('series-1'))?.latencyMs).toBe(0);
		});

		it('keeps its own latency when a new series starts before its record is final', async () => {
			const ctx = setup(passage(), {
				sources: [new ScriptedSource(passage()), new ScriptedSource(passage())]
			});
			await ctx.repositories.settings.update({
				latency: { note: { ms: 42, provenance: 'player' } }
			});
			await ctx.controller.start();
			// The final record is written late: the new series is up before it is.
			let release!: () => void;
			const gate = new Promise<void>((resolve) => (release = resolve));
			const put = ctx.repositories.sessions.put.bind(ctx.repositories.sessions);
			ctx.repositories.sessions.put = async (record) => {
				if (record.endedAt !== null) await gate;
				return put(record);
			};
			ctx.controller.quit();
			await ctx.repositories.settings.update({
				latency: { note: { ms: 99, provenance: 'player' } }
			});
			await ctx.controller.start();
			release();
			await drain();
			expect(await ctx.repositories.sessions.get('series-1')).toMatchObject({
				latencyMs: 42,
				endedAt: expect.any(Number)
			});
			expect((await ctx.repositories.sessions.get('series-2'))?.latencyMs).toBe(99);
		});

		it('writes the completed observations of its attempts before the end of the session', async () => {
			const ctx = setup([...passage(), ...passage({ passage: 's:1' })]);
			const write = ctx.repositories.attempts.setObservations.bind(ctx.repositories.attempts);
			ctx.repositories.attempts.setObservations = async (id, observations) => {
				await new Promise((resolve) => setTimeout(resolve, 0));
				return write(id, observations);
			};
			let atEnd: Promise<Attempt[]> | null = null;
			const put = ctx.repositories.sessions.put.bind(ctx.repositories.sessions);
			ctx.repositories.sessions.put = (record) => {
				if (record.endedAt !== null) atEnd = ctx.repositories.attempts.all();
				return put(record);
			};
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.03);
			ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
			// After its settlement, still in its span.
			ctx.play(ctx.bar(1) + 1, null);
			ctx.controller.quit();
			await vi.waitFor(async () =>
				expect((await ctx.repositories.sessions.get('series-1'))?.endedAt).not.toBeNull()
			);
			const [whenEnded] = await (atEnd as unknown as Promise<Attempt[]>);
			expect(whenEnded.observations?.map((o) => o.fate)).toEqual(['answer', 'settled']);
		});
	});

	describe('audio input', () => {
		it('opens the input of the settings with its built-in gain before anything sounds', async () => {
			const ctx = setup(passage());
			await ctx.repositories.settings.update({ inputDeviceId: 'guitar', builtInInputGain: 4 });
			await ctx.controller.start();
			expect(ctx.detector).toMatchObject({ running: true, deviceId: 'guitar', builtInGain: 4 });
			expect(ctx.controller.view.audioError).toBeNull();
			ctx.controller.quit();
			await drain();
			expect(ctx.detector.running).toBe(false);
		});

		it('says so when no input opens, writes nothing, and starts again later', async () => {
			const ctx = setup(passage());
			const start = ctx.detector.start.bind(ctx.detector);
			ctx.detector.start = async () => {
				throw new Error('refused');
			};
			await ctx.controller.start();
			expect(ctx.controller.view).toMatchObject({ status: 'idle', audioError: 'input' });
			expect(ctx.sounds.emitted()).toEqual([]);
			expect(await ctx.repositories.sessions.list()).toEqual([]);
			ctx.detector.start = start;
			await ctx.controller.start();
			expect(ctx.controller.view).toMatchObject({ status: 'count-in', audioError: null });
			expect(ctx.prepared).toEqual(['series-1']);
		});
	});

	describe('a new series', () => {
		it('starts again after the end, with a new session id and a new series', async () => {
			const ctx = setup(passage(), {
				sources: [new ScriptedSource(passage()), new ScriptedSource(passage())]
			});
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) - 0.2);
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			await ctx.controller.start();
			expect(ctx.controller.sessionId).toBe('series-2');
			expect(ctx.prepared).toEqual(['series-1', 'series-2']);
			expect(ctx.controller.view.status).toBe('count-in');
			const from = ctx.clock.now();
			ctx.runTo(from + 2.1);
			ctx.play(ctx.clock.now(), rightShape(change(0)));
			const attempts = await ctx.stored('series-2');
			expect(attempts.map((a) => a.success)).toEqual([true]);
			expect(model(ctx).history).toEqual([{ beatIndex: 4, verdict: 'perfect' }]);
			const sessions = await ctx.repositories.sessions.list();
			expect(sessions.map((s) => s.id).sort()).toEqual(['series-1', 'series-2']);
		});
	});

	describe('starting', () => {
		it('starts again after a quit during its start', async () => {
			const ctx = setup(passage(), {
				sources: [new ScriptedSource(passage()), new ScriptedSource(passage())]
			});
			const starting = ctx.controller.start();
			ctx.controller.quit();
			await starting;
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			await ctx.controller.start();
			expect(ctx.controller.view.status).toBe('count-in');
			expect(ctx.controller.sessionId).toBe('series-2');
		});

		it('starts again after a series with nothing to play', async () => {
			const ctx = setup([], {
				sources: [new ScriptedSource([]), new ScriptedSource(passage())]
			});
			await ctx.controller.start();
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			await ctx.controller.start();
			expect(ctx.controller.view.status).toBe('count-in');
		});

		it('prepares a series once when the start screen and the start overlap', async () => {
			const ctx = setup(passage());
			const ready = ctx.controller.ready();
			const started = ctx.controller.start();
			await ready;
			await started;
			expect(ctx.prepared).toEqual(['series-1']);
			expect(ctx.controller.view.status).toBe('count-in');
		});
	});

	describe('the exercise catalog', () => {
		it('reads an exercise through the lookup it is given, and lets an unknown one throw', async () => {
			const exercise = (id: string) => ({ ...exerciseById(id), view: 'own-view' });
			const ctx = setup(passage(), { exercise });
			await ctx.controller.ready();
			expect(ctx.controller.view.stage?.view).toBe('own-view');
			const unknown = setup([change(0, { exerciseId: 'nowhere' })]);
			await expect(unknown.controller.ready()).rejects.toThrow(/nowhere/);
		});
	});

	describe('the gesture selector', () => {
		it('ends a link tour replayed past SESSION_MS at the end of its passage, with no new passage', async () => {
			const cards = triadCards('triad-anchor', 'D', 'maj', G_B_E);
			const selector = createGestureSelector({
				definitions: GESTURE_EXERCISES,
				cards,
				attempts: [],
				sessionId: 'series-1'
			});
			const ctx = setup([], { sources: [selector] });
			await ctx.controller.start();
			// Nothing is played: the first tour fails and is replayed at once, chained.
			const indexes: number[] = [];
			const watch = (until: number) => {
				while (ctx.clock.now() < until && ctx.controller.view.status !== 'finished') {
					ctx.runTo(ctx.clock.now() + 0.05);
					const index = model(ctx)?.index;
					if (index !== undefined && index !== indexes.at(-1)) indexes.push(index);
				}
			};
			const tour = (model(ctx) as unknown as { changes: unknown[] }).changes.length;
			watch(ctx.bar(1 + tour) - 0.1);
			// The replay has begun; the series' time runs out in its middle.
			watch(ctx.bar(1 + tour + 1));
			ctx.clock.epochAtZero += SESSION_MS;
			watch(ctx.bar(1 + 3 * tour));
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			const attempts = await ctx.stored();
			const passages = new Set(
				attempts.map((a) => (a.data as { item: ChordGridItem }).item.passageId)
			);
			expect(passages.size).toBe(2);
			const replay = attempts.filter(
				(a) => (a.data as { item: ChordGridItem }).item.continued === true
			);
			expect(replay.length).toBeGreaterThan(0);
			expect(indexes.length).toBeGreaterThan(tour);
		});
	});
	describe('rounds without a handover', () => {
		/** What the fake mechanic was asked to show, last first. */
		interface Shown {
			index: number;
			settled: string | null;
			place: StagePlace;
			aids: { aid: string; stringAid: boolean };
		}
		const NOTE_C = { string: 3 as const, pitch: 'C' as const };
		const C = acceptableMidis(NOTE_C)[0];
		/** A mechanic played on the guitar on the beat, its string shown a beat before its prompt. */
		const presenter = (overrides: Partial<MechanicPresenter> = {}): MechanicPresenter => ({
			...GESTURE_PRESENTERS['chord-grid'],
			scene: 'guitar',
			sensors: ['note'],
			expectation: undefined,
			feedback: undefined,
			attemptData: undefined,
			contestable: false,
			previewBeats: 1,
			stageOf: (item, settled, _locale, aids, place) => ({
				model: {
					index: (item as ChordGridItem).index,
					settled: settled ? settled.value.verdict : null,
					place,
					aids
				} satisfies Shown
			}),
			...overrides
		});
		/** A mechanic tapped on the screen in free time, shown at its prompt. */
		const TAP: MechanicPresenter = presenter({
			scene: 'screen',
			sensors: ['tap'],
			previewBeats: undefined
		});
		const mechanics = {
			...GESTURE_PRESENTERS,
			beat: presenter(),
			'beat-unannounced': presenter({ previewBeats: undefined }),
			tap: TAP
		};
		// The rounds of these mechanics are templates like any exercise's; the notes they derive
		// are the vocabulary this file adds to the registry.
		const derivations = CONTENT_DERIVATIONS as Record<string, ContentDerivation>;
		derivations['test-note-c'] = {
			kind: NOTE_CONTENT,
			reads: ['beat', 'beat-unannounced'],
			derive: () => NOTE_C
		};
		derivations['test-name'] = {
			kind: NAME_CONTENT,
			reads: ['tap'],
			derive: () => ({ string: 3, fret: 5 })
		};
		const BEAT_ROUND: RoundTemplate = {
			...(LOCATE_NECK.round as RoundTemplate),
			expectations: [
				{
					at: { beats: 0 },
					sensor: 'note',
					content: { from: 'test-note-c' },
					window: { ms: { param: 'windows.perfectMs' } }
				}
			]
		};
		const TAP_ROUND: RoundTemplate = {
			prompt: { lead: 0 },
			expectations: [
				{ at: null, sensor: 'tap', content: { from: 'test-name' }, window: { ms: 3000 } }
			],
			length: { bars: 1 },
			policy: {
				unit: 'response',
				verdict: 'response',
				correction: false,
				pairing: { mode: 'first-answer', opens: { afterPromptMs: 0 }, lateMs: 0, lateCapture: null }
			}
		};
		/** The id of the exercise of the tapped items: the gesture's, its round the tap's. */
		const TAP_EXERCISE = 'fake-tap';
		/** The gesture's exercises, their round the beat's; the tap's under its own id. */
		const fakeExercise = (id: string) => {
			const tap = id === TAP_EXERCISE;
			return {
				...exerciseById(tap ? 'gesture-zone' : id),
				id,
				round: tap ? TAP_ROUND : BEAT_ROUND
			};
		};
		/** Item `index` of `mechanic`, at `lead`; the first one counted in. */
		const beat = (
			index: number,
			lead: LeadBeats = 8,
			extra: Partial<PlannedItem> = {},
			mechanic = 'beat'
		): PlannedItem => ({
			...change(index % 2),
			item: { ...(change(index % 2).item as ChordGridItem), index },
			mechanic,
			...(mechanic === 'tap' && { exerciseId: TAP_EXERCISE }),
			leadBeats: lead,
			countIn: index === 0,
			...extra
		});
		/** The note and tap sensors, fed by the test. */
		const fakeSensors = () => {
			const listeners: Record<string, (observation: Observation) => void> = {};
			const factory =
				(kind: string): SensorFactory =>
				({ clock }) => ({
					onObservation: (callback) => {
						listeners[kind] = callback;
						return () => delete listeners[kind];
					},
					push: (payload) => listeners[kind]?.({ time: clock.now(), payload, readable: true })
				});
			return {
				sensors: { note: factory('note'), tap: factory('tap') },
				hear: (time: number, midi: number) =>
					listeners.note?.({ time, payload: { midi }, readable: true })
			};
		};
		const series = (items: PlannedItem[], options: Parameters<typeof setup>[1] = {}) => {
			const fake = fakeSensors();
			const ctx = setup(items, {
				mechanics,
				exercise: fakeExercise,
				sensors: fake.sensors,
				...options
			});
			return { ...ctx, hear: fake.hear };
		};
		const shown = (ctx: Ctx) => ctx.controller.view.stage?.model as Shown;

		it('after a breath at lead 8: the next prompt on the 1 after the breathing bar, without a count', async () => {
			const ctx = series([beat(0, 8), beat(1, 8)]);
			await ctx.controller.start();
			// Counted on bar 0, the prompt on bar 1, the target on bar 3.
			ctx.runTo(ctx.bar(1));
			expect(shown(ctx).place).toMatchObject({ promptBeat: 4, anchorBeat: 12 });
			ctx.runTo(ctx.bar(3) + 0.03);
			ctx.hear(ctx.bar(3) + 0.02, C);
			expect(ctx.controller.view.status).toBe('verdict');
			// The breathing bar (bar 3) then the second prompt on bar 4, its target on bar 6.
			ctx.runTo(ctx.bar(4) - 0.01);
			expect(ctx.controller.view.status).toBe('verdict');
			ctx.runTo(ctx.bar(4));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(shown(ctx)).toMatchObject({ index: 1, place: { promptBeat: 16, anchorBeat: 24 } });
			expect(ctx.controller.view.countdown).toBeNull();
			// The click goes on through the breath and the lead, never counted.
			expect(clicksBetween(ctx, ctx.bar(3), ctx.bar(6))).toHaveLength(12);
			ctx.runTo(ctx.bar(6) + 0.03);
			ctx.hear(ctx.bar(6) + 0.02, C);
			ctx.controller.quit();
			await drain();
			expect(roles(ctx.controller.trace)).toEqual(['count-in', 'round', 'round']);
			const attempts = await ctx.stored();
			expect(attempts.map((a) => a.success)).toEqual([true, true]);
		});

		it('after a breath at lead 2: the next prompt on beat 3 of the bar after the breathing bar', async () => {
			const ctx = series([beat(0, 2), beat(1, 2)]);
			await ctx.controller.start();
			// Counted on bar 0: the prompt on beat 3 of bar 1, the target on bar 2.
			ctx.runTo(ctx.bar(1.5));
			expect(shown(ctx).place).toMatchObject({ promptBeat: 6, anchorBeat: 8 });
			ctx.runTo(ctx.bar(2) + 0.03);
			ctx.hear(ctx.bar(2) + 0.02, C);
			ctx.runTo(ctx.bar(3.5) - 0.01);
			expect(ctx.controller.view.status).toBe('verdict');
			ctx.runTo(ctx.bar(3.5));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(shown(ctx).place).toMatchObject({ promptBeat: 14, anchorBeat: 16 });
		});

		describe('the bar after a count', () => {
			const onBeat3 = (id: string) => {
				const definition = fakeExercise(id);
				return { ...definition, round: { ...definition.round, barOffset: '1/2' } };
			};
			/** Bar 1's clicks laid by the time the count is placed, before any of them is due. */
			const laidAfterCount = async (items: PlannedItem[], exercise = fakeExercise) => {
				const ctx = setup(items, {
					mechanics,
					exercise,
					sensors: fakeSensors().sensors
				});
				await ctx.controller.start();
				expect(ctx.clock.now()).toBeLessThan(ctx.bar(1));
				return { downbeat: ctx.bar(1), clicks: clicksBetween(ctx, ctx.bar(1), ctx.bar(2)) };
			};

			it('clicks its downbeat at lead 8', async () => {
				const { downbeat, clicks } = await laidAfterCount([beat(0, 8)]);
				expect(clicks).toHaveLength(4);
				expect(clicks[0]).toBeCloseTo(downbeat, 3);
			});

			it('clicks its beats 1 and 2 before a prompt on beat 3 at lead 2', async () => {
				expect((await laidAfterCount([beat(0, 2)])).clicks).toHaveLength(4);
			});

			it('clicks its beats before a prompt the plan puts on beat 3', async () => {
				expect((await laidAfterCount([beat(0, 4)], onBeat3)).clicks).toHaveLength(4);
			});
		});

		it('places a target on beat 3 when its plan says so, clicking on through bars it splits', async () => {
			const onBeat3 = (id: string) => {
				const definition = fakeExercise(id);
				return { ...definition, round: { ...definition.round, barOffset: '1/2' } };
			};
			const fake = fakeSensors();
			const ctx = setup([beat(0, 4), beat(1, 4)], {
				mechanics,
				exercise: onBeat3,
				sensors: fake.sensors
			});
			await ctx.controller.start();
			// Counted on bar 0: the prompt on beat 3 of bar 1, the target on beat 3 of bar 2.
			ctx.runTo(ctx.bar(1.5));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(shown(ctx).place).toMatchObject({ promptBeat: 6, anchorBeat: 10 });
			ctx.runTo(ctx.bar(2.5) + 0.03);
			fake.hear(ctx.bar(2.5) + 0.02, C);
			expect(ctx.controller.view.status).toBe('verdict');
			// Its round ends on beat 3 of bar 3: the next prompt there, its target on beat 3 of bar 4.
			ctx.runTo(ctx.bar(3.5));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(shown(ctx).place).toMatchObject({ promptBeat: 14, anchorBeat: 18 });
			// The click goes on through the bars the rounds split: every beat of bars 2 to 4 heard.
			expect(clicksBetween(ctx, ctx.bar(2), ctx.bar(5))).toHaveLength(12);
			expect(ctx.controller.view.countdown).toBeNull();
		});

		it('counts a bar after the round before an item that asks for one, then applies the same placement', async () => {
			const ctx = series([beat(0, 8), beat(1, 8, { countIn: true })]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) + 0.03);
			ctx.hear(ctx.bar(3) + 0.02, C);
			// Bar 4 counted (the round ends there), the prompt on bar 5, the target on bar 7.
			ctx.runTo(ctx.bar(4) + 0.01);
			expect(ctx.controller.view.countdown).toBe(4);
			ctx.runTo(ctx.bar(5));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(shown(ctx).place).toMatchObject({ promptBeat: 20, anchorBeat: 28 });
		});

		it('shows the next item its preview beats before its prompt, the settled round until then', async () => {
			const ctx = series([beat(0, 8), beat(1, 8, { stringAid: true })]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) + 0.03);
			ctx.hear(ctx.bar(3) + 0.02, C);
			ctx.runTo(ctx.bar(3.75) - 0.01);
			expect(shown(ctx)).toMatchObject({ index: 0, settled: 'perfect' });
			ctx.runTo(ctx.bar(3.75));
			// Waiting: not placed on its target, the view shows its string only.
			expect(shown(ctx)).toMatchObject({
				index: 1,
				settled: null,
				place: { anchorBeat: null, promptBeat: 16 },
				aids: { aid: 'none', stringAid: true }
			});
			expect(ctx.controller.view.status).toBe('verdict');
		});

		it('gives the view the band of an extended expectation, in lane beats', async () => {
			const extended = (id: string) => {
				const definition = fakeExercise(id);
				const round = definition.round as RoundTemplate;
				return {
					...definition,
					round: {
						...round,
						expectations: [
							...round.expectations,
							{ ...round.expectations[0], at: { beats: 1 }, until: { bars: 1 } }
						],
						length: { bars: 1, breath: true }
					}
				};
			};
			const ctx = series([beat(0, 8)], { exercise: extended });
			await ctx.controller.start();
			// Waiting for its round: not placed, no band.
			expect(shown(ctx).place).toMatchObject({ anchorBeat: null, bands: [] });
			// Counted on bar 0, the prompt on bar 1, the target on bar 3: the band from its beat 2
			// to the end of the bar.
			ctx.runTo(ctx.bar(1));
			expect(shown(ctx).place).toMatchObject({
				promptBeat: 4,
				anchorBeat: 12,
				bands: [{ fromBeat: 13, untilBeat: 16 }]
			});
			ctx.runTo(ctx.bar(3) + 0.03);
			ctx.hear(ctx.bar(3) + 0.02, C);
			ctx.runTo(ctx.bar(3.5));
			expect(shown(ctx).place.bands).toEqual([{ fromBeat: 13, untilBeat: 16 }]);
		});

		it('announces the next prompt as many beats early as its exercise says', async () => {
			const exercise = (id: string) => ({ ...fakeExercise(id), flow: { previewBeats: 2 } });
			const ctx = series([beat(0, 8), beat(1, 8)], { exercise });
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) + 0.03);
			ctx.hear(ctx.bar(3) + 0.02, C);
			ctx.runTo(ctx.bar(3.5) - 0.01);
			expect(shown(ctx)).toMatchObject({ index: 0, settled: 'perfect' });
			ctx.runTo(ctx.bar(3.5));
			expect(shown(ctx)).toMatchObject({ index: 1, settled: null });
		});

		it('takes the mechanic’s defaults when the exercise says nothing', async () => {
			const exercise = (id: string) => ({ ...fakeExercise(id), flow: {} });
			const ctx = series([beat(0, 8), beat(1, 8)], { exercise });
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) + 0.03);
			ctx.hear(ctx.bar(3) + 0.02, C);
			ctx.runTo(ctx.bar(3.5));
			expect(shown(ctx)).toMatchObject({ index: 0, settled: 'perfect' });
			ctx.runTo(ctx.bar(3.75));
			expect(shown(ctx)).toMatchObject({ index: 1 });
		});

		it('without preview beats, shows the next item at its prompt', async () => {
			const ctx = series([beat(0, 8, {}, 'beat-unannounced'), beat(1, 8, {}, 'beat-unannounced')]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) + 0.03);
			ctx.hear(ctx.bar(3) + 0.02, C);
			ctx.runTo(ctx.bar(4) - 0.01);
			expect(shown(ctx)).toMatchObject({ index: 0, settled: 'perfect' });
			ctx.runTo(ctx.bar(4));
			expect(shown(ctx)).toMatchObject({ index: 1, place: { promptBeat: 16, anchorBeat: 24 } });
		});

		it('in free time: opens on the beat after the count, then on the beat after each answer', async () => {
			const ctx = series([beat(0, 8, {}, 'tap'), beat(1, 8, {}, 'tap')]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(shown(ctx).place).toMatchObject({ promptBeat: 4, anchorBeat: 4 });
			// Answered between beats 2 and 3 of bar 1: the next one opens on beat 3.
			ctx.runTo(3.0);
			ctx.controller.answer('C');
			expect(ctx.controller.view.status).toBe('verdict');
			ctx.runTo(ctx.bar(1.5) - 0.01);
			expect(shown(ctx)).toMatchObject({ index: 0, settled: 'perfect' });
			ctx.runTo(ctx.bar(1.5));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(shown(ctx)).toMatchObject({ index: 1, place: { promptBeat: 6, anchorBeat: 6 } });
			const opened = ctx.clock.now();
			ctx.runTo(opened + 1);
			ctx.controller.answer('C');
			const attempts = await ctx.stored();
			expect(attempts.map((a) => a.success)).toEqual([true, true]);
			// Its prompt is the instant it opened: the reaction is counted from there.
			expect(attempts[1].promptedAt).toBeCloseTo(ctx.clock.toEpochMs(opened), 6);
			expect(attempts[1].reactionMs).toBeCloseTo(1000, 6);
			// In free time no tempo is played: the attempts and the execution have none.
			expect(attempts.map((a) => a.tempoBpm)).toEqual([null, null]);
			ctx.controller.quit();
			await drain();
			const [session] = await ctx.repositories.sessions.list();
			expect(session.executions).toEqual([
				{ exerciseId: 'fake-tap', scope: 'iohefy-a', tempoBpm: null }
			]);
			// Nothing clicks on the screen.
			expect(clicksBetween(ctx, 0, ctx.bar(3))).toEqual([]);
		});

		describe('a change of meter', () => {
			const METER_3_4: Meter = { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] };
			/** `inWaltz`'s exercise in 3/4, the others in their own meter; no instruction stops. */
			const inWaltz = (waltz: string) => (id: string) => ({
				...fakeExercise(id),
				howTo: undefined,
				...(id === waltz && { meter: METER_3_4 })
			});
			/** One tempo, ♩ = 120, for every exercise (all at level 0): only the meter changes. */
			const levelStates: LevelState[] = [];
			/**
			 * Runs by 10 ms to the second item's target (at most `until`); what the screen showed: the counts with their times, and the
			 * second item's target, in audio seconds, once its round opened.
			 */
			const watch = (ctx: Ctx, until: number, answer?: { at: number; tap: string }) => {
				const counts: { time: number; count: number }[] = [];
				let target: number | null = null;
				let answered = false;
				// Up to the target: the series ends after it, its sounds cancelled.
				for (
					let time = ctx.clock.now();
					time < until && (target === null || time < target);
					time += 0.01
				) {
					ctx.runTo(time);
					if (answer && !answered && time >= answer.at) {
						ctx.controller.answer(answer.tap);
						answered = true;
					}
					const count = ctx.controller.view.countdown;
					if (count !== null && counts[counts.length - 1]?.count !== count) {
						counts.push({ time: ctx.clock.now(), count });
					}
					if (
						target === null &&
						ctx.controller.view.status === 'awaiting' &&
						shown(ctx).index === 1
					) {
						const beats = (shown(ctx).place.anchorBeat ?? 0) - ctx.controller.timeline.nowBeat();
						target = ctx.clock.now() + beats * 0.5;
					}
				}
				return { counts, target };
			};
			/** The clicks heard from `from` on, accents marked. */
			const heard = (ctx: Ctx, from: number) =>
				ctx.sounds
					.emitted()
					.filter((s) => s.time >= from - 1e-9)
					.map((s) => ({ time: s.time, accent: s.sound === 'click-accent' }));

			it('counts a bar in the new meter between a timed item and one of another meter, then plays in it', async () => {
				const ctx = series([beat(0, 8), beat(1, 3, { exerciseId: 'gesture-zone' })], {
					exercise: inWaltz('gesture-zone'),
					levelStates
				});
				await ctx.controller.start();
				ctx.runTo(ctx.bar(3) + 0.03);
				ctx.hear(ctx.bar(3) + 0.02, C);
				const { counts, target } = watch(ctx, 20);
				// After the round in 4/4, a count of 3 in 3/4.
				expect(counts.map((c) => c.count)).toEqual([3, 2, 1]);
				const countAt = counts[0].time;
				// Not before the first round's breath ends.
				expect(countAt).toBeGreaterThanOrEqual(ctx.bar(4) - 0.01);
				const clicks = heard(ctx, countAt - 0.01);
				// Three clicks a bar, the accent on each 1, half a second apart.
				expect(clicks.slice(0, 7).map((c) => c.accent)).toEqual([
					true,
					false,
					false,
					true,
					false,
					false,
					true
				]);
				for (let i = 1; i < 7; i++) {
					expect(clicks[i].time - clicks[i - 1].time).toBeCloseTo(0.5, 6);
				}
				// Its target on the 1 of a 3/4 bar, clicked.
				expect(target).not.toBeNull();
				expect(clicks.some((c) => c.accent && Math.abs(c.time - (target as number)) < 0.02)).toBe(
					true
				);
				ctx.controller.quit();
			});

			it('counts a bar in 3/4 after an item in free time first, then plays in it', async () => {
				const ctx = series([beat(0, 8, {}, 'tap'), beat(1, 3, { countIn: true })], {
					exercise: inWaltz('gesture-jam'),
					levelStates
				});
				await ctx.controller.start();
				// The tapped one opens after its (silent) 4/4 count and is answered.
				const { counts, target } = watch(ctx, 20, { at: ctx.bar(1) + 0.5, tap: 'C' });
				expect(counts.map((c) => c.count)).toEqual([4, 3, 2, 1, 3, 2, 1]);
				const countAt = counts[4].time;
				const clicks = heard(ctx, countAt - 0.01);
				expect(clicks.slice(0, 4).map((c) => c.accent)).toEqual([true, false, false, true]);
				expect(clicks[0].time).toBeCloseTo(countAt, 1);
				expect(target).not.toBeNull();
				expect(clicks.some((c) => c.accent && Math.abs(c.time - (target as number)) < 0.02)).toBe(
					true
				);
				ctx.controller.quit();
			});
		});

		it('past SESSION_MS: ends after a round without a handover, and begins nothing else', async () => {
			const ctx = series([beat(0, 8), beat(1, 8), beat(2, 8)]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) + 0.03);
			ctx.clock.epochAtZero += SESSION_MS;
			ctx.hear(ctx.bar(3) + 0.02, C);
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			expect(await ctx.stored()).toHaveLength(1);
			expect(ctx.source.asked.at(-1)?.elapsedMs).toBeGreaterThanOrEqual(SESSION_MS);
		});

		it('paused during the breath: rewrites nothing, closes the span, and resumes with a counted bar then the same placement', async () => {
			const ctx = series([beat(0, 8), beat(1, 8), beat(2, 8)]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) + 0.03);
			ctx.hear(ctx.bar(3) + 0.02, C);
			ctx.runTo(ctx.bar(3.5));
			ctx.hear(ctx.bar(3.5), C);
			ctx.controller.pause();
			ctx.hear(ctx.bar(3.5) + 0.1, C);
			await drain();
			const [attempt] = await ctx.stored();
			expect(attempt.success).toBe(true);
			// The span closed at the pause: what is heard later is nobody's.
			expect(attempt.observations?.map((o) => o.fate)).toEqual(['answer', 'settled']);
			expect(ctx.source.recorded).toHaveLength(1);
			ctx.runTo(20);
			expect(ctx.controller.view.status).toBe('paused');
			ctx.controller.resume();
			await drain();
			expect(ctx.controller.view.status).toBe('count-in');
			// A fresh map from 20.1 s: bar 0 counted, the waiting item's prompt on bar 1.
			ctx.runTo(20.1 + 2);
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(shown(ctx)).toMatchObject({ index: 1, place: { promptBeat: 4, anchorBeat: 12 } });
			expect(await ctx.stored()).toHaveLength(1);
		});
	});
	describe('scenes, taps and the meter', () => {
		/** The gesture's presenter on the screen: a scene that does not click, answered by taps too. */
		const SCREEN_GRID: MechanicPresenter = {
			...GESTURE_PRESENTERS['chord-grid'],
			scene: 'screen',
			sensors: ['chord', 'tap']
		};
		const mechanics = { ...GESTURE_PRESENTERS, 'screen-grid': SCREEN_GRID };
		// The chord grid's items, read under another mechanic's name.
		const grids = CONTENT_DERIVATIONS as Record<string, ContentDerivation>;
		grids['grid-change'] = {
			...grids['grid-change'],
			reads: [...grids['grid-change'].reads, 'screen-grid']
		};
		const numbers = ITEM_NUMBERS as Record<string, ItemNumber>;
		numbers['change-beats'] = {
			...numbers['change-beats'],
			reads: [...numbers['change-beats'].reads, 'screen-grid']
		};
		const onScreen = (items: PlannedItem[]) =>
			items.map((item) => ({ ...item, mechanic: 'screen-grid' }));
		/** A sensor fed by the screen, keeping what it was pushed. */
		const pushable = () => {
			const pushed: unknown[] = [];
			const factory: SensorFactory = () => ({
				onObservation: () => () => undefined,
				push: (payload) => pushed.push(payload)
			});
			return { pushed, factory };
		};
		const screenSeries = (items: PlannedItem[], options: Parameters<typeof setup>[1] = {}) => {
			const tap = pushable();
			const ctx = setup(items, { mechanics, sensors: { tap: tap.factory }, ...options });
			return { ...ctx, pushed: tap.pushed };
		};
		const METER_3_4: Meter = { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] };

		it('accompanies no bar on a scene that does not click, and comes back to the guitar through a counted bar heard', async () => {
			const ctx = screenSeries([...onScreen(passage()), ...passage({ passage: 's:1' })]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) - 0.19);
			// The screen's passage, its count included, in silence.
			expect(clicksBetween(ctx, 0, ctx.bar(3))).toEqual([]);
			// Bar 3 counted and heard, the guitar's first change on bar 4, clicked.
			expect(clicksBetween(ctx, ctx.bar(3), ctx.bar(4))).toEqual([6.1, 6.6, 7.1, 7.6]);
			ctx.runTo(ctx.bar(4) + 0.01);
			expect(clicksBetween(ctx, ctx.bar(4), ctx.bar(5))).toEqual([8.1, 8.6, 9.1, 9.6]);
		});

		it('plays an exercise of a guitar mechanic on the screen when the exercise says so: no click', async () => {
			const exercise = (id: string) => ({
				...exerciseById(id),
				flow: { scene: 'screen' as const }
			});
			const ctx = setup(passage(), { exercise });
			await ctx.controller.start();
			ctx.runTo(ctx.bar(2));
			expect(clicksBetween(ctx, 0, ctx.bar(2))).toEqual([]);
		});

		it('shows a counted bar before a scene that does not click, without a sound', async () => {
			const ctx = screenSeries([...passage(), ...onScreen(passage({ passage: 's:1' }))]);
			await ctx.controller.start();
			const counts: (number | null)[] = [];
			for (let beat = 0; beat <= 4; beat++) {
				ctx.runTo(ctx.bar(3 + beat / 4) + 0.01);
				counts.push(ctx.controller.view.countdown);
			}
			expect(counts).toEqual([4, 3, 2, 1, null]);
			expect(clicksBetween(ctx, ctx.bar(3) - 0.1, ctx.bar(6))).toEqual([]);
		});

		it('pushes a tapped answer to the sensor that takes one, only while a round awaits or shows its verdict', async () => {
			const ctx = screenSeries(onScreen(passage()));
			ctx.controller.answer('C');
			await ctx.controller.start();
			// Counting: no round to answer.
			ctx.controller.answer('D');
			ctx.runTo(ctx.bar(0.75));
			expect(ctx.controller.view.status).toBe('awaiting');
			ctx.controller.answer('E');
			ctx.runTo(ctx.bar(1) + 0.5);
			expect(ctx.controller.view.status).toBe('verdict');
			ctx.controller.answer('F');
			ctx.controller.pause();
			ctx.controller.answer('G');
			expect(ctx.pushed).toEqual(['E', 'F']);
		});

		it('begins the transport in the meter of the first item’s exercise, and compiles its rounds in it', async () => {
			const ctx = setup(passage(), {
				exercise: (id) => ({ ...exerciseById(id), meter: METER_3_4 })
			});
			await ctx.controller.start();
			// ♩ = 120: the counted bar is three clicks, a bar lasts 1.5 s.
			expect(clicksBetween(ctx, 0, 1.6)).toEqual([0.1, 0.6, 1.1]);
			ctx.runTo(1.11);
			expect(ctx.controller.view.countdown).toBe(1);
			ctx.runTo(1.6);
			expect(ctx.controller.view.status).toBe('awaiting');
		});
	});
});
