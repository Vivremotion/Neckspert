import { DEFAULT_PREVIEW_BEATS, DEFAULT_RESPIRATION_BARS } from '$lib/domain/exercise/pacing';
import { describe, expect, it } from 'vitest';
import type { PromptStageModel } from '$lib/application/presentation';
import type { PlaySessionController } from '$lib/application/session/contract';
import type { IdentifyData } from '$lib/domain/sets';
import { LEARNABLE_FRETS, locateItems, neckCardKey, type NeckCard } from '$lib/testing/neck';
import { openPitch, pitchOnString, type IdentifyItem, type LocateItem } from '$lib/domain/music';
import type { PitchName } from '$lib/domain/music/types';
import { introduceCard } from '$lib/domain/progress';
import { LOCATE_NECK, TRIADS_ANCHOR } from '$lib/testing/catalog';
import { DEFAULT_ITEM_LEARNING } from '$lib/domain/learning/params';
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
 * The notes' sessions on the session controller (plan H4, Task 10): the real wiring of
 * `createAppServices` (neck subject, learning procedure, presenters, the round templates), the stores in
 * memory, the transport on a fake clock. Each pedagogical rule kept by the migration is played
 * here as the player meets it: through the screen's model, the sounds and the stored attempts.
 */

const BAR_BEATS = 4;

/** Quits and lets every write end; the session's attempts, in order. */
async function quitAndRead(app: NotesApp, controller: PlaySessionController): Promise<Attempt[]> {
	controller.quit();
	await drain();
	return app.deps.attempts.listBySession(controller.sessionId);
}

const keyOf = (card: NeckCard) => neckCardKey(card);

/** The note lane on stage, if any. */
function lane(controller: PlaySessionController): PromptStageModel | null {
	const stage = controller.view.stage;
	return stage?.view === 'lane' ? (stage.model as PromptStageModel) : null;
}

/** Every locate note learned, acquired and due: a learn session full of cold reviews on the beat. */
const ALL_LOCATE = locateItems().map((item) => learnedCard({ skill: 'locate-note-string', item }));

describe('a learn session of the notes', () => {
	it('shows the lane of locate from the start screen, before any sound', async () => {
		const app = await notesApp();
		const controller = await app.services.startRoutine('notes');
		expect(controller.view.stage).toBeNull();
		await controller.ready?.();
		expect(controller.view.status).toBe('idle');
		expect(controller.view.stage?.view).toBe('lane');
		expect(app.sounds.emitted()).toEqual([]);
	});

	it('presents a new note at level 1 from its first prompt, its position shown and its string drawn', async () => {
		const app = await notesApp();
		const controller = await startNotes(app, 'learn');
		const rounds = await playRounds(app, controller, allRight, { rounds: 8 });
		const [first] = rounds;
		// The first note of the queue, as level 1 shows it: its position and its string.
		expect(first.prompt).toMatchObject({ primary: 'G', secondary: 'corde de E grave' });
		expect(first.prompt.aid).not.toBeNull();
		expect(first.prompt.pictures).not.toEqual([]);
		// Played right DEFAULT_ITEM_LEARNING.aidFadeSuccesses times: when it comes back, a level up,
		// the string drawn has faded (and the position too).
		const met = rounds.filter((round) => keyOf(round.card) === keyOf(first.card));
		const back = met[DEFAULT_ITEM_LEARNING.aidFadeSuccesses];
		expect(back).toBeDefined();
		expect(back?.prompt.pictures).toEqual([]);
		expect(back?.prompt.aid).toBeNull();

		const attempts = await quitAndRead(app, controller);
		// Learning, not a review: stored hot.
		expect(attempts[0]).toMatchObject({
			cardKey: keyOf(first.card),
			phase: 'learning',
			temperature: 'hot',
			success: true
		});
		expect(attempts[0].aids).toEqual(expect.arrayContaining(['show-position']));
	});

	it('brings a missed new note back as a spaced retest, never at once', async () => {
		// Solid notes to play between: a miss calls for one of them next.
		const solid = [
			learnedCard(locate(5, 'C')),
			learnedCard(locate(4, 'F')),
			learnedCard(locate(3, 'D'))
		];
		const app = await notesApp({ cards: solid });
		const controller = await startNotes(app, 'learn');
		const known = new Set(solid.map((card) => card.key));
		/** The first new note served, missed at its first prompt. */
		let missed: string | null = null;
		const rounds = await playRounds(
			app,
			controller,
			(round) => {
				if (missed !== null || known.has(keyOf(round.card))) return allRight();
				missed = keyOf(round.card);
				return { play: 'wrong' };
			},
			{ rounds: 14 }
		);
		const at = rounds.flatMap((round) => (keyOf(round.card) === missed ? [round.n] : []));
		const attempts = await quitAndRead(app, controller);
		// Presented, then back only after other notes.
		expect(at.length).toBeGreaterThanOrEqual(2);
		expect(at[1]).toBeGreaterThan(at[0] + 1);
		expect(new Set(attempts.filter((a) => a.cardKey === missed).map((a) => a.phase))).toEqual(
			new Set(['learning'])
		);
		// Between the miss and the retest: never the missed note.
		for (const round of rounds.slice(at[0] + 1, at[1])) expect(keyOf(round.card)).not.toBe(missed);
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
			// The review right, the new note missed at its first prompt.
			(round) => (round.n === 1 ? { play: 'wrong' } : allRight()),
			{ rounds: 2 }
		);
		await drain();
		const reviewLevel = await app.deps.levels.get(levelOf(review, 2));
		const introduced = rounds[1].card;
		// Its card is made by the record of its first attempt.
		const afterFirst = await app.deps.cards.get(keyOf(introduced));
		expect(afterFirst).toMatchObject({
			introducedInSession: controller.sessionId,
			learnedAt: null
		});
		expect(await app.deps.levels.get(levelOf(introduced, 0))).toMatchObject({ level: 0 });
		// Played right when it comes back.
		for (let round = 0; round < 8; round++) {
			const [played] = await playRounds(app, controller, allRight, { rounds: 1 });
			if (keyOf(played.card) === keyOf(introduced)) break;
		}
		const attempts = await quitAndRead(app, controller);

		expect(keyOf(rounds[0].card)).toBe(keyOf(review));
		expect(attempts[0]).toMatchObject({ phase: 'review', temperature: 'cold', success: true });
		expect(
			attempts
				.filter((a) => a.cardKey === keyOf(introduced))
				.map((a) => [a.phase, a.temperature, a.success])
		).toEqual([
			['learning', 'hot', false],
			['learning', 'hot', true]
		]);
		// The cold review went through FSRS and moved its level at the top.
		const reviewed = await app.deps.cards.get(keyOf(review));
		expect(reviewed?.scheduling).not.toEqual(before?.scheduling);
		expect(reviewed?.scheduling.reps).toBe((before?.scheduling.reps ?? 0) + 1);
		expect(reviewLevel).toMatchObject({ level: 2, successes: 1 });
		// The hot one moved its level only: its card's scheduling is as its first attempt left it.
		expect(await app.deps.levels.get(levelOf(introduced, 0))).toMatchObject({ level: 1 });
		expect((await app.deps.cards.get(keyOf(introduced)))?.scheduling).toEqual(
			afterFirst?.scheduling
		);
	});

	it('never serves a note right after itself', async () => {
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
		for (let i = 1; i < attempts.length; i++) {
			expect(attempts[i].cardKey).not.toBe(attempts[i - 1].cardKey);
		}
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
		const notes = rounds.filter((round) => round.card.skill === 'locate-note-string');
		expect(notes.length).toBeGreaterThanOrEqual(10);
		let pairs = 0;
		for (const [i, note] of notes.entries()) {
			const anchor = note.anchorBeat as number;
			const prompt = note.promptBeat as number;
			// On beat 1 of a bar, its accented click sounding there.
			expect(anchor % BAR_BEATS).toBe(0);
			expect(accents).toContain(Math.round(note.dueAt * 1000));
			// Its lead is one of the ladder's: the prompt on beat 1 or 3.
			expect([2, 4, 8]).toContain(anchor - prompt);
			if (i === 0 || rounds[note.n - 1]?.card.skill !== 'locate-note-string') continue;
			// After the target before: its breathing bar, then the first bar the lead allows.
			const previous = notes[i - 1].anchorBeat as number;
			expect(prompt - previous).toBeGreaterThanOrEqual(DEFAULT_RESPIRATION_BARS * BAR_BEATS);
			expect(prompt - previous).toBeLessThan((DEFAULT_RESPIRATION_BARS + 1) * BAR_BEATS);
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
		expect(lane(controller)?.verdict?.misses[0]?.correction).toMatch(/^corde de .+, case \d+$/);
		// Through the breath it stays, at every step, until the next note's string shows.
		let shownAt: number | null = null;
		let kept = true;
		await runUntil(app, () => {
			const model = lane(controller);
			if (model && model.anchorBeat === null) {
				shownAt = controller.timeline.nowBeat();
				return true;
			}
			if (!model?.verdict?.misses[0]?.correction) kept = false;
			return false;
		});
		expect(kept).toBe(true);
		const preview = lane(controller);
		expect(preview?.verdict).toBeNull();
		expect(onStage(controller)?.card.skill).toBe('locate-note-string');
		const promptBeat = preview?.promptBeat as number;
		// The next prompt a breathing bar at least after the missed target; its string a beat
		// before it (to the step).
		expect(promptBeat - (missed.anchorBeat as number)).toBeGreaterThanOrEqual(
			DEFAULT_RESPIRATION_BARS * BAR_BEATS
		);
		expect(shownAt).toBeCloseTo(promptBeat - DEFAULT_PREVIEW_BEATS, 1);
		expect(shownAt as unknown as number).toBeGreaterThan(settledAt);
		// The note itself at its prompt.
		await runUntil(app, () => controller.view.status === 'awaiting');
		expect(lane(controller)?.anchorBeat).not.toBeNull();
		expect(controller.timeline.nowBeat()).toBeCloseTo(promptBeat, 1);
		await quitAndRead(app, controller);
	});

	it('answers identify by a tap, silently, and counts a sounding bar back to the guitar', async () => {
		// Two names to tap due, at the top of their ladder, then a new note to play: identify,
		// identify, locate.
		const app = await notesApp({
			cards: [learnedCard(identify(5, 3)), learnedCard(identify(4, 5))],
			levels: [levelOf(identify(5, 3), 1), levelOf(identify(4, 5), 1)]
		});
		const controller = await startNotes(app, 'learn');
		// A tap during the (silent) count before the first name is no answer.
		await runUntil(app, () => controller.view.status === 'count-in');
		expect(controller.view.status).toBe('count-in');
		controller.answer('A');
		await runUntil(app, () => controller.view.status === 'awaiting');
		const first = onStage(controller);
		expect(first?.card.skill).toBe('identify-note');
		for (let i = 0; i < 60; i++) await step(app);
		const right = rightName(first?.card.item as IdentifyItem);
		// Two taps: the first answers, the second comes after the answer.
		controller.answer(right);
		expect(controller.view.status).toBe('verdict');
		controller.answer(right === 'C' ? 'D' : 'C');
		expect(app.sounds.emitted()).toEqual([]);
		const rest = await playRounds(app, controller, allRight, { rounds: 2 });
		expect(rest.map((round) => round.card.skill)).toEqual(['identify-note', 'locate-note-string']);
		const attempts = await quitAndRead(app, controller);
		const [tapped] = attempts;
		expect(tapped).toMatchObject({
			skill: 'identify-note',
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
		expect(named.card.skill).toBe('identify-note');
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
		expect(note?.card.skill).toBe('locate-note-string');
		const promptTime = app.clock.now();
		const clicks = app.sounds.emitted().filter((s) => s.time > answeredAt && s.time < promptTime);
		expect(clicks.length).toBeGreaterThanOrEqual(BAR_BEATS);
		expect(countdowns.length).toBe(BAR_BEATS);
		const beatS = 60 / controller.view.tempoBpm;
		// The count's first click at least a bar before the prompt.
		expect(promptTime - clicks[0].time).toBeGreaterThanOrEqual(BAR_BEATS * beatS - 0.02);
		await quitAndRead(app, controller);
	});

	it('stores the latency of the first calibrated sensor its rounds listened to, a tap having none', async () => {
		// A name to tap first (no latency for a tap), then a note to play, heard by the note sensor.
		const app = await notesApp({ cards: [learnedCard(identify(5, 3))] });
		await app.deps.settings.update({ latency: { note: { ms: 30, provenance: 'system' } } });
		const controller = await startNotes(app, 'learn');
		const [named, played] = await playRounds(app, controller, allRight, { rounds: 2 });
		expect([named.card.skill, played.card.skill]).toEqual(['identify-note', 'locate-note-string']);
		await quitAndRead(app, controller);
		expect((await app.deps.sessions.get(controller.sessionId))?.latencyMs).toBe(30);
	});

	it('keeps a named note off the note lane that follows', async () => {
		// A name to tap due, then a new note to play: identify, a counted bar, locate.
		const app = await notesApp({ cards: [learnedCard(identify(5, 3))] });
		const controller = await startNotes(app, 'learn');
		const [named, played] = await playRounds(app, controller, allRight, { rounds: 2 });
		expect([named.card.skill, played.card.skill]).toEqual(['identify-note', 'locate-note-string']);
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
		expect(named?.card.skill).toBe('identify-note');
		const beatS = 60 / controller.view.tempoBpm;
		const nextBar = (Math.floor(controller.timeline.nowBeat() / BAR_BEATS) + 1) * BAR_BEATS;
		// Tapped a few ms before the next bar line.
		await runUntil(app, () => (nextBar - controller.timeline.nowBeat()) * beatS <= 0.05);
		const tappedAt = app.clock.now();
		expect((nextBar - controller.timeline.nowBeat()) * beatS).toBeGreaterThan(0);
		controller.answer(rightName(named?.card.item as IdentifyItem));
		await runUntil(app, () => controller.view.status === 'awaiting');
		expect(onStage(controller)?.card.skill).toBe('locate-note-string');
		// The count's first click, the first sound since the tap.
		const [first] = app.sounds.emitted().filter((s) => s.time >= tappedAt);
		expect(first).toBeDefined();
		expect(first.time - tappedAt).toBeGreaterThanOrEqual(START_DELAY_S);
		await quitAndRead(app, controller);
	});

	it('plays locate at 80 bpm, fixed, and writes its level', async () => {
		const card = locate(6, 'G');
		// Learned at lead 2 (level 2 at ♩ = 80); locate is fixed at 80.
		const app = await notesApp({
			cards: [learnedCard(card)],
			levels: [levelOf(card, 2)]
		});
		const controller = await startNotes(app, 'learn');
		const [played] = await playRounds(app, controller, allRight, { rounds: 1 });
		await runUntil(app, () => controller.view.status === 'verdict');
		const attempts = await quitAndRead(app, controller);
		expect(controller.view.tempoBpm).toBe(80);
		expect(keyOf(played.card)).toBe(keyOf(card));
		// Served at lead 2, the top of the ladder at 80 bpm, played right: its level is written.
		expect((played.anchorBeat as number) - (played.promptBeat as number)).toBe(2);
		expect(attempts[0]).toMatchObject({ leadBeats: 2, temperature: 'cold', success: true });
		expect(await app.deps.levels.get(levelOf(card, 2))).toMatchObject({ level: 2, successes: 1 });
	});

	it('ends after SESSION_MS once the round under way settles', async () => {
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
	}, 30_000);

	it('writes attempts the summary and the neck map read as before', async () => {
		const note = locate(5, 'C');
		const name = identify(4, 5);
		// Both at the top of their ladder, so both are reviewed cold.
		const app = await notesApp({
			cards: [learnedCard(note), learnedCard(name)],
			levels: [levelOf(note, 2), levelOf(name, 1)]
		});
		const controller = await startNotes(app, 'learn');
		const rounds = await playRounds(
			app,
			controller,
			(round) =>
				round.card.skill === 'locate-note-string'
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
			chords: false
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

/** A learned card of the neck, not due before long. */
function notDue(card: NeckCard, options: { acquired?: boolean } = {}) {
	const learned = learnedCard(card, options);
	return { ...learned, scheduling: { ...learned.scheduling, due: Number.MAX_SAFE_INTEGER } };
}

/** The first `count` notes of the locate list the catalog writes. */
const LOCATE_ORDER = (LOCATE_NECK.items ?? []).map((entry) => {
	const [string, pitch] = String(entry).split(':');
	return locate(Number(string) as LocateItem['string'], pitch as PitchName);
});

describe('the notes on the subject the catalog writes', () => {
	it('serves a player in mid-learning by category: a due review, a resumed note, then a note to name before a new one', async () => {
		const resumed = introduceCard(
			{ key: keyOf(locate(4, 'F')), skill: 'locate-note-string', item: locate(4, 'F').item },
			0,
			's-old'
		);
		const cards = [learnedCard(locate(6, 'G')), notDue(locate(5, 'C')), resumed];
		const app = await notesApp({ cards, levels: [levelOf(locate(6, 'G'), 2)] });
		const controller = await startNotes(app, 'learn');
		await playRounds(app, controller, allRight, { rounds: 6 });
		const attempts = await quitAndRead(app, controller);
		expect(attempts.slice(0, 2)).toMatchObject([
			{ cardKey: keyOf(locate(6, 'G')), phase: 'review', temperature: 'cold' },
			{ cardKey: keyOf(locate(4, 'F')), phase: 'learning' }
		]);
		// The first card introduced names a note already located (6:G, the first of the list).
		const known = new Set(cards.map((card) => card.key));
		const introduced = attempts.find((attempt) => !known.has(attempt.cardKey));
		expect(introduced).toMatchObject({ cardKey: keyOf(identify(6, 3)), phase: 'learning' });
	});

	it('introduces a note in its turn, its mirror still fragile', async () => {
		const before = LOCATE_ORDER.slice(
			0,
			LOCATE_ORDER.findIndex((c) => keyOf(c) === keyOf(locate(5, 'E')))
		);
		const fragile = keyOf(locate(6, 'A'));
		const cards = before.flatMap((card) => {
			if (keyOf(card) === fragile) return [notDue(card, { acquired: false })];
			const { string, pitch } = card.item as LocateItem;
			const fret = LEARNABLE_FRETS.find((f) => pitchOnString(string, f) === pitch)!;
			return [notDue(card), notDue(identify(string, fret))];
		});
		const app = await notesApp({ cards });
		const controller = await startNotes(app, 'learn');
		await playRounds(app, controller, allRight, { rounds: 1 });
		const [first] = await quitAndRead(app, controller);
		expect(first).toMatchObject({
			cardKey: keyOf(locate(5, 'E')),
			phase: 'learning',
			temperature: 'hot'
		});
	});

	it('keeps the order of the notes whatever triads are being learned', async () => {
		const voicing = String(TRIADS_ANCHOR.items?.[0]);
		const anchoring = introduceCard(
			{ key: `chord-anchor:${voicing}`, skill: 'chord-anchor', item: { voicingKey: voicing } },
			0,
			's-old'
		);
		const app = await notesApp({ cards: [anchoring] });
		const controller = await startNotes(app, 'learn');
		await playRounds(app, controller, allRight, { rounds: 1 });
		const [first] = await quitAndRead(app, controller);
		expect(first).toMatchObject({
			cardKey: keyOf(LOCATE_ORDER[0]),
			phase: 'learning',
			temperature: 'hot'
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

describe('a note forgotten', () => {
	it('keeps a named note hot once a missed review has brought it down to the name shown, even fast', async () => {
		const card = identify(5, 3);
		// The ladder of identify: the name shown, then the top, which asks a direct recall.
		const app = await notesApp({ cards: [learnedCard(card)], levels: [levelOf(card, 1)] });
		const first = await startNotes(app, 'learn');
		await playRounds(app, first, () => ({ play: 'wrong' }), { rounds: 1 });
		await runUntil(app, () => first.view.status === 'verdict');
		const [missed] = await quitAndRead(app, first);
		expect(missed).toMatchObject({ phase: 'review', temperature: 'cold', success: false });
		expect(await app.deps.levels.get(levelOf(card, 0))).toMatchObject({ level: 0 });
		const forgotten = await app.deps.cards.get(keyOf(card));

		// Due again a month later: asked at the name shown, answered right well within 3 s.
		app.clock.advance(30 * 24 * 3600);
		const second = await startNotes(app, 'learn');
		const [round] = await playRounds(app, second, allRight, { rounds: 1 });
		await runUntil(app, () => second.view.status === 'verdict');
		const [again] = await quitAndRead(app, second);
		expect(keyOf(round.card)).toBe(keyOf(card));
		expect(again).toMatchObject({ phase: 'consolidation', temperature: 'hot', success: true });
		expect(again.reactionMs).toBeLessThan(3_000);
		// It climbs back a level; its card is as the miss left it.
		expect(await app.deps.levels.get(levelOf(card, 0))).toMatchObject({ level: 1 });
		expect(await app.deps.cards.get(keyOf(card))).toEqual(forgotten);
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
			const item = round.card.item;
			if (round.card.skill === 'identify-note') expect((item as IdentifyItem).fret).not.toBe(0);
			else expect((item as LocateItem).pitch).not.toBe(openPitch(item.string));
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
		expect(countdowns).toHaveLength(BAR_BEATS);
		expect(app.sounds.emitted().length).toBeGreaterThanOrEqual(BAR_BEATS);
		expect(onStage(controller)?.card.skill).toBe('locate-note-string');
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

	it('stores nothing when paused or quit before a name is tapped', async () => {
		for (const stop of ['pause', 'quit'] as const) {
			const app = await notesApp({ cards: [learnedCard(identify(5, 3))] });
			const controller = await startNotes(app, 'learn');
			await runUntil(app, () => controller.view.status === 'awaiting');
			expect(onStage(controller)?.card.skill).toBe('identify-note');
			for (let i = 0; i < 100; i++) await step(app);
			controller[stop]();
			await drain();
			expect(await app.deps.attempts.listBySession(controller.sessionId)).toEqual([]);
			expect(await app.deps.cards.get(keyOf(identify(5, 3)))).toEqual(learnedCard(identify(5, 3)));
		}
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
