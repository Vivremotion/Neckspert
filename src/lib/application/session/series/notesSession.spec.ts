import { describe, expect, it } from 'vitest';
import type { NoteLaneModel } from '$lib/application/mechanics/locate';
import type { PlaySessionController } from '$lib/application/session/contract';
import { LOCATE_NECK } from '$lib/domain/exercise';
import type { IdentifyData } from '$lib/domain/mechanics';
import {
	asNeckCard,
	isMirrorPair,
	locateItems,
	neckCardKey,
	openPitch,
	pitchOnString,
	type NeckCard
} from '$lib/domain/music';
import { STRING_PREVIEW_BEATS, RESPIRATION_BARS } from '$lib/domain/timing/grid';
import { STRING_AID_FADE_SUCCESSES } from '$lib/domain/progress/constants';
import { SESSION_MS } from '$lib/domain/session';
import { START_DELAY_S } from '$lib/application/session/transport';
import type { Attempt } from '$lib/domain/types';
import {
	allRight,
	drain,
	identify,
	learnedCard,
	levelOf,
	locate,
	notesApp,
	onStage,
	playRounds,
	rightName,
	runUntil,
	seeded,
	startNotes,
	step,
	type NotesApp
} from '$lib/testing/notesSeries';

/**
 * The notes' sessions on the response series (plan H4, Task 10): the real wiring of
 * `createAppServices` (neck subject, learning procedure, presenters, `neckPlan`), the stores in
 * memory, the transport on a fake clock. Each pedagogical rule kept by the migration is played
 * here as the player meets it: through the screen's model, the sounds and the stored attempts.
 */

const BEATS_PER_BAR = 4;

/** Quits and lets every write end; the session's attempts, in order. */
async function quitAndRead(app: NotesApp, controller: PlaySessionController): Promise<Attempt[]> {
	controller.quit();
	await drain();
	return app.deps.attempts.listBySession(controller.sessionId);
}

const keyOf = (card: NeckCard) => neckCardKey(card);

/** The note an attempt played, from its data. */
const cardOf = (attempt: Attempt): NeckCard =>
	asNeckCard({ mechanic: attempt.mechanic, item: (attempt.data as { item: unknown }).item });

/** The note lane on stage, if any. */
function lane(controller: PlaySessionController): NoteLaneModel | null {
	const stage = controller.view.stage;
	return stage?.view === 'note-lane' ? (stage.model as NoteLaneModel) : null;
}

/** Every locate note learned, acquired and due: a learn session full of cold reviews on the beat. */
const ALL_LOCATE = locateItems().map((item) => learnedCard({ mechanic: 'locate', item }));

describe('a learn session of the notes', () => {
	it('probes a new note unaided, then presents it aided at once after a miss, with the string drawn', async () => {
		const app = await notesApp();
		const controller = await startNotes(app, 'learn');
		const rounds = await playRounds(
			app,
			controller,
			(round) => (round.n === 0 ? { play: 'none' } : allRight()),
			{ rounds: 8 }
		);
		const [probe, aided] = rounds;
		// The first note of the queue, unaided: no position, no string drawn.
		expect(probe.prompt).toMatchObject({
			primary: 'G',
			secondary: 'corde de E grave',
			aid: null,
			diagram: null
		});
		// Missed: the very next prompt is the same note, its position shown and its string drawn.
		expect(aided.card).toEqual(probe.card);
		expect(aided.prompt.aid).not.toBeNull();
		expect(aided.prompt.diagram).not.toBeNull();
		// Played right STRING_AID_FADE_SUCCESSES times (the aided one first): when it comes back,
		// the string drawn has faded (and the position too).
		const met = rounds.filter((round) => keyOf(round.card) === keyOf(probe.card));
		const back = met[1 + STRING_AID_FADE_SUCCESSES];
		expect(back).toBeDefined();
		expect(back?.prompt.diagram).toBeNull();
		expect(back?.prompt.aid).toBeNull();

		const attempts = await quitAndRead(app, controller);
		// A missed probe measures no forgetting: stored hot.
		expect(attempts[0]).toMatchObject({
			cardKey: keyOf(probe.card),
			phase: 'probe',
			temperature: 'hot',
			success: false,
			aids: []
		});
		expect(attempts[1]).toMatchObject({
			cardKey: keyOf(probe.card),
			phase: 'learning',
			temperature: 'hot',
			success: true
		});
		expect(attempts[1].aids).toEqual(expect.arrayContaining(['show-position']));
	});

	it('brings a missed note back as a spaced retest, never at once', async () => {
		const app = await notesApp({
			// Solid notes to play between: a miss calls for one of them next.
			cards: [learnedCard(locate(5, 'C')), learnedCard(locate(4, 'F')), learnedCard(locate(3, 'D'))]
		});
		const controller = await startNotes(app, 'learn');
		const g = keyOf(locate(6, 'G'));
		let misses = 0;
		const rounds = await playRounds(
			app,
			controller,
			// G on the low E string, the first new note to play, missed probed then missed aided.
			(round) => (keyOf(round.card) === g && misses++ < 2 ? { play: 'none' } : allRight()),
			{ rounds: 14 }
		);
		const at = rounds.flatMap((round) => (keyOf(round.card) === g ? [round.n] : []));
		const attempts = await quitAndRead(app, controller);
		// Probed, presented aided at once, then back only after other notes.
		expect(at.length).toBeGreaterThanOrEqual(3);
		expect(at[1]).toBe(at[0] + 1);
		expect(at[2]).toBeGreaterThan(at[1] + 1);
		expect(attempts.filter((a) => a.cardKey === g).map((a) => a.phase)).toEqual(
			expect.arrayContaining(['probe', 'learning', 'learning'])
		);
		// Between the two misses and the retest: never the missed note.
		for (const round of rounds.slice(at[1] + 1, at[2])) expect(keyOf(round.card)).not.toBe(g);
	});

	it('grades a cold review through fsrs and moves its level; a hot one moves only its level', async () => {
		const review = locate(5, 'C');
		// At ♩ = 80 the ladder is 8, 4, 2: level 2 is its top.
		const app = await notesApp({ cards: [learnedCard(review)], levels: [levelOf(review, 2)] });
		const before = await app.deps.cards.get(keyOf(review));
		const controller = await startNotes(app, 'learn');
		const rounds = await playRounds(
			app,
			controller,
			// The review right, the new note's probe missed, its aided presentation right.
			(round) => (round.n === 1 ? { play: 'wrong' } : allRight()),
			{ rounds: 2 }
		);
		await drain();
		const probed = rounds[1].card;
		const afterProbe = await app.deps.cards.get(keyOf(probed));
		expect(afterProbe).toBeDefined();
		const levelAfterProbe = await app.deps.levels.get(levelOf(probed, 0));
		await playRounds(app, controller, allRight, { rounds: 1 });
		const attempts = await quitAndRead(app, controller);

		expect(keyOf(rounds[0].card)).toBe(keyOf(review));
		expect(attempts.map((a) => [a.phase, a.temperature, a.success])).toEqual([
			['review', 'cold', true],
			['probe', 'hot', false],
			['learning', 'hot', true]
		]);
		// The cold review went through FSRS and moved its level at the top.
		const reviewed = await app.deps.cards.get(keyOf(review));
		expect(reviewed?.scheduling).not.toEqual(before?.scheduling);
		expect(reviewed?.scheduling.reps).toBe((before?.scheduling.reps ?? 0) + 1);
		expect(await app.deps.levels.get(levelOf(review, 2))).toMatchObject({ level: 2, successes: 1 });
		// The hot one moved its level only: its card's scheduling is as the probe left it.
		expect(levelAfterProbe?.level).toBe(0);
		expect(await app.deps.levels.get(levelOf(probed, 0))).toMatchObject({ level: 1 });
		expect((await app.deps.cards.get(keyOf(probed)))?.scheduling).toEqual(afterProbe?.scheduling);
	});

	it('never serves a note right after itself nor its mirror', async () => {
		// A on the low E string and E on the A string mirror each other.
		const app = await notesApp({
			cards: [
				learnedCard(locate(6, 'A')),
				learnedCard(locate(5, 'E')),
				learnedCard(locate(4, 'C')),
				learnedCard(locate(5, 'A')),
				learnedCard(identify(6, 5)),
				learnedCard(identify(5, 7))
			],
			random: seeded(7)
		});
		const controller = await startNotes(app, 'learn');
		const rounds = await playRounds(
			app,
			controller,
			(round) => (round.n % 4 === 3 ? { play: 'wrong' } : allRight()),
			{ rounds: 24 }
		);
		const attempts = await quitAndRead(app, controller);
		expect(rounds).toHaveLength(24);
		expect(attempts.map((a) => a.cardKey)).toEqual(rounds.map((round) => keyOf(round.card)));
		expect(attempts.map((a) => a.cardKey)).toEqual(
			expect.arrayContaining([keyOf(locate(6, 'A')), keyOf(locate(5, 'E'))])
		);
		let checked = 0;
		for (let i = 1; i < attempts.length; i++) {
			const [before, after] = [attempts[i - 1], attempts[i]];
			// The one exception: a missed probe is presented aided at once.
			if (before.phase === 'probe' && !before.success) {
				expect(after).toMatchObject({ cardKey: before.cardKey, phase: 'learning' });
				continue;
			}
			checked++;
			expect(after.cardKey).not.toBe(before.cardKey);
			expect(isMirrorPair(cardOf(before), cardOf(after))).toBe(false);
		}
		expect(checked).toBeGreaterThan(20);
	});

	it('lands every locate target on a downbeat, a breathing bar after the one before', async () => {
		const app = await notesApp({ cards: ALL_LOCATE, random: seeded(3) });
		const controller = await startNotes(app, 'learn');
		const accents: number[] = [];
		const rounds = await playRounds(app, controller, allRight, { rounds: 12 });
		for (const sound of app.sounds.emitted()) {
			if (sound.sound === 'click-accent') accents.push(Math.round(sound.time * 1000));
		}
		await quitAndRead(app, controller);
		const notes = rounds.filter((round) => round.card.mechanic === 'locate');
		expect(notes.length).toBeGreaterThanOrEqual(10);
		let pairs = 0;
		for (const [i, note] of notes.entries()) {
			const anchor = note.anchorBeat as number;
			const prompt = note.promptBeat as number;
			// On beat 1 of a bar, its accented click sounding there.
			expect(anchor % BEATS_PER_BAR).toBe(0);
			expect(accents).toContain(Math.round(note.dueAt * 1000));
			// Its lead is one of the ladder's: the prompt on beat 1 or 3.
			expect([2, 4, 8]).toContain(anchor - prompt);
			if (i === 0 || rounds[note.n - 1]?.card.mechanic !== 'locate') continue;
			// After the target before: its breathing bar, then the first bar the lead allows.
			const previous = notes[i - 1].anchorBeat as number;
			expect(prompt - previous).toBeGreaterThanOrEqual(RESPIRATION_BARS * BEATS_PER_BAR);
			expect(prompt - previous).toBeLessThan((RESPIRATION_BARS + 1) * BEATS_PER_BAR);
			pairs++;
		}
		expect(pairs).toBeGreaterThan(0);
	});

	it('shows the string a beat before the note, the correction staying through the breath', async () => {
		const app = await notesApp({ cards: ALL_LOCATE, random: seeded(5) });
		const controller = await startNotes(app, 'learn');
		const [missed] = await playRounds(app, controller, () => ({ play: 'wrong' }), { rounds: 1 });
		// Settled: the miss and its correction (« corde de …, case … ») on the lane.
		await runUntil(app, () => controller.view.status === 'verdict');
		const settledAt = controller.timeline.nowBeat();
		expect(lane(controller)?.verdict).toMatchObject({ verdict: 'wrong' });
		expect(lane(controller)?.verdict?.correction).toMatch(/^corde de .+, case \d+$/);
		// Through the breath it stays, at every step, until the next note's string shows.
		let shownAt: number | null = null;
		let kept = true;
		await runUntil(app, () => {
			const model = lane(controller);
			if (model && model.anchorBeat === null) {
				shownAt = controller.timeline.nowBeat();
				return true;
			}
			if (!model?.verdict?.correction) kept = false;
			return false;
		});
		expect(kept).toBe(true);
		const preview = lane(controller);
		expect(preview?.verdict).toBeNull();
		expect(onStage(controller)?.card.mechanic).toBe('locate');
		const promptBeat = preview?.promptBeat as number;
		// The next prompt a breathing bar at least after the missed target; its string a beat
		// before it (to the step).
		expect(promptBeat - (missed.anchorBeat as number)).toBeGreaterThanOrEqual(
			RESPIRATION_BARS * BEATS_PER_BAR
		);
		expect(shownAt).toBeCloseTo(promptBeat - STRING_PREVIEW_BEATS, 1);
		expect(shownAt as unknown as number).toBeGreaterThan(settledAt);
		// The note itself at its prompt.
		await runUntil(app, () => controller.view.status === 'awaiting');
		expect(lane(controller)?.anchorBeat).not.toBeNull();
		expect(controller.timeline.nowBeat()).toBeCloseTo(promptBeat, 1);
		await quitAndRead(app, controller);
	});

	it('answers identify by a tap, silently, and counts a sounding bar back to the guitar', async () => {
		// Two names to tap due, then a new note to play: identify, identify, locate.
		const app = await notesApp({
			cards: [learnedCard(identify(5, 3)), learnedCard(identify(4, 5))]
		});
		const controller = await startNotes(app, 'learn');
		// A tap during the (silent) count before the first name is no answer.
		await runUntil(app, () => controller.view.status === 'count-in');
		expect(controller.view.status).toBe('count-in');
		controller.answer('A');
		await runUntil(app, () => controller.view.status === 'awaiting');
		const first = onStage(controller);
		expect(first?.card.mechanic).toBe('identify');
		for (let i = 0; i < 60; i++) await step(app);
		const right = rightName((first?.card as Extract<NeckCard, { mechanic: 'identify' }>).item);
		// Two taps: the first answers, the second comes after the answer.
		controller.answer(right);
		expect(controller.view.status).toBe('verdict');
		controller.answer(right === 'C' ? 'D' : 'C');
		expect(app.sounds.emitted()).toEqual([]);
		const rest = await playRounds(app, controller, allRight, { rounds: 2 });
		expect(rest.map((round) => round.card.mechanic)).toEqual(['identify', 'locate']);
		const attempts = await quitAndRead(app, controller);
		const [tapped] = attempts;
		expect(tapped).toMatchObject({
			mechanic: 'identify',
			phase: 'review',
			temperature: 'cold',
			success: true
		});
		expect((tapped.data as IdentifyData).answer).toEqual({ pitch: right });
		expect(tapped.reactionMs).toBeGreaterThan(500);
		expect(tapped.observations?.map((o) => o.fate)).toEqual(['answer', 'settled']);
		expect(tapped.observations?.map((o) => o.sensor)).toEqual(['tap', 'tap']);
	});

	it('starts a learn session on identify without a click', async () => {
		const app = await notesApp({ cards: [learnedCard(identify(5, 3))] });
		const controller = await startNotes(app, 'learn');
		const [named] = await playRounds(app, controller, allRight, { rounds: 1 });
		expect(named.card.mechanic).toBe('identify');
		await runUntil(app, () => controller.view.status === 'count-in');
		// Nothing sounded from the start to the name's answer.
		const answeredAt = named.answeredAt as number;
		expect(app.sounds.emitted().filter((s) => s.time <= answeredAt)).toEqual([]);
		// Back to the guitar: a counted bar that sounds, its countdown shown, then the note.
		const countdowns: number[] = [];
		await runUntil(app, () => {
			const { countdown } = controller.view;
			if (countdown !== null && countdowns.at(-1) !== countdown) countdowns.push(countdown);
			return controller.view.status === 'awaiting';
		});
		const note = onStage(controller);
		expect(note?.card.mechanic).toBe('locate');
		const promptTime = app.clock.now();
		const clicks = app.sounds.emitted().filter((s) => s.time > answeredAt && s.time < promptTime);
		expect(clicks.length).toBeGreaterThanOrEqual(BEATS_PER_BAR);
		expect(countdowns.length).toBe(BEATS_PER_BAR);
		const beatS = 60 / controller.view.tempoBpm;
		// The count's first click at least a bar before the prompt.
		expect(promptTime - clicks[0].time).toBeGreaterThanOrEqual(BEATS_PER_BAR * beatS - 0.02);
		await quitAndRead(app, controller);
	});

	it('keeps a named note off the note lane that follows', async () => {
		// A name to tap due, then a new note to play: identify, a counted bar, locate.
		const app = await notesApp({ cards: [learnedCard(identify(5, 3))] });
		const controller = await startNotes(app, 'learn');
		const [named, played] = await playRounds(app, controller, allRight, { rounds: 2 });
		expect([named.card.mechanic, played.card.mechanic]).toEqual(['identify', 'locate']);
		// Settled, the lane of the note shows its own tile, none for the name tapped before it.
		expect(lane(controller)?.history).toEqual([
			{ beatIndex: played.anchorBeat, verdict: 'perfect' }
		]);
		await quitAndRead(app, controller);
	});

	it('counts back to the guitar no sooner than the start delay after a tap near a bar line', async () => {
		const app = await notesApp({ cards: [learnedCard(identify(5, 3))] });
		const controller = await startNotes(app, 'learn');
		await runUntil(app, () => controller.view.status === 'awaiting');
		const named = onStage(controller);
		expect(named?.card.mechanic).toBe('identify');
		const beatS = 60 / controller.view.tempoBpm;
		const nextBar = (Math.floor(controller.timeline.nowBeat() / BEATS_PER_BAR) + 1) * BEATS_PER_BAR;
		// Tapped a few ms before the next bar line.
		await runUntil(app, () => (nextBar - controller.timeline.nowBeat()) * beatS <= 0.05);
		const tappedAt = app.clock.now();
		expect((nextBar - controller.timeline.nowBeat()) * beatS).toBeGreaterThan(0);
		controller.answer(rightName((named?.card as Extract<NeckCard, { mechanic: 'identify' }>).item));
		await runUntil(app, () => controller.view.status === 'awaiting');
		expect(onStage(controller)?.card.mechanic).toBe('locate');
		// The count's first click, the first sound since the tap.
		const [first] = app.sounds.emitted().filter((s) => s.time >= tappedAt);
		expect(first).toBeDefined();
		expect(first.time - tappedAt).toBeGreaterThanOrEqual(START_DELAY_S);
		await quitAndRead(app, controller);
	});

	it('serves a short lead at the top of the ladder at a fast tempo, and writes that level', async () => {
		const card = locate(6, 'G');
		// Learned at lead 2 (level 2 at ♩ = 80); ♩ = 160 brings the ladder to 8, 4.
		const app = await notesApp({
			cards: [learnedCard(card)],
			levels: [levelOf(card, 2)],
			progressions: [
				{ exerciseId: LOCATE_NECK.id, mechanic: 'locate', tempoBpm: 160, updatedAt: 0 }
			]
		});
		const controller = await startNotes(app, 'learn');
		const [played] = await playRounds(app, controller, allRight, { rounds: 1 });
		await runUntil(app, () => controller.view.status === 'verdict');
		const attempts = await quitAndRead(app, controller);
		expect(controller.view.tempoBpm).toBe(160);
		expect(keyOf(played.card)).toBe(keyOf(card));
		// Served at lead 4, played right: its level is written as played, at the top of this ladder.
		expect((played.anchorBeat as number) - (played.promptBeat as number)).toBe(4);
		expect(attempts[0]).toMatchObject({ leadBeats: 4, temperature: 'cold', success: true });
		expect(await app.deps.levels.get(levelOf(card, 2))).toMatchObject({ level: 1, successes: 1 });
	});

	it('ends after SESSION_MS once the round under way settles, and moves the locate tempo', async () => {
		const app = await notesApp({ cards: ALL_LOCATE, random: seeded(11) });
		const controller = await startNotes(app, 'learn');
		const record = await app.deps.sessions.get(controller.sessionId);
		const startedAt = record?.startedAt as number;
		const spentAt = app.clock.now() + SESSION_MS / 1000;
		const rounds = await playRounds(app, controller, allRight, {
			stepS: 0.02,
			maxSteps: (SESSION_MS / 1000 + 60) / 0.02
		});
		await drain();
		expect(controller.view.status).toBe('finished');
		const attempts = await app.deps.attempts.listBySession(controller.sessionId);
		// Every round opened was played to its end and written: none cut at the limit.
		expect(attempts).toHaveLength(rounds.length);
		expect(attempts.every((a) => a.success)).toBe(true);
		// None opened after the limit but the one chosen before it, which ended the session.
		const late = rounds.filter((round) => round.openedAt > spentAt);
		expect(late.length).toBeLessThanOrEqual(1);
		const ended = (await app.deps.sessions.get(controller.sessionId))?.endedAt as number;
		expect(ended).toBeGreaterThanOrEqual(startedAt + SESSION_MS);
		const lastPrompt = Math.max(...attempts.map((a) => a.promptedAt));
		expect(ended).toBeGreaterThan(lastPrompt);
		// All right at ♩ = 80: the locate tempo moves up; identify has none.
		const progressions = await app.deps.progressions.all();
		expect(progressions).toEqual([
			expect.objectContaining({ exerciseId: LOCATE_NECK.id, tempoBpm: 85 })
		]);
	}, 30_000);

	it('writes attempts the summary and the neck map read as before', async () => {
		const note = locate(5, 'C');
		const name = identify(4, 5);
		const app = await notesApp({ cards: [learnedCard(note), learnedCard(name)] });
		const controller = await startNotes(app, 'learn');
		const rounds = await playRounds(
			app,
			controller,
			(round) =>
				round.card.mechanic === 'locate'
					? { play: 'right', offsetMs: 30 }
					: { play: 'right', afterMs: 900 },
			{ rounds: 2 }
		);
		await runUntil(app, () => controller.view.status !== 'awaiting');
		const attempts = await quitAndRead(app, controller);
		expect(rounds.map((round) => keyOf(round.card))).toEqual([keyOf(note), keyOf(name)]);
		const [located, named] = attempts;
		expect(located.timingOffsetMs).toBeCloseTo(30, 0);
		expect(named.reactionMs).toBeGreaterThanOrEqual(900);
		expect(named.reactionMs).toBeLessThan(950);

		const summary = await app.services.sessionSummary(controller.sessionId);
		expect(summary).toMatchObject({
			sessionId: controller.sessionId,
			pool: 'cold',
			attemptCount: 2,
			correctCount: 2,
			tempoBpm: 80,
			kind: 'learn'
		});
		expect(summary.medianOffsetMs).toBeCloseTo(30, 0);
		expect(summary.identifyMedianReactionMs).toBe(named.reactionMs);

		const map = await app.services.neckMap();
		const cell = (string: number, fret: number) =>
			map.find((c) => c.string === string && c.fret === fret);
		// C on the A string, fret 3: its last cold recall at its lead and tempo.
		expect(cell(5, 3)).toMatchObject({
			pitch: 'C',
			locate: expect.stringMatching(/acquired|mastered/),
			locateRecallMs: ((located.leadBeats as number) * 60_000) / 80,
			coldAccuracy: 1
		});
		expect(cell(4, 5)).toMatchObject({
			pitch: pitchOnString(4, 5),
			identifyMedianReactionMs: named.reactionMs,
			coldAccuracy: 1
		});
	});
});

describe('notes across sessions', () => {
	it('serves in the next session the level the recorder wrote in this one', async () => {
		const card = locate(5, 'C');
		// At ♩ = 80 the ladder is 8, 4, 2: level 1 plays at lead 4, level 2 at lead 2.
		const app = await notesApp({ cards: [learnedCard(card)], levels: [levelOf(card, 1)] });
		const first = await startNotes(app, 'learn');
		const [before] = await playRounds(app, first, allRight, { rounds: 1 });
		await runUntil(app, () => first.view.status === 'verdict');
		await quitAndRead(app, first);
		expect(keyOf(before.card)).toBe(keyOf(card));
		expect((before.anchorBeat as number) - (before.promptBeat as number)).toBe(4);
		expect(await app.deps.levels.get(levelOf(card, 0))).toMatchObject({ level: 2 });

		// Due again a month later, on the same stores.
		app.clock.advance(30 * 24 * 3600);
		const second = await startNotes(app, 'learn');
		const [after] = await playRounds(app, second, allRight, { rounds: 1 });
		await quitAndRead(app, second);
		expect(second.sessionId).not.toBe(first.sessionId);
		expect(keyOf(after.card)).toBe(keyOf(card));
		expect((after.anchorBeat as number) - (after.promptBeat as number)).toBe(2);
	});
});

describe('a free session of the notes', () => {
	it('never prompts an open string', async () => {
		const app = await notesApp({ random: seeded(13) });
		const controller = await startNotes(app, 'free');
		// The whole list, to its end.
		const rounds = await playRounds(app, controller, allRight);
		await drain();
		expect(controller.view.status).toBe('finished');
		const attempts = await app.deps.attempts.listBySession(controller.sessionId);
		expect(rounds.length).toBeGreaterThanOrEqual(10);
		expect(attempts).toHaveLength(rounds.length);
		for (const round of rounds) {
			if (round.card.mechanic === 'identify') expect(round.card.item.fret).not.toBe(0);
			else expect(round.card.item.pitch).not.toBe(openPitch(round.card.item.string));
		}
	});
});

describe('stops and misses on the notes', () => {
	it('writes the attempt once when paused in the breath after a miss, and counts in on resume', async () => {
		const app = await notesApp({ cards: ALL_LOCATE, random: seeded(17) });
		const controller = await startNotes(app, 'learn');
		const [missed] = await playRounds(app, controller, () => ({ play: 'wrong' }), { rounds: 1 });
		await runUntil(app, () => controller.view.status === 'verdict');
		// In the breathing bar: settled, the next note not shown yet.
		await runUntil(app, () => controller.timeline.nowBeat() >= (missed.anchorBeat as number) + 1.5);
		expect(controller.view.status).toBe('verdict');
		controller.pause();
		expect(controller.view.status).toBe('paused');
		for (let i = 0; i < 100; i++) await step(app);
		await drain();
		const key = keyOf(missed.card);
		const afterPause = await app.deps.attempts.listBySession(controller.sessionId);
		expect(afterPause.filter((a) => a.cardKey === key)).toHaveLength(1);

		controller.resume();
		expect(controller.view.status).toBe('count-in');
		const countdowns: number[] = [];
		await runUntil(app, () => {
			const { countdown } = controller.view;
			if (countdown !== null && countdowns.at(-1) !== countdown) countdowns.push(countdown);
			return controller.view.status === 'awaiting';
		});
		expect(countdowns).toHaveLength(BEATS_PER_BAR);
		expect(app.sounds.emitted().length).toBeGreaterThanOrEqual(BEATS_PER_BAR);
		expect(onStage(controller)?.card.mechanic).toBe('locate');
		const attempts = await quitAndRead(app, controller);
		expect(attempts.filter((a) => a.cardKey === key)).toHaveLength(1);
		expect(attempts[0]).toMatchObject({ cardKey: key, success: false });
	});

	it('ends on resume when SESSION_MS was spent during a pause in the breath', async () => {
		const app = await notesApp({ cards: ALL_LOCATE, random: seeded(17) });
		const controller = await startNotes(app, 'learn');
		const [played] = await playRounds(app, controller, allRight, { rounds: 1 });
		await runUntil(app, () => controller.view.status === 'verdict');
		// In the breathing bar, the next note already chosen and held.
		await runUntil(app, () => controller.timeline.nowBeat() >= (played.anchorBeat as number) + 1.5);
		controller.pause();
		expect(controller.view.status).toBe('paused');
		app.clock.advance(SESSION_MS / 1000);
		controller.resume();
		await drain();
		expect(controller.view.status).toBe('finished');
		const attempts = await app.deps.attempts.listBySession(controller.sessionId);
		expect(attempts).toHaveLength(1);
		expect((await app.deps.sessions.get(controller.sessionId))?.endedAt).not.toBeNull();
	});

	it('offers no « Joué juste » on a note, even in development', async () => {
		const app = await notesApp({ cards: ALL_LOCATE, development: true, random: seeded(19) });
		const controller = await startNotes(app, 'learn');
		const [missed] = await playRounds(app, controller, () => ({ play: 'wrong' }), { rounds: 1 });
		// From the miss to the next prompt, nothing to contest.
		const contests = new Set<string | null>();
		await runUntil(app, () => controller.view.status === 'verdict');
		await runUntil(app, () => {
			contests.add(controller.view.contest);
			return controller.view.status === 'awaiting';
		});
		const attempts = await quitAndRead(app, controller);
		expect(attempts[0]).toMatchObject({ cardKey: keyOf(missed.card), success: false });
		expect([...contests]).toEqual([null]);
	});
});
