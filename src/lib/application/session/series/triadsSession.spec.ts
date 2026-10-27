import { describe, expect, it } from 'vitest';
import type { PlaySessionController } from '$lib/application/session/contract';
import { finishDestination } from '$lib/application/session/finishDestination';
import { TRIADS_ANCHOR } from '$lib/domain/exercise';
import type { TriadAnchorData, TriadZoneData } from '$lib/domain/mechanics';
import {
	closeTriadVoicings,
	parseVoicingKey,
	voicingKey,
	voicingOccurrences
} from '$lib/domain/music';
import { SESSION_MS } from '$lib/domain/session';
import { cueFrets, occurrenceOfId, occurrencePosition } from '$lib/domain/triads';
import type { ResponseValue } from '$lib/domain/time';
import type { Attempt } from '$lib/domain/types';
import { UnresumedClock } from '$lib/testing/fakes';
import { drain, runUntil, step } from '$lib/testing/notesSeries';
import {
	ANCHOR_CHORD_BEATS,
	ORDER,
	allRight,
	expectationsTold,
	laneModel,
	learnedTriad,
	playChord,
	playRoot,
	playTriads,
	shapes,
	startTriads,
	triadsApp,
	voicingOfShape,
	type TriadSeen,
	type TriadsApp
} from '$lib/testing/triadsSeries';

/**
 * The triads' sessions on the response series (plan H5, Task 7): the real wiring of
 * `createAppServices` (triad subject, learning procedure, presenters, the catalog's round
 * templates and presentations, the lane), the stores in memory, the transport on a fake clock.
 * Each pedagogical rule of the triads (specs 2026-10-08 and 2026-10-09) is played here as the
 * player meets it: through the screen's model, what the chord sensor is told and the stored
 * attempts.
 */

const C = ORDER[0];
const DAY_S = 24 * 60 * 60;

/** Quits and lets every write end; the session's attempts, in order. */
async function quitAndRead(app: TriadsApp, controller: PlaySessionController): Promise<Attempt[]> {
	controller.quit();
	await drain();
	return app.deps.attempts.listBySession(controller.sessionId);
}

async function cardOf(app: TriadsApp, mechanic: string, voicing: string) {
	return app.deps.cards.get(`${mechanic}:${voicing}`);
}

/** Plays rounds, one at a time, until `done` holds (checked after each round has settled). */
async function playUntil(
	app: TriadsApp,
	controller: PlaySessionController,
	choose: (round: TriadSeen) => ReturnType<typeof allRight>,
	done: () => Promise<boolean>,
	maxRounds = 60
): Promise<TriadSeen[]> {
	const rounds: TriadSeen[] = [];
	for (let i = 0; i < maxRounds; i++) {
		const [round] = await playTriads(app, controller, (r) => choose({ ...r, n: rounds.length }), {
			rounds: 1
		});
		if (!round) break;
		rounds.push({ ...round, n: rounds.length });
		await runUntil(app, () => controller.view.status !== 'awaiting');
		await drain();
		if (await done()) break;
	}
	return rounds;
}

/** An anchor round opened: the root on its target, ready to be answered by hand. */
async function firstRound(app: TriadsApp, controller: PlaySessionController): Promise<TriadSeen> {
	const [round] = await playTriads(app, controller, () => ({ root: 'none', chord: 'none' }), {
		rounds: 1
	});
	return round;
}

/** Steps the clock until `time`. */
async function runTo(app: TriadsApp, time: number): Promise<void> {
	await runUntil(app, () => app.clock.now() >= time);
}

describe('the triads exercises, from the probe to the zone', () => {
	it('learns C in anchor, acquires it cold, then asks it around a fret', async () => {
		const app = await triadsApp();

		// First session: C's probe is missed; its aided presentation follows, then its ladder.
		const firstSession = await startTriads(app, 'triads');
		const first = await playUntil(
			app,
			firstSession,
			(round) => (round.n === 0 ? { root: 'none', chord: 'none' } : allRight()),
			async () => (await cardOf(app, 'triad-anchor', C))?.learnedAt != null
		);
		await quitAndRead(app, firstSession);
		expect(first[0]).toMatchObject({ mechanic: 'triad-anchor', voicing: C, aided: false });
		const cPrompts = first.filter((p) => p.voicing === C);
		expect(cPrompts[1]).toMatchObject({ aided: true });
		expect(cPrompts.length).toBeGreaterThanOrEqual(5);
		const learned = await cardOf(app, 'triad-anchor', C);
		expect(learned?.learnedAt).not.toBeNull();
		expect(learned?.acquiredAt).toBeNull();
		expect(first.every((p) => p.mechanic === 'triad-anchor')).toBe(true);

		// A later session, past the cold delay: C is reviewed cold and acquired.
		app.clock.advance(3 * DAY_S);
		const secondSession = await startTriads(app, 'triads');
		const second = await playUntil(
			app,
			secondSession,
			allRight,
			async () => (await cardOf(app, 'triad-anchor', C))?.acquiredAt != null
		);
		await quitAndRead(app, secondSession);
		expect(second.some((p) => p.voicing === C)).toBe(true);
		expect(second.every((p) => p.mechanic === 'triad-anchor')).toBe(true);

		// The zone exercise, its own session: C is asked around a fret.
		const thirdSession = await startTriads(app, 'triads-zone');
		const third = await playUntil(
			app,
			thirdSession,
			allRight,
			async () => {
				const attempts = await app.deps.attempts.listBySession(thirdSession.sessionId);
				return attempts.some((a) => a.cardKey === `triad-zone:${C}`);
			},
			20
		);
		await quitAndRead(app, thirdSession);
		expect(third.every((p) => p.mechanic === 'triad-zone')).toBe(true);
		const zone = third.find((p) => p.voicing === C);
		expect(zone).toBeDefined();
		// The sensor listens for the shape that covers the fret named, and that shape only.
		expect(zone?.expectation.expected).toHaveLength(1);
		const shape = occurrenceOfId(zone!.expectation.expected[0]);
		expect(shape && voicingKey(shape.voicing)).toBe(C);
		expect(shape && cueFrets(shape)).toContain(zone?.fret);
		expect(zone?.prompt).toMatchObject({ primary: 'C', detail: 'sol‑si‑mi' });
		expect(zone?.prompt.secondary).toMatch(/^vers la case \d+$/);
		const attempts = await app.deps.attempts.all();
		const cold = attempts.find(
			(a) => a.cardKey === `triad-anchor:${C}` && a.phase === 'review' && a.temperature === 'cold'
		);
		expect(cold?.success).toBe(true);
	}, 30_000);

	it('probes a new chord unaided, then shows it aided on the next prompt after a miss, not at once', async () => {
		const app = await triadsApp();
		const controller = await startTriads(app, 'triads');
		const rounds = await playTriads(
			app,
			controller,
			(round) => (round.n === 0 ? { root: 'right', chord: 'wrong' } : allRight()),
			{ rounds: 3 }
		);
		await runUntil(app, () => controller.view.status !== 'awaiting');
		const attempts = await quitAndRead(app, controller);
		const [probe, between, aided] = rounds;
		// The first chord of the queue, unaided, on its root and chord: no shape drawn, at the
		// ladder's top lead; the sensor takes every octave of its shape.
		expect(probe).toMatchObject({ voicing: C, aided: false });
		expect(probe.prompt).toMatchObject({
			primary: 'C',
			secondary: 'fondamentale sur si',
			detail: 'sol‑si‑mi',
			aid: null,
			pictures: []
		});
		expect(probe.anchorBeat - probe.promptBeat).toBe(2);
		expect(probe.expectation.expected).toEqual([
			'C|maj|3:5,2:1,1:3@0-1-0',
			'C|maj|3:5,2:1,1:3@12-13-12'
		]);
		// Missed: its chord still rings, so another chord comes first; then C, its shape drawn.
		expect(between.voicing).not.toBe(C);
		expect(aided).toMatchObject({ voicing: C, aided: true });
		expect(aided.prompt.pictures).not.toEqual([]);
		// A missed probe measures no forgetting: stored hot.
		expect(attempts[0]).toMatchObject({
			cardKey: `triad-anchor:${C}`,
			phase: 'probe',
			temperature: 'hot',
			success: false,
			aids: []
		});
		expect(attempts[2]).toMatchObject({ cardKey: `triad-anchor:${C}`, phase: 'learning' });
		expect(attempts[2].aids).toEqual(expect.arrayContaining(['show-position']));
	});

	it('never asks the same voicing twice in a row', async () => {
		// Every chord new and every probe missed: the procedure would present each missed probe
		// aided at once (`presentsAtOnce`), the same voicing right after itself; and every miss puts
		// its retest due soon. The chord still rings: another one must come between.
		const app = await triadsApp();
		const controller = await startTriads(app, 'triads');
		const met = new Set<string>();
		const rounds = await playTriads(
			app,
			controller,
			(round) => {
				const probe = !met.has(round.voicing);
				met.add(round.voicing);
				return probe ? { root: 'right', chord: 'wrong' } : allRight();
			},
			{ rounds: 16, maxSteps: 60_000 }
		);
		await runUntil(app, () => controller.view.status !== 'awaiting');
		const attempts = await quitAndRead(app, controller);
		expect(rounds).toHaveLength(16);
		const voicings = attempts.map((a) => (a.data as TriadAnchorData).item.voicingKey);
		expect(voicings).toEqual(rounds.map((round) => round.voicing));
		for (let i = 1; i < voicings.length; i++) expect(voicings[i]).not.toBe(voicings[i - 1]);
		// Missed probes were followed, each by another chord, and came back aided later.
		const missedProbes = attempts.filter((a) => a.phase === 'probe' && !a.success);
		expect(missedProbes.length).toBeGreaterThanOrEqual(3);
		for (const probe of missedProbes) {
			const at = attempts.indexOf(probe);
			const back = attempts.findIndex((a, i) => i > at && a.cardKey === probe.cardKey);
			if (back < 0) continue;
			expect(back).toBeGreaterThan(at + 1);
			expect(attempts[back].aids).toEqual(expect.arrayContaining(['show-position']));
		}
	}, 30_000);

	it('asks in the zone a shape other than the last one stored, from attempts stored before H5', async () => {
		const shapesOfC = voicingOccurrences(parseVoicingKey(C));
		expect(shapesOfC.length).toBeGreaterThan(1);
		// The shape the zone would ask first, were nothing stored.
		const last = occurrencePosition(shapesOfC[0]);
		// Stored before H5: the item names its position, no fret.
		const old: Attempt = {
			sessionId: 's-old',
			exerciseId: 'triads-zone',
			mechanic: 'triad-zone',
			cardKey: `triad-zone:${C}`,
			phase: 'review',
			temperature: 'cold',
			aids: [],
			promptedAt: 1000,
			tempoBpm: 80,
			leadBeats: 2,
			timingOffsetMs: 0,
			reactionMs: 1500,
			correct: true,
			success: true,
			verdict: { relation: 'beat', version: 1, value: 'perfect' },
			measures: {},
			plan: null,
			data: { item: { voicingKey: C, position: last }, answer: null, confusion: null },
			observations: null
		};
		const app = await triadsApp({
			cards: [learnedTriad('triad-anchor', C), learnedTriad('triad-zone', C)],
			attempts: [old]
		});
		const controller = await startTriads(app, 'triads-zone');
		const [round] = await playTriads(app, controller, allRight, { rounds: 1 });
		await runUntil(app, () => controller.view.status !== 'awaiting');
		const [attempt] = await quitAndRead(app, controller);
		expect(round).toMatchObject({ mechanic: 'triad-zone', voicing: C });
		const asked = occurrenceOfId(round.expectation.expected[0]);
		expect(asked && occurrencePosition(asked)).not.toBe(last);
		expect((attempt.data as TriadZoneData).item.position).not.toBe(last);
	});
});

describe('the anchor in time', () => {
	it('judges the root on the beat, early or late as any timed note', async () => {
		const app = await triadsApp({
			cards: ORDER.slice(0, 3).map((voicing) => learnedTriad('triad-anchor', voicing))
		});
		const controller = await startTriads(app, 'triads');
		const offsets = [-200, 200, 0];
		await playTriads(app, controller, (round) => ({ rootOffsetMs: offsets[round.n] }), {
			rounds: 3
		});
		await runUntil(app, () => controller.view.status !== 'awaiting');
		const attempts = await quitAndRead(app, controller);
		expect(attempts.map((a) => (a.verdict.value as ResponseValue).verdict)).toEqual([
			'early',
			'late',
			'perfect'
		]);
		attempts.forEach((attempt, i) => expect(attempt.timingOffsetMs).toBeCloseTo(offsets[i], -1));
		// Early and late are right: the chord was, and so was the root.
		expect(attempts.map((a) => a.success)).toEqual([true, true, true]);
	});

	it('takes the chord in the band only: one strummed before it is no answer', async () => {
		const app = await triadsApp({ cards: [learnedTriad('triad-anchor', C)] });
		const controller = await startTriads(app, 'triads');
		// The right chord, half a beat after the root: the band opens a beat after it.
		await playTriads(app, controller, () => ({ chordBeats: 0.5 }), { rounds: 1 });
		await runUntil(app, () => controller.view.status === 'verdict');
		const [attempt] = await quitAndRead(app, controller);
		expect(attempt).toMatchObject({ success: false, correct: false });
		expect(attempt.data).toMatchObject({
			answer: { chord: null },
			confusion: { kind: 'no-chord', part: 'chord' }
		});
		expect(attempt.observations?.map((o) => [o.sensor, o.fate])).toEqual([
			['note', 'answer'],
			['chord', 'before-window']
		]);
	});
});

describe('what feeds FSRS', () => {
	it('leaves a card’s scheduling as it was on a hot attempt, moving its level only', async () => {
		const app = await triadsApp();
		const controller = await startTriads(app, 'triads');
		const key = `triad-anchor:${C}`;
		/** Steps until the session has stored `count` attempts. */
		const stored = async (count: number) => {
			for (let i = 0; i < 5000; i++) {
				await drain();
				if ((await app.deps.attempts.listBySession(controller.sessionId)).length >= count) return;
				await step(app);
			}
		};
		// C probed and missed: stored hot, its card made.
		await playTriads(app, controller, () => ({ chord: 'wrong' }), { rounds: 1 });
		await stored(1);
		const afterProbe = await app.deps.cards.get(key);
		expect(afterProbe).toBeDefined();
		// Another chord, then C aided, played right: a hot learning attempt.
		await playTriads(app, controller, allRight, { rounds: 2 });
		await stored(3);
		const attempts = await quitAndRead(app, controller);
		expect(attempts.map((a) => [a.cardKey === key, a.phase, a.temperature])).toEqual([
			[true, 'probe', 'hot'],
			[false, 'probe', expect.any(String)],
			[true, 'learning', 'hot']
		]);
		expect(attempts[2].success).toBe(true);
		const after = await app.deps.cards.get(key);
		expect(after?.scheduling).toEqual(afterProbe?.scheduling);
		expect(
			await app.deps.levels.get({ exerciseId: TRIADS_ANCHOR.id, scope: '', item: C })
		).toMatchObject({ level: 1 });
	});
});

describe('a triad put right in the band', () => {
	it('shows a wrong first chord at once, settles it corrected when put right in the band, stores one miss', async () => {
		const app = await triadsApp();
		const controller = await startTriads(app, 'triads');
		const round = await firstRound(app, controller);
		const beatS = 60 / controller.view.tempoBpm;
		const { right, wrong } = shapes(round);
		await runTo(app, round.targetAt);
		playRoot(app, round, true, round.targetAt);
		// Strummed in the band: from the beat after the root to the end of the bar.
		const wrongAt = round.targetAt + 1.5 * beatS;
		await runTo(app, wrongAt);
		playChord(app, wrong, wrongAt);
		await drain();
		// At once: the miss, the chord heard and the one expected drawn, while the band listens on.
		expect(controller.view.status).toBe('verdict');
		const shown = laneModel(controller)?.verdict;
		expect(shown?.verdict).toBe('wrong');
		expect(shown?.misses[0]?.heard).not.toBeNull();
		expect(shown?.misses[0]?.expected).not.toBeNull();
		// What tells them apart, in words.
		expect(shown?.misses[0]?.gap).toBeTruthy();
		expect(await app.deps.attempts.listBySession(controller.sessionId)).toEqual([]);

		const rightAt = round.targetAt + (ANCHOR_CHORD_BEATS + 0.5) * beatS;
		await runTo(app, rightAt);
		playChord(app, right, rightAt);
		await drain();
		expect(laneModel(controller)?.verdict?.verdict).toBe('corrected');
		expect(laneModel(controller)?.verdict?.misses[0]?.gap).toBeTruthy();
		const attempts = await quitAndRead(app, controller);
		expect(attempts).toHaveLength(1);
		expect(attempts[0]).toMatchObject({
			verdict: { relation: 'response', value: { verdict: 'corrected' } },
			correct: false,
			success: false
		});
		expect(attempts[0].data).toMatchObject({
			answer: { chord: { decided: wrong }, correction: { decided: right } }
		});
		expect((await cardOf(app, 'triad-anchor', round.voicing))?.learnedAt ?? null).toBeNull();
	});

	it('offers « Joué juste » on a miss in development only', async () => {
		for (const development of [true, false]) {
			const app = await triadsApp({ development });
			const controller = await startTriads(app, 'triads');
			await playTriads(app, controller, () => ({ root: 'right', chord: 'wrong' }), { rounds: 1 });
			const offers = new Set<string | null>();
			await runUntil(app, () => {
				offers.add(controller.view.contest);
				return controller.view.status === 'verdict';
			});
			// From the miss to the next prompt.
			await runUntil(app, () => {
				offers.add(controller.view.contest);
				return controller.view.status === 'awaiting';
			});
			if (development) {
				expect(offers.has('available')).toBe(true);
				// The next prompt takes the offer away.
				expect(controller.view.contest).toBeNull();
			} else {
				expect([...offers]).toEqual([null]);
			}
			const attempts = await quitAndRead(app, controller);
			expect(attempts[0]).toMatchObject({ success: false });
		}
	});

	it('labels the miss contested when « Joué juste » is pressed in development', async () => {
		const app = await triadsApp({ development: true });
		const controller = await startTriads(app, 'triads');
		await playTriads(app, controller, () => ({ root: 'right', chord: 'wrong' }), { rounds: 1 });
		await runUntil(app, () => controller.view.contest === 'available');
		controller.contest();
		await runUntil(app, () => controller.view.status === 'verdict');
		const [attempt] = await quitAndRead(app, controller);
		expect(attempt).toMatchObject({ success: false, contested: true });
	});
});

describe('what the chord sensor is told', () => {
	it('withdraws the chord expectation on pause: what the sensor reports then goes to the closing round', async () => {
		const app = await triadsApp();
		const controller = await startTriads(app, 'triads');
		const round = await firstRound(app, controller);
		const beatS = 60 / controller.view.tempoBpm;
		const { right } = shapes(round);
		await runTo(app, round.targetAt);
		playRoot(app, round, true, round.targetAt);
		// Strummed in the band; its window is still open when the player pauses.
		await runTo(app, round.targetAt + 1.8 * beatS);
		app.verifier.onWithdraw = () => playChord(app, right, round.targetAt + 1.5 * beatS);
		controller.pause();
		await drain();
		expect(app.verifier.expectations.at(-1)).toBeNull();
		const [attempt, ...others] = await quitAndRead(app, controller);
		expect(others).toEqual([]);
		expect(attempt).toMatchObject({ success: true, correct: true });
		expect((attempt.data as TriadAnchorData).answer?.chord).toEqual({ decided: right });
		expect(attempt.observations?.map((o) => [o.sensor, o.fate])).toEqual([
			['note', 'answer'],
			['chord', 'answer']
		]);
	});

	it('tells the chord sensor the chord just asked, and nothing after a pause', async () => {
		// C's three inversions due: each is the others' look-alike.
		const family = ORDER.slice(0, 3);
		const app = await triadsApp({
			cards: family.map((voicing) => learnedTriad('triad-anchor', voicing))
		});
		const inversionsOf = (voicing: string) => {
			const parsed = parseVoicingKey(voicing);
			return closeTriadVoicings(
				parsed.chord,
				parsed.strings.map((s) => s.string)
			).map(voicingKey);
		};
		const told = (round: TriadSeen) =>
			round.expectation.candidates.map((c) => voicingOfShape(c.id));
		const controller = await startTriads(app, 'triads');
		const [before, after] = await playTriads(app, controller, allRight, { rounds: 2 });
		// The chord asked just before still rings: never a candidate of the next one.
		expect(inversionsOf(after.voicing)).toContain(before.voicing);
		expect(told(after)).not.toContain(before.voicing);

		// Paused once the second chord is played: after the pause, nothing rings any more.
		controller.pause();
		controller.resume();
		const [resumed] = await playTriads(app, controller, allRight, { rounds: 1 });
		expect(resumed.voicing).not.toBe(after.voicing);
		for (const voicing of inversionsOf(resumed.voicing)) expect(told(resumed)).toContain(voicing);
		expect(expectationsTold(app)).toHaveLength(3);
		await quitAndRead(app, controller);
	});
});

describe('the length and the tempo of a triads session', () => {
	it('ends on the summary when the zone has nothing to ask', async () => {
		const app = await triadsApp({ cards: [learnedTriad('triad-anchor', C, { acquired: false })] });
		const controller = await startTriads(app, 'triads-zone');
		await drain();
		expect(controller.view.status).toBe('finished');
		expect(finishDestination(controller.sessionId)).toContain(controller.sessionId);
		const record = await app.deps.sessions.get(controller.sessionId);
		expect(record).toMatchObject({ kind: 'triads-zone' });
		expect(record?.endedAt).not.toBeNull();
		const summary = await app.services.sessionSummary(controller.sessionId);
		expect(summary).toMatchObject({ kind: 'triads-zone', attemptCount: 0 });
	});

	it('ends after SESSION_MS, a round under way finishing', async () => {
		const app = await triadsApp({
			cards: ORDER.slice(0, 6).map((voicing) => learnedTriad('triad-anchor', voicing))
		});
		const controller = await startTriads(app, 'triads');
		const startedAt = (await app.deps.sessions.get(controller.sessionId))?.startedAt as number;
		const spentAt = app.clock.now() + SESSION_MS / 1000;
		const rounds = await playTriads(app, controller, allRight, {
			stepS: 0.02,
			maxSteps: (SESSION_MS / 1000 + 60) / 0.02
		});
		await drain();
		expect(controller.view.status).toBe('finished');
		const attempts = await app.deps.attempts.listBySession(controller.sessionId);
		// Every round opened was played to its end and written: none cut at the limit.
		expect(attempts).toHaveLength(rounds.length);
		expect(attempts.every((a) => a.success)).toBe(true);
		expect(rounds.filter((round) => round.openedAt > spentAt).length).toBeLessThanOrEqual(1);
		const ended = (await app.deps.sessions.get(controller.sessionId))?.endedAt as number;
		expect(ended).toBeGreaterThanOrEqual(startedAt + SESSION_MS);
		expect(ended).toBeGreaterThan(Math.max(...attempts.map((a) => a.promptedAt)));
	}, 60_000);

	it('plays at 80 bpm whatever progression is stored, and writes none', async () => {
		const stored = {
			exerciseId: TRIADS_ANCHOR.id,
			mechanic: 'triad-anchor',
			tempoBpm: 160,
			updatedAt: 0
		};
		const app = await triadsApp({
			cards: ORDER.slice(0, 2).map((voicing) => learnedTriad('triad-anchor', voicing)),
			progressions: [stored]
		});
		const controller = await startTriads(app, 'triads');
		await playTriads(app, controller, allRight, { rounds: 2 });
		await runUntil(app, () => controller.view.status !== 'awaiting');
		expect(controller.view.tempoBpm).toBe(80);
		const attempts = await quitAndRead(app, controller);
		expect(attempts.map((a) => a.tempoBpm)).toEqual([80, 80]);
		const record = await app.deps.sessions.get(controller.sessionId);
		expect(record?.executions).toEqual([{ exerciseId: TRIADS_ANCHOR.id, tempoBpm: 80 }]);
		expect(await app.deps.progressions.all()).toEqual([stored]);
	});

	it('stores the attempt data as before', async () => {
		const app = await triadsApp({
			cards: [learnedTriad('triad-anchor', C), learnedTriad('triad-zone', C)]
		});
		const anchor = await startTriads(app, 'triads');
		const [asked] = await playTriads(app, anchor, allRight, { rounds: 1 });
		await runUntil(app, () => anchor.view.status !== 'awaiting');
		const [anchored] = await quitAndRead(app, anchor);
		const anchorData: TriadAnchorData = {
			item: { voicingKey: C },
			answer: { root: { midi: 60 }, chord: { decided: shapes(asked).right }, correction: null },
			confusion: null
		};
		expect(anchored.data).toEqual(anchorData);

		const zone = await startTriads(app, 'triads-zone');
		const [round] = await playTriads(app, zone, () => ({ chord: 'wrong' }), { rounds: 1 });
		await runUntil(app, () => zone.view.status !== 'awaiting');
		const [zoned] = await quitAndRead(app, zone);
		const shape = occurrenceOfId(round.expectation.expected[0])!;
		const wrong = round.expectation.candidates.find((c) => c.kind !== 'expected')!;
		const zoneData: TriadZoneData = {
			item: {
				voicingKey: C,
				position: occurrencePosition(shape),
				fret: round.fret as number
			},
			answer: { decided: wrong.id },
			confusion: { kind: wrong.kind as 'other-octave', part: 'chord' }
		};
		expect(zoned.data).toEqual(zoneData);
	});
});

describe('the play screen before the audio clock exists', () => {
	it.each([['triads'], ['triads-zone'], ['learn'], ['free']] as const)(
		'shows the start screen of a %s session before any gesture, then starts on the clock resumed',
		async (kind) => {
			const clock = new UnresumedClock();
			const app = await triadsApp({
				clock,
				cards: [learnedTriad('triad-anchor', C), learnedTriad('triad-zone', C)]
			});
			const controller = await app.services.startSession(kind);
			// The page asks it ready on mount, before any gesture: no audio clock to read yet.
			await controller.ready?.();
			expect(clock.resumed).toBe(false);
			expect(controller.view.status).toBe('idle');
			expect(controller.view.stage).not.toBeNull();
			// Start, from the player's gesture, resumes it.
			await controller.start();
			expect(clock.resumed).toBe(true);
			expect(controller.view.status).toBe('count-in');
			const record = await app.deps.sessions.get(controller.sessionId);
			expect(record?.startedAt).toBe(clock.toEpochMs(clock.now()));
			await quitAndRead(app, controller);
		}
	);
});
