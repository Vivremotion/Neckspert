/** The triads' sessions on the app's real wiring (`createAppServices`), the stores in memory and the fakes. */
import { TRIAD_PRESENTERS } from '$lib/application/mechanics';
import type { ChordExpectation } from '$lib/application/ports';
import type { PresentedPrompt, PromptStageModel } from '$lib/application/presentation';
import type { PlaySessionController } from '$lib/application/session/contract';
import { chordSensor } from '$lib/application/session/sensors';
import { TRIADS_ANCHOR } from '$lib/domain/exercise';
import { rootPosition } from '$lib/domain/mechanics';
import { acceptableMidis, parseVoicingKey, voicingKey } from '$lib/domain/music';
import { introduceCard, markLearned } from '$lib/domain/progress';
import { occurrenceOfId, triadIntroductionOrder, triadParams } from '$lib/domain/triads';
import type { CardState } from '$lib/domain/types';
import { CutShortVerifier } from './gestureSeries';
import { notesApp, step, type NotesSetup } from './notesSeries';

export type TriadMechanic = 'triad-anchor' | 'triad-zone';

/** The anchor's introduction queue, with no locate position acquired: C's three inversions first. */
export const ORDER = triadIntroductionOrder(triadParams(TRIADS_ANCHOR), new Set()).map(voicingKey);

/** A learned triad card, due at once (a cold review), acquired unless told otherwise. */
export function learnedTriad(
	mechanic: TriadMechanic,
	voicing: string,
	options: { acquired?: boolean } = {}
): CardState {
	const learned = markLearned(
		introduceCard(
			{ key: `${mechanic}:${voicing}`, mechanic, item: { voicingKey: voicing } },
			0,
			's-old'
		),
		0
	);
	return {
		...learned,
		acquiredAt: options.acquired === false ? null : 0,
		scheduling: { ...learned.scheduling, due: 0 }
	};
}

/** The app's services on fakes, with the triads' presenters and a chord sensor on a fake verifier. */
export async function triadsApp(setup: NotesSetup = {}) {
	const verifier = new CutShortVerifier();
	const app = await notesApp({
		...setup,
		presenters: { ...TRIAD_PRESENTERS, ...setup.presenters },
		sensors: { chord: chordSensor(verifier), ...setup.sensors }
	});
	return { ...app, verifier };
}

export type TriadsApp = Awaited<ReturnType<typeof triadsApp>>;

/** A session of `kind` started on `app`. */
export async function startTriads(app: TriadsApp, kind: 'triads' | 'triads-zone') {
	const controller = await app.services.startSession(kind);
	await controller.ready?.();
	await controller.start();
	return controller;
}

/** The lane's model on stage, if any. */
export function laneModel(controller: PlaySessionController): PromptStageModel | null {
	const stage = controller.view.stage;
	return stage?.view === 'lane' ? (stage.model as PromptStageModel) : null;
}

/** The chords told to the verifier, withdrawals left out. */
export function expectationsTold(app: TriadsApp): ChordExpectation[] {
	return app.verifier.expectations.filter((e): e is ChordExpectation => e !== null);
}

/** The voicing a shape id names. */
export function voicingOfShape(id: string): string {
	const occurrence = occurrenceOfId(id);
	if (!occurrence) throw new Error(`Not a shape: ${id}`);
	return voicingKey(occurrence.voicing);
}

/** A triad round as the player meets it: the screen and what the chord sensor is told. */
export interface TriadSeen {
	n: number;
	mechanic: TriadMechanic;
	voicing: string;
	/** The fret a zone prompt names; 'open' for a shape on open strings only. */
	fret?: number | 'open';
	/** The prompt shows its aid (the shape drawn, or the root's string). */
	aided: boolean;
	prompt: PresentedPrompt;
	expectation: ChordExpectation;
	anchorBeat: number;
	promptBeat: number;
	/** Audio seconds the round opened at, and of its target. */
	openedAt: number;
	targetAt: number;
}

/** How a round is answered: each part right, wrong or not played. */
export interface TriadAnswer {
	root?: 'right' | 'wrong' | 'none';
	chord?: 'right' | 'wrong' | 'none';
}

export const allRight = (): TriadAnswer => ({ root: 'right', chord: 'right' });

/** Beats after the target an anchor's chord is strummed, inside its band. */
export const ANCHOR_CHORD_BEATS = 2;

/** The round that has just opened, as the screen and the chord sensor show it. */
function seen(app: TriadsApp, controller: PlaySessionController, n: number): TriadSeen | null {
	const model = laneModel(controller);
	const expectation = app.verifier.expectations.at(-1);
	if (!model || !expectation || model.anchorBeat === null || model.promptBeat === null) return null;
	const voicing = voicingOfShape(expectation.expected[0]);
	// The anchor names its root's string; the zone a fret.
	const secondary = model.prompt.secondary ?? '';
	const zone = secondary.startsWith('vers la case') || secondary === 'à vide';
	const now = app.clock.now();
	const beatS = 60 / controller.view.tempoBpm;
	return {
		n,
		mechanic: zone ? 'triad-zone' : 'triad-anchor',
		voicing,
		...(zone && {
			fret: secondary === 'à vide' ? 'open' : Number(secondary.replace('vers la case ', ''))
		}),
		aided: model.prompt.aid !== null || model.prompt.pictures.length > 0,
		prompt: model.prompt,
		expectation,
		anchorBeat: model.anchorBeat,
		promptBeat: model.promptBeat,
		openedAt: now,
		targetAt: now + (model.anchorBeat - controller.timeline.nowBeat()) * beatS
	};
}

/** Plays `round`'s root on `app`'s note detector at `time`: right, or a semitone off. */
export function playRoot(app: TriadsApp, round: TriadSeen, right: boolean, time: number): void {
	const midi = acceptableMidis(rootPosition(parseVoicingKey(round.voicing)))[0];
	app.detector.emitNote({ time, midi: right ? midi : midi + 1, frequencyHz: 0, clarity: 0.9 });
}

/** A chord read by the verifier at `time`: the shape `decided`. */
export function playChord(app: TriadsApp, decided: string | null, time: number): void {
	app.verifier.emit({ time, windowMs: 300, decided, final: true, variants: [] });
}

/** The shape the sensor takes as right, and one it takes as wrong. */
export function shapes(round: TriadSeen): { right: string; wrong: string } {
	const wrong = round.expectation.candidates.find((c) => c.kind !== 'expected');
	if (!wrong) throw new Error('No wrong shape among the candidates');
	return { right: round.expectation.expected[0], wrong: wrong.id };
}

/**
 * Plays the session's rounds as they open (the status turning to awaiting), each answered as
 * `choose` says (an anchor: the root on its target, the chord `ANCHOR_CHORD_BEATS` later; a zone:
 * the chord on its target), each sound sent when the clock reaches it, until `rounds` rounds have
 * opened and their sounds were sent, or the session ends, or `maxSteps` run out.
 */
export async function playTriads(
	app: TriadsApp,
	controller: PlaySessionController,
	choose: (round: TriadSeen) => TriadAnswer,
	options: { rounds?: number; stepS?: number; maxSteps?: number } = {}
): Promise<TriadSeen[]> {
	const rounds: TriadSeen[] = [];
	const limit = options.rounds ?? Infinity;
	const maxSteps = options.maxSteps ?? 20_000;
	let status = controller.view.status;
	let sounds: { time: number; play: () => void }[] = [];
	for (let i = 0; i < maxSteps; i++) {
		if (controller.view.status === 'finished') break;
		if (rounds.length >= limit && sounds.length === 0) break;
		await step(app, options.stepS);
		const now = app.clock.now();
		if (controller.view.status === 'awaiting' && status !== 'awaiting' && rounds.length < limit) {
			const round = seen(app, controller, rounds.length);
			if (round) {
				rounds.push(round);
				const answer = { ...allRight(), ...choose(round) };
				const { right, wrong } = shapes(round);
				const chordAt =
					round.mechanic === 'triad-anchor'
						? round.targetAt + (ANCHOR_CHORD_BEATS * 60) / controller.view.tempoBpm
						: round.targetAt;
				if (round.mechanic === 'triad-anchor' && answer.root !== 'none') {
					const time = round.targetAt;
					sounds.push({ time, play: () => playRoot(app, round, answer.root === 'right', time) });
				}
				if (answer.chord !== 'none') {
					const shape = answer.chord === 'right' ? right : wrong;
					sounds.push({ time: chordAt, play: () => playChord(app, shape, chordAt) });
				}
			}
		}
		status = controller.view.status;
		const due = sounds.filter((sound) => now >= sound.time);
		sounds = sounds.filter((sound) => now < sound.time);
		for (const sound of due) sound.play();
	}
	return rounds;
}
